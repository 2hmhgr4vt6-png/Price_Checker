/**
 * Relevance scoring: does this listing answer what the shopper asked for?
 *
 * Two jobs. First, keep accessories out: querying "iPhone 14 128GB" on Daraz
 * returns pages of cases, films and camera rings at a few hundred rupees, and
 * without filtering the "Best price" badge would land on a silicone cover.
 *
 * Second, be tolerant of how differently shops write the same product. Query
 * understanding lives in ./query.js - brand and product-line words are
 * optional, abbreviations are expanded, and single typos still match - so a
 * search for "Samsung Galaxy S26 Ultra" matches a title that reads only
 * "Samsung S26 Ultra".
 */
import { canonicalise, normalise, tokenise, tokenMatches } from './query.js';

export { normalise, tokenise };

const ACCESSORY_WORDS = [
  'case', 'cover', 'casing', 'pouch', 'skin', 'sleeve', 'bumper',
  'screen protector', 'tempered glass', 'screen guard', 'protector',
  'charger', 'cable', 'adapter', 'adaptor', 'power bank', 'powerbank',
  'holder', 'stand', 'mount', 'strap', 'lens protector', 'camera protector',
  'sticker', 'skin wrap', 'combo offer', 'replacement', 'battery',
  'earphone', 'headphone', 'airpod', 'stylus', 'sim tray', 'back glass',
  // Camera-lens rings, screen films and grips are the cheapest listings on
  // Daraz for any flagship search, so they crowd the top of the table.
  // Searching for one of these inverts the rule and brings them back.
  'lens', 'ring', 'film', 'grip', 'dock', 'sim ejector', 'keyboard cover',
];

/**
 * Phone and laptop brands are mutually exclusive: if the shopper named one and
 * the title names a different one, it is the wrong product however well the
 * model number lines up.
 */
const BRANDS = new Set([
  'samsung', 'apple', 'xiaomi', 'oneplus', 'oppo', 'vivo', 'realme', 'honor',
  'huawei', 'nokia', 'motorola', 'lenovo', 'asus', 'acer', 'dell', 'hp', 'msi',
  'lg', 'sony', 'tecno', 'infinix', 'itel', 'google', 'nothing', 'philips',
]);

const mentionsAccessory = (text) => ACCESSORY_WORDS.some((word) => text.includes(word));

function brandsConflict(queryTokens, titleTokens) {
  const queryBrands = queryTokens.filter((token) => BRANDS.has(token));
  const titleBrands = titleTokens.filter((token) => BRANDS.has(token));
  if (!queryBrands.length || !titleBrands.length) return false;
  return !titleBrands.some((brand) => queryBrands.includes(brand));
}

/**
 * @returns {{ score: number, matched: string[], missing: string[], accessory: boolean }}
 *   `score` counts only the required tokens: a brand or line word the shop left
 *   out of its title is not evidence against the listing.
 */
export function scoreListing(query, productName) {
  const { tokens, required, optional } = canonicalise(query);
  const titleTokens = tokenise(productName);
  const haystack = normalise(productName);

  const matched = required.filter((token) => tokenMatches(token, titleTokens));
  const missing = required.filter((token) => !matched.includes(token));

  const queryWantsAccessory = mentionsAccessory(normalise(query));
  const accessory = !queryWantsAccessory && mentionsAccessory(haystack);

  return {
    score: required.length ? matched.length / required.length : 0,
    matched: [...matched, ...optional.filter((token) => tokenMatches(token, titleTokens))],
    missing,
    accessory,
    wrongBrand: brandsConflict(tokens, titleTokens),
  };
}

/**
 * Keep listings that match what was asked for and are not off-topic.
 *
 * 0.7 is the threshold found against live Daraz results: forgiving enough for
 * titles worded differently ("Latitude 3420 Core i5" for "Dell laptop i5"),
 * strict enough to reject a near-miss that changes the product category - a
 * "Dell tiny PC i5" desktop no longer answers a search for a Dell laptop.
 */
export function isRelevant(query, productName, minScore = 0.7) {
  const { score, accessory, wrongBrand } = scoreListing(query, productName);
  return score >= minScore && !accessory && !wrongBrand;
}
