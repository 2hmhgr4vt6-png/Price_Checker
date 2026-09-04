/**
 * Flight fare provider registry.
 *
 * ADDING A BOOKING SITE: one entry below. `bookingFormProvider` fills the
 * site's own search form in a browser by finding the fields that mean "from",
 * "to" and "date" - by name, id, placeholder and label text - so most sites
 * need no selectors at all. Pass `overrides` when a form is awkward.
 *
 * WHY THIS IS ALL BROWSER WORK: no Nepali airline or agency publishes a fare
 * API, a fare deep link, or a static fare table (checked Buddha Air, Yeti,
 * Shree, Himalaya, Nepal Airlines, Sastotickets and Hop Nepal). A fare exists
 * only after a search form has been submitted. The one exception is Amadeus,
 * a licensed fare API - if you have keys, that is the sturdiest source here.
 *
 * WHY NOT ESEWA / KHALTI / IME PAY: they sell tickets, but only to a
 * logged-in account - eSewa serves a bare login shell to anyone else, Khalti's
 * flight page is marketing copy with booking inside the app, and IME Pay is
 * app-first. Reading them would mean automating someone's wallet login, which
 * this project will not do. They also resell through the same consolidators as
 * everyone else, so their domestic fares are generally the airline's fare -
 * they would add rows, not information. Compare here, then pay in whichever
 * wallet gives you cashback.
 *
 * `verified: false` means the flow is written against the site's real form but
 * has not been run against the live site from this repo's CI. Run
 * `npm run check:flights -- KTM PKR <date>` to see which providers work from
 * your network, and RENDER_DEBUG=1 for the page each one ended on.
 */
import sastotickets from './sastotickets.js';
import amadeus from './amadeus.js';
import { bookingFormProvider } from './formProvider.js';

export const flightProviders = [
  // Licensed fare API - no scraping, most reliable. Needs keys.
  amadeus,

  // Online travel agencies: one search covers many carriers.
  sastotickets,
  bookingFormProvider({
    id: 'hopnepal',
    name: 'Hop Nepal',
    homepage: 'https://hopnepal.com',
    searchPage: 'https://hopnepal.com/flight',
    // Its form uses Amadeus's own field names.
    overrides: { from: 'input[name="originLocationCode"]', to: 'input[name="destinationLocationCode"]' },
  }),

  // Airline-direct: worth having because an airline's own site is the
  // reference price its resellers mark up or discount from.
  bookingFormProvider({ id: 'buddhaair', name: 'Buddha Air', homepage: 'https://www.buddhaair.com', kind: 'airline' }),
  bookingFormProvider({ id: 'yetiairlines', name: 'Yeti Airlines', homepage: 'https://yetiairlines.com', kind: 'airline' }),
  bookingFormProvider({ id: 'shreeairlines', name: 'Shree Airlines', homepage: 'https://shreeairlines.com', kind: 'airline' }),
];

export const enabledFlightProviders = () =>
  flightProviders.filter((provider) => (typeof provider.enabled === 'boolean' ? provider.enabled : true));

/** Providers switched off because a credential is missing. */
export const disabledFlightProviders = () => {
  const active = new Set(enabledFlightProviders().map((provider) => provider.id));
  return flightProviders
    .filter((provider) => !active.has(provider.id))
    .map((provider) => ({
      id: provider.id,
      name: provider.name,
      homepage: provider.homepage,
      reason: provider.requiresCredentials
        ? `Needs ${provider.requiresCredentials} to be configured`
        : 'Disabled',
    }));
};
