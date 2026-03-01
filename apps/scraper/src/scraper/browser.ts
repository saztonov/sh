import { chromium, type Browser, type BrowserContext } from 'playwright';
import { existsSync } from 'node:fs';
import { config } from '../config.js';
import { logger } from '../logger.js';

/**
 * Launch a Chromium browser and create a context with saved authentication state.
 * Returns both the browser and context so we can save state and close them later.
 */
export async function launchBrowser(): Promise<{
  browser: Browser;
  context: BrowserContext;
}> {
  logger.info(
    { headless: config.playwright.headless, statePath: config.playwright.statePath },
    'Launching browser',
  );

  const browser = await chromium.launch({
    headless: config.playwright.headless,
  });

  const contextOptions: Parameters<Browser['newContext']>[0] = {};

  // Load saved storage state if it exists
  if (existsSync(config.playwright.statePath)) {
    contextOptions.storageState = config.playwright.statePath;
    logger.info('Loaded saved browser state');
  } else {
    logger.warn(
      { path: config.playwright.statePath },
      'No saved browser state found -- session may require manual login',
    );
  }

  const context = await browser.newContext(contextOptions);

  return { browser, context };
}

/**
 * Save the current browser context storage state (cookies, localStorage)
 * to disk so subsequent runs can reuse the authenticated session.
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
