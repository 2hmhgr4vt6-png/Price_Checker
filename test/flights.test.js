/**
 * Flight layer: airport lookup, query validation, fare-row extraction and the
 * orchestrator. The extraction test runs against a fixture page shaped like a
 * real OTA result list, including the noise (promo banner, baggage table,
 * check-in times) that a naive price scraper would misread as fares.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';

import { searchAirports, airportByCode, isValidCode } from '../src/airports.js';
import { parseFlightQuery, searchFlights } from '../src/flightsearch.js';
import { flightProviders } from '../src/flights/index.js';
import { extractFareRows } from '../src/flights/extract.js';
import { bookingFormProvider } from '../src/flights/formProvider.js';
import { browserAvailable, renderAndExtract, closeBrowser } from '../src/browser.js';

const isoInDays = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

test('airport search ranks the way a traveller expects', () => {
  assert.equal(searchAirports('ktm')[0].code, 'KTM');
  assert.deepEqual(searchAirports('pokh').map((a) => a.code), ['PKR', 'PHH']);
  assert.equal(searchAirports('lukla')[0].code, 'LUA');
  assert.equal(searchAirports('biratnagar')[0].code, 'BIR');
  // Domestic airports lead the default list, since most searches are domestic.
  assert.ok(searchAirports('').every((airport) => airport.domestic));
  assert.equal(airportByCode('bwa').city, 'Bhairahawa');
  assert.ok(isValidCode('KTM') && !isValidCode('KTMX') && !isValidCode('K1M'));
});

test('flight query validation rejects what cannot be priced', () => {
  const query = parseFlightQuery({ from: 'ktm', to: 'pkr', date: isoInDays(7), adults: '2', infants: '9' });
  assert.equal(query.from, 'KTM');
  assert.equal(query.adults, 2);
  // At most one lap infant per adult.
  assert.equal(query.infants, 2);

  assert.throws(() => parseFlightQuery({ from: 'XX', to: 'PKR', date: isoInDays(7) }), /suggestions/);
  assert.throws(() => parseFlightQuery({ from: 'KTM', to: 'KTM', date: isoInDays(7) }), /same/);
  assert.throws(() => parseFlightQuery({ from: 'KTM', to: 'PKR', date: '20-09-2026' }), /YYYY-MM-DD/);
  assert.throws(() => parseFlightQuery({ from: 'KTM', to: 'PKR', date: isoInDays(-1) }), /past/);
  assert.throws(() => parseFlightQuery({ from: 'KTM', to: 'PKR', date: isoInDays(400) }), /this far ahead/);
});

const available = await browserAvailable();
after(() => closeBrowser());

test('reads fare rows and ignores priced noise', { skip: available ? false : 'playwright not installed' }, async (t) => {
  const html = await readFile(new URL('./fixtures/fare-results.html', import.meta.url));
  const server = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());

  const rows = await renderAndExtract(
    `http://127.0.0.1:${server.address().port}/results`,
    extractFareRows,
  );

  assert.equal(rows.length, 3, 'one row per flight, and nothing else');
  assert.deepEqual(rows.map((row) => row.airline), ['buddha air', 'yeti airlines', 'shree airlines']);
  assert.deepEqual(rows.map((row) => row.priceText), ['NPR 5,499', 'NPR 4,950', 'Rs. 6,120']);
  assert.deepEqual(rows.map((row) => row.departTime), ['07:25', '09:10', '14:05']);
  assert.deepEqual(rows.map((row) => row.arriveTime), ['07:50', '09:35', '14:30']);
  assert.equal(rows[0].flightNumber, 'U4 601');
  assert.match(rows[0].url, /\/book\/u4-601$/);

  // The promo banner has a price but no time; the baggage table has prices but
  // no times; the check-in line has times but no price. None is a fare.
  assert.ok(!rows.some((row) => /promo|baggage|check-in/i.test(row.text)));
});

const fakeProvider = (id, fares, { fail = false } = {}) => ({
  id,
  name: id,
  homepage: `https://${id}.test`,
  kind: 'ota',
  async searchFlights() {
    if (fail) throw new Error('form submit failed');
    return fares;
  },
});

function useProviders(...replacements) {
  const original = flightProviders.splice(0, flightProviders.length, ...replacements);
  return () => flightProviders.splice(0, flightProviders.length, ...original);
}

test('sorts fares, badges the lowest and reports skipped providers', async () => {
  const restore = useProviders(
    fakeProvider('alpha', [
      { airline: 'Buddha Air', amount: 5499, currency: 'NPR', departTime: '07:25', url: 'https://a/1' },
      { airline: 'Yeti Airlines', amount: 4950, currency: 'NPR', departTime: '09:10', url: 'https://a/2' },
    ]),
    fakeProvider('beta', [], { fail: true }),
  );

  try {
    const payload = await searchFlights({ from: 'KTM', to: 'PKR', date: isoInDays(10) }, { fresh: true });

    assert.deepEqual(payload.results.map((row) => row.fareNpr), [4950, 5499]);
    assert.equal(payload.results[0].bestFare, true);
    assert.equal(payload.cheapest.airline, 'Yeti Airlines');
    assert.deepEqual(payload.fareRange, { min: 4950, max: 5499 });

    const beta = payload.providers.find((provider) => provider.id === 'beta');
    assert.equal(beta.status, 'unavailable');
    assert.equal(beta.count, 0);
    assert.ok(payload.warnings.some((warning) => /No fares from beta/.test(warning)));
    // Every result set carries the fees/taxes caveat.
    assert.ok(payload.warnings.some((warning) => /Baggage, taxes and fees/.test(warning)));
  } finally {
    restore();
  }
});

test('converts a foreign-currency fare and de-duplicates repeated rows', async () => {
  const restore = useProviders(
    fakeProvider('usd-ota', [
      { airline: 'Qatar Airways', amount: 400, currency: 'USD', departTime: '20:15', url: 'https://u/1' },
      { airline: 'Qatar Airways', amount: 400, currency: 'USD', departTime: '20:15', url: 'https://u/1' },
    ]),
  );

  try {
    const payload = await searchFlights({ from: 'KTM', to: 'DOH', date: isoInDays(20) }, { fresh: true });
    assert.equal(payload.resultCount, 1, 'the duplicate row is dropped');
    assert.equal(payload.results[0].originalPrice.currency, 'USD');
    assert.ok(payload.results[0].fareNpr > 20000, 'USD converts upward into NPR');
  } finally {
    restore();
  }
});

test('the generic form filler finds the right fields and submits', { skip: available ? false : 'playwright not installed' }, async (t) => {
  const form = await readFile(new URL('./fixtures/booking-form.html', import.meta.url), 'utf8');
  const fares = await readFile(new URL('./fixtures/fare-results.html', import.meta.url), 'utf8');

  let submitted = null;
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });

    if (url.pathname === '/results') {
      submitted = Object.fromEntries(url.searchParams);
      // Echo the submitted values into the page so the assertions can see
      // both that the form was filled correctly and that fares parse.
      return res.end(fares);
    }
    return res.end(form);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());

  const provider = bookingFormProvider({
    id: 'fixture',
    name: 'Fixture Airlines',
    homepage: `http://127.0.0.1:${server.address().port}/`,
    waitFor: '.flight-row',
  });

  const results = await provider.searchFlights({ from: 'KTM', to: 'PKR', date: '2026-09-20', adults: 2 });

  // Located by placeholder, by <label for>, and by a label whose wording does
  // not match the field name.
  assert.equal(submitted.origin, 'KTM');
  assert.equal(submitted.dest, 'PKR');
  assert.equal(submitted.journey_date, '2026-09-20');
  assert.equal(submitted.adults, '2');
  // A one-way search must not fill the return date.
  assert.equal(submitted.return_date, '');

  // ...and the fares on the resulting page are read, cheapest not assumed.
  assert.equal(results.length, 3);
  assert.deepEqual(results.map((row) => row.amount), [5499, 4950, 6120]);
  assert.deepEqual(results.map((row) => row.airline), ['Buddha Air', 'Yeti Airlines', 'Shree Airlines']);
  assert.equal(results[0].flightNumber, 'U4 601');
});
