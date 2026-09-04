/**
 * Sastotickets - Nepali online travel agency.
 *
 * Chosen as the first fare provider because one search returns fares across
 * every domestic carrier (Buddha, Yeti, Shree, Saurya, Nepal Airlines,
 * Himalaya) plus international routes, so it is the single highest-value
 * source rather than six separate airline scrapers.
 *
 * Its search is a POST form protected against non-browser clients: submitting
 * it over HTTP with a valid CSRF token and session cookie redirects straight
 * back to the homepage, and there is no fare deep link
 * (/search-flight/<date>/<from>/<to> and friends all 404). So the form is
 * filled and submitted in a real browser instead.
 *
 * The field names and formats below are read from the site's own markup and
 * validation code: three-letter airport codes, and `yy-mm-dd` dates per the
 * datepicker config.
 */
import { renderFormFlow, browserAvailable } from '../browser.js';
import { extractFareRows, prettyAirline } from './extract.js';
import { parsePrice } from '../price.js';

const ORIGIN = 'https://sastotickets.com';

/**
 * Runs in the page. The date input is readonly and driven by a datepicker, so
 * values are assigned directly and the form submitted programmatically -
 * clicking the button would run their client-side validation against a UI we
 * never touched.
 */
/* c8 ignore start - runs inside Chromium */
function fillSearchForm(input) {
  const set = (id, value) => {
    const field = document.getElementById(id);
    if (field) field.value = value;
  };

  set('depart_city', input.from);
  set('dest_city', input.to);
  set('depart_date', input.date);
  set('trip_type', 'oneway');
  set('adults', String(input.adults));
  set('children', String(input.children));
  set('infant', String(input.infants));
  set('currency', 'NPR');

  document.getElementById('form-search-flights')?.submit();
}
/* c8 ignore stop */

export default {
  id: 'sastotickets',
  name: 'Sastotickets',
  homepage: ORIGIN,
  kind: 'ota',
  needsBrowser: true,

  async searchFlights({ from, to, date, adults = 1, children = 0, infants = 0 }, { limit = 25, timeout } = {}) {
    if (!(await browserAvailable())) {
      throw new Error('Needs headless rendering - run: npm run setup:browser');
    }

    const { url, data } = await renderFormFlow(ORIGIN, {
      prepare: fillSearchForm,
      input: { from, to, date, adults, children, infants },
      extract: extractFareRows,
      waitFor: '[class*="flight"], [class*="result"]',
      timeout,
    });

    if (process.env.RENDER_DEBUG) {
      console.log(`[flights] sastotickets -> ${url} (${data?.length ?? 0} raw rows)`);
      for (const row of (data ?? []).slice(0, 5)) console.log(`[flights]   ${row.priceText} ${row.airline} ${row.departTime}`);
    }

    return (data ?? [])
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
