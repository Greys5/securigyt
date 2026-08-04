/**
 * Per-repository deep scan — fetched lazily when a repo page is opened, never
 * eagerly for the whole org.
 *
 * File contents (every workflow + the CODEOWNERS candidates) come back in a
 * single aliased GraphQL query. The rest is REST, and every sub-section
 * degrades on its own so one missing permission does not blank the page.
 */

import pLimit from "p-limit";
import { getOctokit, tryFetch, type Maybe } from "@/lib/github/client";
import { runGraphql } from "@/lib/github/graphql";
import { cached, type CachedValue } from "@/lib/cache";
import { getConfig } from "@/lib/config";
import { parseWorkflow, type ParsedWorkflow } from "@/lib/parse/workflow";
import { getRepoInventory, type RepoSummary } from "@/lib/github/collectors/repos";

/** Checked in order; the first hit is the one GitHub honours. */
const CODEOWNERS_PATHS = [".github/CODEOWNERS", "CODEOWNERS", "docs/CODEOWNERS"];

const RULESET_CONCURRENCY = 5;

export type Collaborator = {
  login: string;
  type: string;
  role: string;
  admin: boolean;
  htmlUrl: string;
  avatarUrl: string;
};

export type TeamAccess = {
  name: string;
  slug: string;
  permission: string;
};

export type RulesetRule = {
  type: string;
  parameters: Record<string, unknown> | null;
};

export type RulesetDetail = {
  id: number;
  name: string;
  target: string;
  enforcement: string;
  sourceType: string;
  source: string;
  /** Ref patterns the ruleset applies to, e.g. `~DEFAULT_BRANCH`. */
  includes: string[];
  excludes: string[];
  rules: RulesetRule[];
  bypassActors: { actorType: string; bypassMode: string; actorId: number | null }[];
  htmlUrl: string | null;
};

export type CodeownersFile = {
  path: string;
  text: string;
  /** Non-comment, non-blank rule lines. */
  ruleCount: number;
  owners: string[];
};

export type SecurityAnalysis = {
  advancedSecurity: string | null;
  secretScanning: string | null;
  secretScanningPushProtection: string | null;
  dependabotSecurityUpdates: string | null;
  codeSecurity: string | null;
};

export type RepoDetail = {
  summary: RepoSummary;
  workflows: ParsedWorkflow[];
  workflowsTruncated: string[];
  codeowners: CodeownersFile | null;
  codeownersErrors: { kind: string; line: number; message: string; path: string }[];
  collaborators: Maybe<Collaborator[]>;
  teams: Maybe<TeamAccess[]>;
  rulesets: Maybe<RulesetDetail[]>;
  security: Maybe<SecurityAnalysis>;
};

type Blob = { text: string | null; byteSize: number; isTruncated: boolean } | null;

type ContentsResponse = {
  repository: (Record<string, Blob> & {
    codeowners: { errors: { kind: string; line: number; message: string; path: string }[] } | null;
  }) | null;
};

function buildContentsQuery(workflowFiles: string[]): string {
  const workflowSelections = workflowFiles
    .map((file, i) => {
      const escaped = file.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      return `    w${i}: object(expression: "HEAD:.github/workflows/${escaped}") { ... on Blob { text byteSize isTruncated } }`;
    })
    .join("\n");

  const codeownersSelections = CODEOWNERS_PATHS.map(
    (path, i) =>
      `    co${i}: object(expression: "HEAD:${path}") { ... on Blob { text byteSize isTruncated } }`,
  ).join("\n");

  return `
    query($org: String!, $repo: String!) {
      repository(owner: $org, name: $repo) {
        codeowners { errors { kind line message path } }
${codeownersSelections}
${workflowSelections}
      }
    }
  `;
}

/** Owner handles referenced by a CODEOWNERS file, de-duplicated. */
function extractOwners(text: string): { ruleCount: number; owners: string[] } {
  const owners = new Set<string>();
  let ruleCount = 0;

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    ruleCount += 1;
    for (const token of trimmed.split(/\s+/).slice(1)) {
      if (token.startsWith("@") || token.includes("@")) owners.add(token);
    }
  }

  return { ruleCount, owners: [...owners].sort() };
}

async function fetchDetail(repoName: string): Promise<RepoDetail> {
  const { org } = getConfig();
  const octokit = getOctokit();

  const inventory = await getRepoInventory();
  const summary = inventory.value.repos.find((r) => r.name === repoName);
  if (!summary) throw new Error(`Repository "${repoName}" is not in the ${org} inventory.`);

  // One GraphQL round trip for every file this page needs.
  const contents = await runGraphql<ContentsResponse>(
    octokit,
    buildContentsQuery(summary.workflowFiles),
    { org, repo: repoName },
  );
  const repoContents = contents.data.repository;

  const workflows: ParsedWorkflow[] = [];
  const workflowsTruncated: string[] = [];
  summary.workflowFiles.forEach((file, i) => {
    const blob = repoContents?.[`w${i}`];
    if (!blob?.text) return;
    if (blob.isTruncated) workflowsTruncated.push(file);
    workflows.push(parseWorkflow(file, blob.text));
  });

  let codeowners: CodeownersFile | null = null;
  for (let i = 0; i < CODEOWNERS_PATHS.length; i += 1) {
    const blob = repoContents?.[`co${i}`];
    if (blob?.text) {
      codeowners = { path: CODEOWNERS_PATHS[i], text: blob.text, ...extractOwners(blob.text) };
      break;
    }
  }

  const [collaborators, teams, rulesets, security] = await Promise.all([
    tryFetch<Collaborator[]>("Collaborators", async () => {
      const list = await octokit.paginate(octokit.rest.repos.listCollaborators, {
        owner: org,
        repo: repoName,
        affiliation: "all",
        per_page: 100,
      });
      return list
        .map((c) => ({
          login: c.login,
          type: c.type,
          role: c.role_name ?? (c.permissions?.admin ? "admin" : "read"),
          admin: Boolean(c.permissions?.admin),
          htmlUrl: c.html_url,
          avatarUrl: c.avatar_url,
        }))
        .sort((a, b) => a.login.localeCompare(b.login));
    }),

    tryFetch<TeamAccess[]>(
      "Teams",
      async () => {
        const list = await octokit.paginate(octokit.rest.repos.listTeams, {
          owner: org,
          repo: repoName,
          per_page: 100,
        });
        return list.map((t) => ({ name: t.name, slug: t.slug, permission: t.permission }));
      },
      "Team access needs repository admin permission.",
    ),

    tryFetch<RulesetDetail[]>("Rulesets", async () => {
      const { data: list } = await octokit.request("GET /repos/{owner}/{repo}/rulesets", {
        owner: org,
        repo: repoName,
        includes_parents: true,
      });

      const limit = pLimit(RULESET_CONCURRENCY);
      const detailed = await Promise.all(
        list.map((rs) =>
          limit(async () => {
            const { data } = await octokit.request(
              "GET /repos/{owner}/{repo}/rulesets/{ruleset_id}",
              { owner: org, repo: repoName, ruleset_id: rs.id, includes_parents: true },
            );
            const conditions = data.conditions as
              | { ref_name?: { include?: string[]; exclude?: string[] } }
              | undefined;
            return {
              id: data.id,
              name: data.name,
              target: data.target ?? "branch",
              enforcement: data.enforcement,
              sourceType: data.source_type ?? "Repository",
              source: data.source,
              includes: conditions?.ref_name?.include ?? [],
              excludes: conditions?.ref_name?.exclude ?? [],
              rules: (data.rules ?? []).map((r) => ({
                type: r.type,
                parameters:
                  "parameters" in r && r.parameters
                    ? (r.parameters as Record<string, unknown>)
                    : null,
              })),
              bypassActors: (data.bypass_actors ?? []).map((a) => ({
                actorType: a.actor_type ?? "Unknown",
                bypassMode: a.bypass_mode ?? "unknown",
                actorId: a.actor_id ?? null,
              })),
              htmlUrl: data._links?.html?.href ?? null,
            } satisfies RulesetDetail;
          }),
        ),
      );
      return detailed;
    }),

    tryFetch<SecurityAnalysis>(
      "Security settings",
      async () => {
        const { data } = await octokit.rest.repos.get({ owner: org, repo: repoName });
        const sa = data.security_and_analysis;
        if (!sa) {
          throw Object.assign(new Error("security_and_analysis not returned"), { status: 403 });
        }
        return {
          advancedSecurity: sa.advanced_security?.status ?? null,
          secretScanning: sa.secret_scanning?.status ?? null,
          secretScanningPushProtection: sa.secret_scanning_push_protection?.status ?? null,
          dependabotSecurityUpdates: sa.dependabot_security_updates?.status ?? null,
          codeSecurity: sa.code_security?.status ?? null,
        };
      },
      "Repository security settings need admin access on the repository.",
    ),
  ]);

  return {
    summary,
    workflows,
    workflowsTruncated,
    codeowners,
    codeownersErrors: repoContents?.codeowners?.errors ?? [],
    collaborators,
    teams,
    rulesets,
    security,
  };
}

export function getRepoDetail(
  repoName: string,
  opts: { force?: boolean } = {},
): Promise<CachedValue<RepoDetail>> {
  return cached<RepoDetail>("repo-detail", repoName, () => fetchDetail(repoName), opts);
}
