/**
 * Shared implementation for stores that only exist as client-rendered SPAs.
 *
 * Rather than hand-write brittle CSS selectors per shop (they change without
 * notice and silently produce nothing), extraction is heuristic and runs in
 * two passes inside the rendered page:
 *
 *   1. schema.org Product data, if the shop publishes it - the reliable path;
 *   2. otherwise, every link whose visible text contains both a price and a
 *      plausible product title, which is exactly how a shopper reads a
 *      results grid.
 *
 * Both passes read only what the finished page displays, so a shop that shows
 * nothing yields nothing - it is never filled in with a guess.
 */
import { renderAndExtract, browserAvailable } from '../browser.js';
import { parsePrice } from '../price.js';

/** Runs in the browser. Must be self-contained - no imports, no closures. */
/* c8 ignore start - executed inside Chromium, not in the node test process */
function extractListings() {
  const PRICE_RE = /(?:rs\.?|npr|रु)\s*[\d,]+(?:\.\d+)?/i;
  const clean = (text) => (text || '').replace(/\s+/g, ' ').trim();
  const absolute = (href) => { try { return new URL(href, location.origin).href; } catch { return null; } };

  const found = [];
  const seen = new Set();
  const push = (row) => {
    if (!row.productName || !row.priceText || !row.url) return;
    const key = row.url;
    if (seen.has(key)) return;
    seen.add(key);
    found.push(row);
  };

  const availabilityFrom = (text) => {
    if (/out of stock|sold out|stock out|unavailable/i.test(text)) return 'out_of_stock';
    if (/in stock|available/i.test(text)) return 'in_stock';
    return 'unknown';
  };

  // ---- pass 1: schema.org Product / ItemList -------------------------------
  const walk = (node, visit) => {
    if (Array.isArray(node)) return node.forEach((entry) => walk(entry, visit));
    if (!node || typeof node !== 'object') return;
    visit(node);
    for (const value of Object.values(node)) walk(value, visit);
  };

  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    let data;
    try { data = JSON.parse(script.textContent); } catch { continue; }

    walk(data, (node) => {
      const types = [].concat(node['@type'] ?? []);
      if (!types.includes('Product')) return;

      const offer = [].concat(node.offers ?? [])[0] ?? {};
      const price = offer.price ?? offer.lowPrice ?? node.price;
      if (price == null) return;

      const currency = offer.priceCurrency ?? 'NPR';
      push({
        productName: clean(node.name),
        priceText: `${currency} ${price}`,
        url: absolute(offer.url ?? node.url ?? location.href),
        availability: /InStock/i.test(offer.availability ?? '')
          ? 'in_stock'
          : /OutOfStock|SoldOut/i.test(offer.availability ?? '')
            ? 'out_of_stock'
            : 'unknown',
        source: 'json-ld',
      });
    });
  }

  if (found.length) return found;

  // ---- pass 2: priced links in the rendered grid ---------------------------
  for (const anchor of document.querySelectorAll('a[href]')) {
    const text = clean(anchor.innerText);
    if (text.length < 10 || text.length > 400) continue;

    const priceMatch = text.match(PRICE_RE);
    if (!priceMatch) continue;

    // A product card links to a product page, not to a category or a filter.
    const href = anchor.getAttribute('href');
    if (!href || href.startsWith('#') || /^(javascript|mailto|tel):/i.test(href)) continue;

    // The title is the longest line that is not itself the price - card
    // layouts put name, price and badges on separate lines.
    const lines = (anchor.innerText || '')
      .split('\n')
      .map(clean)
      .filter((line) => line.length > 3 && !PRICE_RE.test(line) && !/^-?\d+%$/.test(line));
    const productName = lines.sort((a, b) => b.length - a.length)[0];
    if (!productName || productName.length < 6) continue;

    push({
      productName,
      priceText: priceMatch[0],
      url: absolute(href),
      availability: availabilityFrom(text),
      source: 'dom',
    });
  }

  return found;
}
/* c8 ignore stop */

/**
 * Build a store adapter backed by headless rendering.
 *
 * @param {object} config
 * @param {string} config.id
 * @param {string} config.name
 * @param {string} config.homepage
 * @param {(query: string) => string} config.searchUrl
 * @param {string} [config.waitFor]  selector to wait for before extracting
 * @param {string} [config.kind]
 * @param {string} [config.note]     shown on every row from this store
 */
export function renderedStore({ id, name, homepage, searchUrl, waitFor, kind = 'retailer', note = null }) {
  return {
    id,
    name,
    homepage,
    kind,
    needsBrowser: true,

    search(query, { limit = 12, timeout } = {}) {
      return renderListings(searchUrl(query), { limit, timeout, waitFor, note });
    },
  };
}

/**
 * Render `searchUrl` and return normalised listings. Used both by
 * `renderedStore` and by adapters that prefer HTTP but fall back to a real
 * browser when a shop's CDN blocks non-browser clients.
 */
export async function renderListings(searchUrl, { limit = 12, timeout, waitFor, note = null } = {}) {
  if (!(await browserAvailable())) {
    throw new Error('Needs headless rendering - run: npm run setup:browser');
  }

  const listings = await renderAndExtract(searchUrl, extractListings, { waitFor, timeout });

  // RENDER_DEBUG=1 prints what the browser actually saw, which is the quickest
  // way to tell "the shop returned nothing" apart from "our extraction missed
  // it" when a storefront changes its markup.
  if (process.env.RENDER_DEBUG) {
    console.log(`[render] ${searchUrl} -> ${listings?.length ?? 0} raw listings`);
    for (const listing of (listings ?? []).slice(0, 5)) {
      console.log(`[render]   (${listing.source}) ${listing.priceText}  ${String(listing.productName).slice(0, 60)}`);
    }
  }

  return (listings ?? [])
    .map((listing) => {
      const price = parsePrice(listing.priceText, 'NPR');
      if (!price) return null;
      return {
        productName: listing.productName,
        ...price,
        url: listing.url,
        availability: listing.availability ?? 'unknown',
        note,
      };
    })
    .filter(Boolean)
    .slice(0, limit);
}

// Exported for the extractor tests, which run it against a fixture page.
export const __extractListings = extractListings;
