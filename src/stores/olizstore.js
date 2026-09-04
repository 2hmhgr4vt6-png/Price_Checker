/**
 * Oliz Store - Apple/electronics retailer on Shopify.
 *
 * Two paths, in order:
 *   1. Shopify's public predictive-search JSON, which needs no key and is fast;
 *   2. rendering the search page in a real browser.
 *
 * The fallback exists because Oliz sits behind Cloudflare bot protection that
 * answers datacentre IPs with "Sorry, you have been blocked" (HTTP 403) for
 * every path including sitemap.xml — while its robots.txt permits crawling
 * everything outside /checkout. From a normal Nepali connection path 1 works;
 * from a cloud host it usually does not, and a real browser is the honest way
 * through rather than trying to defeat the challenge.
 */
import { searchShopify } from './platforms.js';
import { renderListings } from './rendered.js';

const ORIGIN = 'https://www.olizstore.com';

export default {
  id: 'olizstore',
  name: 'Oliz Store',
  homepage: ORIGIN,
  kind: 'retailer',
  // Rendering is a fallback here, not a requirement, so this store is not
  // flagged needsBrowser: path 1 alone is enough where it is reachable.

  async search(query, { limit = 12, timeout } = {}) {
    try {
      const listings = await searchShopify(ORIGIN, query, { limit, timeout });
      if (listings.length) return listings;
    } catch (error) {
      // Anything other than the bot block is a genuine failure worth reporting
      // as-is; only a 403 is worth spending a browser render on.
      if (!/HTTP 403/.test(error.message)) throw error;
    }

    return renderListings(`${ORIGIN}/search?q=${encodeURIComponent(query)}`, {
      limit,
      waitFor: 'a[href*="/products/"]',
    });
  },
};
