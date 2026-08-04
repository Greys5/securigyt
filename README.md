# SecuriGit

A lightweight, GitHub-like console for the **security posture of a whole GitHub organization**.

It answers org-wide questions without clicking through repositories one at a time:

- which repos have a `.github` directory, and what is in it
- which actions each workflow uses, at which versions, and whether they are pinned to a commit SHA
- which rulesets apply to each repo, and which branches are actually protected
- who collaborates on each repo and with what role
- what rules, apps, tokens and webhooks exist at the organization level
- which repos have CODEOWNERS, what is in them, and whether they are valid
- Dependabot / secret scanning / code scanning alerts, audit log and Actions cost
- a weighted **security score** per repository, rolled up across the org

## How it stays fast

A 190-repo organization resolves in seconds, and instantly after the first load:

| Pass | Cost |
| --- | --- |
| Repo listing (100 repos per GraphQL query) | ~2s per 100 repos |
| Repo security facts (25 repos per aliased query, 6 concurrent) | ~14s for 190 repos |
| Workflow contents (8 repos × their files per query, 5 concurrent) | ~10s for 178 workflows |
| Any warm page load | ~1ms from the SQLite cache |

Expensive per-repo work (workflow file contents, collaborators, ruleset details) is fetched
**lazily when you open that repo**, never eagerly for the whole org. Every page has a Refresh
button that invalidates just its own cache scope.

## Setup

### 1. Credentials

Copy the example env file:

```bash
cp .env.local.example .env.local
```

Then pick one of two modes.

**Quick start (personal access token).** Fastest way to see it working:

```bash
printf 'GITHUB_ORG=my-org\nGITHUB_TOKEN=%s\n' "$(gh auth token)" > .env.local
```

A token with `repo` + `read:org` covers the repository, workflow, ruleset, CODEOWNERS and
collaborator views. Add `admin:org` to also see organization rulesets, installed apps,
fine-grained PATs, webhooks, 2FA status and the Actions policy.

**Recommended (GitHub App).** Higher rate limits (15,000 req/h) and a stable org-scoped identity.

1. Organization → Settings → Developer settings → GitHub Apps → **New GitHub App**
2. Grant these **read-only** permissions:
   - Repository: Administration, Contents, Metadata, Dependabot alerts, Secret scanning alerts,
     Code scanning alerts
   - Organization: Administration, Members, Personal access tokens, Webhooks
3. Install it on the organization, for **All repositories**
4. Generate a private key, then fill in `.env.local`:

```
GITHUB_ORG=my-org
GITHUB_APP_ID=123456
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----\n"
GITHUB_APP_INSTALLATION_ID=98765432
```

The installation id is the number in the URL of the app's org install settings page
(`.../installations/<ID>`).

**Optional fallback PAT.** The organization audit log (GitHub Enterprise Cloud only) and the
billing endpoints reject GitHub App installation tokens. Set `GITHUB_FALLBACK_PAT` to a classic
PAT with `admin:org` (and `manage_billing:*` for costs) to enable those two sections. Without it
they render as unavailable and everything else works.

### 2. Verify

```bash
npm run verify
```

This probes every endpoint the dashboard uses and prints exactly which sections will work:

```
Org
  ✓ Organization settings
      plan: team; 2FA required: true
  ✗ Organization rulesets
      HTTP 404: Not Found
```

Anything marked `✗` renders in the UI as an "Unavailable" card explaining the missing permission —
nothing crashes and nothing is silently omitted.

### 3. Run

```bash
npm run dev
```

Open http://localhost:3000.

## Pages

| Page | What it shows |
| --- | --- |
| `/` | Org rollup: average score, biggest control gaps, grade distribution, worst repos, flagged workflows |
| `/repos` | Every repository with `.github`, CODEOWNERS, protection, ruleset and workflow columns; filterable |
| `/repos/[name]` | Score breakdown, every workflow and action with pinning status, rulesets, branch protection, CODEOWNERS content, collaborators, security settings |
| `/actions` | Org-wide action inventory: action → versions → repos, drill-down to each usage site, flagged workflows |
| `/org` | Org security defaults, Actions policy, org rulesets, installed apps, fine-grained PATs, webhooks, owners |
| `/security` | Grade distribution, per-control coverage, Dependabot / code scanning / secret scanning rollups, audit log, costs |

## Security score

Fourteen weighted checks, scored as `earned / applicable`:

| Check | Weight |
| --- | --- |
| Default branch is protected | 3 |
| Force pushes blocked | 2 |
| Pull request review required | 2 |
| CODEOWNERS file present | 2 |
| Dependabot alerts enabled | 2 |
| Actions pinned to a commit SHA | 2 |
| Secret scanning enabled | 2 |
| Secret push protection enabled | 2 |
| No critical or high alerts open | 2 |
| Branch deletion blocked | 1 |
| Code owner review required | 1 |
| CODEOWNERS has no errors | 1 |
| Security policy published | 1 |
| No direct admin collaborators | 1 |

Protection is credited whether it comes from a classic branch protection rule **or** an actively
enforced ruleset — many orgs have migrated to rulesets, and scoring only the old mechanism would
report false failures.

A check whose data is unreachable is marked `unknown` and **leaves the denominator** rather than
counting as a failure. A missing permission must never look like a security problem.

## Development

```bash
npm run dev      # dev server
npm test         # unit tests for the workflow parser and score
npm run lint     # eslint
npm run verify   # probe every GitHub endpoint the app depends on
```

The cache lives in `.data/cache.db` (gitignored). Delete it to force a cold rescan.
