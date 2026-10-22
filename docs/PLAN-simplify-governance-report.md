# Simplify the governance report

## Phase 1 — Correct the visible policy identity

- Keep the generated profile hash internal.
- Display actual ruleset names.
- For classic branch protection, display its branch pattern because GitHub does not assign classic protection rules a separate name.

**Checkpoint:** no generated profile ID appears in the app, CSV, or visual HTML report.

**Status:** complete. Ruleset names are shown directly; classic protection uses its branch scope; generated hashes remain internal only.

## Phase 2 — Reduce the report surface

- Make repository search the primary interaction.
- Remove dashboard charts, large metric cards, and secondary aggregation tables from the live report.
- Keep a compact summary, grouped protection rows, exports, and search-triggered repository evidence.
- Apply the same compact hierarchy to the downloaded visual report.

**Checkpoint:** the default view is a compact policy summary; repository-level detail appears only when searched or expanded.

**Status:** complete. The live and downloadable reports now use one search control, compact summary text, grouped protection rows, and on-demand repository evidence.

## Phase 3 — Verify

- Extend report tests to cover real protection names and absence of generated IDs.
- Run focused lint/tests and verify the live route.

**Status:** complete. Focused ESLint passes, all 4 governance report tests pass, and the live route returns HTTP 200.

## Resume from here

Complete. Next independent task: adjust only from live visual feedback.
