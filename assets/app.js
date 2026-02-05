// assets/app.js
const state = {
  data: null,
  selectedAtoms: new Set(),
  mode: 'and', // 'and' | 'or'
  q: '',
  tags: new Set(),
  facets: { allTags: [], allAtoms: [] } // cached after load
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

// --- Utilities ---
function ensureChild(container, selector, creator) {
  let node = container.querySelector(selector);
  if (!node) {
    node = creator();
    container.appendChild(node);
  }
  return node;
}

async function loadData() {
  try {
    const res = await fetch('data/recipes.json', { cache: 'no-store' });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} while fetching data/recipes.json`);
    }
    const json = await res.json();

    if (!json || !Array.isArray(json.recipes)) {
      throw new Error('Invalid JSON structure: expected { recipes: [...] }');
    }

    json.recipes.forEach(r => {
      r.tags = r.tags || [];
      r.ingredientTags = r.ingredientTags || [];
      r.ingredientAtoms = r.ingredientAtoms || [];
      // Normalize optional top-level fallback arrays
      r.ingredients = r.ingredients || [];
      r.instructions = r.instructions || [];
    });
    state.data = json;

    // Build global facets ONCE (from full dataset; not filtered),
    // so chips don't "disappear" during interaction.
    const uniqueSorted = (arr) => [...new Set(arr)].sort((a,b)=>a.localeCompare(b));
    state.facets.allTags  = uniqueSorted(json.recipes.flatMap(r => r.tags || []));
    state.facets.allAtoms = uniqueSorted(json.recipes.flatMap(r => r.ingredientAtoms || []));
  } catch (err) {
    console.error('[loadData] Failed to load recipes.json:', err);
    // Provide a visible message in the UI
    const list = $('#results');
    if (list) {
      list.innerHTML = '';
      const div = document.createElement('div');
      div.className = 'error';
      div.textContent = 'Failed to load recipes data. Make sure you are running a local web server and that data/recipes.json is reachable.';
      list.appendChild(div);
    }
    throw err; // rethrow to stop init
  }
}

function renderTagSelectOnce() {
  const sel = $('#tagSelect');
  if (!sel || sel.dataset.bound === '1') return;
  sel.innerHTML = '';
  state.facets.allTags.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t; opt.textContent = t;
    sel.appendChild(opt);
  });
  sel.dataset.bound = '1';
}

function renderAtomChips() {
  const box = $('#atomChips');
  if (!box) return;
  const filter = ($('#atomFilter')?.value || '').trim().toLowerCase();
  box.innerHTML = '';
  (state.facets.allAtoms || [])
    .filter(a => (a || '').toLowerCase().includes(filter))
    .forEach(atom => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip' + (state.selectedAtoms.has(atom) ? ' selected' : '');
      chip.textContent = atom;
      chip.setAttribute('aria-pressed', state.selectedAtoms.has(atom));
      chip.addEventListener('click', () => {
        if (state.selectedAtoms.has(atom)) state.selectedAtoms.delete(atom);
        else state.selectedAtoms.add(atom);
        renderAtomChips();
        renderResults();
        updateURL();
      });
      box.appendChild(chip);
    });
}

function matchRecipe(r) {
  const q = (state.q || '').toLowerCase();
  if (q) {
    const hay = [r.name, ...(r.tags||[]), ...(r.ingredientTags||[]), ...(r.ingredientAtoms||[])]
      .join(' ').toLowerCase();
    if (!hay.includes(q)) return false;
  }
  if (state.tags.size) {
    if (![...state.tags].every(t => r.tags.includes(t))) return false;
  }
  const atoms = [...state.selectedAtoms];
  if (atoms.length) {
    return state.mode === 'and'
      ? atoms.every(a => r.ingredientAtoms.includes(a))
      : atoms.some(a => r.ingredientAtoms.includes(a));
  }
  return true;
}

function renderResults() {
  const list = $('#results');
  if (!list) {
    console.error('[renderResults] #results container not found.');
    return;
  }

  list.innerHTML = '';

  if (!state.data || !Array.isArray(state.data.recipes)) {
    console.error('[renderResults] No data loaded or invalid structure.');
    const div = document.createElement('div');
    div.textContent = 'No data available.';
    list.appendChild(div);
    return;
  }

  let results = state.data.recipes.filter(matchRecipe);
  results.sort((a,b)=>a.name.localeCompare(b.name));

  const tmpl = document.getElementById('recipeCardTmpl');
  if (!tmpl || !('content' in tmpl)) {
    console.error('[renderResults] Missing <template id="recipeCardTmpl"> or template not supported.');
    const div = document.createElement('div');
    div.textContent = 'Template not found. Please include a <template id="recipeCardTmpl"> in your HTML.';
    list.appendChild(div);
    return;
  }

  try {
    results.forEach(r => {
      const node = tmpl.content.cloneNode(true);

      // Ensure required containers exist in the cloned node
      const titleEl = ensureChild(node, '.card-title', () => {
        const h3 = document.createElement('h3'); h3.className = 'card-title'; return h3;
      });
      const metaEl = ensureChild(node, '.meta', () => {
        const p = document.createElement('p'); p.className = 'meta'; return p;
      });
      const tagsEl = ensureChild(node, '.tags', () => {
        const div = document.createElement('div'); div.className = 'tags'; return div;
      });
      const ingBox = ensureChild(node, '.ingredients', () => {
        const div = document.createElement('div'); div.className = 'ingredients'; return div;
      });
      const insBox = ensureChild(node, '.instructions', () => {
        const div = document.createElement('div'); div.className = 'instructions'; return div;
      });

      titleEl.textContent = r.name || '';
      metaEl.textContent = `Servings: ${r.servings ?? ''}`;

      tagsEl.innerHTML = '';
      (r.tags || []).forEach(t => {
        const span = document.createElement('span');
        span.className = 'tag';
        span.textContent = t;
        tagsEl.appendChild(span);
      });

      // Clear any previous content in containers in case template had placeholders
      ingBox.innerHTML = '';
      insBox.innerHTML = '';

      // Render components conditionally, or fallback to top-level
      let renderedIngredients = false;
      let renderedInstructions = false;

      if (Array.isArray(r.components) && r.components.length) {
        r.components.forEach(c => {
          // Ingredients block
          if (Array.isArray(c.ingredients) && c.ingredients.length) {
            const h = document.createElement('h4');
            h.textContent = c.component_name || 'Ingredients';
            ingBox.appendChild(h);

            const ul = document.createElement('ul');
            c.ingredients.forEach(i => {
              const li = document.createElement('li');
              li.textContent = [i.amount, i.item, i.notes, i.optional ? '(optional)' : '']
                .filter(Boolean).join(' ');
              ul.appendChild(li);
            });
            ingBox.appendChild(ul);
            renderedIngredients = true;
          }

          // Instructions block
          if (Array.isArray(c.instructions) && c.instructions.length) {
            const h2 = document.createElement('h4');
            h2.textContent = c.component_name || 'Instructions';
            insBox.appendChild(h2);

            const ol = document.createElement('ol');
            c.instructions.forEach(step => {
              const li = document.createElement('li');
              li.textContent = step;
              ol.appendChild(li);
            });
            insBox.appendChild(ol);
            renderedInstructions = true;
          }
        });
      }

      // Fallbacks: if components present but had no valid arrays, use top-level
      if (!renderedIngredients && Array.isArray(r.ingredients) && r.ingredients.length) {
        const h = document.createElement('h4'); h.textContent = 'Ingredients'; ingBox.appendChild(h);
        const ul = document.createElement('ul');
        r.ingredients.forEach(i => {
          const li = document.createElement('li');
          li.textContent = [i.amount, i.item, i.notes, i.optional ? '(optional)' : '']
            .filter(Boolean).join(' ');
          ul.appendChild(li);
        });
        ingBox.appendChild(ul);
      }

      if (!renderedInstructions && Array.isArray(r.instructions) && r.instructions.length) {
        const h2 = document.createElement('h4'); h2.textContent = 'Instructions'; insBox.appendChild(h2);
        const ol = document.createElement('ol');
        r.instructions.forEach(step => {
          const li = document.createElement('li');
          li.textContent = step;
          ol.appendChild(li);
        });
        insBox.appendChild(ol);
      }

      list.appendChild(node);
    });
  } catch (err) {
    console.error('[renderResults] Rendering error:', err);
    const div = document.createElement('div');
    div.className = 'error';
    div.textContent = 'An error occurred while rendering recipes. Check the console for details.';
    list.appendChild(div);
  }

  if (!results.length) {
    const div = document.createElement('div');
    div.textContent = 'No recipes match your filters.';
    list.appendChild(div);
  }
}

function updateURL() {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.tags.size) params.set('tags', [...state.tags].join(','));
  if (state.selectedAtoms.size) params.set('atoms', [...state.selectedAtoms].join(','));
  params.set('mode', state.mode);
  history.replaceState({}, '', '?' + params.toString());
}

function restoreFromURL() {
  const url = new URL(location.href);
  const q = url.searchParams.get('q') || '';
  const tags = (url.searchParams.get('tags')||'').split(',').filter(Boolean);
  const atoms = (url.searchParams.get('atoms')||'').split(',').filter(Boolean);
  const mode = url.searchParams.get('mode') || 'and';
  const qInput = $('#q');
  if (qInput) qInput.value = q;
  state.q = q; state.mode = mode;
  state.tags = new Set(tags); state.selectedAtoms = new Set(atoms);
}

function bindControlEvents() {
  // Search box
  $('#q')?.addEventListener('input', e => {
    state.q = e.target.value.trim();
    renderResults();
    updateURL();
  });

  // Tags multi-select (do not rebuild options during render)
  $('#tagSelect')?.addEventListener('change', e => {
    const selected = Array.from(e.target.selectedOptions).map(o=>o.value);
    state.tags = new Set(selected);
    renderResults();
    updateURL();
  });

  // AND/OR radios — select by CLASS, not ID
