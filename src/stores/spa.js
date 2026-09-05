/**
 * Nepali stores that are client-rendered single-page apps with no usable HTTP
 * endpoint. (Hukut also renders client-side but exposes a public JSON API, so
 * it lives in ./hukut.js and needs no browser - always worth checking for one
 * before adding a store here.)
 *
 * Each of these shows nothing at all to a plain HTTP fetch - their search
 * pages ship an empty shell and load listings over private XHR endpoints - so
 * they are rendered in headless Chromium instead. See ../browser.js for why
 * that is optional, and ./rendered.js for how listings are read back out.
 *
 * Search URLs come from each site's own schema.org SearchAction template where
 * it publishes one, so they follow the shop rather than being guessed.
 */
import { renderedStore } from './rendered.js';

/**
 * General and household retailers, which is where searches outside
 * electronics land: groceries, kitchenware, tools, sports kit, gas cylinders.
 * Daraz covers those categories too, but a single marketplace is not a
 * comparison, and these are the largest Nepali shops that stock them.
 */
export const bhatbhateni = renderedStore({
  id: 'bhatbhateni',
  name: 'Bhatbhateni Online',
  homepage: 'https://bhatbhateni.com.np',
  searchUrl: (query) => `https://bhatbhateni.com.np/search?q=${encodeURIComponent(query)}`,
});

export const muncha = renderedStore({
  id: 'muncha',
  name: 'Muncha',
  homepage: 'https://muncha.com',
  // Its own search form posts these three, and the code is the only one that
  // varies per query.
  searchUrl: (query) =>
    `https://muncha.com/Shop/Search?merchantID=1&CategoryID=0&q=${encodeURIComponent(query)}`,
});

export const smartdoko = renderedStore({
  id: 'smartdoko',
  name: 'SmartDoko',
  homepage: 'https://smartdoko.com',
  searchUrl: (query) => `https://smartdoko.com/search?q=${encodeURIComponent(query)}`,
  waitFor: 'a[href*="/product"]',
});

/**
 * ITTI is the weakest of these. Its own search API
 * (`/api-proxy/product-list?type=search`) is reachable but returns
 * `selling_price: 0` for every row, which is why its unrendered markup shows
 * "रु NaN" - the shop itself displays no price on search results. Rendering is
 * kept because per-product prices do exist and the page may fill them in, but
 * expect this store to contribute nothing for many queries. That is a property
 * of the shop, not a bug here.
 */
export const itti = renderedStore({
  id: 'itti',
  name: 'ITTI Computer World',
  homepage: 'https://itti.com.np',
  searchUrl: (query) => `https://itti.com.np/search?q=${encodeURIComponent(query)}`,
});

export const hamrobazar = renderedStore({
  id: 'hamrobazar',
  name: 'Hamrobazar',
  homepage: 'https://hamrobazaar.com',
  // Published SearchAction: /search/product?q={search_term_string}
  searchUrl: (query) => `https://hamrobazaar.com/search/product?q=${encodeURIComponent(query)}`,
  kind: 'classifieds',
  note: 'Second-hand / classifieds listing',
});
