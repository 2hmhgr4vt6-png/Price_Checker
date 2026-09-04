/**
 * Config-driven fare provider for booking sites.
 *
 * Every Nepali airline and agency puts its fares behind a search form, and
 * each form is different. Writing a bespoke scraper per site does not scale
 * and rots fast, so this fills a form the way a person would: find the field
 * that means "from", the one that means "to", the date field, set them, press
 * the search button, then read the fare rows off the result.
 *
 * Fields are located by name, id, placeholder and nearby label text, which
 * survives a redesign far better than a CSS path. A site with an awkward form
 * can override any of it - see ./sastotickets.js.
 *
 * Adding a booking site is therefore usually:
 *   bookingFormProvider({ id: 'x', name: 'X', homepage: 'https://x.com' })
 */
import { renderFormFlow, browserAvailable } from '../browser.js';
import { extractFareRows, prettyAirline } from './extract.js';
import { parsePrice } from '../price.js';

/**
 * Runs in the page. Self-contained: no imports, no closures.
 * @param {object} input { from, to, date, adults, children, infants, overrides }
 */
/* c8 ignore start - runs inside Chromium */
function fillBookingForm(input) {
  const { overrides = {} } = input;

  const visible = (element) => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  /** Everything that identifies a field to a human reader. */
  const describe = (field) => {
    const parts = [field.name, field.id, field.placeholder, field.getAttribute('aria-label')];
    if (field.id) {
      const label = document.querySelector(`label[for="${field.id}"]`);
      if (label) parts.push(label.innerText);
    }
    const wrapper = field.closest('div, td, li, fieldset');
    if (wrapper) parts.push(wrapper.querySelector('label')?.innerText);
    return parts.filter(Boolean).join(' ').toLowerCase();
  };

  const candidates = [...document.querySelectorAll('input, select')].filter(visible);

  const find = (selector, patterns, exclude = []) => {
    if (selector) {
      const direct = document.querySelector(selector);
      if (direct) return direct;
    }
    for (const pattern of patterns) {
      const match = candidates.find((field) => {
        const text = describe(field);
        return pattern.test(text) && !exclude.some((bad) => bad.test(text));
      });
      if (match) return match;
    }
    return null;
  };

  const set = (field, value) => {
    if (!field || value == null) return false;
    field.value = String(value);
    // Frameworks listen for these; a bare assignment fires nothing and leaves
    // the site's own state out of step with what is on screen.
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  };

  // "return"/"arrival" fields must not be mistaken for the outbound ones.
  const RETURN = [/return/i, /arriv/i, /inbound/i, /dest_date/i];

  const filled = {
    from: set(find(overrides.from, [/\b(origin|from|depart(ure)?[_\s-]?(city|airport|station)?)\b/i, /originlocationcode/i], RETURN), input.from),
    to: set(find(overrides.to, [/\b(destination|to|arrival[_\s-]?(city|airport)?)\b/i, /destinationlocationcode/i], [/\breturn\b/i]), input.to),
    date: set(find(overrides.date, [/\b(depart(ure)?[_\s-]?date|departuredate|onward|journey[_\s-]?date)\b/i, /\bdate\b/i], RETURN), input.date),
  };

  set(find(overrides.adults, [/\badults?\b/i, /\bpax\b/i]), input.adults);
  if (input.children) set(find(overrides.children, [/\bchild(ren)?\b/i]), input.children);
  if (input.infants) set(find(overrides.infants, [/\binfants?\b/i]), input.infants);

  // Prefer the site's own button: it runs their validation and whatever state
  // their scripts set up before submitting.
  const buttons = [...document.querySelectorAll('button, input[type="submit"], a[role="button"]')].filter(visible);
  const button = (overrides.submit && document.querySelector(overrides.submit))
    || buttons.find((element) => /search|find|compare|show\s*flight/i.test(element.innerText || element.value || ''));

  if (button) button.click();
  else (overrides.form ? document.querySelector(overrides.form) : document.querySelector('form'))?.submit();

  return filled;
}
/* c8 ignore stop */

/**
 * @param {object} config
 * @param {string} config.id
 * @param {string} config.name
 * @param {string} config.homepage
 * @param {string} [config.searchPage]  page holding the form; defaults to homepage
 * @param {object} [config.overrides]   { from, to, date, adults, submit, form } CSS selectors
 * @param {string} [config.waitFor]     selector to wait for on the results page
 * @param {string} [config.kind]        'ota' | 'airline'
 * @param {boolean} [config.verified]   has this been run against the live site?
 */
export function bookingFormProvider({
  id, name, homepage, searchPage, overrides = {}, waitFor, kind = 'ota', verified = false,
}) {
  return {
    id,
    name,
    homepage,
    kind,
    needsBrowser: true,
    verified,

    async searchFlights({ from, to, date, adults = 1, children = 0, infants = 0 }, { limit = 25, timeout } = {}) {
      if (!(await browserAvailable())) {
        throw new Error('Needs headless rendering - run: npm run setup:browser');
      }

      const { url, title, bodyText, data } = await renderFormFlow(searchPage ?? homepage, {
        prepare: fillBookingForm,
        input: { from, to, date, adults, children, infants, overrides },
        extract: extractFareRows,
        waitFor: waitFor ?? '[class*="flight"], [class*="result"], [class*="fare"]',
        timeout,
      });

      if (process.env.RENDER_DEBUG) {
        console.log(`[flights] ${id} -> ${url}`);
        console.log(`[flights] ${id} title: ${title}`);
        console.log(`[flights] ${id} rows: ${data?.length ?? 0}`);
        console.log(`[flights] ${id} page text: ${bodyText}`);
        for (const row of (data ?? []).slice(0, 5)) {
          console.log(`[flights] ${id}   ${row.priceText} ${row.airline} ${row.departTime}`);
        }
      }

      if (!data?.length) {
        // Tell the three real causes apart: the site refused the search, the
        // route genuinely has nothing, or extraction missed rows on the page.
        const stayedPut = new URL(url).pathname === new URL(searchPage ?? homepage).pathname;
        if (stayedPut) throw new Error(`${name} did not accept the search (still on ${new URL(url).pathname})`);
        if (/no (flights?|results?|fares?|seats?)/i.test(bodyText ?? '')) return [];
        throw new Error(`${name} loaded results (${url}) but no fare rows were recognised`);
      }

      return data
        .map((row) => {
          const price = parsePrice(row.priceText, 'NPR');
          if (!price) return null;
          return {
            airline: prettyAirline(row.airline),
            flightNumber: row.flightNumber,
            departTime: row.departTime,
            arriveTime: row.arriveTime,
            ...price,
            url: row.url ?? url,
            availability: 'unknown',
          };
        })
        .filter(Boolean)
        .slice(0, limit);
    },
  };
}

// Exported so the generic filler can be tested against a fixture form.
export const __fillBookingForm = fillBookingForm;
