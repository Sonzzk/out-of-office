# Out of Office

A Backrooms company-management sim for the browser. Design lives in the project's
`backrooms-sim/concept.md`; the build plan is `backrooms-sim/build-plan.md`.

## Commands
- `npm run dev`: local dev server
- `npm test`: simulation unit tests (Vitest)
- `npm run build`: type-check and build to `dist/`
- `npm run shot`: headless play-test, screenshots in `shots/`

## Layout
- `src/sim/`: game rules. Pure TypeScript, no DOM, seeded RNG, fully testable.
- `src/ui/`: the Win95 desktop, windows and apps.
- `src/data/`: content tables (names, levels, entities, items, memos).
- `public/art/`: art copied from `backrooms-sim/art`.
