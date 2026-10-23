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

The Python backend batches GitHub queries and stores results in SQLite:

| Pass | Cost |
| --- | --- |
| Repo listing | 100 repos per GraphQL query |
| Repo security facts | 25 repos per aliased query, up to 6 concurrent |
| Workflow contents | 8 repos per aliased query, up to 5 concurrent |
| Warm page load | SQLite cache with scope-specific freshness |

Workflow contents are batched for the Actions inventory. Collaborators and detailed repository
rulesets are fetched **when you open a repository**. Every page has a Refresh button that
invalidates its relevant cache scopes.

## Setup

### 1. Install runtimes

Python 3.15.1 is selected by `.python-version`. Install it with `pyenv`, then create the project environment:

```bash
pyenv install -s 3.15.1
uv venv --python "$(pyenv which python)" .venv
uv pip install --python .venv/bin/python -r backend/requirements.txt
npm ci
```

### 2. Credentials

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

### 3. Verify

```bash
npm run verify
```

This probes the GitHub endpoints used by the dashboard and prints which sections are accessible:

```
Org
  ✓ Organization settings
      plan: team
  ✗ Organization rulesets
      Resource not accessible by integration
```

Permission-limited sections render as "Unavailable" cards in the UI.

### 4. Run

```bash
npm run dev
```

Open http://localhost:3000.

`npm run dev` starts the Python API on `127.0.0.1:8000` and Next.js on port 3000. GitHub credentials and the SQLite cache are handled by Python. Next.js renders pages and keeps thin browser-facing refresh and release routes.

## Pages

| Page | What it shows |
| --- | --- |
| `/` | Org rollup: average score, biggest control gaps, grade distribution, worst repos, flagged workflows |
| `/repos` | Every repository with `.github`, CODEOWNERS, protection, ruleset and workflow columns; filterable |
| `/repos/[name]` | Score breakdown, every workflow and action with pinning status, rulesets, branch protection, CODEOWNERS content, collaborators, security settings |
| `/actions` | Org-wide action inventory: action → versions → repos, drill-down to each usage site, flagged workflows |
| `/org` | Org security defaults, Actions policy, org rulesets, installed apps, fine-grained PATs, webhooks, owners |
| `/security` | Grade distribution, per-control coverage, Dependabot / code scanning / secret scanning rollups, audit log, costs |
| `/reports/governance` | Searchable repository protection, CODEOWNERS and bypass evidence; HTML and CSV exports |
| `/assessment` | CSA/STAR evidence domains, STRIDE and secure SDLC views, remediation guidance and CSV evidence |

Assessment mappings support audit preparation. They do not establish certification. Snapshot timestamps indicate evidence age; approval enforcement depends on branch scope, CODEOWNERS matching, and bypass permissions.

## Git workflow

The baseline lives on `main`. Create a separate branch for each feature or fix, using the Jira ticket ID when provided or a descriptive change name, and merge reviewed changes into `main`.

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
npm run dev      # Python API and Next.js
npm test         # TypeScript UI helpers and Python backend tests
npm run lint     # eslint
npm run verify   # probe dashboard GitHub permissions
```

The cache lives in `.data/cache.db` (gitignored). Delete it to force a cold rescan.
