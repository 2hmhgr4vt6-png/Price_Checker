/**
 * Big Movies - Kathmandu cinema chain.
 *
 * Publishes its full ticket-price table as server-rendered HTML, so this
 * needs no browser: fetch the page, read the table.
 */
import { getText } from '../http.js';
import { parsePriceTables } from './priceTable.js';

const ORIGIN = 'https://bigmovies.com.np';

export default {
  id: 'bigmovies',
  name: 'Big Movies',
  homepage: ORIGIN,
  city: 'Kathmandu',

  async listPrices({ timeout } = {}) {
    const html = await getText(`${ORIGIN}/ticket-price`, { timeout });
    return parsePriceTables(html);
  },
};
