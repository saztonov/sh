import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { existsSync } from 'node:fs';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { supabase } from '../db.js';
import { ScrapeLogger } from '../scrape-logger.js';
import { uploadToS3 } from '../s3.js';

/**
 * Upload a debug screenshot to S3. Returns the S3 key or null on failure.
 * Never throws — errors are silently logged.
 */
async function uploadDebugScreenshot(page: Page, label: string): Promise<string | null> {
  try {
    const buffer = await page.screenshot({ fullPage: true });
    const key = `debug/auto-login/${Date.now()}_${label}.png`;
    await uploadToS3(key, buffer, 'image/png');
    logger.info({ key }, 'Debug screenshot uploaded to S3');
    return key;
  } catch (err) {
    logger.warn({ err }, 'Failed to upload debug screenshot');
    return null;
  }
}

/**
 * Build launch options based on config.
 * Uses system Chrome/Edge via `channel`, or a custom executable path.
 */
function getLaunchOptions(headless: boolean) {
  const channel = config.playwright.channel;

  const args = ['--disable-blink-features=AutomationControlled', '--no-first-run', '--no-default-browser-check'];

  // Empty channel → use Playwright's bundled Chromium (optimal for VPS)
  if (!channel) {
    return { headless, args };
  }

  // Known channel names that Playwright supports directly
  const knownChannels = ['chrome', 'chrome-beta', 'chrome-dev', 'chrome-canary', 'msedge', 'msedge-beta', 'msedge-dev'];

  if (knownChannels.includes(channel)) {
    return { headless, channel, args };
  }

  // Treat as executable path (e.g. Yandex Browser)
  return { headless, executablePath: channel, args };
}

/**
 * Launch browser and create a context with saved authentication state.
 */
export async function launchBrowser(overrideHeadless?: boolean, statePath?: string): Promise<{
  browser: Browser;
  context: BrowserContext;
}> {
  const headless = overrideHeadless ?? config.playwright.headless;
  const resolvedStatePath = statePath ?? config.playwright.statePath;

  logger.info(
    { headless, channel: config.playwright.channel, statePath: resolvedStatePath },
    'Launching browser',
  );

  const browser = await chromium.launch(getLaunchOptions(headless));

  const contextOptions: Parameters<Browser['newContext']>[0] = {};

  // Load saved storage state if it exists
  if (existsSync(resolvedStatePath)) {
    contextOptions.storageState = resolvedStatePath;
    logger.info('Loaded saved browser state');
  } else {
    logger.warn(
      { path: resolvedStatePath },
      'No saved browser state found',
    );
  }

  const context = await browser.newContext(contextOptions);

  return { browser, context };
}

/**
 * Save the current browser context storage state (cookies, localStorage).
 */
export async function saveBrowserState(context: BrowserContext, statePath?: string): Promise<void> {
  const resolvedPath = statePath ?? config.playwright.statePath;
  await context.storageState({ path: resolvedPath });
  logger.info({ path: resolvedPath }, 'Saved browser state');
}

/**
 * Gracefully close the browser instance.
 */
export async function closeBrowser(browser: Browser): Promise<void> {
  try {
    await browser.close();
    logger.info('Browser closed');
  } catch (err) {
    logger.error({ err }, 'Error closing browser');
  }
}

/**
 * Check if a URL belongs to an authenticated Classroom page.
 */
function isClassroomUrl(url: string): boolean {
  return url.includes('classroom.google.com/u/') || url.includes('classroom.google.com/h');
}

/**
 * Check if the user is logged in to Google Classroom.
 * Does NOT rely on CSS class names (Google changes them frequently).
 * Instead checks:
 * 1. URL is on classroom.google.com (not accounts.google.com or landing page)
 * 2. Page has loaded meaningful content (not just a sign-in shell)
 */
async function isLoggedInToClassroom(page: Page): Promise<boolean> {
  const url = page.url();

  // Definitely not logged in if on Google login page
  if (url.includes('accounts.google.com')) {
    logger.debug({ url }, 'Login check: on accounts.google.com — not logged in');
    return false;
  }

  // Must be on an authenticated Classroom URL (any profile number)
  if (!isClassroomUrl(url)) {
    logger.debug({ url }, 'Login check: not on classroom.google.com — not logged in');
    return false;
  }

  // Check that the page has actual content by evaluating in browser context
  try {
    const contentInfo = await page.evaluate(() => {
      // Check for links with any profile number (/u/0/, /u/1/, etc.)
      const internalLinks = document.querySelectorAll('a[href*="/u/"]');
      const nav = document.querySelector('[role="navigation"], [role="banner"]');
      const main = document.querySelector('[role="main"], main');
      const bodyText = document.body?.innerText ?? '';

      return {
        internalLinksCount: internalLinks.length,
        hasNav: !!nav,
        hasMain: !!main,
        bodyTextLength: bodyText.length,
      };
    });

    logger.debug(
      { url, ...contentInfo },
      'Login check: DOM content info',
    );

    if (contentInfo.internalLinksCount >= 3) return true;
    if (contentInfo.hasNav && contentInfo.hasMain) return true;
    if (contentInfo.bodyTextLength > 500) return true;

    return false;
  } catch (err) {
    logger.debug({ err }, 'Login check: page.evaluate failed');
    return false;
  }
}

/**
 * Check the database for a force_save request.
 */
async function checkForForceSave(): Promise<string | null> {
  try {
    const { data } = await supabase
      .from('scrape_runs')
      .select('id')
      .eq('status', 'force_save')
      .order('started_at', { ascending: true })
      .limit(1);

    return data && data.length > 0 ? (data[0].id as string) : null;
  } catch {
    return null;
  }
}

/**
 * Capture a Google Classroom session interactively.
 * Opens visible browser, navigates to Classroom, waits for user to log in (up to 10 min),
 * saves session, and closes the browser. Does NOT scrape any data.
 */
export async function captureSession(log?: ScrapeLogger): Promise<{ success: boolean; error?: string }> {
  let browser: Browser | undefined;

  try {
    log?.info('browser_launch', 'Запуск браузера для захвата сессии Google');
    // Always launch visible (headless=false) for session capture
    const launched = await launchBrowser();
    browser = launched.browser;
    const { context } = launched;
    const page = await context.newPage();

    let sessionSaved = false;
    let browserDisconnected = false;

    // Track browser disconnect (user closes browser manually)
    browser.on('disconnected', () => {
      browserDisconnected = true;
      logger.info('Browser disconnected (closed by user)');
    });

    page.on('close', () => {
      logger.info('Page closed');
    });

    page.on('crash', () => {
      logger.error('Page crashed');
    });

    // Eagerly save session whenever the page navigates to an authenticated Classroom URL.
    // Matches any profile number (/u/0/, /u/1/, etc.)
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        const frameUrl = frame.url();
        logger.info({ url: frameUrl }, 'Main frame navigated');

        if (isClassroomUrl(frameUrl)) {
          context.storageState({ path: config.playwright.statePath })
            .then(() => {
              sessionSaved = true;
              logger.info({ url: frameUrl }, 'Session saved (eager save on navigation to Classroom)');
            })
            .catch(() => {
              // Context may already be closed — ignore
            });
        }
      }
    });

    logger.info('Navigating to Google Classroom for session capture...');
    await page.goto('https://classroom.google.com', {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    await page.waitForTimeout(3000);

    const initialUrl = page.url();
    logger.info({ url: initialUrl }, 'Initial page URL after navigation');

    // Check if already logged in
    if (await isLoggedInToClassroom(page)) {
      logger.info('Already logged in to Google Classroom');
      log?.info('session_check', 'Уже авторизован в Google Classroom');
      await saveBrowserState(context);
      await closeBrowser(browser);
      log?.info('session_save', 'Сессия сохранена');
      await log?.flush();
      return { success: true };
    }

    // Not logged in — wait for user to complete login (up to 10 minutes)
    log?.info('manual_login_wait', 'Ожидание ручного входа в Google (10 мин)');
    logger.info('Not logged in — waiting for manual login (10 min timeout)...');

    const deadline = Date.now() + 600_000; // 10 minutes
    let iteration = 0;

    while (Date.now() < deadline && !browserDisconnected) {
      try {
        await page.waitForTimeout(3000);
      } catch {
        logger.info('waitForTimeout interrupted — browser likely closed');
        break;
      }

      iteration++;
      const elapsed = Math.round((Date.now() - (deadline - 600_000)) / 1000);

      if (browserDisconnected) {
        logger.info('Browser disconnected during wait loop');
        break;
      }

      // Check for force_save request from the portal
      const forceSaveId = await checkForForceSave();
      if (forceSaveId) {
        logger.info({ forceSaveId }, 'Force save request detected');
        try {
          await saveBrowserState(context);
          sessionSaved = true;
          // Mark force_save run as success
          await supabase
            .from('scrape_runs')
            .update({ status: 'success', finished_at: new Date().toISOString() })
            .eq('id', forceSaveId);
          logger.info('Session force-saved successfully');
          if (!browserDisconnected) {
            await closeBrowser(browser);
          }
          return { success: true };
        } catch (err) {
          logger.error({ err }, 'Force save failed');
        }
      }

      // If eager save already captured session, we're done
      if (sessionSaved) {
        try {
          await saveBrowserState(context);
        } catch { /* browser might be closing */ }
        logger.info('Login detected via navigation, session saved');
        if (!browserDisconnected) {
          await closeBrowser(browser);
        }
        return { success: true };
      }

      // Also check via page content as a backup
      try {
        const currentUrl = page.url();
        logger.info(
          { iteration, elapsed, url: currentUrl },
          'Checking login status...',
        );

        if (await isLoggedInToClassroom(page)) {
          await saveBrowserState(context);
          sessionSaved = true;
          logger.info('Login confirmed via content check, session saved');
          if (!browserDisconnected) {
            await closeBrowser(browser);
          }
          return { success: true };
        }
      } catch {
        logger.info('Content check interrupted — browser likely closed');
        break;
      }
    }

    // Loop ended — determine result

    if (sessionSaved) {
      logger.info('Session was saved successfully');
      if (!browserDisconnected) {
        try { await closeBrowser(browser); } catch { /* already closed */ }
      }
      return { success: true };
    }

    if (browserDisconnected) {
      return { success: false, error: 'Браузер был закрыт до завершения входа. Попробуйте ещё раз.' };
    }

    // Timeout
    logger.warn('Session capture timed out after 10 minutes');
    await closeBrowser(browser);
    return { success: false, error: 'Время ожидания истекло (10 минут). Попробуйте ещё раз.' };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error({ err }, 'Session capture failed');
    if (browser) {
      try { await closeBrowser(browser); } catch { /* already closed */ }
    }
    return { success: false, error: errorMessage };
  }
}

/**
 * Attempt automatic Google login using credentials from environment.
 * Returns true on success, false on failure (CAPTCHA, 2FA, wrong credentials, etc.)
 */
async function autoLogin(page: Page, email: string, password: string, log?: ScrapeLogger): Promise<{ success: boolean; screenshotUrl?: string }> {
  try {
    logger.info({ email }, 'Attempting automatic Google login...');

    // Check if we're on the "Verify your identity" page (session partially expired)
    // Google shows the email and a "Next" button, no email input
    const emailInput = await page.waitForSelector('input[type="email"]', { timeout: 5_000 }).catch(() => null);

    if (emailInput) {
      // Normal login flow: fill email and click Next
      log?.info('auto_login', 'Поле email найдено, обычный вход');
      await emailInput.fill(email);
      log?.info('auto_login', 'Email введён');
      logger.info('Email entered');

      await page.click('#identifierNext');
      log?.info('auto_login', 'Нажал "Далее" после email');
      logger.info('Clicked Next after email');
    } else {
      // "Verify your identity" page: no email input, but there might be a "Next" button
      log?.info('auto_login', 'Поле email не найдено — проверяю страницу подтверждения личности');
      logger.info('No email input — checking for identity verification page');

      // Look for a "Next" / "Далее" button on the verify identity page
      const nextButton = await page.$('button:has-text("Далее"), button:has-text("Next"), #identifierNext');
      if (nextButton) {
        await nextButton.click();
        log?.info('auto_login', 'Нажал "Далее" на странице подтверждения личности');
        logger.info('Clicked Next on identity verification page');
      } else {
        log?.warn('auto_login', `Не найдены элементы входа, URL: ${page.url()}`);
        const screenshotUrl = await uploadDebugScreenshot(page, 'no-login-elements');
        return { success: false, screenshotUrl: screenshotUrl ?? undefined };
      }
    }

    // Wait for password input
    log?.info('auto_login', 'Ожидание поля пароля...');
    const passwordInput = await page.waitForSelector('input[type="password"]:visible', { timeout: 15_000 });
    if (!passwordInput) {
      logger.warn('Password input not found — possible CAPTCHA or account chooser');
      log?.warn('auto_login', `Поле пароля не найдено, URL: ${page.url()}`);
      const screenshotUrl = await uploadDebugScreenshot(page, 'no-password-input');
      return { success: false, screenshotUrl: screenshotUrl ?? undefined };
    }

    await passwordInput.fill(password);
    log?.info('auto_login', 'Пароль введён');
    logger.info('Password entered');

    // Click "Next"
    await page.click('#passwordNext');
    log?.info('auto_login', 'Нажал "Далее" после пароля');
    logger.info('Clicked Next after password');

    // Wait for redirect to Classroom
    try {
      await page.waitForURL(/classroom\.google\.com/, { timeout: 30_000 });
      log?.info('auto_login', 'Перенаправлен на Classroom');
      logger.info({ url: page.url() }, 'Redirected to Classroom after auto-login');
      return { success: true };
    } catch {
      const currentUrl = page.url();
      logger.warn({ url: currentUrl }, 'Did not redirect to Classroom — possible 2FA or error');
      log?.warn('auto_login', `Нет редиректа на Classroom, URL: ${currentUrl}`);
      const screenshotUrl = await uploadDebugScreenshot(page, 'no-redirect');
      return { success: false, screenshotUrl: screenshotUrl ?? undefined };
    }
  } catch (err) {
    logger.error({ err }, 'Auto-login failed');
    log?.error('auto_login', `Исключение: ${err instanceof Error ? err.message : String(err)}`);
    const screenshotUrl = await uploadDebugScreenshot(page, 'exception');
    return { success: false, screenshotUrl: screenshotUrl ?? undefined };
  }
}

/**
 * Capture session using automatic Google login.
 * Launches browser, navigates to Classroom, attempts auto-login with env credentials.
 * Does NOT fall back to manual login — that's a separate button.
 */
export async function captureSessionAuto(log?: ScrapeLogger): Promise<{ success: boolean; error?: string }> {
  const email = config.google?.email;
  const password = config.google?.password;

  if (!email || !password) {
    return { success: false, error: 'GOOGLE_EMAIL and GOOGLE_PASSWORD not configured' };
  }

  let browser: Browser | undefined;

  try {
    const launched = await launchBrowser(true);
    browser = launched.browser;
    const { context } = launched;

    // Stealth: realistic viewport and user-agent
    const page = await context.newPage();
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    log?.info('browser_launch', 'Запуск браузера для автологина Google');
    logger.info('Navigating to Google Classroom for auto-login...');
    await page.goto('https://classroom.google.com', {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    await page.waitForTimeout(3000);

    logger.info({ url: page.url() }, 'Initial page URL');

    // Check if already logged in
    if (await isLoggedInToClassroom(page)) {
      logger.info('Already logged in to Google Classroom');
      log?.info('session_check', 'Уже авторизован в Google Classroom');
      await saveBrowserState(context);
      await closeBrowser(browser);
      await log?.flush();
      return { success: true };
    }

    // Attempt auto-login (with one retry)
    log?.info('auto_login', 'Попытка автоматического входа в Google');
    let loginResult = await autoLogin(page, email, password, log);

    if (!loginResult.success) {
      log?.warn('auto_login', 'Первая попытка не удалась, повтор через 3 сек...');
      await page.waitForTimeout(3000);
      await page.goto('https://classroom.google.com', {
        waitUntil: 'domcontentloaded',
        timeout: 60_000,
      });
      await page.waitForTimeout(2000);
      loginResult = await autoLogin(page, email, password, log);
    }

    if (!loginResult.success) {
      const details: Record<string, unknown> = {};
      if (loginResult.screenshotUrl) details.screenshot_url = loginResult.screenshotUrl;
      log?.error('auto_login', 'Автологин Google не удался', Object.keys(details).length > 0 ? details : undefined);
      await closeBrowser(browser);
      await log?.flush();
      return { success: false, error: 'Автоматический вход не удался. Возможные причины: CAPTCHA, 2FA, неверные данные.' };
    }

    // Wait for page to fully load (SPA needs time in headless mode)
    try {
      await page.waitForLoadState('networkidle', { timeout: 15_000 });
    } catch {
      // networkidle may not fire on heavy SPA pages — continue anyway
    }
    await page.waitForTimeout(3000);

    if (await isLoggedInToClassroom(page)) {
      await saveBrowserState(context);
      log?.info('session_save', 'Автологин Google успешен, сессия сохранена');
      logger.info('Auto-login successful, session saved');
      await closeBrowser(browser);
      await log?.flush();
      return { success: true };
    }

    // Fallback: autoLogin succeeded (URL was on classroom.google.com),
    // so session cookies are valid even if DOM hasn't fully rendered
    const finalUrl = page.url();
    logger.info({ url: finalUrl }, 'Post-login URL (DOM check failed, checking URL fallback)');

    if (finalUrl.includes('classroom.google.com') && !finalUrl.includes('accounts.google.com')) {
      logger.info({ url: finalUrl }, 'Classroom URL looks authenticated, saving session despite DOM check failure');
      await saveBrowserState(context);
      log?.info('session_save', 'Автологин Google: URL авторизован, сессия сохранена');
      await closeBrowser(browser);
      await log?.flush();
      return { success: true };
    }

    const screenshotUrl = await uploadDebugScreenshot(page, 'final-url-not-classroom');
    const details: Record<string, unknown> = {};
    if (screenshotUrl) details.screenshot_url = screenshotUrl;
    log?.error('auto_login', `Автологин Google: финальный URL не на Classroom: ${finalUrl}`, Object.keys(details).length > 0 ? details : undefined);
    await closeBrowser(browser);
    await log?.flush();
    return { success: false, error: `Автологин выполнен, но финальный URL: ${finalUrl}` };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error({ err }, 'Auto-login session capture failed');
    if (browser) {
      try { await closeBrowser(browser); } catch { /* already closed */ }
    }
    return { success: false, error: errorMessage };
  }
}

/**
 * Validate the saved session by opening a headless browser,
 * navigating to Classroom, and checking if we get redirected to login.
 * Returns 'valid' if session works, 'invalid' if redirect to login, 'no_session' if no state file.
 */
export async function validateSession(): Promise<'valid' | 'invalid' | 'no_session'> {
  if (!existsSync(config.playwright.statePath)) {
    logger.info('No session file found');
    return 'no_session';
  }

  let browser: Browser | undefined;

  try {
    // Launch headless for validation
    const launched = await launchBrowser(true);
    browser = launched.browser;
    const { context } = launched;
    const page = await context.newPage();

    await page.goto('https://classroom.google.com', {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });

    // Wait for page to settle (redirects, JS rendering)
    await page.waitForTimeout(5000);

    const loggedIn = await isLoggedInToClassroom(page);
    await closeBrowser(browser);

    if (!loggedIn) {
      logger.info('Session is invalid');
      return 'invalid';
    }

    logger.info('Session is valid');
    return 'valid';
  } catch (err) {
    logger.error({ err }, 'Session validation failed');
    if (browser) await closeBrowser(browser);
    return 'invalid';
  }
}
