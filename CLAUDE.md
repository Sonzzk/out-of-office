# Out of Office

Backrooms company-management sim for the browser. Plain TypeScript + Vite, no framework. See `README.md` for design docs, saves, and credits.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | local dev server |
| `npm run lint` / `npm run lint:fix` | Biome check / auto-fix |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | simulation unit tests (Vitest, dot reporter) |
| `npm run build` | typecheck + build to `dist/` |
| `node scripts/playtest-<name>.mjs` | one headless playtest (e.g. `tutorial`, `economy`) |
| `npm run playtest` | ALL 36 playtests — slow, CI/pre-release only |
| `npm run shot` | headless play-test, screenshots in `shots/` |
| `npm run balance` | balance bot, seeded games per strategy |
| `npm run artifact` | after a build, writes `dist/artifact.html` |

## Verifying work

When done writing code, invoke `/pipeline` (it runs lint, typecheck, tests, and build in a forked context and reports a short summary). Never run `npm run playtest` directly as verification — if a playtest is relevant, run the single matching script or `/pipeline playtest <name>`.

## Layout

- `src/sim/` — game rules. Pure TypeScript, **no DOM**, seeded RNG (`src/sim/rng.ts`), fully testable. New game logic goes here with a test in `tests/`.
- `src/ui/` — the Win95 desktop, windows and apps. DOM only; talks to the sim through `src/store.ts`.
- `src/data/` — content tables (names, levels, entities, items, memos).
- `tests/` — Vitest unit tests for the sim.
- `scripts/` — headless Playwright playtests and tooling.

## Rules

- Whenever the saved shape changes: bump `SAVE_VERSION` and add a `migrate` step in `src/sim/state.ts`.
- `fit()` in `src/ui/windows.ts` is a window-layout helper, not a focused test (Biome's `noFocusedTests` is off for `src/` because of it).
- The game must keep working offline from `localStorage` only; never add network calls.
