/**
 * Reading a cinema's published ticket-price table.
 *
 * Nepali cinemas do not price per film - they price per day band and show
 * slot, and publish that as a small table:
 *
 *     Weekends (Friday to Sunday)        All Screen
 *     Morning Show (Before 10:59 AM)     Rs. 200.00
 *     Regular Shows (11:00 AM onwards)   Rs. 450.00
 *
 * So a row here is "this cinema, this day band, this slot, this price", which
 * is what actually answers "where is the cheapest ticket on a weekday
 * morning". A header row (no price) names the day band the rows under it
 * belong to.
 */
import { stripTags } from '../html.js';
import { parsePrice } from '../price.js';

const PRICE_RE = /(?:Rs\.?|NPR|रु)\s*[\d,]+(?:\.\d+)?/i;

/** Next.js and similar embed page HTML with escaped quotes and entities. */
const unescapeEmbedded = (html) => html
  .replace(/\\"/g, '"')
  .replace(/\\u003c/gi, '<')
  .replace(/\\u003e/gi, '>')
  .replace(/\\u0026/gi, '&')
  .replace(/\\n/g, ' ');

/**
 * @param {string} html
 * @param {number} [limit]
 * @returns {{ dayBand: string|null, show: string, amount: number, currency: string }[]}
 */
export function parsePriceTables(html, limit = 40) {
  const rows = [];
  let dayBand = null;

  for (const match of unescapeEmbedded(html).matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    // Cells are kept separate: the label is the first, the price the last.
    const cells = [...match[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map((cell) => stripTags(cell[1]))
      .filter(Boolean);
    if (!cells.length) continue;

    const priced = cells.find((cell) => PRICE_RE.test(cell));
    if (!priced) {
      // A row with no price introduces the band the following rows sit in.
      const label = cells[0];
      if (label && label.length < 70) dayBand = label;
      continue;
    }

    const price = parsePrice(priced.match(PRICE_RE)[0], 'NPR');
    const show = cells.find((cell) => cell !== priced) ?? 'Ticket';
    if (!price || !show) continue;

    rows.push({ dayBand, show, ...price });
    if (rows.length >= limit) break;
  }

  // The same table is often rendered twice (once server side, once in the
  // hydration payload), so the same band+show+price arrives more than once.
  const seen = new Set();
  return rows.filter((row) => {
    const key = `${row.dayBand}|${row.show}|${row.amount}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
