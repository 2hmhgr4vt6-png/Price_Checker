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
 *
 * Three fetch mechanisms are in play, in order of preference:
 *   1. a store's own JSON search API           (daraz)
 *   2. server-rendered HTML                    (evostore, sastodeal, neoshop24, …)
 *   3. headless rendering of a JS-only SPA     (hukut, smartdoko, itti, hamrobazar)
 * Mechanism 3 needs `npm run setup:browser`; without it those stores are
 * skipped and everything else still works.
 */
import daraz from './daraz.js';
import evostore from './evostore.js';
import sastodeal from './sastodeal.js';
import olizstore from './olizstore.js';
import neoshop24 from './neoshop24.js';
import bananamobile from './bananamobile.js';
import gadgetbyte from './pricereference.js';
import { hukut, smartdoko, itti, hamrobazar } from './spa.js';

export const stores = [
  // Direct API / server-rendered HTML - work anywhere the site is reachable.
  daraz,
  evostore,
  sastodeal,
  olizstore,
  neoshop24,
  bananamobile,
  // Headless-rendered SPAs.
  hukut,
  smartdoko,
  itti,
  hamrobazar,
  // Published "official price" reference, not a shop.
  gadgetbyte,
];

export const enabledStores = () =>
  stores.filter((store) => (typeof store.enabled === 'boolean' ? store.enabled : true));

export const storeById = (id) => stores.find((store) => store.id === id) ?? null;
