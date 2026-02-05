// assets/app.js
const state = {
  data: null,
  selectedAtoms: new Set(),
  mode: 'and', // 'and'|'or'
  q: '',
  tags: new Set(),
  facets: { allTags: [], allAtoms: [] } // cached after load
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

async function loadData() {
  const res = await fetch('data/recipes.json');
  const json = await res.json();
  json.recipes.forEach(r => {
    r.tags = r.tags || [];
    r.ingredientTags = r.ingredientTags || [];
    r.ingredientAtoms = r.ingredientAtoms || [];
  });
  state.data = json;

  // Build global facets ONCE (from full dataset; not filtered),
  // so chips don't "disappear" during interaction.
  const uniqueSorted = (arr) => [...new Set(arr)].sort((a,b)=>a.localeCompare(b));
  state.facets.allTags  = uniqueSorted(json.recipes.flatMap(r => r.tags || []));
  state.facets.allAtoms = uniqueSorted(json.recipes.flatMap(r => r.ingredientAtoms || []));
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
  // Only re-render the chips area, not the entire controls panel.
  const box = $('#atomChips');
  if (!box) return;
  const filter = $('#atomFilter').value.trim().toLowerCase();
  box.innerHTML = '';
  state.facets.allAtoms
    .filter(a => a.includes(filter))
    .forEach(atom => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip' + (state.selectedAtoms.has(atom) ? ' selected' : '');
      chip.textContent = atom;
      chip.setAttribute('aria-pressed', state.selectedAtoms.has(atom));
      chip.addEventListener('click', () => {
        // Toggle selection, then re-render only chips + results
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
  const q = state.q.toLowerCase();
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
  list.innerHTML = '';
  let results = state.data.recipes.filter(matchRecipe);
  results.sort((a,b)=>a.name.localeCompare(b.name));

  const tmpl = document.getElementById('recipeCardTmpl');
  results.forEach(r => {
    const node = tmpl.content.cloneNode(true);
    node.querySelector('.card-title').textContent = r.name;
    node.querySelector('.meta').textContent = `Servings: ${r.servings ?? ''}`;
    const tg = node.querySelector('.tags');
    r.tags.forEach(t => {
      const span = document.createElement('span');
      span.className = 'tag'; span.textContent = t; tg.appendChild(span);
    });
    const ingBox = node.querySelector('.ingredients');
    const insBox = node.querySelector('.instructions');
    if (r.components) {
      r.components.forEach(c => {
        if (c.ingredients) {
          const h = document.createElement('h4'); h.textContent = c.component_name; ingBox.appendChild(h);
          const ul = document.createElement('ul');
          (c.ingredients||[]).forEach(i => {
            const li = document.createElement('li');
            li.textContent = [i.amount, i.item, i.notes, i.optional? '(optional)':'' ].filter(Boolean).join(' ');
            ul.appendChild(li);
          });
          ingBox.appendChild(ul);
        }
        if (c.instructions) {
          const ol = document.createElement('ol');
          (c.instructions||[]).forEach(step => { const li=document.createElement('li'); li.textContent=step; ol.appendChild(li); });
          insBox.appendChild(ol);
        }
      });
    } else {
      const h = document.createElement('h4'); h.textContent = 'Ingredients'; ingBox.appendChild(h);
      const ul = document.createElement('ul');
      (r.ingredients||[]).forEach(i => {
        const li = document.createElement('li');
        li.textContent = [i.amount, i.item, i.notes, i.optional? '(optional)':'' ].filter(Boolean).join(' ');
        ul.appendChild(li);
      });
      ingBox.appendChild(ul);
      const h2 = document.createElement('h4'); h2.textContent = 'Instructions'; insBox.appendChild(h2);
      const ol = document.createElement('ol');
      (r.instructions||[]).forEach(step => { const li=document.createElement('li'); li.textContent=step; ol.appendChild(li); });
      insBox.appendChild(ol);
    }
    list.appendChild(node);
  });

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
  $('#q').value = q; state.q = q; state.mode = mode;
  state.tags = new Set(tags); state.selectedAtoms = new Set(atoms);
}

function bindControlEvents() {
  // Search box
  $('#q').addEventListener('input', e => {
    state.q = e.target.value.trim();
    renderResults();
    updateURL();
  });

  // Tags multi-select (do not rebuild options during render)
  $('#tagSelect').addEventListener('change', e => {
    const selected = Array.from(e.target.selectedOptions).map(o=>o.value);
    state.tags = new Set(selected);
    renderResults();
    updateURL();
  });

  // AND/OR radios — select by CLASS, not ID
  document.querySelectorAll('.atom-mode input[name="mode"]').forEach(r => {
    r.addEventListener('change', e => {
      state.mode = e.target.value;
      renderResults();
      updateURL();
    });
  });

  // Live filter for the chips list
  $('#atomFilter').addEventListener('input', () => {
    renderAtomChips();
  });

  // Clear filters
  $('#clearBtn').addEventListener('click', () => {
    state.q = '';
    state.tags.clear();
    state.selectedAtoms.clear();
    state.mode = 'and';
    $('#q').value = '';
    $('#atomFilter').value = '';
    // Reset radios to AND
    document.querySelectorAll('.atom-mode input[name="mode"]').forEach(r => r.checked = (r.value === 'and'));
    renderAtomChips();
    renderResults();
    updateURL();
  });
}

(async function init() {
  await loadData();
  restoreFromURL();
  renderTagSelectOnce();   // build tag options once
  bindControlEvents();     // bind once
  renderAtomChips();       // render chips area
  renderResults();         // render cards
  updateURL();
})();
