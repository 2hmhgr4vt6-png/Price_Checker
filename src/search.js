/**
 * Search orchestrator: fan out to every enabled store, normalise what comes
 * back, and hand the UI one sorted, currency-consistent result set.
 *
 * Rules that matter for trust:
 *  - a store that errors, times out or returns nothing is *skipped*, never
 *    filled in with a guess;
 *  - non-NPR prices are converted and labelled with the rate used;
 *  - obvious accessories are filtered out so "Best Price" is a real answer;
 *  - implausibly cheap rows are flagged rather than silently promoted.
 */
import { enabledStores, stores } from './stores/index.js';
import { currencyConverter } from './fx.js';
import { isRelevant, scoreListing } from './relevance.js';

const PER_STORE_TIMEOUT_MS = 9000;
const PER_STORE_LIMIT = 24;
const CACHE_TTL_MS = 10 * 60 * 1000;
const SUSPICIOUS_RATIO = 0.35; // under 35% of the median => flag, do not hide

const cache = new Map();

const median = (numbers) => {
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

function dedupe(results) {
  const seen = new Set();
  return results.filter((row) => {
    const key = `${row.storeId}|${row.url || row.productName}|${row.priceNpr}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function searchOneStore(store, query, convert) {
  const startedAt = Date.now();

  try {
    const listings = await store.search(query, { limit: PER_STORE_LIMIT, timeout: PER_STORE_TIMEOUT_MS });
    const rows = [];
    let filtered = 0;

    for (const listing of listings ?? []) {
      if (!listing?.productName || !Number.isFinite(listing.amount)) continue;

      if (!isRelevant(query, listing.productName)) {
        filtered += 1;
        continue;
      }

      const converted = convert.toNpr(listing.amount, listing.currency || 'NPR');
      if (!converted) continue;

      const { score, missing } = scoreListing(query, listing.productName);
      rows.push({
        storeId: store.id,
        storeName: store.name,
        storeKind: store.kind ?? 'retailer',
        productName: listing.productName,
        priceNpr: Math.round(converted.amount),
        originalPrice: listing.currency && listing.currency !== 'NPR'
          ? { amount: listing.amount, currency: listing.currency, rate: Number(converted.rate.toFixed(4)) }
          : null,
        availability: listing.availability ?? 'unknown',
        url: listing.url ?? store.homepage,
        image: listing.image ?? null,
        seller: listing.seller ?? null,
        note: listing.note ?? null,
        matchScore: Number(score.toFixed(2)),
        // Surfaced in the UI as "closest match" when the title is missing part
        // of what was asked for.
        exactMatch: missing.length === 0,
      });
    }

    return {
      status: rows.length ? 'ok' : 'no_results',
      store: { id: store.id, name: store.name, homepage: store.homepage },
      rows,
      count: rows.length,
      filtered,
      ms: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      status: 'unavailable',
      store: { id: store.id, name: store.name, homepage: store.homepage },
      rows: [],
      count: 0,
      // Kept short: shown as a tooltip in the store-status strip, and it is the
      // honest reason a store is missing from the table.
      error: error.message.slice(0, 160),
      ms: Date.now() - startedAt,
    };
  }
}

function buildWarnings(rows, stores) {
  const warnings = [];
  if (rows.length >= 3) {
    const mid = median(rows.map((row) => row.priceNpr));
    for (const row of rows) {
      if (row.priceNpr < mid * SUSPICIOUS_RATIO) {
        row.suspicious = true;
      }
    }
    if (rows.some((row) => row.suspicious)) {
      warnings.push(
        'Some listings are priced far below the typical price for this product. ' +
        'These are often accessories, refurbished units or scam listings - open the link and check carefully.',
      );
    }
  }

  if (rows.length && rows.every((row) => !row.exactMatch)) {
    warnings.push('No exact match was found - the closest available products are shown instead.');
  }

  const usedStores = new Set(rows.map((row) => row.storeId));
  const skipped = stores.filter((entry) => !usedStores.has(entry.store.id));
  if (skipped.length) {
    warnings.push(
      `No listings from ${skipped.map((entry) => entry.store.name).join(', ')} for this search.`,
    );
  }

  return warnings;
}

/**
 * @param {string} query raw shopper input
 * @returns {Promise<object>} payload consumed directly by the front-end
 */
export async function searchAllStores(query, { fresh = false } = {}) {
  const trimmed = String(query ?? '').trim();
  if (trimmed.length < 2) {
    throw Object.assign(new Error('Please enter at least 2 characters.'), { statusCode: 400 });
  }

  const cacheKey = trimmed.toLowerCase();
  const hit = cache.get(cacheKey);
  if (!fresh && hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return { ...hit.payload, cached: true };
  }

  const convert = await currencyConverter();
  const active = enabledStores();

  // All stores are queried in parallel; one slow shop cannot hold up the page
  // beyond PER_STORE_TIMEOUT_MS.
  const storeResults = await Promise.all(active.map((store) => searchOneStore(store, trimmed, convert)));

  const rows = dedupe(storeResults.flatMap((result) => result.rows))
    .sort((a, b) => a.priceNpr - b.priceNpr);

  const warnings = buildWarnings(rows, storeResults);

  // "Best Price" must not land on a flagged row.
  const best = rows.find((row) => !row.suspicious) ?? rows[0];
  if (best) best.bestPrice = true;

  const payload = {
    query: trimmed,
    generatedAt: new Date().toISOString(),
    resultCount: rows.length,
    results: rows,
    cheapest: best ? { storeName: best.storeName, priceNpr: best.priceNpr, productName: best.productName, url: best.url } : null,
    priceRange: rows.length ? { min: rows[0].priceNpr, max: rows[rows.length - 1].priceNpr } : null,
    stores: storeResults.map(({ store, status, count, filtered, error, ms }) => ({
      id: store.id, name: store.name, homepage: store.homepage, status, count, filtered: filtered ?? 0, error: error ?? null, ms,
    })),
    disabledStores: disabledStores(),
    fx: convert.meta,
    warnings,
    cached: false,
  };

  cache.set(cacheKey, { at: Date.now(), payload });
  return payload;
}

/** Stores registered but switched off, e.g. because a token is not configured. */
function disabledStores() {
  const active = new Set(enabledStores().map((store) => store.id));
  return stores
    .filter((store) => !active.has(store.id))
    .map((store) => ({
      id: store.id,
      name: store.name,
      homepage: store.homepage,
      reason: store.requiresCredentials
        ? `Needs ${store.requiresCredentials} to be configured`
        : 'Disabled',
    }));
}
