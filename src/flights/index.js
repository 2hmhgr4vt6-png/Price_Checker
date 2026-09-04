/**
 * Flight fare provider registry.
 *
 * ADDING A PROVIDER: default-export
 *   { id, name, homepage, kind, needsBrowser?, searchFlights(query, opts) }
 * where query is { from, to, date, adults, children, infants } with IATA codes
 * and an ISO date, and the return is
 *   { airline, flightNumber?, departTime?, arriveTime?, amount, currency, url,
 *     availability }[]
 * A provider that throws or returns [] is reported as skipped, exactly as with
 * the product stores - a fare is never estimated.
 *
 * Why only one provider today: no Nepali airline or agency publishes a fare
 * API, a fare deep link, or even a static fare table (checked Buddha Air,
 * Yeti, Shree, Himalaya, Nepal Airlines and Sastotickets). Fares exist only
 * behind a submitted booking form, so each provider is a browser flow written
 * against that site's own form. Sastotickets comes first because one search
 * covers every domestic carrier; per-airline providers are worth adding for
 * cross-checking, and go here.
 */
import sastotickets from './sastotickets.js';

export const flightProviders = [sastotickets];

export const enabledFlightProviders = () =>
  flightProviders.filter((provider) => (typeof provider.enabled === 'boolean' ? provider.enabled : true));
