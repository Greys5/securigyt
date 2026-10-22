/**
 * Org repository inventory.
 *
 * Two passes, both batched, so a 200-repo org resolves in seconds:
 *   1. cheap paginated listing (100 repos/query) -> names and basic metadata
 *   2. aliased detail batches (25 repos/query) run concurrently -> security facts
 *
 * Nothing here is per-repo-sequential. The only file contents fetched in the
 * inventory are the three supported CODEOWNERS locations, inside the same batches.
 */

import pLimit from "p-limit";
import { getOctokit } from "@/lib/github/client";
import { runGraphql, chunk, aliasFor, type GraphqlResult } from "@/lib/github/graphql";
import { cached, type CachedValue } from "@/lib/cache";
import { getConfig } from "@/lib/config";
import { parseCodeowners, type CodeownerRule } from "@/lib/parse/codeowners";

const DETAIL_BATCH_SIZE = 25;
const DETAIL_CONCURRENCY = 6;

export type PullRequestRuleParams = {
  requiredApprovingReviewCount: number | null;
  requireCodeOwnerReview: boolean;
  dismissStaleReviewsOnPush: boolean;
  requireLastPushApproval: boolean;
};

export type RulesetSummary = {
  name: string;
  enforcement: string;
  target: string;
  databaseId: number | null;
  source: string;
  /** Uppercase rule types, e.g. DELETION, NON_FAST_FORWARD, PULL_REQUEST. */
  ruleTypes: string[];
  pullRequest: PullRequestRuleParams | null;
  includes: string[];
  excludes: string[];
  bypassActors: RulesetBypassActor[];
};

export type RulesetBypassActor = {
  actorType: string;
  actorName: string;
  bypassMode: string;
};

export type CodeownersSummary = {
  path: string;
  ruleCount: number;
  owners: string[];
  teams: string[];
  users: string[];
  emails: string[];
  rules: CodeownerRule[];
  truncated: boolean;
};

export type BranchProtection = {
  pattern: string;
  allowsForcePushes: boolean;
  allowsDeletions: boolean;
  requiresApprovingReviews: boolean;
  requiredApprovingReviewCount: number | null;
  requiresCodeOwnerReviews: boolean;
  dismissesStaleReviews: boolean;
  requiresStatusChecks: boolean;
  requiresConversationResolution: boolean;
  requiresLinearHistory: boolean;
  requiresCommitSignatures: boolean;
  isAdminEnforced: boolean;
  restrictsPushes: boolean;
};

export type ProtectionSource = "branch-protection" | "ruleset" | "none";

export type RepoSummary = {
  name: string;
  url: string;
  description: string | null;
  archived: boolean;
  isPrivate: boolean;
  isFork: boolean;
  visibility: string;
  pushedAt: string | null;
  defaultBranch: string | null;

  hasDotGithub: boolean;
  dotGithubEntries: string[];
  workflowFiles: string[];

  hasCodeowners: boolean;
  codeownersErrorCount: number;
  codeowners: CodeownersSummary | null;

  hasSecurityPolicy: boolean;
  dependabotAlertsEnabled: boolean;

  branchProtection: BranchProtection | null;
  rulesets: RulesetSummary[];
  protectionSource: ProtectionSource;
  defaultBranchProtected: boolean;
};

export type RepoInventory = {
  org: string;
  totalCount: number;
  repos: RepoSummary[];
  /** Repos GitHub refused to resolve, so the UI can say so instead of silently dropping them. */
  errors: string[];
};

type ListNode = {
  name: string;
  url: string;
  description: string | null;
  isArchived: boolean;
  isPrivate: boolean;
  isFork: boolean;
  visibility: string;
  pushedAt: string | null;
};

type ListResponse = {
  organization: {
    repositories: {
      totalCount: number;
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      nodes: (ListNode | null)[];
    };
  };
};

const LIST_QUERY = `
  query($org: String!, $cursor: String) {
    organization(login: $org) {
      repositories(first: 100, after: $cursor, ownerAffiliations: OWNER, orderBy: {field: NAME, direction: ASC}) {
        totalCount
        pageInfo { hasNextPage endCursor }
        nodes { name url description isArchived isPrivate isFork visibility pushedAt }
      }
    }
  }
`;

type TreeObject = { entries?: { name: string; type: string }[] } | null;
type TextBlob = { text: string | null; isTruncated: boolean } | null;

type BypassActorNode = {
  actor: ({ __typename: string; name?: string; slug?: string; login?: string } | null);
  bypassMode: string;
  deployKey: boolean;
  enterpriseOwner: boolean;
  enterpriseRole: boolean;
  organizationAdmin: boolean;
  repositoryRoleName: string | null;
};

type RulesetNode = {
  name: string;
  enforcement: string;
  target: string;
  databaseId: number | null;
  source: unknown;
  conditions: { refName: { include: string[]; exclude: string[] } | null };
  bypassActors: { nodes: (BypassActorNode | null)[] | null } | null;
  rules: {
    nodes:
      | ({ type: string; parameters: ({ __typename: string } & Partial<PullRequestRuleParams>) | null } | null)[]
      | null;
  } | null;
};

type DetailNode = {
  name: string;
  isSecurityPolicyEnabled: boolean;
  hasVulnerabilityAlertsEnabled: boolean;
  codeowners: { errors: { kind: string; line: number; message: string; path: string }[] } | null;
  defaultBranchRef: { name: string; branchProtectionRule: BranchProtection | null } | null;
  rulesets: { nodes: (RulesetNode | null)[] | null } | null;
  dotGithub: TreeObject;
  workflowsDir: TreeObject;
  codeownersDotGithub: TextBlob;
  codeownersRoot: TextBlob;
  codeownersDocs: TextBlob;
};

const DETAIL_FIELDS = `
  name
  isSecurityPolicyEnabled
  hasVulnerabilityAlertsEnabled
  codeowners { errors { kind line message path } }
  defaultBranchRef {
    name
    branchProtectionRule {
      pattern
      allowsForcePushes
      allowsDeletions
      requiresApprovingReviews
      requiredApprovingReviewCount
      requiresCodeOwnerReviews
      dismissesStaleReviews
      requiresStatusChecks
      requiresConversationResolution
      requiresLinearHistory
      requiresCommitSignatures
      isAdminEnforced
      restrictsPushes
    }
  }
  rulesets(first: 20, includeParents: true) {
    nodes {
      name enforcement target databaseId source { __typename }
      conditions { refName { include exclude } }
      bypassActors(first: 100) {
        nodes {
          bypassMode deployKey enterpriseOwner enterpriseRole organizationAdmin repositoryRoleName
          actor {
            __typename
            ... on App { name slug }
            ... on Team { name slug }
            ... on User { login }
          }
        }
      }
      rules(first: 30) {
        nodes {
          type
          parameters {
            __typename
            ... on PullRequestParameters {
              requiredApprovingReviewCount
              requireCodeOwnerReview
              dismissStaleReviewsOnPush
              requireLastPushApproval
            }
          }
        }
      }
    }
  }
  dotGithub: object(expression: "HEAD:.github") { ... on Tree { entries { name type } } }
  workflowsDir: object(expression: "HEAD:.github/workflows") { ... on Tree { entries { name type } } }
  codeownersDotGithub: object(expression: "HEAD:.github/CODEOWNERS") { ... on Blob { text isTruncated } }
  codeownersRoot: object(expression: "HEAD:CODEOWNERS") { ... on Blob { text isTruncated } }
  codeownersDocs: object(expression: "HEAD:docs/CODEOWNERS") { ... on Blob { text isTruncated } }
`;

function bypassActorLabel(node: BypassActorNode): RulesetBypassActor {
  const actor = node.actor;
  if (actor) {
    const actorName = actor.slug ?? actor.login ?? actor.name ?? actor.__typename;
    return { actorType: actor.__typename, actorName, bypassMode: node.bypassMode };
  }
  if (node.organizationAdmin) return { actorType: "OrganizationAdmin", actorName: "Organization admins", bypassMode: node.bypassMode };
  if (node.enterpriseOwner) return { actorType: "EnterpriseOwner", actorName: "Enterprise owners", bypassMode: node.bypassMode };
  if (node.enterpriseRole) return { actorType: "EnterpriseRole", actorName: "Enterprise role", bypassMode: node.bypassMode };
  if (node.deployKey) return { actorType: "DeployKey", actorName: "Deploy keys", bypassMode: node.bypassMode };
  if (node.repositoryRoleName) return { actorType: "RepositoryRole", actorName: node.repositoryRoleName, bypassMode: node.bypassMode };
  return { actorType: "Unknown", actorName: "Unknown actor", bypassMode: node.bypassMode };
}

function buildDetailQuery(names: string[]): string {
  const selections = names
    .map((name, i) => {
      // Repo names are org-controlled and GraphQL string-escaped here.
      const escaped = name.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      return `  ${aliasFor(i)}: repository(owner: $org, name: "${escaped}") {${DETAIL_FIELDS}  }`;
    })
    .join("\n");
  return `query($org: String!) {\n${selections}\n}`;
}

/** A ruleset counts as branch protection when it is active and targets branches. */
function rulesetProtects(rulesets: RulesetSummary[]): boolean {
  return rulesets.some((r) => r.target === "BRANCH" && r.enforcement === "ACTIVE");
}

function toSummary(list: ListNode, detail: DetailNode | null): RepoSummary {
  const rulesets: RulesetSummary[] = (detail?.rulesets?.nodes ?? [])
    .filter((r): r is RulesetNode => r != null)
    .map((r) => {
      const rules = (r.rules?.nodes ?? []).filter((n): n is NonNullable<typeof n> => n != null);
      const pr = rules.find((n) => n.parameters?.__typename === "PullRequestParameters");

      return {
        name: r.name,
        enforcement: r.enforcement,
        target: r.target,
        databaseId: r.databaseId ?? null,
        source:
          typeof r.source === "object" && r.source !== null && "__typename" in r.source
            ? String((r.source as { __typename: string }).__typename)
            : "Unknown",
        ruleTypes: rules.map((n) => n.type),
        pullRequest: pr?.parameters
          ? {
              requiredApprovingReviewCount: pr.parameters.requiredApprovingReviewCount ?? null,
              requireCodeOwnerReview: pr.parameters.requireCodeOwnerReview ?? false,
              dismissStaleReviewsOnPush: pr.parameters.dismissStaleReviewsOnPush ?? false,
              requireLastPushApproval: pr.parameters.requireLastPushApproval ?? false,
            }
          : null,
        includes: r.conditions?.refName?.include ?? [],
        excludes: r.conditions?.refName?.exclude ?? [],
        bypassActors: (r.bypassActors?.nodes ?? [])
          .filter((actor): actor is BypassActorNode => actor != null)
          .map(bypassActorLabel),
      };
    });

  const branchProtection = detail?.defaultBranchRef?.branchProtectionRule ?? null;
  const protectionSource: ProtectionSource = branchProtection
    ? "branch-protection"
    : rulesetProtects(rulesets)
      ? "ruleset"
      : "none";

  const dotGithubEntries = (detail?.dotGithub?.entries ?? []).map((e) => e.name);
  const workflowFiles = (detail?.workflowsDir?.entries ?? [])
    .filter((e) => e.type === "blob" && /\.ya?ml$/i.test(e.name))
    .map((e) => e.name);
  const codeownersBlob = detail
    ? ([
        [".github/CODEOWNERS", detail.codeownersDotGithub],
        ["CODEOWNERS", detail.codeownersRoot],
        ["docs/CODEOWNERS", detail.codeownersDocs],
      ] as const).find(([, blob]) => blob != null)
    : undefined;
  const codeowners = codeownersBlob?.[1]?.text
    ? {
        path: codeownersBlob[0],
        ...parseCodeowners(codeownersBlob[1].text),
        truncated: codeownersBlob[1].isTruncated,
      }
    : null;

  return {
    name: list.name,
    url: list.url,
    description: list.description,
    archived: list.isArchived,
    isPrivate: list.isPrivate,
    isFork: list.isFork,
    visibility: list.visibility,
    pushedAt: list.pushedAt,
    defaultBranch: detail?.defaultBranchRef?.name ?? null,

    hasDotGithub: dotGithubEntries.length > 0,
    dotGithubEntries,
    workflowFiles,

    hasCodeowners: detail?.codeowners != null,
    codeownersErrorCount: detail?.codeowners?.errors.length ?? 0,
    codeowners,

    hasSecurityPolicy: detail?.isSecurityPolicyEnabled ?? false,
    dependabotAlertsEnabled: detail?.hasVulnerabilityAlertsEnabled ?? false,

    branchProtection,
    rulesets,
    protectionSource,
    defaultBranchProtected: protectionSource !== "none",
  };
}

async function fetchInventory(): Promise<RepoInventory> {
  const { org } = getConfig();
  const octokit = getOctokit();
  const errors: string[] = [];

  // Pass 1 — list every repo (cheap fields only).
  const listed: ListNode[] = [];
  let cursor: string | null = null;
  let totalCount = 0;

  do {
    const result: GraphqlResult<ListResponse> = await runGraphql<ListResponse>(
      octokit,
      LIST_QUERY,
      { org, cursor },
    );
    errors.push(...result.errors);
    const page = result.data.organization.repositories;
    totalCount = page.totalCount;
    listed.push(...page.nodes.filter((n): n is ListNode => n != null));
    cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (cursor);

  // Pass 2 — aliased detail batches, run concurrently.
  const limit = pLimit(DETAIL_CONCURRENCY);
  const batches = chunk(listed, DETAIL_BATCH_SIZE);
  const details = new Map<string, DetailNode>();

  await Promise.all(
    batches.map((batch) =>
      limit(async () => {
        const names = batch.map((r) => r.name);
        const { data, errors: batchErrors } = await runGraphql<Record<string, DetailNode | null>>(
          octokit,
          buildDetailQuery(names),
          { org },
        );
        errors.push(...batchErrors);
        names.forEach((name, i) => {
          const node = data?.[aliasFor(i)];
          if (node) details.set(name, node);
        });
      }),
    ),
  );

  for (const repo of listed) {
    if (!details.has(repo.name)) errors.push(`${repo.name}: detail unavailable`);
  }

  return {
    org,
    totalCount,
    repos: listed.map((r) => toSummary(r, details.get(r.name) ?? null)),
    errors,
  };
}

export function getRepoInventory(opts: { force?: boolean } = {}): Promise<CachedValue<RepoInventory>> {
  const { org } = getConfig();
  return cached<RepoInventory>("org-repos", org, fetchInventory, opts);
}
