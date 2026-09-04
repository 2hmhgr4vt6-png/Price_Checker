/**
 * Flight fare orchestrator - the flights counterpart to ./search.js.
 *
 * Same honesty rules as the product side: providers run in parallel, a
 * provider that fails or finds nothing is reported as skipped rather than
 * filled in, fares in other currencies are converted and labelled, and the
 * cheapest fare is badged only if it is a real quoted fare.
 */
import { enabledFlightProviders, flightProviders } from './flights/index.js';
import { currencyConverter } from './fx.js';
import { airportByCode, isValidCode } from './airports.js';
import { browserAvailable } from './browser.js';

const PROVIDER_TIMEOUT_MS = 45000; // a booking form submit plus a render
const CACHE_TTL_MS = 5 * 60 * 1000; // fares move faster than shop prices
const MAX_AHEAD_DAYS = 361; // Sastotickets' own limit, and a sane cap anyway

const cache = new Map();

const badRequest = (message) => Object.assign(new Error(message), { statusCode: 400 });

/** Validate and normalise what the form sent. */
export function parseFlightQuery(params) {
  const from = String(params.from ?? '').toUpperCase().trim();
  const to = String(params.to ?? '').toUpperCase().trim();
  const date = String(params.date ?? '').trim();

  if (!isValidCode(from) || !isValidCode(to)) {
    throw badRequest('Pick a departure and destination airport from the suggestions.');
  }
  if (from === to) throw badRequest('Departure and destination airports are the same.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw badRequest('Enter the travel date as YYYY-MM-DD.');

  const departure = new Date(`${date}T00:00:00`);
  if (Number.isNaN(departure.getTime())) throw badRequest('That travel date is not a real date.');

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (departure < today) throw badRequest('That travel date is in the past.');

  const daysAhead = Math.round((departure - today) / 86400000);
  if (daysAhead > MAX_AHEAD_DAYS) {
    throw badRequest(`Airlines do not sell this far ahead — pick a date within ${MAX_AHEAD_DAYS} days.`);
  }

  const count = (value, fallback, max) => {
    const parsed = Number.parseInt(value ?? fallback, 10);
    return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), max) : fallback;
  };

  const adults = Math.max(1, count(params.adults, 1, 9));
  const children = count(params.children, 0, 9);
  const infants = count(params.infants, 0, adults); // one lap infant per adult

  return { from, to, date, adults, children, infants };
}

async function searchOneProvider(provider, query, convert) {
  const startedAt = Date.now();

  try {
    const fares = await provider.searchFlights(query, { timeout: PROVIDER_TIMEOUT_MS });
    const rows = [];

    for (const fare of fares ?? []) {
      if (!fare?.airline || !Number.isFinite(fare.amount)) continue;

      const converted = convert.toNpr(fare.amount, fare.currency || 'NPR');
      if (!converted) continue;

      rows.push({
        providerId: provider.id,
        providerName: provider.name,
        providerKind: provider.kind ?? 'ota',
        airline: fare.airline,
        flightNumber: fare.flightNumber ?? null,
        departTime: fare.departTime ?? null,
        arriveTime: fare.arriveTime ?? null,
        fareNpr: Math.round(converted.amount),
        originalPrice: fare.currency && fare.currency !== 'NPR'
          ? { amount: fare.amount, currency: fare.currency, rate: Number(converted.rate.toFixed(4)) }
          : null,
        availability: fare.availability ?? 'unknown',
        url: fare.url ?? provider.homepage,
        note: fare.note ?? null,
      });
    }

    return {
      status: rows.length ? 'ok' : 'no_results',
      provider: { id: provider.id, name: provider.name, homepage: provider.homepage },
      rows,
      count: rows.length,
      ms: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      status: 'unavailable',
      provider: { id: provider.id, name: provider.name, homepage: provider.homepage },
      rows: [],
      count: 0,
      error: error.message.slice(0, 160),
      ms: Date.now() - startedAt,
    };
  }
}

function dedupe(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    // The same flight can appear twice on a results page (e.g. once per fare
    // class block); airline + departure + fare identifies it well enough.
    const key = `${row.providerId}|${row.airline}|${row.departTime}|${row.fareNpr}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * @param {object} params raw query params from the request
 * @returns {Promise<object>} payload consumed directly by the front-end
 */
export async function searchFlights(params, { fresh = false } = {}) {
  const query = parseFlightQuery(params);

  const cacheKey = [query.from, query.to, query.date, query.adults, query.children, query.infants].join('|');
  const hit = cache.get(cacheKey);
  if (!fresh && hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return { ...hit.payload, cached: true };
  }

  const convert = await currencyConverter();
  const active = enabledFlightProviders();
  const results = await Promise.all(active.map((provider) => searchOneProvider(provider, query, convert)));

  const rows = dedupe(results.flatMap((result) => result.rows)).sort((a, b) => a.fareNpr - b.fareNpr);
  if (rows.length) rows[0].bestFare = true;

  const warnings = [];
  const skipped = results.filter((result) => result.status !== 'ok');
  if (rows.length && skipped.length) {
    warnings.push(`No fares from ${skipped.map((result) => result.provider.name).join(', ')} for this route and date.`);
  }
  if (rows.length) {
    warnings.push(
      'Fares change constantly and the airline may charge more at checkout. ' +
      'Baggage, taxes and fees are not always included in the figure shown — confirm on the booking site.',
    );
  }

  const payload = {
    query: {
      ...query,
      fromAirport: airportByCode(query.from),
      toAirport: airportByCode(query.to),
    },
    generatedAt: new Date().toISOString(),
    resultCount: rows.length,
    results: rows,
    cheapest: rows.length
      ? { providerName: rows[0].providerName, airline: rows[0].airline, fareNpr: rows[0].fareNpr, url: rows[0].url }
      : null,
    fareRange: rows.length ? { min: rows[0].fareNpr, max: rows[rows.length - 1].fareNpr } : null,
    providers: results.map(({ provider, status, count, error, ms }) => ({
      id: provider.id, name: provider.name, homepage: provider.homepage, status, count, error: error ?? null, ms,
    })),
    totalProviders: flightProviders.length,
    browserRendering: await browserAvailable(),
    fx: convert.meta,
    warnings,
    cached: false,
  };

  cache.set(cacheKey, { at: Date.now(), payload });
  return payload;
}
