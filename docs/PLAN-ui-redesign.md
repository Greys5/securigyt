# SecuriGit UI redesign

## Goal

Replace the current generic dashboard styling with a coherent, professional
security-operations interface while preserving all existing data and behavior.

## Phase 1 — Audit and visual direction

- Capture the current overview, repositories, actions, organization, security,
  and repository-detail screens.
- Identify repeated visual and UX problems.
- Produce three distinct desktop design directions grounded in the current app.
- User selects one direction.

**Checkpoint:** selected visual target.

## Phase 2 — Design system and application shell

- Define color, typography, spacing, status, table, and navigation tokens.
- Replace the current top navigation with the selected information architecture.
- Add a professional icon set and consistent page headers.

**Checkpoint:** shell and shared primitives render correctly.

## Phase 3 — Core screens

- Redesign overview, repository inventory, action inventory, security, org, and
  repository-detail screens.
- Preserve filtering, sorting, refresh, links, and live GitHub data.
- Remove demo-like copy and generic metric-card repetition.

**Checkpoint:** all routes match the selected visual direction.

## Phase 4 — Responsive and accessibility pass

- Verify desktop and narrow layouts.
- Check keyboard focus, contrast, table overflow, loading, empty, and error states.
- Compare rendered screens against the selected visual target and correct drift.

**Checkpoint:** visual QA and interaction QA complete.

## Phase 5 — Verification

- TypeScript, ESLint, unit tests, production build, and route smoke tests.

**Checkpoint:** handoff with working local preview.

## Resume from here

Complete. Production build and design QA passed.
