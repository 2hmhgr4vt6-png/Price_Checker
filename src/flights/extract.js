/**
 * In-page extraction of fare rows from an airline or OTA results page.
 *
 * Every Nepali booking site renders its results differently, and none of them
 * publishes a stable class contract, so instead of per-site selectors this
 * looks for what a fare row unavoidably contains: a price, a departure time,
 * and an airline. Requiring all three together is what keeps promo banners,
 * baggage-fee tables and footer text out.
 *
 * Returns raw strings; parsing into numbers happens in Node, where it can be
 * tested. Must stay self-contained - it is serialised into the browser.
 */

/* c8 ignore start - runs inside Chromium */
export function extractFareRows() {
  const PRICE_RE = /(?:npr|rs\.?|रु)\s*[\d,]{3,}(?:\.\d+)?/i;
  // The optional am/pm sits inside the group so a match never carries the
  // trailing space with it: "07:50 " and "07:50" must not be different times.
  const TIME_RE = /\b(?:[01]?\d|2[0-3]):[0-5]\d(?:\s*[ap]\.?m\.?)?/i;

  // Carriers with scheduled service in Nepal, plus the international airlines
  // that appear in Kathmandu results. Matching on the operator's name is what
  // distinguishes a fare row from any other priced block on the page.
  const AIRLINES = [
    'buddha air', 'yeti airlines', 'yeti', 'tara air', 'shree airlines', 'shree',
    'saurya airlines', 'saurya', 'nepal airlines', 'himalaya airlines', 'sita air',
    'summit air', 'guna airlines', 'simrik airlines', 'manang air', 'altitude air',
    'air dynasty', 'kailash', 'mountain air',
    'indigo', 'air india', 'vistara', 'spicejet', 'qatar airways', 'emirates',
    'flydubai', 'air arabia', 'etihad', 'turkish airlines', 'thai airways',
    'thai lion', 'malaysia airlines', 'airasia', 'batik air', 'singapore airlines',
    'cathay', 'korean air', 'china southern', 'china eastern', 'sichuan airlines',
    'air china', 'druk air', 'bhutan airlines', 'us-bangla', 'biman', 'srilankan',
    'oman air', 'salam air', 'kuwait airways', 'jazeera', 'saudia', 'gulf air',
    'fly jinnah', 'nepal airlines corporation',
  ];

  const clean = (text) => (text || '').replace(/\s+/g, ' ').trim();
  const absolute = (href) => { try { return new URL(href, location.origin).href; } catch { return null; } };

  const rows = [];
  const seen = new Set();

  // Walk from the smallest containers upward: the tightest element holding a
  // price, a time and an airline is the fare row itself, not the page wrapper.
  const candidates = document.querySelectorAll('tr, li, article, section, div');

  for (const element of candidates) {
    const text = clean(element.innerText);
    if (text.length < 15 || text.length > 600) continue;

    const price = text.match(PRICE_RE);
    const time = text.match(TIME_RE);
    if (!price || !time) continue;

    const lower = text.toLowerCase();
    const airline = AIRLINES.find((name) => lower.includes(name));
    if (!airline) continue;

    // Skip an element whose child already matched - keep the innermost row.
    if ([...element.querySelectorAll('*')].some((child) => {
      const childText = clean(child.innerText);
      return childText.length > 15
        && PRICE_RE.test(childText)
        && TIME_RE.test(childText)
        && AIRLINES.some((name) => childText.toLowerCase().includes(name));
    })) continue;

    const key = text.slice(0, 160);
    if (seen.has(key)) continue;
    seen.add(key);

    const times = text.match(new RegExp(TIME_RE.source, 'gi')) ?? [];
    const link = element.querySelector('a[href]')?.getAttribute('href');
    // A flight designator is a 2-3 character carrier code then 2-4 digits:
    // "U4 601", "YT 673", "SHA 502". The lookahead stops a currency prefix
    // ("NPR 5499") being read as one.
    const flightNumber = text.match(/\b(?!NPR|RS|USD|INR)([A-Z]{2}|[A-Z]\d|\d[A-Z]|[A-Z]{3})[\s-]?(\d{2,4})\b/);

    rows.push({
      airline,
      priceText: price[0],
      departTime: times[0]?.trim() ?? null,
      arriveTime: times[1]?.trim() ?? null,
      flightNumber: flightNumber ? `${flightNumber[1]} ${flightNumber[2]}` : null,
      url: link ? absolute(link) : location.href,
      text: text.slice(0, 220),
    });
  }

  return rows;
}
/* c8 ignore stop */

/** Title-case an airline name matched in lowercase. */
export function prettyAirline(name) {
  return String(name)
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
