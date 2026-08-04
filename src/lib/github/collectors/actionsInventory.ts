/**
 * Org-wide GitHub Actions inventory.
 *
 * Answers "which actions does the org use, at which versions, and where?" —
 * plus the supply-chain view: which references are not pinned to a commit SHA.
 *
 * Workflow file contents for every repo are fetched with aliased GraphQL
 * queries batched across both repositories and files, so a 190-repo org costs
 * a handful of queries rather than hundreds of REST calls.
 */

import pLimit from "p-limit";
import { getOctokit } from "@/lib/github/client";
import { runGraphql, chunk, aliasFor } from "@/lib/github/graphql";
import { cached, type CachedValue } from "@/lib/cache";
import { getConfig } from "@/lib/config";
import { parseWorkflow, type RefType, type UsesKind } from "@/lib/parse/workflow";
import { getRepoInventory } from "@/lib/github/collectors/repos";

const REPO_BATCH_SIZE = 8;
const BATCH_CONCURRENCY = 5;

export type ActionUsageSite = {
  repo: string;
  workflow: string;
  job: string;
  step: string | null;
  ref: string | null;
  refType: RefType;
  pinned: boolean;
};

export type ActionVersion = {
  ref: string | null;
  refType: RefType;
  pinned: boolean;
  count: number;
  repos: string[];
};

export type ActionUsage = {
  name: string;
  kind: UsesKind;
  firstParty: boolean;
  totalRefs: number;
  repoCount: number;
  unpinnedRefs: number;
  versions: ActionVersion[];
  sites: ActionUsageSite[];
};

export type WorkflowFlag = {
  repo: string;
  workflow: string;
  name: string | null;
  reason: string;
  detail: string;
};

export type ActionsInventory = {
  scannedRepos: number;
  workflowCount: number;
  totalRefs: number;
  unpinnedRefs: number;
  distinctActions: number;
  actions: ActionUsage[];
  /** Workflows worth a second look: risky triggers or broad token permissions. */
  flagged: WorkflowFlag[];
  errors: string[];
};

type Blob = { text: string | null; isTruncated: boolean } | null;

function buildBatchQuery(repos: { name: string; workflowFiles: string[] }[]): string {
  const selections = repos
    .map((repo, ri) => {
      const files = repo.workflowFiles
        .map((file, fi) => {
          const escaped = file.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
          return `      f${fi}: object(expression: "HEAD:.github/workflows/${escaped}") { ... on Blob { text isTruncated } }`;
        })
        .join("\n");
      const escapedRepo = repo.name.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      return `  ${aliasFor(ri)}: repository(owner: $org, name: "${escapedRepo}") {\n${files}\n  }`;
    })
    .join("\n");

  return `query($org: String!) {\n${selections}\n}`;
}

async function fetchActionsInventory(): Promise<ActionsInventory> {
  const { org } = getConfig();
  const octokit = getOctokit();
  const errors: string[] = [];

  const inventory = await getRepoInventory();
  const targets = inventory.value.repos
    .filter((r) => !r.archived && r.workflowFiles.length > 0)
    .map((r) => ({ name: r.name, workflowFiles: r.workflowFiles }));

  const limit = pLimit(BATCH_CONCURRENCY);
  const batches = chunk(targets, REPO_BATCH_SIZE);

  const actions = new Map<string, ActionUsage>();
  const flagged: WorkflowFlag[] = [];
  let workflowCount = 0;
  let totalRefs = 0;
  let unpinnedRefs = 0;

  await Promise.all(
    batches.map((batch) =>
      limit(async () => {
        const { data, errors: batchErrors } = await runGraphql<
          Record<string, Record<string, Blob> | null>
        >(octokit, buildBatchQuery(batch), { org });
        errors.push(...batchErrors);

        batch.forEach((repo, ri) => {
          const repoData = data?.[aliasFor(ri)];
          if (!repoData) {
            errors.push(`${repo.name}: workflow contents unavailable`);
            return;
          }

          repo.workflowFiles.forEach((file, fi) => {
            const text = repoData[`f${fi}`]?.text;
            if (!text) return;

            const wf = parseWorkflow(file, text);
            workflowCount += 1;

            if (wf.parseError) {
              flagged.push({
                repo: repo.name,
                workflow: file,
                name: wf.name,
                reason: "Parse error",
                detail: wf.parseError,
              });
            }

            if (wf.riskyTriggers.length > 0) {
              flagged.push({
                repo: repo.name,
                workflow: file,
                name: wf.name,
                reason: "Risky trigger",
                detail: `${wf.riskyTriggers.join(", ")} runs with repository secrets in a fork context`,
              });
            }

            if (wf.permissions === "write-all") {
              flagged.push({
                repo: repo.name,
                workflow: file,
                name: wf.name,
                reason: "Broad token permissions",
                detail: "Workflow requests write-all",
              });
            }

            for (const use of wf.uses) {
              totalRefs += 1;
              const notPinned = !use.pinned && use.kind !== "docker";
              if (notPinned) unpinnedRefs += 1;

              let entry = actions.get(use.name);
              if (!entry) {
                entry = {
                  name: use.name,
                  kind: use.kind,
                  firstParty: use.firstParty,
                  totalRefs: 0,
                  repoCount: 0,
                  unpinnedRefs: 0,
                  versions: [],
                  sites: [],
                };
                actions.set(use.name, entry);
              }

              entry.totalRefs += 1;
              if (notPinned) entry.unpinnedRefs += 1;
              entry.sites.push({
                repo: repo.name,
                workflow: file,
                job: use.job,
                step: use.step,
                ref: use.ref,
                refType: use.refType,
                pinned: use.pinned,
              });

              let version = entry.versions.find((v) => v.ref === use.ref);
              if (!version) {
                version = {
                  ref: use.ref,
                  refType: use.refType,
                  pinned: use.pinned,
                  count: 0,
                  repos: [],
                };
                entry.versions.push(version);
              }
              version.count += 1;
              if (!version.repos.includes(repo.name)) version.repos.push(repo.name);
            }
          });
        });
      }),
    ),
  );

  const list = [...actions.values()].map((entry) => ({
    ...entry,
    repoCount: new Set(entry.sites.map((s) => s.repo)).size,
    versions: entry.versions.sort((a, b) => b.count - a.count),
  }));

  // Most-used first; that is where a pinning problem matters most.
  list.sort((a, b) => b.totalRefs - a.totalRefs || a.name.localeCompare(b.name));

  return {
    scannedRepos: targets.length,
    workflowCount,
    totalRefs,
    unpinnedRefs,
    distinctActions: list.length,
    actions: list,
    flagged: flagged.sort((a, b) => a.repo.localeCompare(b.repo)),
    errors,
  };
}

export function getActionsInventory(
  opts: { force?: boolean } = {},
): Promise<CachedValue<ActionsInventory>> {
  const { org } = getConfig();
  return cached<ActionsInventory>("repo-workflows", org, fetchActionsInventory, opts);
}
