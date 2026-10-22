# Design QA

- Baseline capture: `docs/ui-audit/review-repos.png`
- Implementation capture: `docs/ui-audit/repository-audit-builder-light.png`
- Side-by-side comparison: `docs/ui-audit/repository-reporting-comparison.png`
- Evidence capture: `docs/ui-audit/repository-audit-expanded.png`
- Theme captures: `docs/ui-audit/repository-audit-builder-dark.png`, `docs/ui-audit/repository-audit-builder-hacker.png`
- Responsive capture: `docs/ui-audit/repository-audit-mobile.png`
- Branch report capture: `docs/ui-audit/branch-protection-report.png`
- Branch report comparison: `docs/ui-audit/branch-protection-report-comparison.png`
- Review viewport: 1269 x 714 desktop and 390 x 844 mobile
- State: Repositories, all-repository branch protection report, and repository-scoped
  CODEOWNERS remediation using the live organization inventory

## Visual comparison

- Hierarchy: passed. The flat filter-and-table screen is now an audit builder with presets,
  active filters, export count, dynamic metrics, charts, and detailed evidence.
- Information density: passed. Summary decisions remain visible while ownership patterns,
  protected branches, rulesets, and bypass actors move into expandable evidence.
- Color semantics: passed. Blue is used for controls, cyan for ownership, green for healthy
  protection, amber/red for remediation. Dark and Hacker preserve those meanings.
- Responsive behavior: passed. Filters stack, the primary action remains visible, metrics
  collapse to one column, and the evidence table remains horizontally scrollable.
- Branch protection hierarchy: passed. Coverage, protection source, restriction coverage,
  scope, review requirements, and bypasses are summarized before the developer table.

## Interaction QA

- Combined CODEOWNERS + protected preset: passed with 11 live repositories.
- Search by repository and owner handle: passed.
- Expandable CODEOWNERS patterns and branch/ruleset evidence: passed.
- Repository-level remediation selection: passed.
- Exact filtered CSV download: passed. The downloaded file contained one header plus 11
  data records, and the selected remediation row exported `remediation_selected=true`.
- Basic/Deep report profiles: passed. Branch protection Basic exposes 9 focused columns;
  Deep exposes the 32-column audit contract. CODEOWNERS Basic excludes email and validation
  diagnostics unless Deep is selected.
- Repository-scoped CODEOWNERS remediation: passed. `Add CODEOWNERS` opened
  `/repos?view=codeowners-missing&repository=.github` with exactly one matching repository.
- Light, Dark, and Hacker switching and reload persistence: passed.
- Mobile theme control accessible name: passed.

## Data and implementation QA

- Live branch protection inventory: 205 repositories, 203 active, 2 archived, 187 protected,
  18 unprotected, 15 with classic protection plus rulesets, 172 ruleset-only, and 0
  classic-only.
- Effective restrictions: force push and deletion blocked on 187 repositories, approving
  review required on 17, additional protected branch scopes on 11, and 0 visible bypass actors.
- Collection pattern: passed. CODEOWNERS contents, ruleset scopes, and bypass actors remain
  in the existing batched GraphQL inventory instead of introducing per-repository REST walks.
- CODEOWNERS comments are excluded from parsed owner attribution.
- Empty bypass results are labeled "None returned" because visibility can depend on GitHub
  permissions.

## Verification

- TypeScript: passed.
- ESLint: passed.
- Tests: 37 passed across 5 files.
- Production build: passed with Next.js 16.3.0 and Webpack.

final result: passed
