# Governance report search and expansion fix

## Phase 1 — Correct interaction behavior

- Ensure hidden protection rows are actually removed from the downloaded report layout during search.
- Update visible repository and protection counts dynamically.
- Hide global summary values while a repository search is active to avoid contradictory totals.

**Checkpoint:** searching one repository shows only its matching protection configurations and repository row.

**Status:** complete. Explicit hidden-state CSS now removes filtered grid rows, dynamic counts track repository and protection matches, and global totals disappear during search.

## Phase 2 — Correct protection and repository presentation

- Put `Ruleset`, `Classic`, or `Unprotected` directly in the protection display name.
- Replace the narrow native details expansion with a full-width repository grid.
- Apply the same naming and expansion hierarchy to the live report.

**Checkpoint:** expanded repositories use the full report width and protection type is understandable from the name alone.

**Status:** complete. Protection type is part of the display name and repository expansion renders as a full-width responsive grid in both report surfaces.

## Phase 3 — Verify

- Add focused assertions for protection naming, search-hiding CSS, and full-width expansion markup.
- Run focused lint/tests and verify the live route.

**Status:** complete. Focused ESLint passes, all 4 governance report tests pass, and the live route returns HTTP 200.

## Resume from here

Complete. Download a fresh visual report to replace older HTML files that contain the broken layout.
