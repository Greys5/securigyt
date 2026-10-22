# Governance report implementation

## Phase 1 — Model and UX audit

- Inspect the current repository inventory, reporting helpers, navigation, and theme system.
- Read the applicable Next.js 16 project documentation before editing components.
- Define grouped report semantics for CODEOWNERS, branch protection, rulesets, and bypass actors.

**Checkpoint:** confirm that repeated controls can be represented once as reusable protection profiles.

**Status:** complete. Effective policy signatures group repositories by source, branch scope, exclusions, restrictions, review settings, and bypass actors while retaining ruleset names as traceability metadata.

## Phase 2 — Implement the report

- Add a governance report route with interactive filters and compact visual summaries.
- Group identical protection configurations and reference them from a concise repository index.
- Add downloadable, print-ready report output for the current filter selection.
- Add navigation entry points without changing unrelated pages.

**Checkpoint:** the report remains understandable for roughly 200 repositories without repeating full policy details per repository.

**Status:** complete. Added `/reports/governance`, interactive filters, coverage charts, grouped protection profiles, ownership and bypass rollups, a compact profile-based repository index, self-contained HTML export, print/PDF output, and grouped CSV export. The route reads the last completed SQLite snapshot directly so stale data remains immediately viewable instead of blocking on GitHub.

## Phase 3 — Verify

- Add focused tests for grouping and report export behavior.
- Run scoped tests, lint, and production build.
- Exercise filtering and download behavior in the browser.

**Status:** complete.

- Focused and full tests pass: 41 tests.
- Scoped ESLint passes without warnings.
- Next.js production build passes with the webpack builder.
- Browser verification used the current cached 205-repository snapshot: filtering recomputed the full report, the visual HTML downloaded successfully, and the grouped CSV contained one row per policy profile.
- An intentionally stale snapshot returned the report with HTTP 200 and first byte in about 123 ms, and the UI labeled it as cached.
- Other application routes still block on a stale GitHub inventory refresh; the report route is snapshot-only, while the broader background-sync work remains documented in `PLAN-dashboard-latency.md`.

## Resume from here

Complete. Next independent task: implement the asynchronous snapshot refresh path so cold report routes never wait on GitHub.
