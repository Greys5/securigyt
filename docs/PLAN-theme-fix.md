# Theme switcher fix

## Phase 1 — Reproduce and trace

- Reproduce Light, Dark, and Hacker selection in the browser.
- Inspect `data-theme`, persisted storage, computed CSS variables, and console errors.

## Phase 2 — Minimal fix

- Correct the root cause without changing unrelated UI.
- Add a regression test for theme selection and persistence.

## Phase 3 — Verify

- Exercise all three themes in-browser.
- Run targeted tests, TypeScript, and ESLint.

## Resume from here

Complete — LAN hydration, all three themes, persistence, TypeScript, ESLint,
and the test suite were verified.
