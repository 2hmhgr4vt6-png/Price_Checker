/**
 * Understanding what the shopper meant.
 *
 * Nepali shops phrase the same product half a dozen ways, and shoppers type it
 * a seventh. Three concrete failures this fixes, all reproduced against live
 * stores:
 *
 *   "samsung galaxy s26 ultra" found nothing on Daraz, whose titles read
 *       "Samsung S26 Ultra" - no "Galaxy".
 *   "iphone 17 pm" found nothing anywhere, because no title spells "pm".
 *   "samsng galaxy s26" found nothing, because of one missing letter.
 *
 * So a raw query is turned into:
 *   - a CANONICAL form, with abbreviations expanded ("pm" -> "pro max");
 *   - REQUIRED and OPTIONAL tokens, where brand and product-line words are
 *     optional because shops drop them freely;
 *   - a short list of VARIANTS to send to each store's own search engine.
 *
 * Broadening what is *sent* to a store is safe because what comes back is
 * still filtered against the shopper's canonical intent - a wider net, not a
 * looser standard.
 */

/** Shorthand shoppers type, and what it stands for. */
const ABBREVIATIONS = new Map([
  ['pm', 'pro max'],
  ['pmax', 'pro max'],
  ['promax', 'pro max'],
  ['prm', 'pro max'],
  ['ultr', 'ultra'],
  ['ult', 'ultra'],
  ['gen', 'generation'],
  ['ltd', 'limited'],
  ['ss', 'samsung'],
  ['sam', 'samsung'],
  ['mbp', 'macbook pro'],
  ['mba', 'macbook air'],
  ['ipd', 'ipad'],
  ['tab', 'tablet'],
  ['ac', 'air conditioner'],
  ['tv', 'tv'],
  ['wm', 'washing machine'],
  ['fridge', 'refrigerator'],
]);

/**
 * Brand and product-line words. A shop may print any subset of them, so their
 * absence from a title is not evidence that the title is the wrong product:
 * "Samsung S26 Ultra", "Galaxy S26 Ultra" and "Samsung Galaxy S26 Ultra" are
 * one phone.
 */
const OPTIONAL_WORDS = new Set([
  // brands
  'samsung', 'apple', 'xiaomi', 'oneplus', 'oppo', 'vivo', 'realme', 'honor',
  'huawei', 'nokia', 'motorola', 'lenovo', 'asus', 'acer', 'dell', 'hp', 'msi',
  'lg', 'sony', 'tecno', 'infinix', 'itel', 'google', 'nothing', 'philips',
  // product lines and marketing words
  'galaxy', 'redmi', 'poco', 'nord', 'pixel', 'thinkpad', 'ideapad', 'inspiron',
  'latitude', 'pavilion', 'zenbook', 'vivobook',
  'new', 'original', 'official', 'genuine', 'brand',
  '4g', '5g', 'dual', 'sim',
]);

/** Product-line words a brand's models are commonly sold under. */
const BRAND_LINES = new Map([
  ['samsung', 'galaxy'],
  ['google', 'pixel'],
  ['xiaomi', 'redmi'],
]);

const STOPWORDS = new Set(['the', 'a', 'an', 'and', 'for', 'with', 'in', 'of']);

/**
 * Words worth spell-checking a query against. Tolerating a typo when matching
 * titles is not enough on its own: a store's own search engine gets the raw
 * string, and Daraz returns nothing at all for "samsng". So a misspelling of a
 * word we know is corrected in one of the variants we send out.
 */
const VOCABULARY = [
  'samsung', 'apple', 'iphone', 'ipad', 'macbook', 'airpods', 'xiaomi', 'redmi',
  'poco', 'oneplus', 'oppo', 'vivo', 'realme', 'honor', 'huawei', 'nokia',
  'motorola', 'lenovo', 'asus', 'acer', 'dell', 'nothing', 'google', 'pixel',
  'galaxy', 'ultra', 'laptop', 'mobile', 'tablet', 'watch', 'earbuds',
  'refrigerator', 'washing', 'machine', 'television', 'monitor', 'printer',
  'fryer', 'blender', 'heater', 'cooler', 'speaker', 'camera', 'console',
  'thinkpad', 'ideapad', 'inspiron', 'latitude', 'pavilion', 'zenbook', 'vivobook',
];

/** Lowercase, drop punctuation, glue "128 gb" into "128gb". */
export function normalise(text = '') {
  const base = String(text)
    .toLowerCase()
    .replace(/\+/g, ' plus ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return base.replace(/(\d)\s+(gb|tb|mb|inch|in|mah|hz|w|k)\b/g, '$1$2');
}

export function tokenise(text) {
  return normalise(text).split(' ').filter((token) => token && !STOPWORDS.has(token));
}

/**
 * @returns {{ canonical: string, tokens: string[], required: string[], optional: string[] }}
 */
export function canonicalise(raw) {
  const expanded = [];
  for (const token of tokenise(raw)) {
    const replacement = ABBREVIATIONS.get(token);
    if (replacement) expanded.push(...replacement.split(' '));
    else expanded.push(token);
  }

  const tokens = [...new Set(expanded)];
  const required = tokens.filter((token) => !OPTIONAL_WORDS.has(token));
  const optional = tokens.filter((token) => OPTIONAL_WORDS.has(token));

  return {
    canonical: tokens.join(' '),
    tokens,
    // A query made only of brand words ("samsung") has to match on those, or
    // it would match everything.
    required: required.length ? required : tokens,
    optional: required.length ? optional : [],
  };
}

/**
 * Correct a token that is one or two edits from a word we know, leaving
 * anything else alone. Digits are never touched - "s26" must not become "s25".
 */
export function spellFix(token) {
  if (token.length < 5 || /\d/.test(token) || VOCABULARY.includes(token)) return token;

  const budget = token.length >= 8 ? 2 : 1;
  let best = null;
  let bestDistance = budget + 1;

  for (const word of VOCABULARY) {
    const distance = editDistance(token, word, budget);
    if (distance < bestDistance) {
      best = word;
      bestDistance = distance;
    }
  }

  return bestDistance <= budget ? best : token;
}

/**
 * Search strings to try against a store, best first. A store is only asked for
 * the next variant when the previous one came back empty.
 *
 * @returns {string[]} 1-4 variants, deduplicated
 */
export function queryVariants(raw) {
  const { canonical, tokens } = canonicalise(raw);
  const variants = [String(raw).trim(), canonical];

  // Spelling-corrected form, when it differs: "samsng galaxy s26" -> "samsung
  // galaxy s26", which is what a store's search engine can actually find.
  const corrected = tokens.map(spellFix);
  if (corrected.join(' ') !== canonical) variants.push(corrected.join(' '));

  // Drop the brand: shops that already sit in one brand's catalogue often omit
  // it from titles, and a brandless query is what their search engine indexes.
  const withoutBrand = corrected.filter((token) => !OPTIONAL_WORDS.has(token));
  if (withoutBrand.length >= 2 && withoutBrand.length < corrected.length) {
    variants.push(withoutBrand.join(' '));
  }

  // Insert the brand's line word: "samsung s26 ultra" -> "samsung galaxy s26 ultra".
  for (const [brand, line] of BRAND_LINES) {
    if (corrected.includes(brand) && !corrected.includes(line)) {
      variants.push(corrected.flatMap((token) => (token === brand ? [brand, line] : [token])).join(' '));
    }
  }

  return [...new Set(variants.map((variant) => variant.trim()).filter(Boolean))].slice(0, 4);
}

/**
 * Levenshtein distance, capped: anything past `max` stops early, because the
 * only question asked here is "is this within one or two typos?".
 */
export function editDistance(a, b, max = 2) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let best = i;

    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      best = Math.min(best, current[j]);
    }

    if (best > max) return max + 1;
    previous = current;
  }

  return previous[b.length];
}

/**
 * Does `token` appear in `haystackTokens`, allowing for a typo?
 *
 * Exact match first. Then one edit for words of 5+ letters ("samsng" ->
 * "samsung"), two for 8+. Short tokens and anything containing a digit are
 * matched exactly: "s26" and "s25" are one edit apart but different phones.
 */
export function tokenMatches(token, haystackTokens) {
  if (haystackTokens.includes(token)) return true;
  if (/\d/.test(token) || token.length < 5) return false;

  const budget = token.length >= 8 ? 2 : 1;
  return haystackTokens.some((candidate) => {
    if (/\d/.test(candidate)) return false;
    // A title word that merely starts with the query word ("galaxys" vs
    // "galaxy") is a match; the reverse is handled by the distance check.
    if (candidate.startsWith(token) && candidate.length - token.length <= 2) return true;
    return editDistance(token, candidate, budget) <= budget;
  });
}
