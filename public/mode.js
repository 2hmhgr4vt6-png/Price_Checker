/**
 * The Products / Flight tickets / Movie tickets switch.
 *
 * Each vertical registers its tab button, its search form and its results
 * section here, so adding another (bus tickets, events) is one register()
 * call rather than another branch in three files. Only one vertical's form
 * and results are on screen at a time, and the choice is reflected in the URL
 * so a mode is shareable.
 */

const modes = new Map();
const listeners = new Set();
let activeId = null;

/**
 * @param {object} config
 * @param {string} config.id            'products' | 'flights' | 'movies' | ...
 * @param {HTMLElement} config.button   the tab
 * @param {HTMLElement[]} config.panels form and any helper elements to show
 * @param {HTMLElement} config.results  results section to hide when inactive
 * @param {string} config.hero          sub-heading text for this vertical
 * @param {Function} [config.onActivate]
 */
let initialApplied = false;

export function registerMode(config) {
  modes.set(config.id, config);
  config.button.addEventListener('click', () => setMode(config.id));

  // Verticals register from separate modules, in whatever order the browser
  // evaluates them, so the initial ?mode= is applied once on the next task -
  // by which time they have all registered.
  if (!initialApplied) {
    initialApplied = true;
    setTimeout(applyInitialMode, 0);
  }
}

export function onModeChange(listener) {
  listeners.add(listener);
}

export function currentMode() {
  return activeId;
}

export function setMode(id, { push = true } = {}) {
  const target = modes.get(id);
  if (!target) return;
  activeId = id;

  for (const mode of modes.values()) {
    const active = mode.id === id;
    mode.button.classList.toggle('is-active', active);
    mode.button.setAttribute('aria-selected', String(active));
    for (const panel of mode.panels) panel.hidden = !active;
    // Another vertical's results would be stale and confusing here.
    if (mode.results && !active) mode.results.hidden = true;
  }

  const hero = document.getElementById('hero-sub');
  if (hero && target.hero) hero.textContent = target.hero;

  // Clear whatever the previous vertical left in the shared status area.
  const status = document.getElementById('status-region');
  if (status) status.innerHTML = '';

  if (push) {
    const url = new URL(window.location);
    if (id === 'products') url.searchParams.delete('mode');
    else url.searchParams.set('mode', id);
    window.history.replaceState({}, '', url);
  }

  target.onActivate?.();
  for (const listener of listeners) listener(id);
}

/** Apply ?mode= on load. Scheduled automatically by the first registerMode. */
export function applyInitialMode() {
  const requested = new URL(window.location).searchParams.get('mode');
  setMode(modes.has(requested) ? requested : 'products', { push: false });
}
