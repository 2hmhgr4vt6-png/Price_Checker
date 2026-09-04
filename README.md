# Nepali Price Checker

A price-comparison website for Nepal. Type a product name once and see the
listings each Nepali shop actually returns, sorted cheapest first, with the
best price badged and every row linking back to the seller's own page.

![Search results for "Dell laptop i5"](docs/screenshot-desktop.png)

## Running it

The server and front-end have no required dependencies — plain Node, plain
browser JavaScript.

```bash
npm start                 # http://localhost:3000
npm run setup:browser     # ONE-OFF: adds Hukut, SmartDoko, ITTI, Hamrobazar
npm run dev               # start with --watch reload
npm test                  # parsing, relevance, orchestrator, rendering
npm run check:stores -- "iphone 17"   # which shops your network can reach
```

**Run `npm run setup:browser` if you want more than a couple of shops.** Four
of Nepal's biggest storefronts are JavaScript-only (see below); that command
installs Playwright + Chromium so they can be read. Without it they are
skipped and the site still works.

Requires Node 18.17+ (Node 22 recommended). `PORT` and `HOST` are honoured.
`CHROMIUM_PATH` points at an existing Chromium build instead of downloading
one; `HTTPS_PROXY` is passed through to the browser.

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

![Which shops were checked](docs/screenshot-store-panel.png)

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

Three fetch mechanisms, in order of preference:

**1. The shop's own JSON API or server-rendered HTML** — fast, no browser needed.

| Store | Adapter | Integration |
|---|---|---|
| Daraz Nepal | `src/stores/daraz.js` | Internal JSON search API, no key needed. Queries the relevance page *and* the price-descending page and merges them, because Daraz's default ranking buries real devices under accessories. |
| Evo Store | `src/stores/evostore.js` | Server-rendered OpenCart theme; `.common-item` cards |
| SastoDeal | `src/stores/sastodeal.js` | Magento 2 `catalogsearch` HTML |
| Oliz Store | `src/stores/olizstore.js` | Shopify predictive-search JSON |
| Neoshop24 | `src/stores/neoshop24.js` | WooCommerce Store API, falls back to shop-page HTML |
| Banana Mobile | `src/stores/bananamobile.js` | WooCommerce Store API, falls back to shop-page HTML |

**2. Headless rendering** (`src/stores/spa.js`, needs `npm run setup:browser`).

| Store | Why |
|---|---|
| Hukut | Next.js app; the search HTML ships zero prices |
| SmartDoko | Same — grid is built client side |
| ITTI Computer World | Same; unrendered markup literally reads `रु NaN` |
| Hamrobazar | SPA over a token-gated API (`api.hamrobazaar.com` returns "Un-Authorized Access" to anonymous callers) |

These render the shop's real search page in Chromium and read the finished DOM,
preferring schema.org `Product` data and falling back to a heuristic that picks
out links whose visible text holds both a price and a product title — the same
thing a shopper's eye does. Search URLs come from each site's own published
`SearchAction` template where it has one, rather than being guessed.

**3. Published "official price" references** (`src/stores/pricereference.js`).

| Source | Notes |
|---|---|
| Gadgetbyte Nepal | WordPress REST API. Not a shop: it publishes official launch prices, so its rows are tagged **Official price, not a shop**, link to the article, and are excluded from the "Best price" badge |

Extraction here is deliberately strict, because a naive "first Rs. number in
the article" reader is worse than useless — pointed at a tech blog it will
cheerfully return the price of an unrelated app subscription. A price is taken
only when the post title *and* the individual table row match the query, and
speculative wording ("could start at", "expected", "leak") is rejected outright.

### Reachability is environment-dependent — this matters

Several Nepali sites sit behind bot protection or refuse traffic from outside
Nepal, so **which stores fill in depends on where you run this**. Measured from
a cloud host outside Nepal:

- reachable and parsing: Daraz Nepal, Evo Store
- HTTP 403 to non-browser clients: Oliz Store
- connection refused / DNS blocked: SastoDeal, Neoshop24, Banana Mobile, Gadgetbyte
- reachable but JavaScript-only, so needing `setup:browser`: Hukut, SmartDoko, ITTI, Hamrobazar

From a machine in Nepal you should get considerably more. Run
`npm run check:stores -- "iphone 17"` to see what *your* network reaches — that
is the difference between a short table and a bug, and the "Which shops were
checked?" panel says which of the two you are looking at.

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
src/browser.js         optional headless Chromium, shared across a search
src/relevance.js       query-vs-title matching and accessory rejection
src/price.js           price/currency string parsing
src/fx.js              NPR conversion with live rates and pinned fallback
src/http.js            fetch with timeout, browser UA, retry on 429/5xx
src/html.js            dependency-free HTML extraction helpers
src/stores/            one module per shop + shared platform routines
src/stores/rendered.js   DOM extraction for JavaScript-only storefronts
src/stores/spa.js        the four rendered stores
src/stores/pricereference.js  strict WordPress "official price" reader
public/                index.html, styles.css, app.js (no build step)
scripts/check-stores.js  reachability diagnostic
test/                  node:test unit tests
```

## Limitations

- Only listings the shops return are shown; coverage is as good as the
  adapters your network can reach.
- Headless rendering costs a few seconds per JavaScript-only store (they get a
  28s budget versus 9s for HTTP stores) and needs ~150 MB for Chromium.
- The rendered-DOM heuristic is verified against a fixture that reproduces the
  real SPA shape (`test/rendered.test.js`), but each shop's live markup can
  drift; `npm run check:stores` is the fastest way to spot it.
- Store HTML changes break HTML-based adapters. `npm run check:stores` catches
  that quickly; the affected shop degrades to "could not be reached" rather
  than showing wrong prices.
- Prices exclude delivery, and marketplace sellers vary in reliability.
  Confirm on the seller's page before paying.

![Mobile card layout](docs/screenshot-mobile.png)

## License

MIT
