---
description: Run quality control pipeline (lint, typecheck, test, build)
context: fork
allowed-tools:
  - Bash
  - TodoWrite
---

# Pipeline

Single npm/Vite/TypeScript unit. Run all phases in order from the repo root.
Use TodoWrite to track phases.

## Arguments

- (none) — run phases 1–4 (the default)
- `playtest <name>` — also run one headless playtest, e.g. `playtest tutorial` runs `node scripts/playtest-tutorial.mjs`
- `playtest all` — also run the full playtest chain (`npm run playtest`, 36 scripts, slow; only when explicitly asked)

## Phases

### Phase 1: Lint

    npm run lint

On failure: auto-fix with `npm run lint:fix`, then re-check with `npm run lint`. If still failing, fix remaining diagnostics and retry (max 3).

### Phase 2: Typecheck

    npm run typecheck

On failure: fix and retry (max 3).

### Phase 3: Test

    npm test

On failure: report to user.

### Phase 4: Build

    npm run build

On failure: report to user.

### Optional: Playtest (argument only)

    node scripts/playtest-<name>.mjs

On failure: report to user.

## Reporting

**On success:**
Pipeline passed — lint, typecheck, tests, build all clean.

**On failure:**
Pipeline failed:
- <phase>: <error summary>

Keep it short — just pass/fail and what broke. Never paste full test or build logs back.
