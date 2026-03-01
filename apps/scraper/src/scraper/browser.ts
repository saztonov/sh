import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
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
 * Check if the user is logged in to Google Classroom.
 * Does NOT rely on CSS class names (Google changes them frequently).
 * Instead checks:
 * 1. URL is on classroom.google.com (not accounts.google.com or landing page)
 * 2. Page has loaded meaningful content (not just a sign-in shell)
 */
async function isLoggedInToClassroom(page: Page): Promise<boolean> {
  const url = page.url();

  // Definitely not logged in if on Google login page
  if (url.includes('accounts.google.com')) return false;

  // Must be on an authenticated Classroom URL
  if (!url.includes('classroom.google.com/u/')) return false;

  // Check that the page has actual content by evaluating in browser context
  // Logged-in Classroom has a navigation bar and main content area
  try {
    const hasContent = await page.evaluate(() => {
      // The authenticated Classroom page has a header bar with navigation
      // and a main content area. The sign-in landing page is mostly empty.
      // Check for multiple signs of being logged in:

      // 1. Any link that points to /u/0/ paths (class links, nav links)
      const internalLinks = document.querySelectorAll('a[href*="/u/0/"]');
      if (internalLinks.length >= 3) return true;

      // 2. Main navigation/app bar is present (role="navigation" or role="banner")
      const nav = document.querySelector('[role="navigation"], [role="banner"]');
      const main = document.querySelector('[role="main"], main');
      if (nav && main) return true;

      // 3. Check body has substantial content (not just a sign-in button)
      const bodyText = document.body?.innerText ?? '';
      if (bodyText.length > 500) return true;

      return false;
    });
    return hasContent;
  } catch {
    return false;
  }
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
      logger.info('Browser disconnected (closed by user)');
    });

    // Eagerly save session whenever the page navigates to an authenticated Classroom URL.
    // This fires immediately on redirect from accounts.google.com back to classroom,
    // capturing cookies even if the user closes the browser right after.
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame() && frame.url().includes('classroom.google.com/u/0/')) {
        context.storageState({ path: config.playwright.statePath })
          .then(() => {
            sessionSaved = true;
            logger.info({ url: frame.url() }, 'Session saved (eager save on navigation to Classroom)');
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

    // Check if already logged in
    if (await isLoggedInToClassroom(page)) {
      logger.info('Already logged in to Google Classroom');
      await saveBrowserState(context);
      await closeBrowser(browser);
      return { success: true };
    }

    // Not logged in — wait for user to complete login (up to 10 minutes)
    logger.info('Not logged in — waiting for manual login (10 min timeout)...');

    const deadline = Date.now() + 600_000; // 10 minutes

    while (Date.now() < deadline && !browserDisconnected) {
      try {
        await page.waitForTimeout(3000);
      } catch {
        break; // Browser was closed during wait
      }

      if (browserDisconnected) break;

      // If eager save already captured session, we're done
      if (sessionSaved) {
        // Do one final save to get the most up-to-date state
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
        break; // Browser was closed during check
      }
    }

    // Loop ended — determine result

    if (sessionSaved) {
      // Session was captured (via eager save or content check) even though loop ended
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
