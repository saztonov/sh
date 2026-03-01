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

    logger.info('Navigating to Google Classroom for session capture...');
    await page.goto('https://classroom.google.com/u/0/h');
    await page.waitForLoadState('domcontentloaded');

    // Check if already logged in
    if (!page.url().includes('accounts.google.com')) {
      logger.info('Already logged in to Google Classroom');
      await saveBrowserState(context);
      await closeBrowser(browser);
      return { success: true };
    }

    // Wait for user to complete login (up to 10 minutes)
    logger.info('Google login page detected — waiting for manual login (10 min timeout)...');

    try {
      await page.waitForURL('**/classroom.google.com/**', { timeout: 600_000 });
    } catch {
      await closeBrowser(browser);
      return { success: false, error: 'Login timeout — browser was open for 10 minutes without successful login' };
    }

    // Wait a bit for page to fully load after redirect
    await page.waitForTimeout(3000);

    logger.info('Login successful, saving session...');
    await saveBrowserState(context);
    await closeBrowser(browser);

    return { success: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error({ err }, 'Session capture failed');
    if (browser) await closeBrowser(browser);
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

    // Small wait for any redirects
    await page.waitForTimeout(2000);

    const isLoginPage = page.url().includes('accounts.google.com');
    await closeBrowser(browser);

    if (isLoginPage) {
      logger.info('Session is invalid — redirected to login');
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
