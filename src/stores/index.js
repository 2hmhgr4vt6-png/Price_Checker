/**
 * Store registry.
 *
 * ADDING A STORE: drop a module in this folder that default-exports
 *   { id, name, homepage, kind, search(query, { limit, timeout }) -> listing[] }
 * and add it to the array below. A listing is
 *   { productName, amount, currency, url, image?, availability, seller?, note? }
 * `availability` is 'in_stock' | 'out_of_stock' | 'unknown'.
 *
 * An adapter that throws, times out or returns [] is reported as skipped and
 * never contributes a row, which is what keeps fabricated prices out of the UI.
 * Swapping in a real scraping service or an official store API later means
 * rewriting one adapter's `search` - nothing else changes.
 */
import daraz from './daraz.js';
import sastodeal from './sastodeal.js';
import olizstore from './olizstore.js';
import neoshop24 from './neoshop24.js';
import bananamobile from './bananamobile.js';
import hamrobazar from './hamrobazar.js';

export const stores = [daraz, sastodeal, olizstore, neoshop24, bananamobile, hamrobazar];

export const enabledStores = () =>
  stores.filter((store) => (typeof store.enabled === 'boolean' ? store.enabled : true));

export const storeById = (id) => stores.find((store) => store.id === id) ?? null;
