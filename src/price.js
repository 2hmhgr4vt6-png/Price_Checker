/** Money parsing helpers: turn whatever a store prints into { amount, currency }. */

const CURRENCY_HINTS = [
  { currency: 'NPR', patterns: [/\bnpr\b/i, /\brs\.?\b/i, /रु/, /\bnrs\.?\b/i] },
  { currency: 'USD', patterns: [/\busd\b/i, /\$/] },
  { currency: 'INR', patterns: [/\binr\b/i, /₹/] },
  { currency: 'EUR', patterns: [/\beur\b/i, /€/] },
  { currency: 'GBP', patterns: [/\bgbp\b/i, /£/] },
];

export function detectCurrency(text = '', fallback = 'NPR') {
  // "Rs." is used by both Nepali and Indian stores; since every adapter here
  // targets a Nepali domain, NPR is checked first and wins ties.
  for (const { currency, patterns } of CURRENCY_HINTS) {
    if (patterns.some((p) => p.test(text))) return currency;
  }
  return fallback;
}

/**
 * Pull the first number out of a price string.
 * Handles "Rs. 1,44,999", "NPR 24999.00", "$1,299.99" and "24999-45999"
 * (ranges resolve to the lower bound, which is what the store advertises).
 */
export function parseAmount(text) {
  if (typeof text === 'number') return Number.isFinite(text) ? text : null;
  if (!text) return null;

  const match = String(text).replace(/ /g, ' ').match(/\d[\d,\s]*(?:\.\d+)?/);
  if (!match) return null;

  const amount = Number(match[0].replace(/[,\s]/g, ''));
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

export function parsePrice(text, fallbackCurrency = 'NPR') {
  const amount = parseAmount(text);
  if (amount === null) return null;
  return { amount, currency: detectCurrency(String(text ?? ''), fallbackCurrency) };
}

export function formatNpr(amount) {
  return `Rs. ${Math.round(amount).toLocaleString('en-IN')}`;
}
