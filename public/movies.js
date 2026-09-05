/**
 * Movie tickets mode.
 *
 * Nepali cinemas price by day band and show slot rather than per film, so
 * this compares published rate cards: which cinema is cheapest for a weekday
 * morning, a weekend regular show, and so on. As everywhere else, only rates
 * a cinema actually publishes are shown.
 */
import { registerMode } from './mode.js';
import { attachFilter, applyFilter } from './filters.js';

const form = document.getElementById('movie-form');
const button = document.getElementById('movie-btn');
const bandSelect = document.getElementById('movie-band');
const slotSelect = document.getElementById('movie-slot');

const statusRegion = document.getElementById('status-region');
const region = document.getElementById('movie-results-region');
const title = document.getElementById('movie-results-title');
const meta = document.getElementById('movie-results-meta');
const summaryBox = document.getElementById('movie-summary');
const warningsBox = document.getElementById('movie-warnings');
const body = document.getElementById('movie-body');
const cinemaList = document.getElementById('cinema-list');
const rowTemplate = document.getElementById('movie-row-template');

const npr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const formatNpr = (amount) => `Rs. ${npr.format(amount)}`;

const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (char) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

let current = null;
let loaded = false;

const cinemaFilter = attachFilter({
  container: document.getElementById('cinema-filter'),
  label: 'Cinema',
  onChange: () => renderCurrentRows(),
});

registerMode({
  id: 'movies',
  button: document.getElementById('mode-movies'),
  panels: [form],
  results: region,
  hero: 'Cinemas in Nepal publish a rate card rather than a price per film, so this compares those rates — the cheapest way to see a film, by day and show time.',
  onActivate: () => { if (!loaded) load(); },
});

function showPanel(html) {
  region.hidden = true;
  statusRegion.innerHTML = `<div class="panel">${html}</div>`;
}

/** Rows matching the chosen day band and show slot. "any" bands always apply. */
function matching(rows) {
  const band = bandSelect.value;
  const slot = slotSelect.value;
  return rows.filter((row) =>
    (!band || row.band === band || row.band === 'any')
    && (!slot || row.slot === slot));
}

function renderCurrentRows() {
  const rows = applyFilter(matching(current?.results ?? []), (row) => row.cinemaId, cinemaFilter.selected);
  const fragment = document.createDocumentFragment();

  for (const row of rows) {
    const node = rowTemplate.content.cloneNode(true);
    if (row.bestPrice) node.querySelector('tr').classList.add('is-best');

    node.querySelector('.cinema').textContent = row.cinemaName;
    node.querySelector('.show').textContent = row.show;
    node.querySelector('.band').textContent = row.dayBand ?? '—';
    node.querySelector('.price').textContent = formatNpr(row.priceNpr);

    if (row.bestPrice) {
      const tag = document.createElement('span');
      tag.className = 'tag tag--best';
      tag.textContent = 'Cheapest ticket';
      node.querySelector('.tags').append(tag);
    }

    const link = node.querySelector('.btn-view');
    link.href = row.url;
    link.setAttribute('aria-label', `Open ${row.cinemaName}`);
    fragment.append(node);
  }

  body.replaceChildren(fragment);

  const total = current?.resultCount ?? 0;
  title.textContent = `${total} published rate${total === 1 ? '' : 's'}`
    + (rows.length === total ? '' : ` (${rows.length} shown)`);
}

function renderCinemas(payload) {
  cinemaList.innerHTML = payload.cinemas.map((cinema) => {
    if (cinema.status === 'ok') {
      return `<li><strong>${escapeHtml(cinema.name)}</strong> — <span class="ok">${cinema.count} rate${cinema.count === 1 ? '' : 's'}</span></li>`;
    }
    if (cinema.status === 'no_results') {
      return `<li><strong>${escapeHtml(cinema.name)}</strong> — <span class="miss">publishes no rate card we could read</span></li>`;
    }
    if (/setup:browser/.test(cinema.error ?? '')) {
      return `<li><strong>${escapeHtml(cinema.name)}</strong> — <span class="miss">its price page is a JavaScript app and needs
        headless rendering (<code>npm run setup:browser</code>)</span></li>`;
    }
    return `<li><strong>${escapeHtml(cinema.name)}</strong> — <span class="err">could not be reached</span>
      <span class="miss">(${escapeHtml(cinema.error ?? 'unavailable')})</span></li>`;
  }).join('');
}

function render(payload) {
  current = payload;
  statusRegion.innerHTML = '';

  if (!payload.resultCount) {
    showPanel(`
      <h2>No published ticket rates found</h2>
      <p>We checked ${payload.cinemas.length} cinema${payload.cinemas.length === 1 ? '' : 's'} and none published a rate
         card we could read. Nothing is shown rather than guessed.</p>
      <ul>${payload.cinemas.map((cinema) =>
        `<li>${escapeHtml(cinema.name)}: ${escapeHtml(cinema.error ?? cinema.status)}</li>`).join('')}</ul>`);
    return;
  }

  region.hidden = false;
  const cinemaCount = new Set(payload.results.map((row) => row.cinemaId)).size;
  meta.textContent =
    `${cinemaCount} cinema${cinemaCount === 1 ? '' : 's'} · `
    + `${formatNpr(payload.priceRange.min)} – ${formatNpr(payload.priceRange.max)} · `
    + `checked ${new Date(payload.generatedAt).toLocaleTimeString()}${payload.cached ? ' (cached)' : ''}`;

  const best = payload.cheapest;
  summaryBox.innerHTML = `
    <div class="summary">
      <p class="summary__lead">Cheapest ticket: <strong>${formatNpr(best.priceNpr)}</strong>
        at <strong>${escapeHtml(best.cinemaName)}</strong></p>
      <p class="summary__detail">${escapeHtml(best.show)}${best.dayBand ? ` · ${escapeHtml(best.dayBand)}` : ''}</p>
    </div>`;

  warningsBox.innerHTML = payload.warnings.map((text) =>
    `<div class="notice notice--info"><span aria-hidden="true">ℹ️</span><span>${escapeHtml(text)}</span></div>`).join('');

  renderCinemas(payload);
  cinemaFilter.update(payload.results.map((row) => ({ key: row.cinemaId, name: row.cinemaName })));
  renderCurrentRows();
}

async function load() {
  button.disabled = true;
  showPanel(`<h2><span class="spinner" aria-hidden="true"></span>Reading cinema rate cards&hellip;</h2>`);

  try {
    const res = await fetch('/api/movies');
    const payload = await res.json();
    if (!res.ok) throw new Error(payload.error ?? `Request failed (${res.status})`);
    loaded = true;
    render(payload);
  } catch (error) {
    showPanel(`<h2>Something went wrong</h2><p>${escapeHtml(error.message)}</p>`);
  } finally {
    button.disabled = false;
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  if (current) renderCurrentRows();
  else load();
});

for (const select of [bandSelect, slotSelect]) {
  select.addEventListener('change', () => { if (current) renderCurrentRows(); });
}
