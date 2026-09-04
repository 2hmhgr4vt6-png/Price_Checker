/**
 * Amadeus Flight Offers Search - a licensed fare API rather than a scrape.
 *
 * This is the most reliable fare source available to a project like this, and
 * the only one that does not depend on a booking site's markup: it returns
 * structured offers, including the airline, flight number, times and total
 * price, for both Nepali domestic and international routes.
 *
 * Off unless credentials are set:
 *
 *   AMADEUS_CLIENT_ID=...  AMADEUS_CLIENT_SECRET=...  npm start
 *
 * Free self-service keys are issued at developers.amadeus.com. The test
 * environment answers with cached fares (good for checking the wiring); set
 * AMADEUS_ENV=production once a production key is approved. Fares here are a
 * reference to judge booking-site prices against - you still book on a site,
 * so rows link to the airline's own page rather than a checkout.
 */
import { getJson, postJson } from '../http.js';
import { airportByCode } from '../airports.js';

const HOSTS = {
  test: 'https://test.api.amadeus.com',
  production: 'https://api.amadeus.com',
};

let token = null; // { value, expiresAt }

async function accessToken(timeout) {
  if (token && Date.now() < token.expiresAt - 30_000) return token.value;

  const host = HOSTS[process.env.AMADEUS_ENV === 'production' ? 'production' : 'test'];
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: process.env.AMADEUS_CLIENT_ID,
    client_secret: process.env.AMADEUS_CLIENT_SECRET,
  });

  // The token endpoint is form-encoded, unlike the rest of the API.
  const res = await fetch(`${host}/v1/security/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(timeout ?? 10_000),
  });

  if (!res.ok) {
    throw new Error(`Amadeus rejected the credentials (HTTP ${res.status})`);
  }

  const payload = await res.json();
  token = {
    value: payload.access_token,
    expiresAt: Date.now() + (payload.expires_in ?? 1800) * 1000,
  };
  return token.value;
}

/** "PT1H35M" is not something to show a traveller. */
const airlineName = (code, dictionaries) =>
  dictionaries?.carriers?.[code]
    ? dictionaries.carriers[code].replace(/\b\w/g, (letter) => letter.toUpperCase())
    : code;

export default {
  id: 'amadeus',
  name: 'Amadeus (fare reference)',
  homepage: 'https://developers.amadeus.com',
  kind: 'reference',
  requiresCredentials: 'AMADEUS_CLIENT_ID and AMADEUS_CLIENT_SECRET',

  get enabled() {
    return Boolean(process.env.AMADEUS_CLIENT_ID && process.env.AMADEUS_CLIENT_SECRET);
  },

  async searchFlights({ from, to, date, adults = 1, children = 0, infants = 0 }, { limit = 25, timeout } = {}) {
    const host = HOSTS[process.env.AMADEUS_ENV === 'production' ? 'production' : 'test'];
    const bearer = await accessToken(timeout);

    const params = new URLSearchParams({
      originLocationCode: from,
      destinationLocationCode: to,
      departureDate: date,
      adults: String(adults),
      currencyCode: 'NPR',
      max: String(Math.min(limit, 50)),
    });
    if (children) params.set('children', String(children));
    if (infants) params.set('infants', String(infants));

    const payload = await getJson(`${host}/v2/shopping/flight-offers?${params}`, {
      timeout,
      headers: { Authorization: `Bearer ${bearer}` },
    });

    const offers = payload?.data ?? [];

    return offers.slice(0, limit).map((offer) => {
      const itinerary = offer.itineraries?.[0];
      const segments = itinerary?.segments ?? [];
      const first = segments[0];
      const last = segments[segments.length - 1];
      if (!first) return null;

      const amount = Number(offer.price?.grandTotal ?? offer.price?.total);
      if (!Number.isFinite(amount)) return null;

      const stops = segments.length - 1;
      return {
        airline: airlineName(first.carrierCode, payload.dictionaries),
        flightNumber: `${first.carrierCode} ${first.number}`,
        departTime: first.departure?.at?.slice(11, 16) ?? null,
        arriveTime: last.arrival?.at?.slice(11, 16) ?? null,
        amount,
        currency: offer.price?.currency ?? 'NPR',
        // Amadeus offers are not bookable from here, so point at the airline.
        url: `https://www.google.com/search?q=${encodeURIComponent(
          `${airlineName(first.carrierCode, payload.dictionaries)} ${from} to ${to} booking`,
        )}`,
        availability: offer.numberOfBookableSeats ? 'in_stock' : 'unknown',
        note: stops
          ? `${stops} stop${stops === 1 ? '' : 's'} · fare reference, book on the airline's site`
          : "Fare reference, book on the airline's site",
      };
    }).filter(Boolean);
  },
};
