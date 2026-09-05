/**
 * Result filters, shared by the product and flight tables.
 *
 * A filter is a row of toggle chips built from whatever is actually in the
 * results - the shops that answered this search, the airlines that fly this
 * route - so it never offers a choice that would empty the table. Each chip
 * carries its own count, and "All" clears the selection.
 *
 * Filtering is client side: the results are already loaded, so narrowing them
 * costs nothing and never re-hits a store.
 */

/**
 * @param {object} options
 * @param {HTMLElement} options.container  where the chips are rendered
 * @param {string} options.label           e.g. "Shop" or "Airline"
 * @param {Function} options.onChange      called with the Set of active keys
 */
export function attachFilter({ container, label, onChange }) {
  let selected = new Set();
  let groups = [];

  function render() {
    if (groups.length < 2) {
      // One group is not a choice.
      container.innerHTML = '';
      container.hidden = true;
      return;
    }

    container.hidden = false;
    const chips = groups.map(({ key, name, count }) => {
      const active = selected.has(key);
      return `<button type="button" class="filter-chip${active ? ' is-active' : ''}"
        data-key="${escapeAttr(key)}" aria-pressed="${active}">
        ${escapeHtml(name)} <span class="filter-chip__count">${count}</span></button>`;
    }).join('');

    container.innerHTML = `
      <span class="filter__label">${escapeHtml(label)}</span>
      <button type="button" class="filter-chip filter-chip--all${selected.size ? '' : ' is-active'}"
        data-key="" aria-pressed="${selected.size === 0}">All</button>
      ${chips}`;
  }

  const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (char) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const escapeAttr = escapeHtml;

  container.addEventListener('click', (event) => {
    const chip = event.target.closest('.filter-chip');
    if (!chip) return;

    const key = chip.dataset.key;
    if (!key) selected.clear();
    else if (selected.has(key)) selected.delete(key);
    else selected.add(key);

    render();
    onChange(new Set(selected));
  });

  return {
    /**
     * Rebuild the chips for a new result set. Selections that still exist are
     * kept, so re-sorting or a repeat search does not silently widen the view.
     * @param {{key: string, name: string}[]} items one entry per row
     */
    update(items) {
      const counts = new Map();
      for (const item of items) {
        const entry = counts.get(item.key) ?? { key: item.key, name: item.name, count: 0 };
        entry.count += 1;
        counts.set(item.key, entry);
      }

      groups = [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
      selected = new Set([...selected].filter((key) => counts.has(key)));
      render();
      return new Set(selected);
    },

    get selected() { return new Set(selected); },

    clear() {
      selected.clear();
      render();
    },
  };
}

/** Keep rows whose key is selected; an empty selection means everything. */
export function applyFilter(rows, keyOf, selected) {
  if (!selected.size) return rows;
  return rows.filter((row) => selected.has(keyOf(row)));
}
