/**
 * Verifies the headless-rendering path end to end against a local fixture that
 * behaves like the real SPA storefronts: no prices in the served HTML, a grid
 * built by script afterwards.
 *
 * Skipped when Playwright is not installed, since it is an optional dependency.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';

import { browserAvailable, closeBrowser } from '../src/browser.js';
import { renderedStore } from '../src/stores/rendered.js';

const available = await browserAvailable();

test('headless rendering reads listings a plain fetch cannot see', { skip: available ? false : 'playwright not installed' }, async (t) => {
  const html = await readFile(new URL('./fixtures/spa-store.html', import.meta.url));
  const server = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();

  t.after(() => server.close());

  // The premise: outside the <script> tag the served document holds no prices
  // and no product links - the grid is built after load. A plain HTTP fetch of
  // this page therefore has nothing to parse, which is the situation the real
  // SPA storefronts put us in.
  const withoutScripts = html.toString().replace(/<script[\s\S]*?<\/script>/gi, '');
  assert.ok(!/Rs\.|NPR/.test(withoutScripts));
  assert.ok(!withoutScripts.includes('/product/'));

  const store = renderedStore({
    id: 'fixture',
    name: 'Fixture Store',
    homepage: `http://127.0.0.1:${port}`,
    searchUrl: (query) => `http://127.0.0.1:${port}/search?q=${encodeURIComponent(query)}`,
  });

  const listings = await store.search('iPhone 17');

  assert.equal(listings.length, 3);

  const phone = listings.find((row) => row.productName.includes('128GB'));
  assert.equal(phone.amount, 173499);
  assert.equal(phone.currency, 'NPR');
  assert.equal(phone.availability, 'in_stock');
  assert.match(phone.url, /\/product\/iphone-17-128gb$/);

  const pro = listings.find((row) => row.productName.includes('Pro'));
  assert.equal(pro.amount, 221299);
  assert.equal(pro.availability, 'out_of_stock');

  // The "-12%" badge line must not be mistaken for the product name.
  assert.ok(listings.every((row) => !/^-?\d+%$/.test(row.productName)));
});

// One shared Chromium serves every test in this file; without this the
// process would keep running after the last assertion.
after(() => closeBrowser());

test('browser-backed stores fail loudly rather than inventing rows', async () => {
  const store = renderedStore({
    id: 'unreachable',
    name: 'Unreachable',
    homepage: 'http://127.0.0.1:1',
    searchUrl: () => 'http://127.0.0.1:1/search',
  });

  await assert.rejects(() => store.search('anything'));
});
