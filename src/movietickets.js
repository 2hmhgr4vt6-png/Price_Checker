/**
 * Cinema ticket-price orchestrator - the movies counterpart to ./search.js.
 *
 * Same rules: cinemas are queried in parallel, one that fails or publishes
 * nothing is reported as skipped rather than filled in, and prices are sorted
 * cheapest first.
 */
import { cinemas, enabledCinemas } from './movies/index.js';
import { browserAvailable } from './browser.js';

const CINEMA_TIMEOUT_MS = 12000;
const BROWSER_TIMEOUT_MS = 30000;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // published tariffs change rarely

let cache = null;

/** Which day band a row belongs to, for filtering. */
function classifyBand(dayBand) {
  const text = String(dayBand ?? '').toLowerCase();
  if (/knock\s*off|wednesday|thursday/.test(text)) return 'midweek';
  if (/weekend|friday|saturday|sunday/.test(text)) return 'weekend';
  if (/weekday|monday|tuesday/.test(text)) return 'weekday';
  return 'any';
}

/** Morning shows are the cheap slot almost everywhere, so make it filterable. */
function classifySlot(show) {
  const text = String(show ?? '').toLowerCase();
  if (/morning|matinee|before\s*1[01]/.test(text)) return 'morning';
  if (/night|late/.test(text)) return 'night';
  return 'regular';
}

async function readOneCinema(cinema) {
  const startedAt = Date.now();
  const timeout = cinema.needsBrowser ? BROWSER_TIMEOUT_MS : CINEMA_TIMEOUT_MS;

  try {
    const prices = await cinema.listPrices({ timeout });
    const rows = (prices ?? [])
      .filter((price) => Number.isFinite(price.amount) && price.amount > 0)
      .map((price) => ({
        cinemaId: cinema.id,
        cinemaName: cinema.name,
        city: cinema.city ?? null,
        dayBand: price.dayBand,
        band: classifyBand(price.dayBand),
        show: price.show,
        slot: classifySlot(price.show),
        priceNpr: Math.round(price.amount),
        url: cinema.homepage,
      }));

    return {
      status: rows.length ? 'ok' : 'no_results',
      cinema: { id: cinema.id, name: cinema.name, homepage: cinema.homepage },
      rows,
      count: rows.length,
      ms: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      status: 'unavailable',
      cinema: { id: cinema.id, name: cinema.name, homepage: cinema.homepage },
      rows: [],
      count: 0,
      error: error.message.slice(0, 160),
      ms: Date.now() - startedAt,
    };
  }
}

export async function listMovieTicketPrices({ fresh = false } = {}) {
  if (!fresh && cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return { ...cache.payload, cached: true };
  }

  const results = await Promise.all(enabledCinemas().map(readOneCinema));
  const rows = results.flatMap((result) => result.rows).sort((a, b) => a.priceNpr - b.priceNpr);
  if (rows.length) rows[0].bestPrice = true;

  const warnings = [];
  if (rows.length) {
    warnings.push(
      'These are each cinema’s published ticket rates, not seat availability for a particular film. ' +
      '3D, recliner and premium screens usually cost more — confirm when booking.',
    );
  }
  const skipped = results.filter((result) => result.status !== 'ok');
  if (rows.length && skipped.length) {
    warnings.push(`No published rates from ${skipped.map((result) => result.cinema.name).join(', ')}.`);
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    resultCount: rows.length,
    results: rows,
    cheapest: rows.length
      ? { cinemaName: rows[0].cinemaName, priceNpr: rows[0].priceNpr, show: rows[0].show, dayBand: rows[0].dayBand }
      : null,
    priceRange: rows.length ? { min: rows[0].priceNpr, max: rows[rows.length - 1].priceNpr } : null,
    cinemas: results.map(({ cinema, status, count, error, ms }) => ({
      id: cinema.id, name: cinema.name, homepage: cinema.homepage, status, count, error: error ?? null, ms,
    })),
    totalCinemas: cinemas.length,
    browserRendering: await browserAvailable(),
    warnings,
    cached: false,
  };

  cache = { at: Date.now(), payload };
  return payload;
}
