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

    // Render tags
    const tg = node.querySelector('.tags');
    tg.innerHTML = '';
    r.tags.forEach(t => {
      const span = document.createElement('span');
      span.className = 'tag';
      span.textContent = t;
      tg.appendChild(span);
      tg.appendChild(document.createTextNode(' '));
    });

    // Render ingredients
    const ingBox = node.querySelector('.ingredients');
    ingBox.innerHTML = '';
    const ingHeader = document.createElement('h4');
    ingHeader.textContent = 'Ingredients';
    ingBox.appendChild(ingHeader);
    const ul = document.createElement('ul');
    if (r.components) {
      r.components.forEach(c => {
        if (c.ingredients) {
          c.ingredients.forEach(i => {
            const li = document.createElement('li');
            li.textContent = [i.amount, i.item, i.notes, i.optional ? '(optional)' : ''].filter(Boolean).join(' ');
            ul.appendChild(li);
          });
        }
      });
    } else if (r.ingredients) {
      r.ingredients.forEach(i => {
        const li = document.createElement('li');
        li.textContent = [i.amount, i.item, i.notes, i.optional ? '(optional)' : ''].filter(Boolean).join(' ');
        ul.appendChild(li);
      });
    }
    ingBox.appendChild(ul);

    // Render instructions
    const insBox = node.querySelector('.instructions');
    insBox.innerHTML = '';
    const insHeader = document.createElement('h4');
    insHeader.textContent = 'Instructions:';
    insBox.appendChild(insHeader);
    const ol = document.createElement('ol');
    if (r.components) {
      r.components.forEach(c => {
        if (c.instructions) {
          c.instructions.forEach(step => {
            const li = document.createElement('li');
            li.textContent = step;
            ol.appendChild(li);
          });
        }
      });
    } else if (r.instructions) {
      r.instructions.forEach(step => {
        const li = document.createElement('li');
        li.textContent = step;
        ol.appendChild(li);
      });
    }
    insBox.appendChild(ol);

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

  // Tags multi-select
  $('#tagSelect').addEventListener('change', e => {
    const selected = Array.from(e.target.selectedOptions).map(o=>o.value);
    state.tags = new Set(selected);
    renderResults();
    updateURL();
  });

  // AND/OR radios
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
    document.querySelectorAll('.atom-mode input[name="mode"]').forEach(r => r.checked = (r.value === 'and'));
    renderAtomChips();
    renderResults();
    updateURL();
  });
}

(async function init() {
  await loadData();
  restoreFromURL();
  renderTagSelectOnce();
  bindControlEvents();
  renderAtomChips();
  renderResults();
  updateURL();
})();
