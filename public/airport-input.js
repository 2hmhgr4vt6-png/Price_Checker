/**
 * Airport autocomplete for the flight form's From/To fields.
 *
 * The visible input shows something a traveller recognises ("Pokhara (PKR)")
 * while a hidden field carries the IATA code the API needs. Typing anything
 * that is not a chosen airport clears the code, so a half-typed city can never
 * be submitted as if it were a real airport.
 */

const DEBOUNCE_MS = 180;

export function attachAirportInput({ input, hidden, list, onPick }) {
  let items = [];
  let active = -1;
  let timer;
  let lastQuery = null;
  // Responses can arrive out of order - focus fires a request for "" while
  // keystrokes fire one for "pokh", and if the empty one lands last it would
  // replace the real matches with the default list. Only the newest wins.
  let requestId = 0;

  const label = (airport) =>
    `${airport.city || airport.name} (${airport.code})`;

  const close = () => {
    list.hidden = true;
    list.innerHTML = '';
    input.setAttribute('aria-expanded', 'false');
    active = -1;
  };

  const pick = (airport) => {
    hidden.value = airport.code;
    input.value = label(airport);
    close();
    onPick?.(airport);
  };

  const render = () => {
    if (!items.length) return close();

    list.innerHTML = items
      .map((airport, index) => `
        <li role="option" id="${list.id}-opt-${index}" data-index="${index}"
            class="${index === active ? 'is-active' : ''}" aria-selected="${index === active}">
          <strong>${airport.code}</strong>
          <span>${airport.city || ''}${airport.city && airport.name ? ' — ' : ''}${airport.name || ''}</span>
          <small>${airport.country || ''}</small>
        </li>`)
      .join('');

    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  };

  async function fetchSuggestions(term) {
    if (term === lastQuery) return render();
    lastQuery = term;

    const id = ++requestId;
    try {
      const res = await fetch(`/api/airports?q=${encodeURIComponent(term)}`);
      const payload = await res.json();
      if (id !== requestId) return;

      items = payload.airports ?? [];
      active = -1;
      render();

      // Nothing bundled matched - ask the slower directory-backed lookup,
      // which covers small airfields the bundled list omits.
      if (!items.length && term.length >= 3) {
        const live = await fetch(`/api/airports?live=1&q=${encodeURIComponent(term)}`);
        const livePayload = await live.json();
        if (id !== requestId) return;

        items = livePayload.airports ?? [];
        render();
      }
    } catch {
      if (id !== requestId) return;
      // Offline or the request failed: no suggestions is better than a
      // misleading list, and the field still accepts a typed code.
      close();
    }
  }

  input.addEventListener('input', () => {
    // A code only counts while it matches what is shown.
    hidden.value = '';
    clearTimeout(timer);
    const term = input.value.trim();
    timer = setTimeout(() => fetchSuggestions(term), DEBOUNCE_MS);
  });

  input.addEventListener('focus', () => {
    clearTimeout(timer);
    fetchSuggestions(input.value.trim());
  });

  input.addEventListener('keydown', (event) => {
    if (list.hidden) return;

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      active = event.key === 'ArrowDown'
        ? (active + 1) % items.length
        : (active - 1 + items.length) % items.length;
      render();
      input.setAttribute('aria-activedescendant', `${list.id}-opt-${active}`);
    } else if (event.key === 'Enter' && active >= 0) {
      event.preventDefault();
      pick(items[active]);
    } else if (event.key === 'Escape') {
      close();
    } else if (event.key === 'Tab' && items.length && !hidden.value) {
      // Tabbing away with an unambiguous match takes it, which is what a
      // traveller who typed "pokh" and moved on expects.
      pick(items[0]);
    }
  });

  list.addEventListener('mousedown', (event) => {
    const option = event.target.closest('li[data-index]');
    if (option) {
      event.preventDefault();
      pick(items[Number(option.dataset.index)]);
    }
  });

  input.addEventListener('blur', () => {
    // Let a click on the list land first.
    setTimeout(() => {
      if (!hidden.value && items.length && input.value.trim()) pick(items[0]);
      close();
    }, 150);
  });

  return {
    /** Programmatic selection, used by the example route chips. */
    setCode(code, airport) {
      if (airport) return pick(airport);
      hidden.value = code;
      input.value = code;
    },
    get code() { return hidden.value; },
    clear() { hidden.value = ''; input.value = ''; close(); },
  };
}
