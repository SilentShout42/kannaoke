# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Kannaoke** — a searchable index of songs performed during Kanna Yanagi's (柳かんな) streams, with timestamps and an embedded YouTube player. Deployed at `kannaoke.oyasumi99.com` on Cloudflare Workers.

## Stack

- React 19 + Vite 6 + TypeScript (strict mode, noEmit)
- Fuse.js 7 for fuzzy search (uses prebuilt index for speed)
- Cloudflare Workers Assets hosting (`@cloudflare/vite-plugin`)
- `@tabler/icons-react` for icon components

## Commands

```bash
npm install              # Install dependencies
npm run dev              # Start dev server (hot reload, runs in Workers runtime)
npm run build            # Type-check + production build
npm run deploy           # Build and deploy to Cloudflare Workers
npm run preview           # Locally preview production build
```

Data pipeline: `npm run prepare:data` runs `scripts/build-performances.mjs` which reads `public/performances.json`, validates/deduplicates/sorts entries, then outputs `public/performances.min.json` (minimized data) and `public/performances.fuse-index.json` (prebuilt Fuse.js index). `npm run prepare:data:watch` watches for changes.

## Architecture

### Single-page app, single component

The app is intentionally minimal — one React component (`src/App.tsx`) plus global styles (`src/styles.css`). No routing library, no state management beyond React hooks.

### Data loading flow

1. On mount, `App` fetches `performances.min.json` + `performances.fuse-index.json` in parallel
2. If those fail, falls back to `performances.json` and builds Fuse index client-side
3. Data is stored in `useState`; Fuse index stored in a `useRef` (not reactive)
4. A `membersOnly` flag on each entry filters out members-only streams from random selection

### URL param system (permalinks)

Three query params drive the initial state:
- `?v=<videoId>&t=<startTime>` — jump to a specific song (matched against all performances)
- `?q=<query>` — fuzzy-search and show first result; synced back to URL on every keystroke
- Params are synced bidirectionally via `useEffect` + `history.replaceState`

### YouTube player

The YouTube IFrame API is loaded dynamically. A ref-based state machine (`ytReadyRef`, `pendingRef`) handles the race between player readiness and song selection. `selectEntry()` either calls `loadVideoById` directly (if ready) or queues the entry in `pendingRef`.

### Layout

- Two-column layout: left `results-panel` (searchable list) + right `player-panel` (YouTube embed)
- Draggable resize handle between panels (mouse event listeners on mount)
- On mobile (<768px), stacks vertically

### Data model (`performances.json`)

Each entry: `videoId`, `title`, `artist`, `videoTitle`, `videoDate` (YYYY-MM-DD), `startTime` (int), optional `endTime` (int|null), optional `membersOnly` (bool). The build script validates all fields, deduplicates by full JSON signature, and sorts by date desc → videoId → startTime → title.

## File structure

```
index.html              Vite entry (SEO meta, schema.org, favicons)
vite.config.ts          React + Cloudflare plugins
wrangler.jsonc          Worker config (SPA not_found_handling)
src/
  App.tsx               All app logic: search, YouTube player, URL sync, layout
  main.tsx              React root entry
  styles.css            All global styles (CSS custom properties for theming)
scripts/
  build-performances.mjs  Data pipeline: validate → dedupe → sort → output
  watch-performances.mjs  File watcher for data pipeline
public/
  performances.json       Source data (edit this)
  performances.min.json   Generated minified data
  performances.fuse-index.json  Generated Fuse.js inverted index
```

## Development notes

- No tests exist. The build script (`scripts/build-performances.mjs`) has validation assertions but no unit tests.
- The `TODO.md` tracks open issues (light/dark mode, feedback mechanism, easter eggs, timing corrections).
- Styling uses CSS custom properties (`--bg`, `--accent`, etc.) making it the natural place for theme/color changes.
- The app is a single component — all state, effects, and logic live in `App.tsx`. There are no sub-components.
- TypeScript is strict with `noUnusedLocals` and `noUnusedParameters` enabled.
- The `worker/` directory mentioned in README.md does not currently exist.
