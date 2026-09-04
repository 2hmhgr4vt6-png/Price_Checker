/**
 * Nepali stores that are client-rendered single-page apps.
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

export const hukut = renderedStore({
  id: 'hukut',
  name: 'Hukut',
  homepage: 'https://hukut.com',
  // Published SearchAction: https://hukut.com/search/{search_term_string}
  searchUrl: (query) => `https://hukut.com/search/${encodeURIComponent(query)}`,
  waitFor: 'a[href*="/product"]',
});

export const smartdoko = renderedStore({
  id: 'smartdoko',
  name: 'SmartDoko',
  homepage: 'https://smartdoko.com',
  searchUrl: (query) => `https://smartdoko.com/search?q=${encodeURIComponent(query)}`,
  waitFor: 'a[href*="/product"]',
});

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
