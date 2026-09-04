/**
 * Currency conversion to NPR.
 *
 * Rates are fetched once per hour from the free open.er-api.com endpoint. If
 * that call fails (offline, blocked, rate-limited) we fall back to a pinned
 * table and clearly label the rate as approximate in the API response and UI,
 * so a converted price is never presented as an exact quote.
 */
import { getJson } from './http.js';

const RATES_URL = 'https://open.er-api.com/v6/latest/NPR';
const TTL_MS = 60 * 60 * 1000;

// Pinned fallback: units of NPR per 1 unit of the foreign currency.
const FALLBACK_RATES = { NPR: 1, USD: 141, INR: 1.6, EUR: 153, GBP: 178, AUD: 92 };
const FALLBACK_UPDATED = '2025-01-01';

let cache = null;

async function loadRates() {
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) return cache;

  try {
    const data = await getJson(RATES_URL, { timeout: 5000 });
    if (data?.result !== 'success' || !data?.rates) throw new Error('unexpected payload');

    // The endpoint returns NPR -> X; invert so we hold X -> NPR.
    const rates = { NPR: 1 };
    for (const [code, perNpr] of Object.entries(data.rates)) {
      if (typeof perNpr === 'number' && perNpr > 0) rates[code] = 1 / perNpr;
    }

    cache = { rates, source: 'open.er-api.com', approximate: false, updated: data.time_last_update_utc ?? null, fetchedAt: Date.now() };
  } catch {
    cache = { rates: FALLBACK_RATES, source: 'pinned fallback table', approximate: true, updated: FALLBACK_UPDATED, fetchedAt: Date.now() };
  }

  return cache;
}

/**
 * @returns {{ toNpr: (amount: number, currency: string) => ({ amount: number, rate: number } | null), meta: object }}
 */
export async function currencyConverter() {
  const { rates, source, approximate, updated } = await loadRates();
  const used = new Map();

  return {
    toNpr(amount, currency = 'NPR') {
      const code = String(currency || 'NPR').toUpperCase();
      const rate = rates[code];
      if (!Number.isFinite(amount) || !Number.isFinite(rate)) return null;
      if (code !== 'NPR') used.set(code, rate);
      return { amount: amount * rate, rate };
    },
    get meta() {
      return {
        source,
        approximate,
        updated,
        // Only currencies actually used in this response are reported, so the
        // UI can say "converted at 1 USD = Rs. 141" and nothing more.
        ratesUsed: Object.fromEntries([...used].map(([code, rate]) => [code, Number(rate.toFixed(4))])),
      };
    },
  };
}
