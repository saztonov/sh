import type { Browser, BrowserContext, Page } from 'playwright';
import { existsSync } from 'node:fs';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { supabase } from '../db.js';
import { launchBrowser, saveBrowserState, closeBrowser } from './browser.js';

const eljurStatePath = config.eljur.statePath;

/**
 * Build the Eljur base URL from the vendor subdomain.
 */
function eljurBaseUrl(): string {
  return `https://${config.eljur.vendor}.eljur.ru`;
}

/**
 * Check if a URL belongs to an authenticated Eljur page
 * (i.e. on the vendor subdomain and NOT on the /authorize page).
 */
function isEljurAuthenticatedUrl(url: string): boolean {
  const vendor = config.eljur.vendor;
  if (!vendor) return false;
  return url.includes(`${vendor}.eljur.ru`) && !url.includes('/authorize');
}

/**
 * Check if the user is logged in to Eljur.
 * Not logged in if on /authorize page or redirected there.
 * Logged in if on the vendor subdomain with dashboard content.
 */
async function isLoggedInToEljur(page: Page): Promise<boolean> {
  const url = page.url();

  // On the authorize page — not logged in
  if (url.includes('/authorize')) {
    logger.debug({ url }, 'Eljur login check: on /authorize — not logged in');
    return false;
  }

  // Must be on the vendor subdomain
  const vendor = config.eljur.vendor;
  if (!vendor || !url.includes(`${vendor}.eljur.ru`)) {
    logger.debug({ url }, 'Eljur login check: not on vendor subdomain — not logged in');
    return false;
  }

  // Check for authenticated content
  try {
    const contentInfo = await page.evaluate(() => {
      const nav = document.querySelector('nav, [class*="menu"], [class*="sidebar"], [class*="header"]');
      const bodyText = document.body?.innerText ?? '';
      const links = document.querySelectorAll('a[href]');
      return {
        hasNav: !!nav,
        bodyTextLength: bodyText.length,
        linksCount: links.length,
      };
    });

    logger.debug({ url, ...contentInfo }, 'Eljur login check: DOM content info');

    if (contentInfo.hasNav && contentInfo.bodyTextLength > 200) return true;
    if (contentInfo.linksCount >= 5 && contentInfo.bodyTextLength > 300) return true;

    return false;
  } catch (err) {
    logger.debug({ err }, 'Eljur login check: page.evaluate failed');
    return false;
  }
}

/**
 * Check the database for an eljur_force_save request.
 */
async function checkForEljurForceSave(): Promise<string | null> {
  try {
    const { data } = await supabase
      .from('scrape_runs')
      .select('id')
      .eq('status', 'eljur_force_save')
      .order('started_at', { ascending: true })
      .limit(1);

    return data && data.length > 0 ? (data[0].id as string) : null;
  } catch {
    return null;
  }
}

/**
 * Attempt automatic Eljur login using credentials from environment.
 */
async function eljurAutoLogin(page: Page, vendor: string, login: string, password: string): Promise<boolean> {
  try {
    logger.info({ vendor, login }, 'Attempting automatic Eljur login...');

    await page.goto(`https://${vendor}.eljur.ru/authorize`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });

    // Wait for the login form to render (dynamic AJAX loading)
    const loginInput = await page.waitForSelector(
      'input[name="login"], input[name="username"], input[type="text"][class*="login"]',
      { timeout: 15_000 },
    );
    if (!loginInput) {
      logger.warn('Eljur login input not found');
      return false;
    }

    await loginInput.fill(login);
    logger.info('Eljur login entered');

    // Fill password
    const passwordInput = await page.waitForSelector('input[type="password"]', { timeout: 10_000 });
    if (!passwordInput) {
      logger.warn('Eljur password input not found');
      return false;
    }

    await passwordInput.fill(password);
    logger.info('Eljur password entered');

    // Click submit button
    const submitButton = await page.waitForSelector(
      'button[type="submit"], input[type="submit"], button:has-text("Войти")',
      { timeout: 10_000 },
    );
    if (submitButton) {
      await submitButton.click();
      logger.info('Clicked Eljur login button');
    } else {
      // Fallback: press Enter
      await passwordInput.press('Enter');
      logger.info('Pressed Enter to submit Eljur login form');
    }

    // Wait for redirect away from /authorize
    try {
      await page.waitForURL((url) => !url.toString().includes('/authorize'), { timeout: 30_000 });
      logger.info({ url: page.url() }, 'Redirected after Eljur auto-login');
      return true;
    } catch {
      const currentUrl = page.url();
      logger.warn({ url: currentUrl }, 'Did not redirect from /authorize — possible error');
      return false;
    }
  } catch (err) {
    logger.error({ err }, 'Eljur auto-login failed');
    return false;
  }
}

/**
 * Capture an Eljur session interactively.
 * Opens visible browser, navigates to Eljur, waits for user to log in (up to 10 min).
 */
export async function captureEljurSession(): Promise<{ success: boolean; error?: string }> {
  const vendor = config.eljur.vendor;
  if (!vendor) {
    return { success: false, error: 'ELJUR_VENDOR не настроен' };
  }

  let browser: Browser | undefined;

  try {
    const launched = await launchBrowser(false, eljurStatePath);
    browser = launched.browser;
    const { context } = launched;
    const page = await context.newPage();

    let sessionSaved = false;
    let browserDisconnected = false;

    browser.on('disconnected', () => {
      browserDisconnected = true;
      logger.info('Eljur browser disconnected (closed by user)');
    });

    // Eagerly save session on navigation to authenticated Eljur URL
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        const frameUrl = frame.url();
        if (isEljurAuthenticatedUrl(frameUrl)) {
          context.storageState({ path: eljurStatePath })
            .then(() => {
              sessionSaved = true;
              logger.info({ url: frameUrl }, 'Eljur session saved (eager save on navigation)');
            })
            .catch(() => { /* Context may already be closed */ });
        }
      }
    });

    logger.info('Navigating to Eljur for session capture...');
    await page.goto(`${eljurBaseUrl()}/authorize`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    await page.waitForTimeout(3000);

    // Check if already logged in
    if (await isLoggedInToEljur(page)) {
      logger.info('Already logged in to Eljur');
      await saveBrowserState(context, eljurStatePath);
      await closeBrowser(browser);
      return { success: true };
    }

    // Wait for manual login (up to 10 minutes)
    logger.info('Not logged in to Eljur — waiting for manual login (10 min timeout)...');

    const deadline = Date.now() + 600_000;
    let iteration = 0;

    while (Date.now() < deadline && !browserDisconnected) {
      try {
        await page.waitForTimeout(3000);
      } catch {
        break;
      }

      iteration++;

      if (browserDisconnected) break;

      // Check for force_save request
      const forceSaveId = await checkForEljurForceSave();
      if (forceSaveId) {
        logger.info({ forceSaveId }, 'Eljur force save request detected');
        try {
          await saveBrowserState(context, eljurStatePath);
          sessionSaved = true;
          await supabase
            .from('scrape_runs')
            .update({ status: 'success', finished_at: new Date().toISOString() })
            .eq('id', forceSaveId);
          logger.info('Eljur session force-saved successfully');
          if (!browserDisconnected) await closeBrowser(browser);
          return { success: true };
        } catch (err) {
          logger.error({ err }, 'Eljur force save failed');
        }
      }

      // If eager save already captured session, we're done
      if (sessionSaved) {
        try { await saveBrowserState(context, eljurStatePath); } catch { /* */ }
        logger.info('Eljur login detected via navigation, session saved');
        if (!browserDisconnected) await closeBrowser(browser);
        return { success: true };
      }

      // Check via page content
      try {
        if (await isLoggedInToEljur(page)) {
          await saveBrowserState(context, eljurStatePath);
          sessionSaved = true;
          logger.info('Eljur login confirmed via content check, session saved');
          if (!browserDisconnected) await closeBrowser(browser);
          return { success: true };
        }
      } catch {
        break;
      }
    }

    if (sessionSaved) {
      if (!browserDisconnected) {
        try { await closeBrowser(browser); } catch { /* */ }
      }
      return { success: true };
    }

    if (browserDisconnected) {
      return { success: false, error: 'Браузер был закрыт до завершения входа. Попробуйте ещё раз.' };
    }

    logger.warn('Eljur session capture timed out after 10 minutes');
    await closeBrowser(browser);
    return { success: false, error: 'Время ожидания истекло (10 минут). Попробуйте ещё раз.' };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error({ err }, 'Eljur session capture failed');
    if (browser) {
      try { await closeBrowser(browser); } catch { /* */ }
    }
    return { success: false, error: errorMessage };
  }
}

/**
 * Capture Eljur session using automatic login with env credentials.
 */
export async function captureEljurSessionAuto(): Promise<{ success: boolean; error?: string }> {
  const { vendor, login, password } = config.eljur;

  if (!vendor || !login || !password) {
    return { success: false, error: 'ELJUR_VENDOR, ELJUR_LOGIN и ELJUR_PASSWORD не настроены' };
  }

  let browser: Browser | undefined;

  try {
    const launched = await launchBrowser(false, eljurStatePath);
    browser = launched.browser;
    const { context } = launched;
    const page = await context.newPage();

    logger.info('Navigating to Eljur for auto-login...');
    await page.goto(`${eljurBaseUrl()}/authorize`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    await page.waitForTimeout(3000);

    // Check if already logged in
    if (await isLoggedInToEljur(page)) {
      logger.info('Already logged in to Eljur');
      await saveBrowserState(context, eljurStatePath);
      await closeBrowser(browser);
      return { success: true };
    }

    // Attempt auto-login
    const loginSuccess = await eljurAutoLogin(page, vendor, login, password);

    if (!loginSuccess) {
      await closeBrowser(browser);
      return { success: false, error: 'Автоматический вход в Элжур не удался. Возможные причины: CAPTCHA, неверные данные.' };
    }

    // Wait for page to fully load
    await page.waitForTimeout(3000);

    if (await isLoggedInToEljur(page)) {
      await saveBrowserState(context, eljurStatePath);
      logger.info('Eljur auto-login successful, session saved');
      await closeBrowser(browser);
      return { success: true };
    }

    await closeBrowser(browser);
    return { success: false, error: 'Автологин выполнен, но страница Элжур не загрузилась.' };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error({ err }, 'Eljur auto-login session capture failed');
    if (browser) {
      try { await closeBrowser(browser); } catch { /* */ }
    }
    return { success: false, error: errorMessage };
  }
}

/**
 * Validate the saved Eljur session by checking if we get redirected to /authorize.
 */
export async function validateEljurSession(): Promise<'valid' | 'invalid' | 'no_session'> {
  if (!existsSync(eljurStatePath)) {
    logger.info('No Eljur session file found');
    return 'no_session';
  }

  const vendor = config.eljur.vendor;
  if (!vendor) {
    logger.info('ELJUR_VENDOR not configured');
    return 'no_session';
  }

  let browser: Browser | undefined;

  try {
    const launched = await launchBrowser(true, eljurStatePath);
    browser = launched.browser;
    const { context } = launched;
    const page = await context.newPage();

    await page.goto(`https://${vendor}.eljur.ru`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });

    await page.waitForTimeout(5000);

    const loggedIn = await isLoggedInToEljur(page);
    await closeBrowser(browser);

    if (!loggedIn) {
      logger.info('Eljur session is invalid');
      return 'invalid';
    }

    logger.info('Eljur session is valid');
    return 'valid';
  } catch (err) {
    logger.error({ err }, 'Eljur session validation failed');
    if (browser) await closeBrowser(browser);
    return 'invalid';
  }
}
