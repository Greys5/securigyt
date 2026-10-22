# Repository-first governance report

## Phase 1 — Build repository protection details

- Represent every active organization/repository ruleset and classic branch protection separately.
- Keep each protection's name, origin, branch scope, restrictions, and bypass actors together.
- Sort repositories by most recent push, with never-pushed repositories last.

**Checkpoint:** organization rulesets are visibly identified by name and origin.

**Status:** complete. Added per-protection names, origin, scope, restrictions, and bypass actors plus newest-push ordering.

## Phase 2 — Replace grouped profile presentation

- Make repository name the first column.
- Render protection details, CODEOWNERS, and bypass actors as peer columns.
- Apply the same repository-first structure to the downloaded HTML and CSV reports.

**Checkpoint:** every row reads repository → named protections with restrictions → CODEOWNERS → bypasses.

**Status:** complete. Live HTML and CSV reports now use repository-first rows with peer protection, CODEOWNERS, and bypass columns.

## Phase 3 — Verify

- Test recency ordering, organization origin, classic protection naming, and repository-level exports.
- Run focused lint/tests and verify the live route.

**Status:** complete. Focused ESLint passes, all 5 governance report tests pass, and the live route returns HTTP 200.

## Resume from here

Complete. Download a fresh HTML/CSV report to use the new repository-first format.
