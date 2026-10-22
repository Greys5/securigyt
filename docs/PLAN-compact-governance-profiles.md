# Compact governance profile layout

## Phase 1 — Define the dense hierarchy

- Replace profile cards with one compact row per effective protection profile.
- Lead with repository reach, then protection name and branch scope, then restrictions and bypass exposure.
- Preserve profile expansion so the exact repositories remain available on demand.

**Checkpoint:** the grouped policy story is readable without repeating controls or opening repository rows.

**Status:** complete. The profile row hierarchy is reach → named policy and scope → restrictions and bypass exposure.

## Phase 2 — Implement

- Build the compact profile matrix using the existing report model and theme tokens.
- Keep filters, charts, exports, and repository links unchanged.

**Checkpoint:** each profile reads as `N repos -> protection/scope -> restrictions` on desktop and stacks cleanly on small screens.

**Status:** complete. The previous two-column cards are now a dense matrix with expandable repository chips.

## Phase 3 — Verify

- Run focused lint and tests.
- Confirm the live governance route recompiles and responds successfully.

**Status:** complete. Focused ESLint passes, all 4 governance report tests pass, and the live route returns HTTP 200.

## Resume from here

Complete. Next independent task: adjust density further only after visual feedback on the live matrix.
