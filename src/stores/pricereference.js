/**
 * "Official price" reference sources.
 *
 * Gadgetbyte and similar Nepali tech publications are not shops - they publish
 * the official launch price of a device, often as a variant table
 * ("iPhone 17 | 256GB | Rs. 1,73,000"). That is genuinely useful context next
 * to shop listings, so those rows are included but marked `kind: 'reference'`,
 * labelled in the UI, and excluded from the "Best price" badge: you cannot buy
 * from an article.
 *
 * Extraction is deliberately strict. A naive "first Rs. number in the post"
 * reader is worse than useless - searched against a tech blog it will happily
 * return the price of an unrelated app subscription. So a price is only taken
 * when BOTH the post title and the individual table row / list item match the
 * query. No match, no row.
 */
import { getJson } from '../http.js';
import { stripTags } from '../html.js';
import { parsePrice } from '../price.js';
import { isRelevant, scoreListing } from '../relevance.js';

const PRICE_RE = /(?:Rs\.?|NPR|रु)\s*[\d,]{4,}(?:\.\d+)?/i;

// Tech blogs speculate about unreleased prices. A guess is not a price.
const SPECULATIVE_RE = /\b(could|might|expected|expect|rumou?r|leak|likely|estimate|around|approximately)\b/i;

/** Split rendered post HTML into the smallest text units that carry a price. */
function priceRows(html) {
  const rows = [];
  for (const re of [/<tr[^>]*>([\s\S]*?)<\/tr>/gi, /<li[^>]*>([\s\S]*?)<\/li>/gi, /<p[^>]*>([\s\S]*?)<\/p>/gi]) {
    let match;
    while ((match = re.exec(html))) {
      const text = stripTags(match[1]);
      if (text && PRICE_RE.test(text) && text.length < 220) rows.push(text);
    }
  }
  return rows;
}

/**
 * @param {object} config
 * @param {string} config.id
 * @param {string} config.name
 * @param {string} config.homepage  WordPress site root, no trailing slash
 */
export function wordpressPriceReference({ id, name, homepage }) {
  return {
    id,
    name,
    homepage,
    kind: 'reference',

    async search(query, { limit = 6, timeout } = {}) {
      const url =
        `${homepage}/wp-json/wp/v2/posts?search=${encodeURIComponent(`${query} price nepal`)}` +
        '&per_page=5&_fields=link,title,content';
      const posts = await getJson(url, { timeout });
      if (!Array.isArray(posts)) return [];

      const rows = [];

      for (const post of posts) {
        const title = stripTags(post.title?.rendered ?? '');
        // Gate 1: the article itself must be about what was searched for.
        if (!isRelevant(query, title, 0.6)) continue;

        for (const text of priceRows(post.content?.rendered ?? '')) {
          // Gate 2: this specific row must mention the product too, so a
          // "related devices" table or an unrelated aside cannot leak in.
          if (SPECULATIVE_RE.test(text)) continue;

          const { score } = scoreListing(query, text);
          if (score < 0.6) continue;

          const price = parsePrice(text.match(PRICE_RE)?.[0], 'NPR');
          if (!price) continue;

          rows.push({
            productName: text.replace(PRICE_RE, '').replace(/[|\-–—:,\s]+$/, '').trim() || title,
            ...price,
            url: post.link,
            availability: 'unknown',
            note: `Official price published by ${name} — not a live shop listing`,
          });

          if (rows.length >= limit) return rows;
        }
      }

      return rows;
    },
  };
}

export default wordpressPriceReference({
  id: 'gadgetbyte',
  name: 'Gadgetbyte Nepal',
  homepage: 'https://www.gadgetbyte.com',
});
