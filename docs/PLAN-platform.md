# SecuriGit → multi-user platform

Turns the current single-user read-only console into a platform where org members
sign in with GitHub, get a role from GitHub Team membership, and can run
remediations that GitHub itself authorizes.

## Architecture (fixed decisions)

- **Read path** — GitHub App installation token. Every signed-in user sees the same
  complete org picture.
- **Write path** — the signed-in user's own OAuth token. GitHub enforces authority;
  a non-admin gets a 403 from GitHub, not from our code.
- **Identity** — GitHub OAuth via the same GitHub App (user-to-server tokens). If the
  org enforces SAML SSO, that is inherited; no second IdP.
- **Roles** — derived from GitHub Team membership (Option B). No local user table.
- **Remediations** — PR-based wherever possible; direct mutations require confirm + audit.
- **Storage** — SQLite stays (WAL, single instance). Revisit only if deployed multi-instance.

### Role model

| Team | Role | Can |
| --- | --- | --- |
| `securigit-admins` | `admin` | View + run every remediation + see audit log |
| `securigit-auditors` | `auditor` | View + open PR-type remediations only |
| org member, neither team | `viewer` | View only |
| not an org member | denied | Nothing — login rejected |

Org owners are always `admin` regardless of team membership.

Roles gate the UI and the API surface. They are **defence in depth, never the only
control** — every write still runs as the user, so GitHub has the final say.

---

## Phase 0 — Manual setup (BLOCKING, user must do this)

Cannot be automated; needs GitHub's web UI.

1. Create the GitHub App in `higgco` with the read-only permissions in the README, **plus**:
   - Enable **"Request user authorization (OAuth) during installation"**
   - Set **Callback URL**: `http://localhost:3000/api/auth/callback`
   - Uncheck "Expire user authorization tokens" for now (simpler); revisit in Phase 6
   - Add Organization permission **Members: Read** (needed to read team membership)
2. Note the **Client ID** and generate a **Client Secret**.
3. Install the App on the org, All repositories.
4. Create two teams in `higgco`: `securigit-admins`, `securigit-auditors`.
5. Add to `.env.local`:
   ```
   GITHUB_APP_CLIENT_ID=Iv1....
   GITHUB_APP_CLIENT_SECRET=....
   SESSION_SECRET=<openssl rand -base64 32>
   APP_URL=http://localhost:3000
   ```

---

## Phase 1 — Auth foundation

- `src/lib/auth/session.ts` — signed+encrypted cookie (iron-session or jose), 8h TTL,
  stores `{ login, id, avatarUrl, accessToken, role, roleCheckedAt }`
- `src/app/api/auth/login/route.ts` — redirect to GitHub authorize URL with `state`
- `src/app/api/auth/callback/route.ts` — exchange code, verify `state`, verify org
  membership, resolve role, set session
- `src/app/api/auth/logout/route.ts` — clear session
- `src/middleware.ts` — every route except `/login` and `/api/auth/*` requires a session
- `src/app/login/page.tsx` — sign-in screen; rejection copy for non-members
- Nav shows avatar, login, role badge, sign out

**Checkpoint:** sign in as yourself, land on `/`, `/login` redirects when already authed,
logout works, non-member is rejected.

## Phase 2 — Roles from GitHub Teams

- `src/lib/auth/roles.ts` — `resolveRole(login)`: org owner check → team membership
  (`GET /orgs/{org}/teams/{slug}/memberships/{user}`) → `admin` | `auditor` | `viewer`
- Cache per-user in the existing cache under a new `user-role` scope, 10 min TTL
- `src/lib/auth/guard.ts` — `requireRole(session, "admin")` for route handlers;
  `can(role, action)` for UI
- Re-resolve role on session refresh so team removal takes effect quickly
- `/org` page gains a "SecuriGit access" card listing who holds which role

**Checkpoint:** move your account between the two teams and confirm the role flips.

## Phase 3 — Write layer foundation

- `src/lib/github/userClient.ts` — Octokit built from the session's user token
- CSRF: double-submit token on every mutating route
- `src/lib/audit.ts` + `audit_log` table — actor, action, target, params, result,
  GitHub response status, timestamp
- `src/app/audit/page.tsx` — admin-only view of the log
- `src/lib/remediation/types.ts` — every remediation implements
  `{ id, label, minRole, plan(target) → preview, apply(target, userOctokit) → result }`
- Shared confirm-dialog component: shows the preview diff/change before applying

**Checkpoint:** a no-op remediation runs end-to-end, appears in the audit log, and is
rejected for a `viewer`.

## Phase 4 — PR-based remediations (`auditor`+)

- `pin-actions` — rewrite `uses: owner/repo@tag` to `@<sha> # tag`, resolving each tag
  to its commit SHA; opens one PR per repo
- `add-codeowners` — create `.github/CODEOWNERS` from a template, PR
- `add-security-policy` — create `SECURITY.md` from a template, PR
- Bulk mode: select N repos from `/repos` or `/security`, preview all, apply
- Every PR body links back to the SecuriGit finding that triggered it

**Checkpoint:** open a real PR against one repo, confirm the SHA pinning is correct and
the workflow still parses.

## Phase 5 — Settings remediations (`admin` only)

- `enable-dependabot-alerts` — `PUT /repos/{o}/{r}/vulnerability-alerts`
- `enable-secret-scanning` + `enable-push-protection` — `PATCH /repos/{o}/{r}`
- Each shows current → proposed state before applying
- Failures surface GitHub's own error (403 = the user lacks admin on that repo)
- Deliberately **excluded**: applying rulesets — too easy to lock people out

**Checkpoint:** enable Dependabot alerts on one repo as `admin`; confirm the same action
is refused for an `auditor`, both in the UI and at the API.

## Phase 6 — Hardening

- Per-user rate-limit accounting; surface remaining budget
- Secrets: document moving the private key out of `.env` for any deployment
- Token expiry + refresh flow
- Deployment notes: HTTPS, callback URL, `APP_URL`, Postgres if multi-instance

---

> **RESUME FROM HERE → Phase 0 blocked on user; Phase 1 can be written now
> and tested once Phase 0 lands.**
