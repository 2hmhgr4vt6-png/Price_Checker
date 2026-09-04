#!/usr/bin/env node
/**
 * Store reachability diagnostic:  npm run check:stores -- "iphone 17"
 *
 * Some Nepali storefronts sit behind bot protection or block traffic from
 * outside Nepal, and four of the biggest are JavaScript-only and need headless
 * rendering. Which adapters return data therefore depends on where the server
 * runs — run this to see what your network can actually reach before blaming
 * the app for a short results table.
 */
import { stores } from '../src/stores/index.js';
import { browserAvailable, closeBrowser } from '../src/browser.js';

const query = process.argv.slice(2).join(' ') || 'iphone';
const rendering = await browserAvailable();

console.log(`Checking ${stores.length} sources for "${query}"`);
console.log(`Headless rendering: ${rendering ? 'available' : 'NOT installed (run npm run setup:browser)'}\n`);

for (const store of stores) {
  const enabled = typeof store.enabled === 'boolean' ? store.enabled : true;
  if (!enabled) {
    console.log(`- ${store.name.padEnd(20)} skipped (needs ${store.requiresCredentials})`);
    continue;
  }
  if (store.needsBrowser && !rendering) {
    console.log(`- ${store.name.padEnd(20)} skipped (JavaScript-only shop, needs headless rendering)`);
    continue;
  }

  const startedAt = Date.now();
  try {
    const listings = await store.search(query, { limit: 5, timeout: store.needsBrowser ? 30000 : 12000 });
    const ms = Date.now() - startedAt;
    const mark = listings.length ? '✓' : '·';
    console.log(`${mark} ${store.name.padEnd(20)} ${String(listings.length).padStart(2)} listings  ${ms}ms`);
    for (const listing of listings.slice(0, 2)) {
      console.log(`    ${listing.currency ?? 'NPR'} ${listing.amount}  ${String(listing.productName).slice(0, 58)}`);
    }
  } catch (error) {
    console.log(`✗ ${store.name.padEnd(20)} ${error.message.slice(0, 90)}`);
  }
}

await closeBrowser();
