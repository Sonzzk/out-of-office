# Out of Office

A Backrooms company-management sim for the browser. Design lives in the project's
`backrooms-sim/concept.md`; the build plan is `backrooms-sim/build-plan.md`.

## Commands
- `npm run dev`: local dev server
- `npm test`: simulation unit tests (Vitest)
- `npm run build`: type-check and build to `dist/`
- `npm run shot`: headless play-test, screenshots in `shots/`
- `npm run playtest`: every headless play-test in turn (tutorial, loop, levels, events, sound, horror, settings, touch...)
- `npm run balance`: balance bot, 100 seeded games of 90 days per strategy
- `npm run artifact`: after a build, writes `dist/artifact.html` for the playable Artifact link

## Layout
- `src/sim/`: game rules. Pure TypeScript, no DOM, seeded RNG, fully testable.
- `src/ui/`: the Win95 desktop, windows and apps.
- `src/data/`: content tables (names, levels, entities, items, memos).
- `public/art/`: art copied from `backrooms-sim/art`.

## Saves and privacy
The game saves to this browser only (`localStorage`); nothing is sent anywhere. The Employee Handbook can export, import and reset a save. A save that cannot be read is kept under `out-of-office.save.backup` rather than overwritten. Bump `SAVE_VERSION` and add a `migrate` step in `src/sim/state.ts` whenever the saved shape changes.

## Credits and licence
Levels, entities and objects are adapted from the Backrooms Wiki (CC BY-SA 3.0). See `src/data/credits.ts`. Choose the project licence before any public release.
