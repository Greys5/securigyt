# Dashboard latency assessment

## Phase 1 — Trace current data path

- Identify what runs during page requests, refreshes, and cache misses.
- Confirm the current persistence layer and cache invalidation behavior.

**Status:** complete.

Findings:

- SQLite is already present and the cached organization payloads are small (roughly 215 KB for repositories and 107 KB for workflows).
- A stale or missing cache entry blocks the page while the full GitHub collector runs.
- Refresh deletes the last good snapshot before re-rendering, which guarantees a blocking cache miss.
- The dashboard asks for repository and workflow inventory both directly and through `getPosture()`; without in-flight request deduplication, a cold render can launch duplicate scans.
- There is no background job, stale-while-revalidate path, incremental repository update, or synchronization status record.

**Checkpoint:** separate GitHub collection latency from dashboard rendering latency.

## Phase 2 — Recommend target architecture

- Define the read path needed for sub-second dashboard interactions.
- Define background synchronization, webhook, and reconciliation responsibilities.
- Compare minimal local persistence with a production multi-user database.

**Checkpoint:** select the smallest architecture that meets interactive latency and freshness goals.

**Status:** complete.

Decision:

- Keep SQLite for the current single-process/local deployment.
- Make dashboard reads snapshot-only; never wait for GitHub during a page request.
- Add in-flight deduplication and stale-while-revalidate immediately.
- Replace destructive invalidation with a queued synchronization run that preserves the last completed snapshot.
- Store synchronization status and per-repository results so later runs can update only changed repositories.
- Add GitHub App webhooks for near-real-time incremental updates plus a periodic full reconciliation.
- Move to PostgreSQL with a durable job queue only when the application runs with multiple web/app worker instances or needs high availability.

## Phase 3 — Produce implementation sequence

- List concrete changes, dependencies, and measurable acceptance criteria.

**Status:** complete.

Implementation order:

1. Add single-flight cache refreshes and stale-while-revalidate behavior.
2. Change `POST /api/refresh` to enqueue/start a sync and return immediately; expose sync status to the UI.
3. Persist immutable completed snapshots and atomically promote a snapshot only after a successful run.
4. Split repository facts by repository and refresh only affected records.
5. Subscribe the GitHub App to repository/push/ruleset/membership events and retain a scheduled reconciliation.

Acceptance targets:

- Warm and stale dashboard server reads complete in under 100 ms locally.
- Manual refresh responds in under 250 ms and never blanks the last good data.
- The UI reports queued/running/completed/failed synchronization state.
- One logical collector runs at most once per organization and scope at a time.
- Webhook-driven repository changes appear within 10 seconds under normal conditions.

## Resume from here

Assessment complete. Next implementation starts at step 1: single-flight plus stale-while-revalidate.
