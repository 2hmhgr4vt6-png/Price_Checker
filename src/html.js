/**
 * Dependency-free HTML helpers.
 *
 * The store adapters only need to pull a handful of fields out of a search
 * results page, so a full DOM parser (cheerio/jsdom) would be more weight than
 * value. If adapters ever grow to need real CSS selectors, swap these helpers
 * for cheerio - nothing outside this file depends on the implementation.
 */

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’',
  lsquo: '‘', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—',
};

export function decodeEntities(input = '') {
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (match, name) => ENTITIES[name.toLowerCase()] ?? match);
}

/** Strip tags and collapse whitespace, e.g. "<b>Rs. 1,200</b>" -> "Rs. 1,200". */
export function stripTags(html = '') {
  return decodeEntities(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/**
 * Return every chunk of HTML that sits inside an element carrying `className`.
 *
 * The class must appear as a whole token in the class list: asking for
 * "common-item" must not match "common-item-wrapper", or a grid container
 * would be returned as one giant block instead of the cards inside it.
 */
export function blocksWithClass(html, className, limit = 60) {
  const blocks = [];
  const opener = /<(\w+)\b[^>]*\bclass="([^"]*)"[^>]*>/gi;
  let match;

  while ((match = opener.exec(html)) && blocks.length < limit) {
    const [, tag, classList] = match;
    if (!classList.split(/\s+/).includes(className)) continue;

    const start = match.index;
    const nested = new RegExp(`<${tag}\\b[^>]*>|</${tag}>`, 'gi');
    nested.lastIndex = opener.lastIndex;

    let depth = 1;
    let inner;
    while (depth > 0 && (inner = nested.exec(html))) {
      depth += inner[0].startsWith('</') ? -1 : 1;
    }

    const end = inner ? nested.lastIndex : html.length;
    blocks.push(html.slice(start, end));
    opener.lastIndex = end;
  }

  return blocks;
}

/** First value of `attribute` found anywhere in `html`. */
export function attr(html, attribute) {
  const match = html.match(new RegExp(`\\b${attribute}="([^"]*)"`, 'i'));
  return match ? decodeEntities(match[1]) : null;
}

/** Parse every <script type="application/ld+json"> payload on a page. */
export function jsonLd(html) {
  const results = [];
  const re = /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let match;

  while ((match = re.exec(html))) {
    try {
      results.push(JSON.parse(match[1].trim()));
    } catch {
      // Malformed JSON-LD is common in the wild - ignore and keep going.
    }
  }

  return results;
}
