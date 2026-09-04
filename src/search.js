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
import { queryVariants } from './query.js';
import { browserAvailable } from './browser.js';

const PER_STORE_TIMEOUT_MS = 9000;
// Rendering a JS-only storefront in headless Chromium is inherently slower
// than an HTTP call, so those adapters get their own budget.
const BROWSER_STORE_TIMEOUT_MS = 28000;
const PER_STORE_LIMIT = 24;
const CACHE_TTL_MS = 10 * 60 * 1000;
// Up to three phrasings per store, tried only while nothing relevant has come
// back. More would multiply every search's latency by the number of wordings
// we can imagine.
const MAX_QUERY_VARIANTS = 3;
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
  const timeout = store.needsBrowser ? BROWSER_STORE_TIMEOUT_MS : PER_STORE_TIMEOUT_MS;

  try {
    // Shops phrase products differently, so if the shopper's own wording finds
    // nothing here, one reworded attempt is made - "samsung s26 ultra" also
    // tried as "samsung galaxy s26 ultra". Whatever comes back is still judged
    // against the shopper's intent, so this widens the net, not the standard.
    const variants = queryVariants(query).slice(0, MAX_QUERY_VARIANTS);
    let listings = [];
    let usedVariant = variants[0];

    for (const variant of variants) {
      const attempt = await store.search(variant, { limit: PER_STORE_LIMIT, timeout });
      usedVariant = variant;
      if ((attempt ?? []).some((listing) => listing?.productName && isRelevant(query, listing.productName))) {
        listings = attempt;
        break;
      }
      // Keep the first non-empty response so a store that returned only
      // near-misses still reports honestly instead of looking unreachable.
      if (!listings.length) listings = attempt ?? [];
    }

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
      // Surfaced in the store panel when a rewording is what found the product.
      usedVariant: usedVariant !== query ? usedVariant : null,
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
  // Two rows are enough to judge: a Daraz listing titled exactly "Samsung
  // Galaxy S26 Ultra" at Rs. 1,744 next to Hukut's Rs. 2,12,999 is precisely
  // the scam listing this flag exists for, and requiring three rows let it
  // take the Best price badge.
  if (rows.length >= 2) {
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

  // "Best Price" must be something you can actually buy: never a flagged row,
  // and never a published-price reference (an article is not a shop).
  const buyable = rows.filter((row) => row.storeKind !== 'reference');
  const best = buyable.find((row) => !row.suspicious) ?? buyable[0];
  if (best) best.bestPrice = true;

  const payload = {
    query: trimmed,
    generatedAt: new Date().toISOString(),
    resultCount: rows.length,
    results: rows,
    cheapest: best ? { storeName: best.storeName, priceNpr: best.priceNpr, productName: best.productName, url: best.url } : null,
    priceRange: rows.length ? { min: rows[0].priceNpr, max: rows[rows.length - 1].priceNpr } : null,
    stores: storeResults.map(({ store, status, count, filtered, error, ms, usedVariant }) => ({
      id: store.id, name: store.name, homepage: store.homepage, status, count,
      filtered: filtered ?? 0, error: error ?? null, usedVariant: usedVariant ?? null, ms,
    })),
    browserRendering: await browserAvailable(),
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
