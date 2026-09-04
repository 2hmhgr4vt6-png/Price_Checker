/**
 * Query understanding. Each case here is a search that failed against live
 * stores before this layer existed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { canonicalise, queryVariants, spellFix, tokenMatches, editDistance } from '../src/query.js';
import { isRelevant, scoreListing } from '../src/relevance.js';

test('brand and product-line words are optional, model words are required', () => {
  const { required, optional } = canonicalise('Samsung Galaxy S26 Ultra');
  assert.deepEqual(required, ['s26', 'ultra']);
  assert.deepEqual(optional, ['samsung', 'galaxy']);

  // A query made only of brand words has to match on those, or it matches all.
  assert.deepEqual(canonicalise('samsung').required, ['samsung']);
});

test('shorthand is expanded', () => {
  assert.equal(canonicalise('iphone 17 pm').canonical, 'iphone 17 pro max');
  assert.equal(canonicalise('iphone 17 promax').canonical, 'iphone 17 pro max');
});

test('a title that omits "Galaxy" still answers a Galaxy search', () => {
  // Daraz writes "Samsung S26 Ultra"; this search found nothing before.
  assert.ok(isRelevant('Samsung Galaxy S26 Ultra', 'Samsung S26 Ultra 12/256GB'));
  assert.ok(isRelevant('Samsung Galaxy S26 Ultra', 'Galaxy S26 Ultra 5G'));
  // The model still has to line up.
  assert.ok(!isRelevant('Samsung Galaxy S26 Ultra', 'Samsung Galaxy S25 Ultra'));
  assert.ok(!isRelevant('Samsung Galaxy S26 Ultra', 'Samsung Galaxy S26'));
});

test('a different brand is the wrong product however well the model matches', () => {
  assert.equal(scoreListing('Samsung Galaxy A16', 'Xiaomi Redmi A16').wrongBrand, true);
  assert.ok(!isRelevant('Samsung Galaxy A16', 'Xiaomi Redmi A16'));
  assert.ok(isRelevant('Samsung Galaxy A16', 'Samsung A16 5G 128GB'));
});

test('one typo does not lose the product', () => {
  assert.equal(spellFix('samsng'), 'samsung');
  assert.equal(spellFix('iphon'), 'iphone');
  assert.equal(spellFix('fryerr'), 'fryer');
  // Digits and short tokens are never "corrected": s26 and s25 are different
  // phones one edit apart.
  assert.equal(spellFix('s26'), 's26');
  assert.equal(spellFix('sony'), 'sony');
  assert.equal(editDistance('samsng', 'samsung'), 1);

  assert.ok(tokenMatches('samsng', ['samsung', 'galaxy', 's26']));
  assert.ok(!tokenMatches('s26', ['samsung', 's25']));
  assert.ok(isRelevant('samsng galaxy s26 ultra', 'Samsung Galaxy S26 Ultra'));
});

test('variants are ordered best-guess first and stay short', () => {
  assert.deepEqual(queryVariants('samsng galaxy s26 ultra'), [
    'samsng galaxy s26 ultra',   // what was typed
    'samsung galaxy s26 ultra',  // spelling corrected
    's26 ultra',                 // brand dropped, which is what Daraz indexes
  ]);

  assert.deepEqual(queryVariants('samsung s26 ultra'), [
    'samsung s26 ultra',
    's26 ultra',
    'samsung galaxy s26 ultra',  // brand's line word inserted
  ]);

  // A query needing no help produces exactly itself.
  assert.deepEqual(queryVariants('air fryer'), ['air fryer']);
  assert.ok(queryVariants('samsung galaxy s26 ultra 12/512gb').length <= 4);
});
