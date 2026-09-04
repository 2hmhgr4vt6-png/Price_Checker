import test from 'node:test';
import assert from 'node:assert/strict';

import { parsePrice, parseAmount, formatNpr, detectCurrency } from '../src/price.js';
import { isRelevant, normalise, scoreListing } from '../src/relevance.js';
import { blocksWithClass, stripTags, attr, decodeEntities } from '../src/html.js';

test('parses Nepali and foreign price strings', () => {
  assert.deepEqual(parsePrice('Rs. 1,44,999'), { amount: 144999, currency: 'NPR' });
  assert.deepEqual(parsePrice('NPR 24999.00'), { amount: 24999, currency: 'NPR' });
  assert.deepEqual(parsePrice('$1,299.99'), { amount: 1299.99, currency: 'USD' });
  assert.equal(parseAmount('out of stock'), null);
  assert.equal(detectCurrency('₹4,999'), 'INR');
  assert.equal(formatNpr(144999.4), 'Rs. 1,44,999');
});

test('normalisation glues units so "128 GB" matches "128GB"', () => {
  assert.equal(normalise('Apple iPhone 14 — 128 GB'), 'apple iphone 14 128gb');
});

test('keeps real products and drops accessories', () => {
  const query = 'iPhone 14 128GB';
  assert.ok(isRelevant(query, 'Apple iPhone 14 128 GB Blue - NTA Approved'));
  assert.ok(!isRelevant(query, 'Clear Phone Case For iPhone 14 128GB'));
  assert.ok(!isRelevant(query, 'Apple iPhone 12 - 64 GB Midnight'));
  // ...unless the shopper asked for the accessory.
  assert.ok(isRelevant('iphone 14 case', 'Apple iPhone 14 Silicone Case Black'));
});

test('flags listings that only partially match the query', () => {
  const { missing } = scoreListing('iPhone 14 128GB', 'Apple iPhone 14 256GB');
  assert.deepEqual(missing, ['128gb']);
});

test('extracts product blocks from HTML', () => {
  const html = '<div class="product-item"><a href="/p/1">Item <b>One</b></a><span class="price">Rs.&nbsp;1,200</span></div>'
    + '<div class="product-item"><a href="/p/2">Item Two</a></div>';
  const blocks = blocksWithClass(html, 'product-item');
  assert.equal(blocks.length, 2);
  assert.equal(attr(blocks[0], 'href'), '/p/1');
  assert.equal(stripTags(blocks[0]), 'Item One Rs. 1,200');
  assert.equal(decodeEntities('Rs.&nbsp;5&amp;6'), 'Rs. 5&6');
});
