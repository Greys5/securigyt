# Report profiles and CODEOWNERS remediation flow

## Phase 1 — Reproduce and trace

**Status:** complete

- Reproduce the current CODEOWNERS export and remediation navigation.
- Trace the export column contract and the finding-to-repository-filter path.

**Checkpoint:** identify why the report is always deep and why remediation loses its scope.

## Phase 2 — Basic and deep reports

**Status:** complete

- Add an explicit Basic/Deep report choice next to repository exports.
- Keep Basic reports focused on the selected control and filtered repository set.
- Preserve the existing full audit evidence in Deep reports.
- Add an all-repository Branch protection report with grouped coverage, scope, restrictions,
  review policy, bypasses, and archived repositories included.

**Checkpoint:** CODEOWNERS Basic exports only useful ownership attribution, while Branch
protection Basic exports a concise developer handoff for all repositories.

## Phase 3 — Scoped remediation navigation

**Status:** complete

- Make CODEOWNERS remediation open the repository audit with CODEOWNERS gaps already applied.
- Preserve the remediation context visibly in the destination view.

**Checkpoint:** the user lands on the relevant repository subset, not all findings.

## Phase 4 — Verification

**Status:** complete

- Add regression tests for Basic/Deep schemas and scoped URL filters.
- Verify browser navigation, downloaded files, themes, TypeScript, ESLint, tests, and build.

## Resume from here

Complete — all four phases are implemented and verified.
