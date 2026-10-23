# Python backend migration plan

Resume from here: Complete. Python 3.15.1 is installed with pyenv and selected by `.python-version`.

## Phase 1 — map contracts and runtime
- [x] Inventory backend functions, cache contracts, routes, and page dependencies.
- [x] Install Python 3.15.1 with pyenv and select it for this repository. Dependency compatibility remains to verify during implementation.
- Checkpoint: Python owns GitHub authentication, GraphQL/REST collection, SQLite cache, parsers, scoring, assessment, and report generation. Next.js owns rendering and its thin browser-facing route handlers. JSON responses must retain existing TypeScript field names and `CachedValue` shape (`value`, `fetchedAt`, `stale`). Existing cache scopes and TTLs stay intact. Pages currently call collectors directly, so each will need a server-side HTTP client. Client-side report/assessment filters also need API-backed equivalents if all business logic moves.

## Phase 2 — implement Python backend
- [x] Port GitHub access, collectors, cache, parsing, scoring, and assessment logic. Browser-side report filtering and export remain in Next.js.
- [x] Expose stable JSON endpoints for Next.js pages and refresh actions.
- Checkpoint: Python unit tests pass; live read-only collector requests returned inventory, Actions, security, organization, detail, posture, and assessment data.

## Phase 3 — connect frontend
- [x] Switch Next.js server pages and routes to Python API calls.
- [x] Remove superseded TypeScript backend code and dependencies; keep TypeScript response types and browser-side helpers.
- Checkpoint: all eight local pages returned HTTP 200 against the Python API before the final cleanup; repeat after final build.

## Phase 4 — verify and hand off
- [x] Run Python tests, Next.js tests, lint, and build after final cleanup.
- [x] Document local startup and exact Python version requirement.
- Checkpoint: 5 Python tests and 17 TypeScript tests passed; lint and TypeScript checks passed; production build passed with Webpack (Turbopack hit a sandbox port restriction). Eight local pages returned HTTP 200. Live GitHub calls validated 213 repositories, 226 parsed workflows with zero collection errors, a repository deep scan, posture, assessment, latest-release lookup, and the setup doctor. Score statuses matched the previous TypeScript implementation for all 213 repositories; assessment status and evidence matched for all 1,688 findings. Organization rulesets and audit log remain unavailable to the configured GitHub App, as reported by the setup doctor.
