/**
 * Relevance scoring.
 *
 * Nepali marketplace search is noisy: querying "iPhone 14 128GB" on Daraz
 * returns phone cases, screen protectors and "combo offers" priced at a few
 * hundred rupees. Without filtering, the cheapest row - and therefore the
 * "Best Price" badge - would be a Rs. 299 silicone cover. This module keeps
 * accessories out unless the shopper actually asked for one.
 */

const STOPWORDS = new Set(['the', 'a', 'an', 'and', 'for', 'with', 'in', 'of', 'new']);

const ACCESSORY_WORDS = [
  'case', 'cover', 'casing', 'pouch', 'skin', 'sleeve', 'bumper',
  'screen protector', 'tempered glass', 'screen guard', 'protector',
  'charger', 'cable', 'adapter', 'adaptor', 'power bank', 'powerbank',
  'holder', 'stand', 'mount', 'strap', 'lens protector', 'camera protector',
  'sticker', 'skin wrap', 'combo offer', 'replacement', 'battery',
  'earphone', 'headphone', 'airpod', 'stylus', 'sim tray', 'back glass',
];

/** Lowercase, drop punctuation, and glue "128 gb" into "128gb" so both match. */
export function normalise(text = '') {
  const base = String(text).toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  return base.replace(/(\d)\s+(gb|tb|mb|inch|in|mah|hz|w|k)\b/g, '$1$2');
}

export function tokenise(text) {
  return normalise(text).split(' ').filter((token) => token && !STOPWORDS.has(token));
}

const mentionsAccessory = (text) => ACCESSORY_WORDS.some((word) => text.includes(word));

/**
 * @returns {{ score: number, matched: string[], missing: string[], accessory: boolean }}
 */
export function scoreListing(query, productName) {
  const queryTokens = [...new Set(tokenise(query))];
  const haystack = normalise(productName);
  const padded = ` ${haystack} `;

  const matched = [];
  const missing = [];
  for (const token of queryTokens) {
    // Word-boundary match, so "14" does not match "144" and "pro" not "product".
    (padded.includes(` ${token} `) || new RegExp(`\\b${token}\\b`).test(haystack) ? matched : missing).push(token);
  }

  const queryWantsAccessory = mentionsAccessory(normalise(query));
  const accessory = !queryWantsAccessory && mentionsAccessory(haystack);

  return {
    score: queryTokens.length ? matched.length / queryTokens.length : 0,
    matched,
    missing,
    accessory,
  };
}

/**
 * Keep listings that match most of the query and are not off-topic accessories.
 *
 * 0.7 is the sweet spot found against live Daraz results: it still tolerates
 * stores that word titles differently ("Latitude 3420 Core i5" for "Dell
 * laptop i5"), while rejecting near-misses that change the product category -
 * a "Dell tiny PC i5" desktop no longer answers a search for a Dell laptop.
 */
export function isRelevant(query, productName, minScore = 0.7) {
  const { score, accessory } = scoreListing(query, productName);
  return score >= minScore && !accessory;
}
