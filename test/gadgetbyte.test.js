/**
 * Gadgetbyte parsing rules, exercised against the real article shapes: a plain
 * variant table, an "Old Price | New Price" republish, and a related-devices
 * table that must not leak into the results.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { __parseArticle, __candidateArticles } from '../src/stores/gadgetbyte.js';

const PLAIN_ARTICLE = `
<table><tbody>
  <tr><td>iPhone 17 Price in Nepal (Official)</td></tr>
  <tr><td>256GB</td><td>NPR 173,499</td></tr>
  <tr><td>512GB</td><td>NPR 215,699</td></tr>
</tbody></table>`;

const REPUBLISHED_ARTICLE = `
<table><tbody>
  <tr><td>iPhone 17 Pro Max Price in Nepal</td><td>Old Price</td><td>New Price</td></tr>
  <tr><td>256GB</td><td>NPR 257,999</td><td>NPR 242,499</td></tr>
  <tr><td>512GB</td><td>NPR 300,199</td><td>NPR 284,599 (out of stock)</td></tr>
</tbody></table>`;

const NOISY_ARTICLE = `
<table><tbody>
  <tr><td>iPhone 17 Price in Nepal (Official)</td></tr>
  <tr><td>256GB</td><td>NPR 173,499</td></tr>
</tbody></table>
<p>Also read:</p>
<table><tbody>
  <tr><td>Galaxy S25 Ultra</td><td>NPR 184,999</td></tr>
  <tr><td>Pixel 10 Pro</td><td>NPR 165,000</td></tr>
</tbody></table>
<table><tbody>
  <tr><td>iPhone 18</td><td>could start at NPR 190,000</td></tr>
</tbody></table>`;

test('reads a variant price table', () => {
  const rows = __parseArticle(PLAIN_ARTICLE, 'iPhone 17', 'https://gb/iphone-17-price-in-nepal/', 10);
  assert.deepEqual(
    rows.map((row) => [row.productName, row.amount]),
    [['iPhone 17 256GB', 173499], ['iPhone 17 512GB', 215699]],
  );
  assert.ok(rows.every((row) => row.url.endsWith('/iphone-17-price-in-nepal/')));
});

test('takes the new price, not the superseded one', () => {
  const rows = __parseArticle(REPUBLISHED_ARTICLE, 'iPhone 17 Pro Max', 'https://gb/a/', 10);
  assert.deepEqual(rows.map((row) => row.amount), [242499, 284599]);
  // Column labels must not end up in the product name.
  assert.equal(rows[0].productName, 'iPhone 17 Pro Max 256GB');
  assert.equal(rows[1].availability, 'out_of_stock');
});

test('ignores related-device tables and speculative prices', () => {
  const rows = __parseArticle(NOISY_ARTICLE, 'iPhone 17', 'https://gb/a/', 10);
  assert.deepEqual(rows.map((row) => row.amount), [173499]);
});

test('prefers the closest article slug', () => {
  const html = `
    <a href="/iphone-17-pro-max-price-nepal/">x</a>
    <a href="/iphone-17-price-in-nepal/">x</a>
    <a href="/iphone-16-price-in-nepal/">x</a>
    <a href="/iphone-17-review/">x</a>`;

  const candidates = __candidateArticles(html, 'iPhone 17');
  assert.match(candidates[0], /\/iphone-17-price-in-nepal\/$/);
  // A different model, and a non-price article, are not candidates at all.
  assert.ok(!candidates.some((url) => url.includes('iphone-16')));
  assert.ok(!candidates.some((url) => url.includes('review')));
});
