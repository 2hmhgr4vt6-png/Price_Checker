/**
 * Optional headless-browser rendering.
 *
 * Several of Nepal's biggest shops (Hukut, SmartDoko, ITTI, Hamrobazar) are
 * client-rendered single-page apps: their search HTML contains no prices at
 * all, and their XHR APIs are private or token-gated. A plain fetch can never
 * see those listings, which is why a naive scraper only ever shows Daraz.
 *
 * So those adapters render the real search page in headless Chromium and read
 * the listings out of the finished DOM - the same thing a shopper's browser
 * does. Playwright is an OPTIONAL dependency: without it, every
 * browser-backed store reports itself unavailable and is skipped, and the rest
 * of the site works exactly as before.
 *
 *   npm run setup:browser     # installs playwright + chromium
 */

let playwrightModule;     // resolved once: the module, or null if not installed
let browserPromise;       // one shared Chromium for the whole process
let launchFailure = null; // remembered so we fail fast instead of retrying

const NAV_TIMEOUT_MS = 25000;
const SETTLE_MS = 2000;

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function loadPlaywright() {
  if (playwrightModule !== undefined) return playwrightModule;
  try {
    playwrightModule = await import('playwright');
  } catch {
    playwrightModule = null;
  }
  return playwrightModule;
}

export async function browserAvailable() {
  return Boolean(await loadPlaywright()) && !launchFailure;
}

async function getBrowser() {
  if (launchFailure) throw launchFailure;

  if (!browserPromise) {
    const playwright = await loadPlaywright();
    if (!playwright) {
      throw new Error('Headless rendering unavailable - run: npm run setup:browser');
    }

    const launchOptions = { args: ['--disable-dev-shm-usage'] };

    // Honour an explicit Chromium path (useful in containers that ship their
    // own build) and an HTTPS proxy, which Chromium does not read from the
    // environment the way fetch() does.
    if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
    if (process.env.HTTPS_PROXY) {
      launchOptions.proxy = { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' };
    }

    browserPromise = playwright.chromium.launch(launchOptions).catch((error) => {
      const detail = error.message.split('\n')[0];
      // `npm install` pulls in the Playwright package (an optional dependency)
      // but not the browser binary, so this is the common first-run case.
      launchFailure = /Executable doesn't exist|Please run the following command/i.test(error.message)
        ? new Error('Chromium is not installed - run: npm run setup:browser')
        : new Error(`Could not start headless Chromium: ${detail}`);
      browserPromise = undefined;
      throw launchFailure;
    });
  }

  return browserPromise;
}

/**
 * Render `url` and run `extract` inside the page.
 *
 * @param {string} url             search URL to open
 * @param {Function} extract       runs in the browser; must return plain JSON
 * @param {object} [options]
 * @param {string} [options.waitFor]  CSS selector to wait for before extracting
 * @param {number} [options.timeout]
 * @returns {Promise<any>} whatever `extract` returned
 */
export async function renderAndExtract(url, extract, { waitFor, timeout = NAV_TIMEOUT_MS } = {}) {
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: UA,
    locale: 'en-NP',
    viewport: { width: 1366, height: 1400 },
  });
  const page = await context.newPage();

  // Images and fonts are the bulk of a Nepali storefront's payload and none of
  // it affects the text we read, so drop them: renders finish far quicker.
  await page.route('**/*', (route) => {
    const type = route.request().resourceType();
    return type === 'image' || type === 'font' || type === 'media'
      ? route.abort()
      : route.continue();
  });

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout });

    if (waitFor) {
      // A missing selector is not fatal - the generic extractor may still find
      // listings, so fall through to the settle delay instead of throwing.
      await page.waitForSelector(waitFor, { timeout: 8000 }).catch(() => {});
    }
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(SETTLE_MS);

    return await page.evaluate(extract);
  } finally {
    await context.close().catch(() => {});
  }
}

export async function closeBrowser() {
  if (!browserPromise) return;
  const browser = await browserPromise.catch(() => null);
  browserPromise = undefined;
  await browser?.close().catch(() => {});
}
