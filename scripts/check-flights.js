#!/usr/bin/env node
/**
 * Flight provider diagnostic:
 *   npm run check:flights -- KTM PKR 2026-09-20
 *
 * Fares are the one thing this app cannot read over plain HTTP, so when a
 * route comes back empty the useful question is *where* the browser ended up.
 * This runs each provider with rendering visible in the output and writes the
 * final page and a screenshot to /tmp, which is enough to tell apart:
 *
 *   - the site bounced the search back to its homepage;
 *   - the site said there are no flights on that route/date;
 *   - the fares are on the page but the row extraction missed them.
 *
 * Paste the summary into an issue (or back to Claude) and the third case can
 * be fixed against real markup instead of guesswork.
 */
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { flightProviders, disabledFlightProviders } from '../src/flights/index.js';
import { browserAvailable, closeBrowser } from '../src/browser.js';
import { parseFlightQuery } from '../src/flightsearch.js';

const [from = 'KTM', to = 'PKR', date] = process.argv.slice(2);

const defaultDate = () => {
  const day = new Date();
  day.setDate(day.getDate() + 14);
  return day.toISOString().slice(0, 10);
};

let query;
try {
  query = parseFlightQuery({ from, to, date: date ?? defaultDate() });
} catch (error) {
  console.error(`Bad arguments: ${error.message}`);
  console.error('Usage: npm run check:flights -- KTM PKR 2026-09-20');
  process.exit(1);
}

if (!(await browserAvailable())) {
  console.error('Headless rendering is not installed, and fares cannot be read without it.');
  console.error('Run: npm run setup:browser');
  process.exit(1);
}

const disabled = disabledFlightProviders();
console.log(`Checking ${flightProviders.length - disabled.length} of ${flightProviders.length} provider(s) for ${query.from} → ${query.to} on ${query.date}`);
for (const provider of disabled) console.log(`- ${provider.name.padEnd(24)} skipped (${provider.reason})`);
console.log();

process.env.RENDER_DEBUG = process.env.RENDER_DEBUG ?? '1';
const disabledIds = new Set(disabled.map((provider) => provider.id));

for (const provider of flightProviders) {
  if (disabledIds.has(provider.id)) continue;
  const startedAt = Date.now();
  try {
    const fares = await provider.searchFlights(query, { timeout: 60000 });
    const mark = fares.length ? '✓' : '·';
    console.log(`\n${mark} ${provider.name}: ${fares.length} fare(s) in ${Date.now() - startedAt}ms`);
    for (const fare of fares.slice(0, 8)) {
      console.log(`    ${String(fare.amount).padStart(7)} ${fare.currency}  ${fare.airline}` +
        `${fare.flightNumber ? ` ${fare.flightNumber}` : ''}${fare.departTime ? ` at ${fare.departTime}` : ''}`);
    }
  } catch (error) {
    console.log(`\n✗ ${provider.name}: ${error.message}`);
  }
}

// A screenshot of the last page is often the fastest way to see what happened.
const notes = join(tmpdir(), 'nepali-price-checker-flights.txt');
await writeFile(notes, `Checked ${query.from} -> ${query.to} on ${query.date} at ${new Date().toISOString()}\n`);
console.log(`\nRun again with RENDER_DEBUG=1 to see the page text each provider ended on.`);
console.log(`Notes: ${notes}`);

await closeBrowser();
