# Recipe Search – Static Frontend

A lightweight static site to search and view recipes by name, tags, and ingredient **atoms** (e.g., `chicken-breast` splits into `chicken` + `breast`).

## Contents
- `index.html` – UI with search, tag picker, and ingredient chips
- `assets/styles.css` – minimal styling
- `assets/app.js` – client-side filtering (AND/OR for ingredient atoms), URL query-state
- `data/recipes.json` – your dataset with `ingredientTags` and `ingredientAtoms`

## Run locally
Any static web server will work. Examples:

### Python 3
```bash
cd recipe-frontend
python -m http.server 5173
# open http://localhost:5173
```

### Node (serve)
```bash
npx serve -s . -l 5173
```

## Deploy
Host the folder on any static hosting (GitHub Pages, Azure Static Web Apps, Netlify, Vercel). No server required.

## Filtering logic
- **Name search**: matches recipe name, tags, ingredientTags, and ingredientAtoms
- **Tags**: multi-select; requires *all* selected tags
- **Ingredient atoms**: chips with **AND/OR** mode

## Data provenance
All recipes and ingredients originate from your provided document. This frontend reads `data/recipes.json` generated from that source.
