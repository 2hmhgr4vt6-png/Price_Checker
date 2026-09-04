/**
 * Flight mode: form handling, fare rendering, and the Products/Flights switch.
 *
 * Like the product side, this page holds no fare data of its own - every row
 * comes from GET /api/flights, which only contains fares a booking site
 * actually quoted.
 */
import { attachAirportInput } from './airport-input.js';

const modeProducts = document.getElementById('mode-products');
const modeFlights = document.getElementById('mode-flights');
const productForm = document.getElementById('search-form');
const productExamples = document.getElementById('examples');
const flightForm = document.getElementById('flight-form');
const heroSub = document.getElementById('hero-sub');

const fromInput = document.getElementById('from-input');
const toInput = document.getElementById('to-input');
const dateInput = document.getElementById('depart-date');
const flightBtn = document.getElementById('flight-btn');

const statusRegion = document.getElementById('status-region');
const productResults = document.getElementById('results-region');
const region = document.getElementById('flight-results-region');
const title = document.getElementById('flight-results-title');
const meta = document.getElementById('flight-results-meta');
const summaryBox = document.getElementById('flight-summary');
const warningsBox = document.getElementById('flight-warnings');
const body = document.getElementById('flight-body');
const providerList = document.getElementById('flight-provider-list');
const providerStatus = document.getElementById('flight-provider-status');
const sortSelect = document.getElementById('flight-sort');
const rowTemplate = document.getElementById('flight-row-template');

const npr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const formatNpr = (amount) => `Rs. ${npr.format(amount)}`;

let current = null;
let inFlight = null;

const escapeHtml = (text) =>
  String(text).replace(/[&<>"']/g, (char) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

/** "07:25" and "7:25 AM" both sort correctly once normalised to minutes. */
function minutesOf(time) {
  if (!time) return Number.MAX_SAFE_INTEGER;
  const match = String(time).match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
  if (!match) return Number.MAX_SAFE_INTEGER;

  let hours = Number(match[1]) % 12;
  if (!match[3]) hours = Number(match[1]);
  else if (match[3].toLowerCase() === 'pm') hours += 12;
  return hours * 60 + Number(match[2]);
}

const SORTERS = {
  'fare-asc': (a, b) => a.fareNpr - b.fareNpr,
  'fare-desc': (a, b) => b.fareNpr - a.fareNpr,
  depart: (a, b) => minutesOf(a.departTime) - minutesOf(b.departTime) || a.fareNpr - b.fareNpr,
  airline: (a, b) => a.airline.localeCompare(b.airline) || a.fareNpr - b.fareNpr,
};

// ---------------------------------------------------------------- mode switch

function setMode(mode, { push = true } = {}) {
  const flights = mode === 'flights';

  modeFlights.classList.toggle('is-active', flights);
  modeProducts.classList.toggle('is-active', !flights);
  modeFlights.setAttribute('aria-selected', String(flights));
  modeProducts.setAttribute('aria-selected', String(!flights));

  productForm.hidden = flights;
  productExamples.hidden = flights;
  flightForm.hidden = !flights;

  heroSub.textContent = flights
    ? 'Pick where you are flying from and to, and we check Nepali ticket-booking sites live, then sort every fare we actually find from cheapest upward.'
    : 'Type a product and we check Nepali stores and marketplaces live, then sort every listing we actually find from cheapest to most expensive.';

  // Only one set of results is meaningful at a time.
  if (flights) {
    productResults.hidden = true;
  } else {
    region.hidden = true;
  }
  statusRegion.innerHTML = '';

  if (push) {
    const url = new URL(window.location);
    if (flights) url.searchParams.set('mode', 'flights');
    else url.searchParams.delete('mode');
    window.history.replaceState({}, '', url);
  }

  (flights ? fromInput : document.getElementById('q')).focus({ preventScroll: true });
}

// ------------------------------------------------------------------ rendering

function showPanel(html) {
  region.hidden = true;
  statusRegion.innerHTML = `<div class="panel">${html}</div>`;
}

function renderProviders(payload) {
  providerList.innerHTML = payload.providers.map((provider) => {
    if (provider.status === 'ok') {
      return `<li><strong>${escapeHtml(provider.name)}</strong> — <span class="ok">${provider.count} fare${provider.count === 1 ? '' : 's'}</span></li>`;
    }
    if (provider.status === 'no_results') {
      return `<li><strong>${escapeHtml(provider.name)}</strong> — <span class="miss">no fares returned for this route and date</span></li>`;
    }
    if (/setup:browser/.test(provider.error ?? '')) {
      return `<li><strong>${escapeHtml(provider.name)}</strong> — <span class="miss">skipped: fares sit behind a booking form,
        which needs headless rendering (<code>npm run setup:browser</code>)</span></li>`;
    }
    return `<li><strong>${escapeHtml(provider.name)}</strong> — <span class="err">could not be reached</span>
      <span class="miss">(${escapeHtml(provider.error ?? 'unavailable')})</span></li>`;
  }).join('');
}

function renderSummary(payload) {
  const best = payload.results[0];
  const saving = payload.fareRange.max - best.fareNpr;
  const route = `${payload.query.from} → ${payload.query.to}`;

  summaryBox.innerHTML = `
    <div class="summary">
      <p class="summary__lead">
        Lowest fare: <strong>${formatNpr(best.fareNpr)}</strong>
        on <strong>${escapeHtml(best.airline)}</strong>
      </p>
      <p class="summary__detail">
        ${escapeHtml(route)} on ${escapeHtml(payload.query.date)} ·
        booked through ${escapeHtml(best.providerName)}${best.departTime ? ` · departs ${escapeHtml(best.departTime)}` : ''}
      </p>
      ${saving > 0 ? `<p class="summary__detail">That is ${formatNpr(saving)} less than the most expensive
        fare we found (${formatNpr(payload.fareRange.max)}) on the same route and date.</p>` : ''}
      <a class="btn-view" href="${escapeHtml(best.url)}" target="_blank" rel="noopener nofollow">Open the cheapest fare</a>
    </div>`;
}

function renderWarnings(payload) {
  const notices = payload.warnings.map((text) =>
    `<div class="notice notice--info"><span aria-hidden="true">ℹ️</span><span>${escapeHtml(text)}</span></div>`);

  const needBrowser = payload.providers.filter((provider) => /setup:browser/.test(provider.error ?? ''));
  if (needBrowser.length) {
    notices.push(`<div class="notice notice--warn"><span aria-hidden="true">🧩</span><span>
      No Nepali airline or agency publishes a fare API or a fare deep link — fares only exist behind a
      submitted booking form. Run <code>npm run setup:browser</code> once so
      ${needBrowser.map((provider) => escapeHtml(provider.name)).join(', ')} can be read.</span></div>`);
  }

  if (payload.fx?.ratesUsed && Object.keys(payload.fx.ratesUsed).length) {
    const rates = Object.entries(payload.fx.ratesUsed)
      .map(([code, rate]) => `1 ${code} = ${formatNpr(rate)}`).join(', ');
    notices.push(`<div class="notice notice--info"><span aria-hidden="true">💱</span><span>
      Some fares were quoted in another currency and converted at ${escapeHtml(rates)}
      (${escapeHtml(payload.fx.source)}${payload.fx.approximate ? ', approximate' : ''}).</span></div>`);
  }

  warningsBox.innerHTML = notices.join('');
}

function renderRows(rows) {
  const fragment = document.createDocumentFragment();

  for (const row of rows) {
    const node = rowTemplate.content.cloneNode(true);
    if (row.bestFare) node.querySelector('tr').classList.add('is-best');

    node.querySelector('.airline').textContent = row.airline;
    node.querySelector('.flight-no').textContent = row.flightNumber ?? '—';
    node.querySelector('.depart').textContent = row.arriveTime
      ? `${row.departTime} → ${row.arriveTime}`
      : (row.departTime ?? '—');
    node.querySelector('.price').textContent = formatNpr(row.fareNpr);
    node.querySelector('.provider').textContent = row.providerName;

    if (row.originalPrice) {
      node.querySelector('.converted').textContent =
        `${row.originalPrice.currency} ${row.originalPrice.amount} @ ${row.originalPrice.rate}`;
    }

    const tags = node.querySelector('.tags');
    if (row.bestFare) {
      const tag = document.createElement('span');
      tag.className = 'tag tag--best';
      tag.textContent = 'Lowest fare';
      tags.append(tag);
    }
    if (row.note) {
      const tag = document.createElement('span');
      tag.className = 'tag tag--seller';
      tag.textContent = row.note;
      tags.append(tag);
    }

    const link = node.querySelector('.btn-view');
    link.href = row.url;
    link.setAttribute('aria-label', `Book ${row.airline} on ${row.providerName}`);

    fragment.append(node);
  }

  body.replaceChildren(fragment);
}

function render(payload) {
  current = payload;
  statusRegion.innerHTML = '';

  if (!payload.resultCount) {
    const unreachable = payload.providers.filter((provider) => provider.status === 'unavailable');
    const needBrowser = unreachable.filter((provider) => /setup:browser/.test(provider.error ?? ''));

    showPanel(`
      <h2>No fares found for ${escapeHtml(payload.query.from)} → ${escapeHtml(payload.query.to)}
        on ${escapeHtml(payload.query.date)}</h2>
      ${needBrowser.length ? `
        <p>Fares on Nepali booking sites only exist behind a submitted search form — there is no fare API
           to call — so reading them needs a real browser. Run this once, then search again:</p>
        <p><code>npm run setup:browser</code></p>` : `
        <p>We checked ${payload.providers.length} booking site${payload.providers.length === 1 ? '' : 's'}
           and none quoted a fare. Nothing is shown rather than guessed.</p>
        <p>Try a nearby date, or check whether this route is flown directly.</p>`}
      ${unreachable.length && !needBrowser.length ? `<ul>${unreachable.map((provider) =>
        `<li>${escapeHtml(provider.name)}: ${escapeHtml(provider.error ?? 'unavailable')}</li>`).join('')}</ul>` : ''}
    `);
    renderProviders(payload);
    providerStatus.hidden = false;
    return;
  }

  region.hidden = false;
  const route = `${payload.query.fromAirport?.city ?? payload.query.from} → ${payload.query.toAirport?.city ?? payload.query.to}`;
  title.textContent = `${payload.resultCount} fare${payload.resultCount === 1 ? '' : 's'} for ${route}`;

  const airlines = new Set(payload.results.map((row) => row.airline)).size;
  meta.textContent =
    `${payload.query.date} · ${airlines} airline${airlines === 1 ? '' : 's'} · ` +
    `${formatNpr(payload.fareRange.min)} – ${formatNpr(payload.fareRange.max)} · ` +
    `checked ${new Date(payload.generatedAt).toLocaleTimeString()}${payload.cached ? ' (cached)' : ''}`;

  renderSummary(payload);
  renderWarnings(payload);
  renderProviders(payload);
  renderRows([...payload.results].sort(SORTERS[sortSelect.value] ?? SORTERS['fare-asc']));
}

// -------------------------------------------------------------------- search

const from = attachAirportInput({
  input: fromInput,
  hidden: document.getElementById('from-code'),
  list: document.getElementById('from-list'),
});
const to = attachAirportInput({
  input: toInput,
  hidden: document.getElementById('to-code'),
  list: document.getElementById('to-list'),
});

async function runFlightSearch() {
  if (!from.code || !to.code) {
    showPanel(`<h2>Pick both airports</h2>
      <p>Choose a departure and destination airport from the suggestions so we know which route to price.</p>`);
    return;
  }
  if (from.code === to.code) {
    showPanel(`<h2>Same airport twice</h2>
      <p>Departure and destination are both ${escapeHtml(from.code)} — pick two different airports.</p>`);
    return;
  }
  if (!dateInput.value) {
    showPanel(`<h2>Pick a travel date</h2><p>Fares depend on the date, so we need one before searching.</p>`);
    return;
  }

  inFlight?.abort();
  inFlight = new AbortController();

  const params = new URLSearchParams({
    from: from.code,
    to: to.code,
    date: dateInput.value,
    adults: document.getElementById('adults').value,
    children: document.getElementById('children').value,
  });

  const url = new URL(window.location);
  url.search = `?mode=flights&${params}`;
  window.history.replaceState({}, '', url);

  flightBtn.disabled = true;
  showPanel(`
    <h2><span class="spinner" aria-hidden="true"></span>Checking booking sites for
      ${escapeHtml(from.code)} → ${escapeHtml(to.code)}&hellip;</h2>
    <p>Each site's search form is submitted live, which takes longer than a product search.</p>
    <div class="skeleton-row"></div><div class="skeleton-row"></div><div class="skeleton-row"></div>
  `);

  try {
    const res = await fetch(`/api/flights?${params}`, { signal: inFlight.signal });
    const payload = await res.json();

    // A 400 is the shopper's input, not a failure: say what to change rather
    // than reporting that something went wrong.
    if (res.status === 400) {
      showPanel(`<h2>Check the search</h2><p>${escapeHtml(payload.error)}</p>`);
      return;
    }
    if (!res.ok) throw new Error(payload.error ?? `Request failed (${res.status})`);
    render(payload);
  } catch (error) {
    if (error.name === 'AbortError') return;
    showPanel(`<h2>Something went wrong</h2><p>${escapeHtml(error.message)}</p>`);
  } finally {
    flightBtn.disabled = false;
  }
}

flightForm.addEventListener('submit', (event) => {
  event.preventDefault();
  runFlightSearch();
});

document.getElementById('swap-airports').addEventListener('click', () => {
  const previous = { code: from.code, label: fromInput.value };
  from.setCode(to.code);
  fromInput.value = toInput.value;
  to.setCode(previous.code);
  toInput.value = previous.label;
});

for (const chip of flightForm.querySelectorAll('.chip[data-route]')) {
  chip.addEventListener('click', async () => {
    const [origin, destination] = chip.dataset.route.split(',');
    // Resolve through the API so the inputs show real airport labels.
    const label = async (code) => {
      try {
        const res = await fetch(`/api/airports?q=${code}`);
        const { airports } = await res.json();
        return airports.find((airport) => airport.code === code) ?? null;
      } catch { return null; }
    };
    from.setCode(origin, await label(origin));
    to.setCode(destination, await label(destination));
    if (!dateInput.value) dateInput.value = defaultDate();
    runFlightSearch();
  });
}

sortSelect.addEventListener('change', () => {
  if (current?.results?.length) {
    renderRows([...current.results].sort(SORTERS[sortSelect.value] ?? SORTERS['fare-asc']));
  }
});

modeProducts.addEventListener('click', () => setMode('products'));
modeFlights.addEventListener('click', () => setMode('flights'));

/** A week out is the common case and keeps the field from starting empty. */
function defaultDate() {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date.toISOString().slice(0, 10);
}

const today = new Date().toISOString().slice(0, 10);
dateInput.min = today;
dateInput.value = defaultDate();

// Deep links: /?mode=flights&from=KTM&to=PKR&date=2026-09-20
const initial = new URL(window.location).searchParams;
if (initial.get('mode') === 'flights') {
  setMode('flights', { push: false });

  const preset = { from: initial.get('from'), to: initial.get('to'), date: initial.get('date') };
  if (preset.from) { from.setCode(preset.from.toUpperCase()); fromInput.value = preset.from.toUpperCase(); }
  if (preset.to) { to.setCode(preset.to.toUpperCase()); toInput.value = preset.to.toUpperCase(); }
  if (preset.date) dateInput.value = preset.date;
  if (initial.get('adults')) document.getElementById('adults').value = initial.get('adults');
  if (initial.get('children')) document.getElementById('children').value = initial.get('children');

  if (preset.from && preset.to && dateInput.value) runFlightSearch();
}
