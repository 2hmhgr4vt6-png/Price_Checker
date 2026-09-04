/**
 * Orchestrator tests. These stub the store registry via a fake adapter list so
 * they never touch the network - the point is the merge/sort/flag logic, not
 * whether Daraz is up.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { searchAllStores } from '../src/search.js';
import { stores } from '../src/stores/index.js';

const fakeStore = (id, listings, { fail = false } = {}) => ({
  id,
  name: id,
  homepage: `https://${id}.test`,
  kind: 'retailer',
  async search() {
    if (fail) throw new Error('boom');
    return listings;
  },
});

function useStores(...replacements) {
  const original = stores.splice(0, stores.length, ...replacements);
  return () => stores.splice(0, stores.length, ...original);
}

test('sorts by price, badges the cheapest and reports unreachable stores', async () => {
  const restore = useStores(
    fakeStore('alpha', [{ productName: 'Widget Pro 128GB', amount: 30000, currency: 'NPR', url: 'https://a/1', availability: 'in_stock' }]),
    fakeStore('beta', [{ productName: 'Widget Pro 128GB', amount: 27000, currency: 'NPR', url: 'https://b/1', availability: 'unknown' }]),
    fakeStore('gamma', [], { fail: true }),
  );

  try {
    const payload = await searchAllStores('Widget Pro 128GB', { fresh: true });
    assert.equal(payload.resultCount, 2);
    assert.deepEqual(payload.results.map((row) => row.priceNpr), [27000, 30000]);
    assert.equal(payload.results[0].bestPrice, true);
    assert.equal(payload.cheapest.storeName, 'beta');

    const gamma = payload.stores.find((store) => store.id === 'gamma');
    assert.equal(gamma.status, 'unavailable');
    assert.equal(gamma.count, 0);
  } finally {
    restore();
  }
});

test('flags implausibly cheap rows and never badges them best price', async () => {
  const restore = useStores(
    fakeStore('a', [{ productName: 'Widget Pro', amount: 30000, currency: 'NPR', url: 'https://a', availability: 'in_stock' }]),
    fakeStore('b', [{ productName: 'Widget Pro', amount: 31000, currency: 'NPR', url: 'https://b', availability: 'in_stock' }]),
    fakeStore('c', [{ productName: 'Widget Pro', amount: 900, currency: 'NPR', url: 'https://c', availability: 'in_stock' }]),
  );

  try {
    const payload = await searchAllStores('Widget Pro', { fresh: true });
    assert.equal(payload.results[0].suspicious, true);
    assert.equal(payload.results[0].bestPrice, undefined);
    assert.equal(payload.cheapest.priceNpr, 30000);
    assert.ok(payload.warnings.some((warning) => /below/i.test(warning)));
  } finally {
    restore();
  }
});

test('converts foreign currency to NPR and records the rate', async () => {
  const restore = useStores(
    fakeStore('usd-shop', [{ productName: 'Widget Pro', amount: 100, currency: 'USD', url: 'https://u', availability: 'in_stock' }]),
  );

  try {
    const payload = await searchAllStores('Widget Pro', { fresh: true });
    const [row] = payload.results;
    assert.equal(row.originalPrice.currency, 'USD');
    assert.ok(row.priceNpr > 5000, 'USD price should be converted upward into NPR');
    assert.ok(payload.fx.ratesUsed.USD > 0);
  } finally {
    restore();
  }
});

test('rejects an empty query', async () => {
  await assert.rejects(() => searchAllStores(' '), /at least 2 characters/);
});
