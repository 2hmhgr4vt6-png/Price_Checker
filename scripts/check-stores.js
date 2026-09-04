#!/usr/bin/env node
/**
 * Store reachability diagnostic:  npm run check:stores -- "iphone 17"
 *
 * Some Nepali storefronts sit behind bot protection or block traffic from
 * outside Nepal, so which adapters return data depends on where the server
 * runs. Run this to see what your network can actually reach before blaming
 * the app for a short results table.
 */
import { stores } from '../src/stores/index.js';

const query = process.argv.slice(2).join(' ') || 'iphone';
console.log(`Checking ${stores.length} stores for "${query}"\n`);

for (const store of stores) {
  const enabled = typeof store.enabled === 'boolean' ? store.enabled : true;
  if (!enabled) {
    console.log(`- ${store.name.padEnd(16)} skipped (needs ${store.requiresCredentials})`);
    continue;
  }

  const startedAt = Date.now();
  try {
    const listings = await store.search(query, { limit: 5, timeout: 12000 });
    const ms = Date.now() - startedAt;
    console.log(`✓ ${store.name.padEnd(16)} ${String(listings.length).padStart(2)} listings  ${ms}ms`);
    for (const listing of listings.slice(0, 2)) {
      console.log(`    ${listing.currency ?? 'NPR'} ${listing.amount}  ${String(listing.productName).slice(0, 60)}`);
    }
  } catch (error) {
    console.log(`✗ ${store.name.padEnd(16)} ${error.message.slice(0, 90)}`);
  }
}
