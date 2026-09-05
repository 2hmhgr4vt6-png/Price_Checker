/**
 * Cinema ticket-price registry.
 *
 * Nepali cinemas price by day band and show slot rather than per film, and
 * publish that as a table, so "compare movie tickets" here means: which
 * cinema is cheapest for the kind of show you want.
 *
 * ADDING A CINEMA: one entry below. If it server-renders its price table,
 * that is a plain fetch; if it is a JavaScript app (QFX ships a 3 KB shell),
 * use renderedCinema, which needs `npm run setup:browser`.
 */
import { getText } from '../http.js';
import { renderHtml, browserAvailable } from '../browser.js';
import { parsePriceTables } from './priceTable.js';
import bigmovies from './bigmovies.js';

/** A cinema whose price page only exists after JavaScript runs. */
function renderedCinema({ id, name, homepage, pricePage, city }) {
  return {
    id,
    name,
    homepage,
    city,
    needsBrowser: true,

    async listPrices({ timeout } = {}) {
      if (!(await browserAvailable())) {
        throw new Error('Needs headless rendering - run: npm run setup:browser');
      }
      const html = await renderHtml(pricePage ?? homepage, { timeout });
      return parsePriceTables(html ?? '');
    },
  };
}

/** A cinema that server-renders its price page. */
function httpCinema({ id, name, homepage, pricePage, city }) {
  return {
    id,
    name,
    homepage,
    city,
    async listPrices({ timeout } = {}) {
      return parsePriceTables(await getText(pricePage ?? homepage, { timeout }));
    },
  };
}

export const cinemas = [
  bigmovies,
  renderedCinema({
    id: 'qfx',
    name: 'QFX Cinemas',
    homepage: 'https://www.qfxcinemas.com',
    pricePage: 'https://www.qfxcinemas.com/ticket-price',
    city: 'Kathmandu and nationwide',
  }),
  httpCinema({
    id: 'onecinemas',
    name: 'One Cinemas',
    homepage: 'https://onecinemas.com.np',
    city: 'Kathmandu',
  }),
];

export const enabledCinemas = () =>
  cinemas.filter((cinema) => (typeof cinema.enabled === 'boolean' ? cinema.enabled : true));
