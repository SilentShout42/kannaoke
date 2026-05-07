# Graph Report - .  (2026-05-06)

## Corpus Check
- Corpus is ~17,761 words - fits in a single context window. You may not need a graph.

## Summary
- 79 nodes · 104 edges · 18 communities detected
- Extraction: 84% EXTRACTED · 16% INFERRED · 0% AMBIGUOUS · INFERRED: 17 edges (avg confidence: 0.77)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_React App Shell|React App Shell]]
- [[_COMMUNITY_App Internal Functions|App Internal Functions]]
- [[_COMMUNITY_Project Config & Docs|Project Config & Docs]]
- [[_COMMUNITY_Data Pipeline & Filtering|Data Pipeline & Filtering]]
- [[_COMMUNITY_Build Script Implementation|Build Script Implementation]]
- [[_COMMUNITY_Build Pipeline Logic|Build Pipeline Logic]]
- [[_COMMUNITY_URL Param System|URL Param System]]
- [[_COMMUNITY_Watch Script|Watch Script]]
- [[_COMMUNITY_Vite Config|Vite Config]]
- [[_COMMUNITY_Project Documentation|Project Documentation]]
- [[_COMMUNITY_Watch Script AST|Watch Script AST]]
- [[_COMMUNITY_Build Script Entry|Build Script Entry]]
- [[_COMMUNITY_Query Preparation|Query Preparation]]
- [[_COMMUNITY_Vite Config AST|Vite Config AST]]
- [[_COMMUNITY_Build Script AST|Build Script AST]]
- [[_COMMUNITY_Watch Script AST|Watch Script AST]]
- [[_COMMUNITY_App AST|App AST]]
- [[_COMMUNITY_Main Entry AST|Main Entry AST]]

## God Nodes (most connected - your core abstractions)
1. `App.tsx (main component)` - 24 edges
2. `Performance data loader` - 6 edges
3. `performances.json (source data)` - 6 edges
4. `URL param system (permalinks)` - 6 edges
5. `CLAUDE.md (project docs)` - 6 edges
6. `fail()` - 5 edges
7. `Results panel (UI layout)` - 5 edges
8. `Members-only filtering` - 5 edges
9. `README.md (project docs)` - 5 edges
10. `normalizeEntry()` - 4 edges

## Surprising Connections (you probably didn't know these)
- `URL param system (permalinks)` --rationale_for--> `seedQueryEffect (URL param seeding)`  [INFERRED]
  CLAUDE.md → src/App.tsx
- `URL param system (permalinks)` --rationale_for--> `Seeded initial state logic`  [INFERRED]
  CLAUDE.md → src/App.tsx
- `CLAUDE.md (project docs)` --references--> `App.tsx (main component)`  [EXTRACTED]
  CLAUDE.md → src/App.tsx
- `README.md (project docs)` --references--> `App.tsx (main component)`  [EXTRACTED]
  README.md → src/App.tsx
- `README.md (project docs)` --references--> `main.tsx (entry point)`  [EXTRACTED]
  README.md → src/main.tsx

## Hyperedges (group relationships)
- **Build pipeline: validate-dedupe-sort-index** — build_main_fn, normalize_entry, dedupe_entries, sort_entries, fuse_build_index [EXTRACTED 1.00]
- **URL param system: bidirectional sync** — seed_query_effect, seed_query_url_sync, active_entry_url_sync, seeded_initial_state [INFERRED 0.80]
- **Two-panel responsive layout** — ui_results_panel, ui_player_panel, drag_resize_handle [INFERRED 0.75]

## Communities

### Community 0 - "React App Shell"
Cohesion: 0.17
Nodes (16): Drag-to-resize handle, formatTime() (time format), fuse.js (npm dependency), fuseOptions (search config), initializeApp() (initial state), loadData (runtime fetch), Dice roll randomizer, selectEntry (song selection) (+8 more)

### Community 1 - "App Internal Functions"
Cohesion: 0.21
Nodes (9): formatTime(), initializeApp(), loadData(), prepareQuery(), rollDice(), runDiceRoll(), selectEntry(), timeLabel() (+1 more)

### Community 2 - "Project Config & Docs"
Cohesion: 0.31
Nodes (8): Build pipeline (data pipeline), CLAUDE.md (project docs), Cloudflare Workers hosting, performances.json (source data), README.md (project docs), scripts/build-performances.mjs, scripts/watch-performances.mjs, main.tsx (entry point)

### Community 3 - "Data Pipeline & Filtering"
Cohesion: 0.31
Nodes (9): Fuse.js build-time index creation, membersOnly field (data model), Members-only filtering, Performance data loader, Performance (data model), performances.fuse-index.json (output), performances.min.json (output), TODO.md (project tracker) (+1 more)

### Community 4 - "Build Script Implementation"
Cohesion: 0.54
Nodes (7): assertInteger(), assertString(), dedupeEntries(), fail(), main(), normalizeEntry(), sortEntries()

### Community 5 - "Build Pipeline Logic"
Cohesion: 0.4
Nodes (5): main() (build script entry), byDate (sorting comparator), dedupeEntries (build dedup), normalizeEntry (build validator), sortEntries (build sorter)

### Community 6 - "URL Param System"
Cohesion: 0.4
Nodes (5): Active entry-URL sync (bidirectional), seedQueryEffect (URL param seeding), Query-URL sync (bidirectional), Seeded initial state logic, URL param system (permalinks)

### Community 7 - "Watch Script"
Cohesion: 1.0
Nodes (0): 

### Community 8 - "Vite Config"
Cohesion: 1.0
Nodes (0): 

### Community 9 - "Project Documentation"
Cohesion: 1.0
Nodes (1): Kannaoke (project)

### Community 10 - "Watch Script AST"
Cohesion: 1.0
Nodes (1): watch-performances.mjs (watch script)

### Community 11 - "Build Script Entry"
Cohesion: 1.0
Nodes (1): runBuild() (watch script trigger)

### Community 12 - "Query Preparation"
Cohesion: 1.0
Nodes (1): prepareQuery() (query prep)

### Community 13 - "Vite Config AST"
Cohesion: 1.0
Nodes (1): viteConfig (AST node)

### Community 14 - "Build Script AST"
Cohesion: 1.0
Nodes (1): build-performances.mjs (AST node)

### Community 15 - "Watch Script AST"
Cohesion: 1.0
Nodes (1): watch-performances.mjs (AST node)

### Community 16 - "App AST"
Cohesion: 1.0
Nodes (1): App.tsx (AST node)

### Community 17 - "Main Entry AST"
Cohesion: 1.0
Nodes (1): main.tsx (AST node)

## Knowledge Gaps
- **21 isolated node(s):** `byDate (sorting comparator)`, `normalizeEntry (build validator)`, `dedupeEntries (build dedup)`, `loadData (runtime fetch)`, `Dice roll randomizer` (+16 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Watch Script`** (2 nodes): `watch-performances.mjs`, `runBuild()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Vite Config`** (1 nodes): `vite.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Project Documentation`** (1 nodes): `Kannaoke (project)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Watch Script AST`** (1 nodes): `watch-performances.mjs (watch script)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Build Script Entry`** (1 nodes): `runBuild() (watch script trigger)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Query Preparation`** (1 nodes): `prepareQuery() (query prep)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Vite Config AST`** (1 nodes): `viteConfig (AST node)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Build Script AST`** (1 nodes): `build-performances.mjs (AST node)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Watch Script AST`** (1 nodes): `watch-performances.mjs (AST node)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `App AST`** (1 nodes): `App.tsx (AST node)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Main Entry AST`** (1 nodes): `main.tsx (AST node)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `App.tsx (main component)` connect `React App Shell` to `Project Config & Docs`, `Data Pipeline & Filtering`, `URL Param System`?**
  _High betweenness centrality (0.211) - this node is a cross-community bridge._
- **Why does `Fuse.js build-time index creation` connect `Data Pipeline & Filtering` to `React App Shell`, `Build Pipeline Logic`?**
  _High betweenness centrality (0.070) - this node is a cross-community bridge._
- **Why does `main() (build script entry)` connect `Build Pipeline Logic` to `Data Pipeline & Filtering`?**
  _High betweenness centrality (0.055) - this node is a cross-community bridge._
- **Are the 5 inferred relationships involving `App.tsx (main component)` (e.g. with `Search bar (UI component)` and `Results panel (UI layout)`) actually correct?**
  _`App.tsx (main component)` has 5 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `Performance data loader` (e.g. with `Fuse.js build-time index creation` and `Members-only filtering`) actually correct?**
  _`Performance data loader` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `URL param system (permalinks)` (e.g. with `seedQueryEffect (URL param seeding)` and `Seeded initial state logic`) actually correct?**
  _`URL param system (permalinks)` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `byDate (sorting comparator)`, `normalizeEntry (build validator)`, `dedupeEntries (build dedup)` to the rest of the system?**
  _21 weakly-connected nodes found - possible documentation gaps or missing edges._