# Nepali Price Checker

A price-comparison website for Nepal. Type a product name once and see the
listings each Nepali shop actually returns, sorted cheapest first, with the
best price badged and every row linking back to the seller's own page.

![Search results for "Dell laptop i5"](docs/screenshot-desktop.png)

## Running it

No dependencies to install — the server and the front-end are plain Node and
plain browser JavaScript.

```bash
npm start           # http://localhost:3000
npm run dev         # same, with --watch reload
npm test            # unit tests for parsing, relevance, and the orchestrator
npm run check:stores -- "iphone 17"   # which shops your network can reach
```

Requires Node 18.17+ (Node 22 recommended). `PORT` and `HOST` are honoured if
you need something other than `0.0.0.0:3000`.

## What it does

1. You search, e.g. `iPhone 17 Pro Max`.
2. The server queries every enabled store adapter **in parallel** with a 9s
   per-store timeout, so one slow shop can't hold up the page.
3. Listings are filtered for relevance, converted to NPR where needed,
   de-duplicated, and sorted by price.
4. The page renders a sortable table (stacked cards on phones) with a
   cheapest-option callout, a "Best price" badge, availability, seller, and a
   **View on site** link.

### Design decisions worth knowing

**Nothing is ever invented.** If a store errors, times out, gets blocked, or
returns no match, it is reported as skipped and contributes zero rows. The
"Which shops were checked?" panel shows exactly what happened to each one, so
a short table is explained rather than mysterious.

**Accessories are filtered out.** Searching `iPhone 14 128GB` on Daraz returns
page after page of phone cases at Rs. 200–900. Without filtering, "Best price"
would land on a silicone cover. `src/relevance.js` requires ≥70% of the query's
tokens to appear in the title (with `128 GB` normalised to `128gb`) and rejects
accessory keywords — unless you actually searched for an accessory, in which
case the rule inverts. Rows that match only part of the query are labelled
**Closest match**, so a near-miss is visible rather than silent.

**Suspiciously cheap rows are flagged, not hidden.** Anything under 35% of the
median price for that search gets a "Price looks too low" tag and a warning
about accessories, refurbished units and scam listings; the "Best price" badge
skips those rows and lands on the cheapest credible one.

**Currency conversion is labelled.** Non-NPR prices are converted using live
rates from `open.er-api.com` (cached an hour) and the row shows the original
amount and rate used. If the rate lookup fails, a pinned fallback table is used
and the response marks the rate approximate.

**Results are cached 10 minutes** per query, so re-sorting or sharing a link
doesn't re-hammer the stores. `?fresh=1` on the API bypasses it.

## Store coverage

| Store | Adapter | Integration |
|---|---|---|
| Daraz Nepal | `src/stores/daraz.js` | Internal JSON search API, no key needed. Queries the relevance page *and* the price-descending page and merges them, because Daraz's default ranking buries real devices under accessories. |
| SastoDeal | `src/stores/sastodeal.js` | Magento 2 `catalogsearch` HTML |
| Oliz Store | `src/stores/olizstore.js` | Shopify predictive-search JSON |
| Neoshop24 | `src/stores/neoshop24.js` | WooCommerce Store API, falls back to shop-page HTML |
| Banana Mobile | `src/stores/bananamobile.js` | WooCommerce Store API, falls back to shop-page HTML |
| Hamrobazar | `src/stores/hamrobazar.js` | Needs `HAMROBAZAR_TOKEN`; their API rejects anonymous callers, so the adapter stays disabled until you set one |

**Reachability is environment-dependent.** Several Nepali storefronts sit behind
bot protection (Oliz returns HTTP 403 to non-browser clients) or refuse traffic
from outside Nepal. From a hosted server you may only get Daraz; from a machine
in Nepal you should get more. Run `npm run check:stores` to see what your
network can reach — that's the difference between a short table and a bug.

![No-results state](docs/screenshot-no-results.png)

## Adding a store

Drop a module in `src/stores/` that default-exports:

```js
export default {
  id: 'myshop',
  name: 'My Shop',
  homepage: 'https://myshop.com.np',
  kind: 'retailer',              // or 'marketplace' | 'classifieds'
  async search(query, { limit, timeout }) {
    return [{
      productName: 'Exact title from the shop',
      amount: 24999,             // number, in `currency`
      currency: 'NPR',
      url: 'https://myshop.com.np/p/1',
      availability: 'in_stock',  // 'in_stock' | 'out_of_stock' | 'unknown'
      image: null,               // optional
      seller: null,              // optional
    }];
  },
};
```

…then add it to the array in `src/stores/index.js`. Nothing else changes:
relevance filtering, currency conversion, sorting, badging and error handling
all live in `src/search.js`.

If the shop runs Shopify, WooCommerce or Magento, the adapter is usually one
line — see `src/stores/platforms.js` for the shared routines.

**Swapping in a real scraping service or an official store API** means
rewriting a single adapter's `search()`. The orchestrator, the JSON API and the
front-end are unaware of how any given store is fetched.

## HTTP API

```
GET /api/search?q=<product>[&fresh=1]
GET /api/stores      # registry, and why a store is disabled
GET /api/health
```

`/api/search` responds with:

```jsonc
{
  "query": "Dell laptop i5",
  "resultCount": 5,
  "results": [{
    "storeName": "Daraz Nepal",
    "productName": "Laptop Dell Latitude 5300 …",
    "priceNpr": 46500,
    "originalPrice": null,        // { amount, currency, rate } when converted
    "availability": "in_stock",
    "url": "https://www.daraz.com.np/products/…",
    "seller": "E-Corn Store",
    "exactMatch": true,
    "bestPrice": true
  }],
  "cheapest": { "storeName": "Daraz Nepal", "priceNpr": 46500 },
  "priceRange": { "min": 46500, "max": 132000 },
  "stores": [{ "id": "sastodeal", "status": "unavailable", "error": "Timed out after 9000ms" }],
  "disabledStores": [{ "id": "hamrobazar", "reason": "Needs HAMROBAZAR_TOKEN to be configured" }],
  "fx": { "source": "open.er-api.com", "approximate": false, "ratesUsed": {} },
  "warnings": ["No listings from SastoDeal, Oliz Store … for this search."]
}
```

## Project layout

```
server.js              node:http server + static file serving + JSON API
src/search.js          fan-out, relevance, conversion, sorting, warnings
src/relevance.js       query-vs-title matching and accessory rejection
src/price.js           price/currency string parsing
src/fx.js              NPR conversion with live rates and pinned fallback
src/http.js            fetch with timeout, browser UA, retry on 429/5xx
src/html.js            dependency-free HTML extraction helpers
src/stores/            one module per shop + shared platform routines
public/                index.html, styles.css, app.js (no build step)
scripts/check-stores.js  reachability diagnostic
test/                  node:test unit tests
```

## Limitations

- Only listings the shops return are shown; coverage is as good as the
  adapters your network can reach.
- Store HTML changes break HTML-based adapters. `npm run check:stores` catches
  that quickly; the affected shop degrades to "could not be reached" rather
  than showing wrong prices.
- Prices exclude delivery, and marketplace sellers vary in reliability.
  Confirm on the seller's page before paying.

![Mobile card layout](docs/screenshot-mobile.png)

## License

MIT
