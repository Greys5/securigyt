# Repository reporting and visual filters

## Phase 1 — Data contract

- Map repository inventory fields available without per-repository scans.
- Add the minimum batched fields needed for CODEOWNERS owners, protected branches,
  rules, and bypass actors.
- Keep unavailable/partial values explicit.

**Checkpoint:** one normalized repository audit row contains exportable governance data.

Status: completed. The batched GraphQL inventory now includes parsed CODEOWNERS attribution,
ruleset ref scopes, rule types, and bypass actors without a sequential repository crawl.

## Phase 2 — Interactive audit view

- Replace the basic filter strip with combinable filter chips and active-filter summary.
- Add filter-responsive KPIs and governance charts.
- Add a compact row/details layout for CODEOWNERS, teams, branch protection, bypasses,
  and remediation readiness.

**Checkpoint:** the selected filter is understandable without reading the whole table.

Status: completed. Quick views, combinable filters, active chips, dynamic metrics, three
governance charts, expandable evidence, and remediation selection are implemented.

## Phase 3 — Export

- Export the exact filtered result as CSV.
- Include repository, CODEOWNERS rules/owners/teams, branch protection locations/rules,
  bypass actors, and remediation status/action columns.
- Use safe CSV serialization and a meaningful filename.

**Checkpoint:** exported rows match the visible filtered result.

Status: completed. Browser verification produced 11 data rows for the 11-repository
CODEOWNERS + protection filter and preserved the selected remediation row.

## Phase 4 — Verification

- Test combined filters and exports with deterministic fixtures.
- Verify Light, Dark, and Hacker themes, responsive behavior, browser logs, TypeScript,
  ESLint, tests, and production build.

Status: completed. Light, Dark, Hacker, desktop, and mobile were verified. TypeScript,
ESLint, 32 tests, and the Next.js production build pass.

## Resume from here

Complete — all checkpoints passed on 2026-08-25.
