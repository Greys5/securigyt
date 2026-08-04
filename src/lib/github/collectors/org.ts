/**
 * Organization-level configuration and access surface.
 *
 * Most of this needs the `admin:org` permission (GitHub App: Organization
 * administration / personal access tokens / webhooks). Each section is fetched
 * independently through `tryFetch` so a missing permission blanks only its own
 * card and says exactly why.
 */

import { getOctokit, tryFetch, type Maybe } from "@/lib/github/client";
import { cached, type CachedValue } from "@/lib/cache";
import { getConfig } from "@/lib/config";

const ADMIN_HINT =
  "Needs organization admin access (GitHub App: Organization administration, read-only).";

export type OrgProfile = {
  login: string;
  name: string | null;
  plan: string | null;
  publicRepos: number;
  privateRepos: number;
  twoFactorRequired: boolean | null;
  defaultRepositoryPermission: string | null;
  membersCanCreateRepositories: boolean | null;
  membersCanCreatePublicRepositories: boolean | null;
  membersCanForkPrivateRepositories: boolean | null;
  webCommitSignoffRequired: boolean | null;
  advancedSecurityEnabledForNewRepos: boolean | null;
  secretScanningEnabledForNewRepos: boolean | null;
  secretScanningPushProtectionForNewRepos: boolean | null;
  dependabotAlertsEnabledForNewRepos: boolean | null;
  dependabotSecurityUpdatesEnabledForNewRepos: boolean | null;
};

export type OrgRuleset = {
  id: number;
  name: string;
  target: string;
  enforcement: string;
  ruleTypes: string[];
  bypassActorCount: number;
  htmlUrl: string | null;
};

export type InstalledApp = {
  id: number;
  appId: number;
  appSlug: string;
  repositorySelection: string;
  permissions: Record<string, string>;
  events: string[];
  createdAt: string | null;
  suspendedAt: string | null;
  htmlUrl: string | null;
};

export type OrgToken = {
  id: number;
  owner: string;
  repositorySelection: string;
  repositoryCount: number | null;
  permissions: Record<string, string>;
  accessGrantedAt: string | null;
  tokenExpired: boolean | null;
  tokenExpiresAt: string | null;
};

export type OrgWebhook = {
  id: number;
  name: string;
  active: boolean;
  events: string[];
  url: string | null;
  insecureSsl: boolean;
  hasSecret: boolean;
};

export type OrgMemberStats = {
  total: number;
  admins: number;
  members: number;
  outsideCollaborators: number | null;
  twoFactorDisabled: number | null;
  adminLogins: string[];
};

export type ActionsPolicy = {
  enabledRepositories: string;
  allowedActions: string | null;
  githubOwnedAllowed: boolean | null;
  verifiedAllowed: boolean | null;
  patternsAllowed: string[] | null;
  defaultWorkflowPermissions: string | null;
  canApprovePullRequestReviews: boolean | null;
};

export type OrgOverview = {
  profile: Maybe<OrgProfile>;
  rulesets: Maybe<OrgRuleset[]>;
  apps: Maybe<InstalledApp[]>;
  tokens: Maybe<OrgToken[]>;
  pendingTokenRequests: Maybe<number>;
  webhooks: Maybe<OrgWebhook[]>;
  members: Maybe<OrgMemberStats>;
  actionsPolicy: Maybe<ActionsPolicy>;
};

async function fetchOrgOverview(): Promise<OrgOverview> {
  const { org } = getConfig();
  const octokit = getOctokit();

  const [profile, rulesets, apps, tokens, pendingTokenRequests, webhooks, members, actionsPolicy] =
    await Promise.all([
      tryFetch<OrgProfile>("Organization profile", async () => {
        const { data } = await octokit.rest.orgs.get({ org });
        return {
          login: data.login,
          name: data.name ?? null,
          plan: data.plan?.name ?? null,
          publicRepos: data.public_repos,
          privateRepos: data.owned_private_repos ?? 0,
          twoFactorRequired: data.two_factor_requirement_enabled ?? null,
          defaultRepositoryPermission: data.default_repository_permission ?? null,
          membersCanCreateRepositories: data.members_can_create_repositories ?? null,
          membersCanCreatePublicRepositories: data.members_can_create_public_repositories ?? null,
          membersCanForkPrivateRepositories: data.members_can_fork_private_repositories ?? null,
          webCommitSignoffRequired: data.web_commit_signoff_required ?? null,
          advancedSecurityEnabledForNewRepos:
            data.advanced_security_enabled_for_new_repositories ?? null,
          secretScanningEnabledForNewRepos:
            data.secret_scanning_enabled_for_new_repositories ?? null,
          secretScanningPushProtectionForNewRepos:
            data.secret_scanning_push_protection_enabled_for_new_repositories ?? null,
          dependabotAlertsEnabledForNewRepos:
            data.dependabot_alerts_enabled_for_new_repositories ?? null,
          dependabotSecurityUpdatesEnabledForNewRepos:
            data.dependabot_security_updates_enabled_for_new_repositories ?? null,
        };
      }),

      tryFetch<OrgRuleset[]>(
        "Organization rulesets",
        async () => {
          const { data: list } = await octokit.request("GET /orgs/{org}/rulesets", { org });
          const detailed = await Promise.all(
            list.map(async (rs) => {
              const { data } = await octokit.request("GET /orgs/{org}/rulesets/{ruleset_id}", {
                org,
                ruleset_id: rs.id,
              });
              return {
                id: data.id,
                name: data.name,
                target: data.target ?? "branch",
                enforcement: data.enforcement,
                ruleTypes: (data.rules ?? []).map((r) => r.type),
                bypassActorCount: (data.bypass_actors ?? []).length,
                htmlUrl: data._links?.html?.href ?? null,
              } satisfies OrgRuleset;
            }),
          );
          return detailed;
        },
        ADMIN_HINT,
      ),

      tryFetch<InstalledApp[]>(
        "Installed GitHub Apps",
        async () => {
          const { data } = await octokit.request("GET /orgs/{org}/installations", {
            org,
            per_page: 100,
          });
          return data.installations.map((i) => ({
            id: i.id,
            appId: i.app_id,
            appSlug: i.app_slug,
            repositorySelection: i.repository_selection,
            permissions: (i.permissions ?? {}) as Record<string, string>,
            events: i.events ?? [],
            createdAt: i.created_at ?? null,
            suspendedAt: i.suspended_at ?? null,
            htmlUrl: i.html_url ?? null,
          }));
        },
        ADMIN_HINT,
      ),

      tryFetch<OrgToken[]>(
        "Fine-grained personal access tokens",
        async () => {
          const list = await octokit.paginate(
            "GET /orgs/{org}/personal-access-tokens",
            { org, per_page: 100 },
          );
          return (list as unknown[]).map((raw) => {
            const t = raw as {
              id: number;
              owner: { login: string };
              repository_selection: string;
              repositories_url?: string;
              permissions?: { organization?: Record<string, string>; repository?: Record<string, string> };
              access_granted_at?: string;
              token_expired?: boolean;
              token_expires_at?: string | null;
              repository_count?: number;
            };
            return {
              id: t.id,
              owner: t.owner?.login ?? "unknown",
              repositorySelection: t.repository_selection,
              repositoryCount: t.repository_count ?? null,
              permissions: {
                ...(t.permissions?.organization ?? {}),
                ...(t.permissions?.repository ?? {}),
              },
              accessGrantedAt: t.access_granted_at ?? null,
              tokenExpired: t.token_expired ?? null,
              tokenExpiresAt: t.token_expires_at ?? null,
            };
          });
        },
        ADMIN_HINT,
      ),

      tryFetch<number>(
        "Pending token requests",
        async () => {
          const list = await octokit.paginate(
            "GET /orgs/{org}/personal-access-token-requests",
            { org, per_page: 100 },
          );
          return (list as unknown[]).length;
        },
        ADMIN_HINT,
      ),

      tryFetch<OrgWebhook[]>(
        "Organization webhooks",
        async () => {
          const { data } = await octokit.rest.orgs.listWebhooks({ org, per_page: 100 });
          return data.map((h) => ({
            id: h.id,
            name: h.name,
            active: h.active,
            events: h.events,
            url: (h.config?.url as string | undefined) ?? null,
            insecureSsl: String(h.config?.insecure_ssl ?? "0") === "1",
            hasSecret: Boolean(h.config?.secret),
          }));
        },
        ADMIN_HINT,
      ),

      tryFetch<OrgMemberStats>("Members", async () => {
        const [admins, all] = await Promise.all([
          octokit.paginate(octokit.rest.orgs.listMembers, { org, role: "admin", per_page: 100 }),
          octokit.paginate(octokit.rest.orgs.listMembers, { org, per_page: 100 }),
        ]);

        // These two need admin:org; treat them as optional extras.
        const outside = await octokit
          .paginate(octokit.rest.orgs.listOutsideCollaborators, { org, per_page: 100 })
          .then((list) => list.length)
          .catch(() => null);
        const twoFactorDisabled = await octokit
          .paginate(octokit.rest.orgs.listMembers, { org, filter: "2fa_disabled", per_page: 100 })
          .then((list) => list.length)
          .catch(() => null);

        return {
          total: all.length,
          admins: admins.length,
          members: all.length - admins.length,
          outsideCollaborators: outside,
          twoFactorDisabled,
          adminLogins: admins.map((a) => a.login).sort(),
        };
      }),

      tryFetch<ActionsPolicy>(
        "Actions policy",
        async () => {
          const { data: permissions } = await octokit.rest.actions.getGithubActionsPermissionsOrganization(
            { org },
          );

          let patternsAllowed: string[] | null = null;
          let githubOwnedAllowed: boolean | null = null;
          let verifiedAllowed: boolean | null = null;
          if (permissions.allowed_actions === "selected") {
            const { data: selected } = await octokit.rest.actions.getAllowedActionsOrganization({
              org,
            });
            patternsAllowed = selected.patterns_allowed ?? null;
            githubOwnedAllowed = selected.github_owned_allowed ?? null;
            verifiedAllowed = selected.verified_allowed ?? null;
          }

          const workflow = await octokit.rest.actions
            .getGithubActionsDefaultWorkflowPermissionsOrganization({ org })
            .then((r) => r.data)
            .catch(() => null);

          return {
            enabledRepositories: permissions.enabled_repositories,
            allowedActions: permissions.allowed_actions ?? null,
            githubOwnedAllowed,
            verifiedAllowed,
            patternsAllowed,
            defaultWorkflowPermissions: workflow?.default_workflow_permissions ?? null,
            canApprovePullRequestReviews: workflow?.can_approve_pull_request_reviews ?? null,
          };
        },
        ADMIN_HINT,
      ),
    ]);

  return {
    profile,
    rulesets,
    apps,
    tokens,
    pendingTokenRequests,
    webhooks,
    members,
    actionsPolicy,
  };
}

export function getOrgOverview(opts: { force?: boolean } = {}): Promise<CachedValue<OrgOverview>> {
  const { org } = getConfig();
  return cached<OrgOverview>("org-meta", org, fetchOrgOverview, opts);
}
