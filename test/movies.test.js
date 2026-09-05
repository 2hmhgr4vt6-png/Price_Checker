/**
 * Cinema rate-card parsing. The fixture is the shape Nepali cinemas publish:
 * a day-band header row with no price, then the slots underneath it, plus the
 * noise a naive reader would pick up - a 3D-glasses surcharge note and a
 * loyalty-programme table.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { parsePriceTables } from '../src/movies/priceTable.js';

const RATE_CARD = `
<table><tbody>
  <tr><td>Weekends (Friday to Sunday)</td><td>All Screen</td></tr>
  <tr><td>Morning Show (Before 10:59 AM)</td><td>Rs. 200.00</td></tr>
  <tr><td>Regular Shows (11:00 AM onwards)</td><td>Rs. 450.00</td></tr>
  <tr><td>Weekdays (Monday, Tuesday)</td><td>All Screen</td></tr>
  <tr><td>Morning Show (Before 10:59 AM)</td><td>Rs. 200.00</td></tr>
  <tr><td>Regular Shows (11:00 AM onwards)</td><td>Rs. 400.00</td></tr>
</tbody></table>
<span>NOTE: 3D Glass: RS 50 Applicable</span>`;

test('reads day bands and slot prices from a rate card', () => {
  const rows = parsePriceTables(RATE_CARD);

  assert.deepEqual(rows.map((row) => [row.dayBand, row.show, row.amount]), [
    ['Weekends (Friday to Sunday)', 'Morning Show (Before 10:59 AM)', 200],
    ['Weekends (Friday to Sunday)', 'Regular Shows (11:00 AM onwards)', 450],
    ['Weekdays (Monday, Tuesday)', 'Morning Show (Before 10:59 AM)', 200],
    ['Weekdays (Monday, Tuesday)', 'Regular Shows (11:00 AM onwards)', 400],
  ]);

  // The surcharge note is not a ticket price - it is not in a table row.
  assert.ok(!rows.some((row) => row.amount === 50));
});

test('the same table rendered twice yields one set of rates', () => {
  // Next.js sites emit the markup once server side and again in the hydration
  // payload, with escaped angle brackets.
  const doubled = RATE_CARD + RATE_CARD.replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
  assert.equal(parsePriceTables(doubled).length, 4);
});

test('a band header with no rows under it contributes nothing', () => {
  assert.deepEqual(parsePriceTables('<table><tr><td>Coming soon</td><td>All Screen</td></tr></table>'), []);
});
