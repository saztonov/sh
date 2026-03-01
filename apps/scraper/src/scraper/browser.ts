import { chromium, type Browser, type BrowserContext } from 'playwright';
import { existsSync } from 'node:fs';
import { config } from '../config.js';
import { logger } from '../logger.js';

/**
 * Build launch options based on config.
 * Uses system Chrome/Edge via `channel`, or a custom executable path.
 */
function getLaunchOptions(headless: boolean) {
  const channel = config.playwright.channel;

  // Known channel names that Playwright supports directly
  const knownChannels = ['chrome', 'chrome-beta', 'chrome-dev', 'chrome-canary', 'msedge', 'msedge-beta', 'msedge-dev'];

  if (knownChannels.includes(channel)) {
    return { headless, channel };
  }

  // Treat as executable path (e.g. Yandex Browser)
  return { headless, executablePath: channel };
}

/**
 * Launch browser and create a context with saved authentication state.
 */
export async function launchBrowser(overrideHeadless?: boolean): Promise<{
  browser: Browser;
  context: BrowserContext;
}> {
  const headless = overrideHeadless ?? config.playwright.headless;

  logger.info(
    { headless, channel: config.playwright.channel, statePath: config.playwright.statePath },
    'Launching browser',
  );

  const browser = await chromium.launch(getLaunchOptions(headless));

  const contextOptions: Parameters<Browser['newContext']>[0] = {};

  // Load saved storage state if it exists
  if (existsSync(config.playwright.statePath)) {
    contextOptions.storageState = config.playwright.statePath;
    logger.info('Loaded saved browser state');
  } else {
    logger.warn(
      { path: config.playwright.statePath },
      'No saved browser state found',
    );
  }

  const context = await browser.newContext(contextOptions);

  return { browser, context };
}

/**
 * Save the current browser context storage state (cookies, localStorage).
 */
export async function saveBrowserState(context: BrowserContext): Promise<void> {
  await context.storageState({ path: config.playwright.statePath });
  logger.info({ path: config.playwright.statePath }, 'Saved browser state');
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
 * Check if the user is actually logged in to Google Classroom
 * by looking for course cards on the page (not just URL).
 * Google Classroom may show a "Sign in" button on classroom.google.com
 * without redirecting to accounts.google.com.
 */
async function isLoggedInToClassroom(page: import('playwright').Page): Promise<boolean> {
  // Check for course cards — these only appear when logged in
  const courseCards = await page.$$('div.GRvzhf.YVvGBb');
  if (courseCards.length > 0) return true;

  // Also check for the user avatar/profile button as a sign of being logged in
  const profileBtn = await page.$('a[aria-label*="Google Account"], img.gb_A, img.gb_za');
  if (profileBtn) return true;

  return false;
}

/**
 * Capture a Google Classroom session interactively.
 * Opens visible browser, navigates to Classroom, waits for user to log in (up to 10 min),
 * saves session, and closes the browser. Does NOT scrape any data.
 */
export async function captureSession(): Promise<{ success: boolean; error?: string }> {
  let browser: Browser | undefined;

  try {
    // Always launch visible (headless=false) for session capture
    const launched = await launchBrowser(false);
    browser = launched.browser;
    const { context } = launched;
    const page = await context.newPage();

    let sessionSaved = false;
    let browserDisconnected = false;

    // Track browser disconnect (user closes browser manually)
    browser.on('disconnected', () => {
      browserDisconnected = true;
    });

    // Eagerly save session whenever the page navigates to classroom.google.com
    // This ensures we capture cookies even if the user closes the browser right after login
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame() && frame.url().includes('classroom.google.com/u/0/')) {
        context.storageState({ path: config.playwright.statePath })
          .then(() => {
            sessionSaved = true;
            logger.info('Session saved (eager save on navigation to Classroom)');
          })
          .catch(() => {
            // Context may already be closed — ignore
          });
      }
    });

    logger.info('Navigating to Google Classroom for session capture...');
    await page.goto('https://classroom.google.com/u/0/h');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    // Check if already logged in by looking for actual classroom content
    if (await isLoggedInToClassroom(page)) {
      logger.info('Already logged in to Google Classroom');
      await saveBrowserState(context);
      await closeBrowser(browser);
      return { success: true };
    }

    // Not logged in — wait for user to complete login (up to 10 minutes)
    logger.info('Not logged in — waiting for manual login (10 min timeout)...');

    const deadline = Date.now() + 600_000; // 10 minutes
    let confirmedLoggedIn = false;

    while (Date.now() < deadline && !browserDisconnected) {
      try {
        await page.waitForTimeout(3000);
      } catch {
        // Browser was closed during waitForTimeout
        break;
      }

      if (browserDisconnected) break;

      try {
        if (await isLoggedInToClassroom(page)) {
          // Save session one more time with final state
          await saveBrowserState(context);
          sessionSaved = true;
          confirmedLoggedIn = true;
          logger.info('Login confirmed, session saved');
          break;
        }
      } catch {
        // Browser was closed during check
        break;
      }
    }

    // Determine result
    if (confirmedLoggedIn) {
      if (!browserDisconnected) {
        await closeBrowser(browser);
      }
      return { success: true };
    }

    if (browserDisconnected && sessionSaved) {
      // User closed browser, but we already saved session via framenavigated handler
      logger.info('Browser closed by user, but session was already saved');
      return { success: true };
    }

    if (browserDisconnected) {
      return { success: false, error: 'Браузер был закрыт до завершения входа. Попробуйте ещё раз — после входа дождитесь, пока в консоли появится сообщение о сохранении сессии.' };
    }

    // Timeout
    await closeBrowser(browser);
    return { success: false, error: 'Login timeout — browser was open for 10 minutes without successful login' };
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

    await page.goto('https://classroom.google.com/u/0/h', { timeout: 30_000 });
    await page.waitForLoadState('domcontentloaded');

    // Wait for page to settle (redirects, JS rendering)
    await page.waitForTimeout(5000);

    // Check URL first (may redirect to accounts.google.com)
    const isLoginPage = page.url().includes('accounts.google.com');
    if (isLoginPage) {
      await closeBrowser(browser);
      logger.info('Session is invalid — redirected to login');
      return 'invalid';
    }

    // Also check for actual classroom content
    const loggedIn = await isLoggedInToClassroom(page);
    await closeBrowser(browser);

    if (!loggedIn) {
      logger.info('Session is invalid — no classroom content found');
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
