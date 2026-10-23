# Latest stable action release

## Phase 1 — Define
Per GitHub action, refresh the GitHub latest stable release, resolve annotated tags to a full commit SHA, and show release immutability separately from SHA pinning. Preserve action subpaths. Local and Docker references are unsupported.
Checkpoint: complete.

## Phase 2 — Implement
Add a server-side lookup endpoint restricted to actions in the cached inventory and a row button with loading, error, release, and copy states. No workflow changes or new dependencies.
Checkpoint: complete. Added per-row lookup and copy controls, inventory-restricted server endpoint, and full SHA resolution including annotated tags. Public repositories outside the App installation use a credential-free GitHub API fallback.

## Phase 3 — Verify
Test tag resolution and validation, run lint/types, and verify local endpoint behavior.
Checkpoint: complete. Three focused tests, scoped lint and TypeScript pass. Live actions/checkout lookup returned a stable release and full SHA; invalid action references return HTTP 400. No workflows changed.

## Resume from here
Complete. Review locally at /actions. Changes are uncommitted on action-latest-stable.
