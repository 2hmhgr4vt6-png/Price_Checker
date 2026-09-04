/**
 * Front-end for Nepali Price Checker.
 *
 * The page owns no product data of its own: every row it renders comes from
 * GET /api/search, which in turn only contains listings a store actually
 * returned. Sorting is done client side so re-sorting never costs a round trip.
 */

const form = document.getElementById('search-form');
const input = document.getElementById('q');
const button = document.getElementById('search-btn');
const statusRegion = document.getElementById('status-region');
const resultsRegion = document.getElementById('results-region');
const resultsTitle = document.getElementById('results-title');
const resultsMeta = document.getElementById('results-meta');
const resultsBody = document.getElementById('results-body');
const summaryBox = document.getElementById('summary');
const warningsBox = document.getElementById('warnings');
const storeStatusList = document.getElementById('store-status-list');
const sortSelect = document.getElementById('sort');
const rowTemplate = document.getElementById('row-template');

let current = null;      // last successful payload
let inFlight = null;     // AbortController for the running request

const npr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const formatNpr = (amount) => `Rs. ${npr.format(amount)}`;

const STOCK_LABEL = {
  in_stock: ['In stock', 'stock--in'],
  out_of_stock: ['Out of stock', 'stock--out'],
  unknown: ['Not stated', 'stock--unknown'],
};

const SORTERS = {
  'price-asc': (a, b) => a.priceNpr - b.priceNpr,
  'price-desc': (a, b) => b.priceNpr - a.priceNpr,
  shop: (a, b) => a.storeName.localeCompare(b.storeName) || a.priceNpr - b.priceNpr,
  // In stock first, then unknown, then sold out; price breaks ties.
  availability: (a, b) => {
    const rank = { in_stock: 0, unknown: 1, out_of_stock: 2 };
    return (rank[a.availability] ?? 1) - (rank[b.availability] ?? 1) || a.priceNpr - b.priceNpr;
  },
};

function showPanel(html) {
  resultsRegion.hidden = true;
  statusRegion.innerHTML = `<div class="panel">${html}</div>`;
}

function clearStatus() {
  statusRegion.innerHTML = '';
}

function showLoading(query) {
  showPanel(`
    <h2><span class="spinner" aria-hidden="true"></span>Checking Nepali shops for &ldquo;${escapeHtml(query)}&rdquo;&hellip;</h2>
    <p>Querying each store live. This usually takes a few seconds.</p>
    <div class="skeleton-row"></div><div class="skeleton-row"></div><div class="skeleton-row"></div>
  `);
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (char) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function renderStoreStatus(payload) {
  const items = payload.stores.map((store) => {
    if (store.status === 'ok') {
      return `<li><strong>${escapeHtml(store.name)}</strong> — <span class="ok">${store.count} listing${store.count === 1 ? '' : 's'}</span>
        ${store.filtered ? `<span class="miss">(${store.filtered} unrelated listing${store.filtered === 1 ? '' : 's'} filtered out)</span>` : ''}</li>`;
    }
    if (store.status === 'no_results') {
      return `<li><strong>${escapeHtml(store.name)}</strong> — <span class="miss">no matching product found</span></li>`;
    }
    return `<li><strong>${escapeHtml(store.name)}</strong> — <span class="err">could not be reached</span>
      <span class="miss">(${escapeHtml(store.error ?? 'unavailable')})</span></li>`;
  });

  for (const store of payload.disabledStores ?? []) {
    items.push(`<li><strong>${escapeHtml(store.name)}</strong> — <span class="miss">${escapeHtml(store.reason)}</span></li>`);
  }

  storeStatusList.innerHTML = items.join('');
}

/** The "cheapest option" callout the shopper is actually here for. */
function renderSummary(payload) {
  const best = payload.results.find((row) => row.bestPrice) ?? payload.results[0];
  const dearest = payload.priceRange.max;
  const saving = dearest - best.priceNpr;

  summaryBox.innerHTML = `
    <div class="summary">
      <p class="summary__lead">
        Cheapest right now: <strong>${formatNpr(best.priceNpr)}</strong>
        at <strong>${escapeHtml(best.storeName)}</strong>
      </p>
      <p class="summary__detail">${escapeHtml(best.productName)}</p>
      ${saving > 0 ? `<p class="summary__detail">That is ${formatNpr(saving)} less than the most expensive
        listing we found (${formatNpr(dearest)}) for the same search.</p>` : ''}
      <a class="btn-view" href="${escapeHtml(best.url)}" target="_blank" rel="noopener nofollow">Open the cheapest listing</a>
    </div>`;
}

function renderWarnings(payload) {
  const notices = payload.warnings.map((text) => {
    const isRisk = /below|scam/i.test(text);
    return `<div class="notice notice--${isRisk ? 'warn' : 'info'}">
      <span aria-hidden="true">${isRisk ? '⚠️' : 'ℹ️'}</span><span>${escapeHtml(text)}</span></div>`;
  });

  if (payload.fx?.ratesUsed && Object.keys(payload.fx.ratesUsed).length) {
    const rates = Object.entries(payload.fx.ratesUsed)
      .map(([code, rate]) => `1 ${code} = ${formatNpr(rate)}`)
      .join(', ');
    notices.push(`<div class="notice notice--info"><span aria-hidden="true">💱</span><span>
      Some prices were listed in another currency and converted to NPR at ${escapeHtml(rates)}
      (${escapeHtml(payload.fx.source)}${payload.fx.approximate ? ', approximate' : ''}).</span></div>`);
  }

  warningsBox.innerHTML = notices.join('');
}

function renderRows(rows) {
  const fragment = document.createDocumentFragment();

  for (const row of rows) {
    const node = rowTemplate.content.cloneNode(true);
    const tr = node.querySelector('tr');
    if (row.bestPrice) tr.classList.add('is-best');

    node.querySelector('.shop').textContent = row.storeName;
    node.querySelector('.product').textContent = row.productName;
    node.querySelector('.price').textContent = formatNpr(row.priceNpr);

    if (row.originalPrice) {
      node.querySelector('.converted').textContent =
        `${row.originalPrice.currency} ${row.originalPrice.amount} @ ${row.originalPrice.rate}`;
    }

    const [label, cls] = STOCK_LABEL[row.availability] ?? STOCK_LABEL.unknown;
    const stock = node.querySelector('.stock');
    stock.textContent = label;
    stock.classList.add(cls);

    const tags = node.querySelector('.tags');
    const addTag = (text, variant) => {
      const span = document.createElement('span');
      span.className = `tag tag--${variant}`;
      span.textContent = text;
      tags.append(span);
    };
    if (row.bestPrice) addTag('Best price', 'best');
    if (!row.exactMatch) addTag('Closest match', 'closest');
    if (row.suspicious) addTag('Price looks too low', 'risk');
    if (row.storeKind === 'classifieds') addTag('Second-hand', 'used');
    if (row.seller) addTag(`Sold by ${row.seller}`, 'seller');

    const link = node.querySelector('.btn-view');
    link.href = row.url;
    link.setAttribute('aria-label', `View ${row.productName} on ${row.storeName}`);

    fragment.append(node);
  }

  resultsBody.replaceChildren(fragment);
}

function render(payload) {
  current = payload;
  clearStatus();

  if (!payload.resultCount) {
    const checked = payload.stores.filter((store) => store.status !== 'unavailable').length;
    const unreachable = payload.stores.filter((store) => store.status === 'unavailable');

    showPanel(`
      <h2>No listings found for &ldquo;${escapeHtml(payload.query)}&rdquo;</h2>
      <p>We searched ${checked} shop${checked === 1 ? '' : 's'} and none returned a matching product.
         Nothing is shown rather than guessed.</p>
      <p>Try a shorter or more common name (for example &ldquo;iPhone 17&rdquo; instead of the full model
         string), check the spelling, or search for the brand on its own.</p>
      ${unreachable.length ? `<ul>${unreachable.map((store) =>
        `<li>${escapeHtml(store.name)} could not be reached right now (${escapeHtml(store.error ?? 'unavailable')}).</li>`).join('')}</ul>` : ''}
    `);
    return;
  }

  resultsRegion.hidden = false;
  resultsTitle.textContent = `${payload.resultCount} listing${payload.resultCount === 1 ? '' : 's'} for “${payload.query}”`;

  const shops = new Set(payload.results.map((row) => row.storeId)).size;
  const range = payload.priceRange;
  resultsMeta.textContent =
    `From ${shops} shop${shops === 1 ? '' : 's'} · ` +
    `${formatNpr(range.min)} – ${formatNpr(range.max)} · ` +
    `checked ${new Date(payload.generatedAt).toLocaleTimeString()}${payload.cached ? ' (cached)' : ''}`;

  renderSummary(payload);
  renderWarnings(payload);
  renderStoreStatus(payload);
  renderRows([...payload.results].sort(SORTERS[sortSelect.value] ?? SORTERS['price-asc']));
}

async function runSearch(query) {
  if (!query || query.trim().length < 2) return;

  inFlight?.abort();
  inFlight = new AbortController();

  button.disabled = true;
  showLoading(query);

  // Keep the URL shareable/bookmarkable and make the back button work.
  const url = new URL(window.location);
  url.searchParams.set('q', query);
  window.history.replaceState({}, '', url);

  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: inFlight.signal });
    const payload = await res.json();
    if (!res.ok) throw new Error(payload.error ?? `Request failed (${res.status})`);
    render(payload);
  } catch (error) {
    if (error.name === 'AbortError') return;
    showPanel(`
      <h2>Something went wrong</h2>
      <p>${escapeHtml(error.message)}</p>
      <p>Check that the server is running, then try again.</p>
    `);
  } finally {
    button.disabled = false;
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  runSearch(input.value);
});

for (const chip of document.querySelectorAll('.chip')) {
  chip.addEventListener('click', () => {
    input.value = chip.dataset.query;
    runSearch(chip.dataset.query);
  });
}

sortSelect.addEventListener('change', () => {
  if (current?.results?.length) {
    renderRows([...current.results].sort(SORTERS[sortSelect.value] ?? SORTERS['price-asc']));
  }
});

// Deep link support: /?q=iphone+17 runs the search on load.
const initialQuery = new URL(window.location).searchParams.get('q');
if (initialQuery) {
  input.value = initialQuery;
  runSearch(initialQuery);
}
