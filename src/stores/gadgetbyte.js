/**
 * Gadgetbyte Nepal - official price reference.
 *
 * Gadgetbyte is a review publication, not a shop, and that is exactly why it
 * is useful here: it publishes the *official* Nepali price of a device, which
 * is the number to judge shop listings against. Its "<product> Price in Nepal"
 * articles carry a clean variant table:
 *
 *     iPhone 17 Price in Nepal (Official)
 *     256GB   NPR 173,499
 *     512GB   NPR 215,699
 *
 * Rows from here are tagged as a reference in the UI, link to the article
 * rather than a cart, and are excluded from the "Best price" badge - you
 * cannot buy from a review.
 *
 * The site is a Next.js front-end (no WordPress REST API), so this reads the
 * server-rendered search page for candidate articles and then the article
 * itself. Product data in the flight payload arrives with escaped quotes,
 * hence the unescape step.
 */
import { getText } from '../http.js';
import { stripTags } from '../html.js';
import { parsePrice } from '../price.js';
import { isRelevant, scoreListing, tokenise } from '../relevance.js';

const ORIGIN = 'https://www.gadgetbytenepal.com';
const PRICE_RE = /(?:NPR|Rs\.?|रु)\s*[\d,]{4,}/i;
const PRICE_RE_ALL = /(?:NPR|Rs\.?|रु)\s*[\d,]{4,}/gi;

// A guess is not a price: skip rows hedging about unreleased devices.
const SPECULATIVE_RE = /\b(could|might|expected|expect|rumou?r|leak|likely|estimate)\b/i;

// What the left-hand cell of a price row looks like when it is a variant of
// the article's product: "256GB", "12/512GB", "6L", "55 inch".
const VARIANT_RE = /\d+\s?(?:gb|tb|mb|l|ml|inch|in|w|mah|hz)\b|\d+\s?\/\s?\d+|^\d+(?:\.\d+)?$/i;

/** Next.js flight payloads embed HTML with escaped quotes and newlines. */
const unescapeFlight = (html) => html.replace(/\\"/g, '"').replace(/\\n/g, ' ');

/** Article slugs on the search page, best candidates first. */
function candidateArticles(html, query) {
  const tokens = tokenise(query);
  const slugs = new Set();

  for (const match of unescapeFlight(html).matchAll(/href="(\/[a-z0-9-]{6,80}\/)"/g)) {
    slugs.add(match[1]);
  }

  // Slug words that carry no product meaning, so they are not counted as
  // "extra" when judging how closely a slug matches the query.
  const FILLER = new Set(['price', 'in', 'nepal', 'and', 'specs', 'review', 'official', 'update', 'updated']);

  return [...slugs]
    .map((slug) => {
      const words = slug.replace(/[/-]+/g, ' ').trim().split(' ').filter(Boolean);
      const matched = tokens.filter((token) => words.includes(token)).length;
      // Words the slug adds beyond the query: "pro", "max", "fe", "ultra", a
      // trailing "2" on a re-published article.
      const extra = words.filter((word) => !FILLER.has(word) && !tokens.includes(word)).length;
      return { slug, matched, extra, isPricePage: words.includes('price') };
    })
    // Every query token must appear in the slug, or it is a different device:
    // "iphone-16-price-in-nepal" must not answer a search for the iPhone 17.
    .filter((entry) => entry.matched === tokens.length && entry.isPricePage)
    // Fewest extra words first, so a search for "iPhone 17" reads the iPhone 17
    // article rather than the iPhone 17 Pro Max one.
    .sort((a, b) => a.extra - b.extra || a.slug.length - b.slug.length)
    .map((entry) => `${ORIGIN}${entry.slug}`);
}

/**
 * Read every `<tr>` in the article. A header row naming the product supplies
 * the model name; the rows under it supply variant and price.
 */
function pricesFromArticle(html, query, articleUrl, limit) {
  const rows = [];
  let productName = null;

  for (const match of unescapeFlight(html).matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const text = stripTags(match[1]);
    if (!text) continue;

    if (!PRICE_RE.test(text)) {
      // e.g. "iPhone 17 Price in Nepal (Official)" -> "iPhone 17"
      const heading = text
        .replace(/\b(old|new)\s+price\b/gi, ' ')
        .replace(/price\s+in\s+nepal.*$/i, '')
        .replace(/[()\s|]+$/, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (heading && heading.length < 80 && isRelevant(query, heading, 0.6)) productName = heading;
      continue;
    }

    if (SPECULATIVE_RE.test(text)) continue;

    // Gadgetbyte re-publishes price changes as an "Old Price | New Price"
    // table, so a row can carry two figures. The last one is the current
    // price; taking the first would quote a price that no longer applies.
    const figures = text.match(PRICE_RE_ALL);
    const price = parsePrice(figures[figures.length - 1], 'NPR');
    if (!price) continue;

    const variant = text
      .replace(PRICE_RE_ALL, ' ')
      .replace(/\(?\s*out of stock\s*\)?/i, ' ')
      .replace(/\s+/g, ' ')
      .replace(/[|\-–—:,\s]+$/, '')
      .trim();
    // A "related devices" table at the foot of the article reuses the same
    // markup, so its rows would otherwise inherit this article's product name
    // and pass the check below. Require the cell to be either a recognisable
    // variant or relevant on its own: "256GB" is fine under an iPhone 17
    // heading, "Galaxy S25 Ultra" is not.
    if (variant && !VARIANT_RE.test(variant) && scoreListing(query, variant).score < 0.6) continue;

    const name = [productName, variant].filter(Boolean).join(' ').trim() || variant;
    if (!name || scoreListing(query, name).score < 0.6) continue;

    rows.push({
      productName: name,
      ...price,
      url: articleUrl,
      availability: /out of stock/i.test(text) ? 'out_of_stock' : 'unknown',
      note: 'Official price published by Gadgetbyte — not a shop listing',
    });

    if (rows.length >= limit) break;
  }

  return rows;
}

export default {
  id: 'gadgetbyte',
  name: 'Gadgetbyte Nepal',
  homepage: ORIGIN,
  kind: 'reference',

  async search(query, { limit = 6, timeout } = {}) {
    const searchHtml = await getText(`${ORIGIN}/search/?q=${encodeURIComponent(query)}`, { timeout });
    const articles = candidateArticles(searchHtml, query).slice(0, 2);

    const rows = [];
    for (const articleUrl of articles) {
      const html = await getText(articleUrl, { timeout }).catch(() => null);
      if (!html) continue;

      rows.push(...pricesFromArticle(html, query, articleUrl, limit - rows.length));
      if (rows.length >= limit) break;
    }

    return rows;
  },
};

// Exported for tests: the parsing rules are the risky part of this adapter.
export const __parseArticle = pricesFromArticle;
export const __candidateArticles = candidateArticles;
