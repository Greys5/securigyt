/**
 * Org security posture — the join of every collector.
 *
 * Combines the repo inventory, the actions inventory and the alert rollups
 * into one scored view. Each source is already cached independently, so this
 * is mostly computation.
 */

import { getRepoInventory, type RepoSummary } from "@/lib/github/collectors/repos";
import { getActionsInventory } from "@/lib/github/collectors/actionsInventory";
import {
  getSecurityOverview,
  alertCountsByRepo,
  hasAnyAlertSource,
  type SecurityOverview,
} from "@/lib/github/collectors/security";
import { computeScore, type Check, type CheckId, type Grade, type Score } from "@/lib/score";

export type ScoredRepo = {
  repo: RepoSummary;
  score: Score;
};

export type CheckRollup = {
  id: CheckId;
  label: string;
  passed: number;
  failed: number;
  unknown: number;
  notApplicable: number;
};

export type Posture = {
  scored: ScoredRepo[];
  averagePercent: number;
  distribution: Record<Grade, number>;
  checkRollup: CheckRollup[];
  security: SecurityOverview;
  /** True when the workflow scan contributed pinning data. */
  actionsScanned: boolean;
  fetchedAt: number;
};

export async function getPosture(): Promise<Posture> {
  const [inventory, actions, security] = await Promise.all([
    getRepoInventory(),
    getActionsInventory(),
    getSecurityOverview(),
  ]);

  // Action references per repo, so the pinning check can be scored org-wide.
  const refsByRepo = new Map<string, { total: number; unpinned: number }>();
  for (const action of actions.value.actions) {
    for (const site of action.sites) {
      let entry = refsByRepo.get(site.repo);
      if (!entry) {
        entry = { total: 0, unpinned: 0 };
        refsByRepo.set(site.repo, entry);
      }
      entry.total += 1;
      if (!site.pinned) entry.unpinned += 1;
    }
  }

  const alertsAvailable = hasAnyAlertSource(security.value);
  const alerts = alertCountsByRepo(security.value);

  const active = inventory.value.repos.filter((r) => !r.archived);

  const scored: ScoredRepo[] = active.map((repo) => {
    // A repo with workflows but no scan entry genuinely has zero references.
    const actionRefs = refsByRepo.get(repo.name) ?? { total: 0, unpinned: 0 };
    const repoAlerts = alerts.get(repo.name);

    return {
      repo,
      score: computeScore({
        repo,
        actionRefs,
        alerts: alertsAvailable
          ? {
              critical: repoAlerts?.critical ?? 0,
              high: repoAlerts?.high ?? 0,
              medium: repoAlerts?.medium ?? 0,
              low: repoAlerts?.low ?? 0,
            }
          : undefined,
      }),
    };
  });

  scored.sort((a, b) => a.score.percent - b.score.percent || a.repo.name.localeCompare(b.repo.name));

  const distribution: Record<Grade, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  for (const s of scored) distribution[s.score.grade] += 1;

  const averagePercent =
    scored.length === 0
      ? 0
      : Math.round(scored.reduce((sum, s) => sum + s.score.percent, 0) / scored.length);

  const rollupMap = new Map<CheckId, CheckRollup>();
  for (const s of scored) {
    for (const c of s.score.checks) {
      let entry = rollupMap.get(c.id);
      if (!entry) {
        entry = { id: c.id, label: c.label, passed: 0, failed: 0, unknown: 0, notApplicable: 0 };
        rollupMap.set(c.id, entry);
      }
      if (c.status === "pass") entry.passed += 1;
      else if (c.status === "fail") entry.failed += 1;
      else if (c.status === "unknown") entry.unknown += 1;
      else entry.notApplicable += 1;
    }
  }

  const checkRollup = [...rollupMap.values()].sort((a, b) => b.failed - a.failed);

  return {
    scored,
    averagePercent,
    distribution,
    checkRollup,
    security: security.value,
    actionsScanned: actions.value.workflowCount > 0,
    fetchedAt: Math.min(inventory.fetchedAt, actions.fetchedAt, security.fetchedAt),
  };
}

/** The single worst failing check across the org, used for headline copy. */
export function topFailure(checks: CheckRollup[]): CheckRollup | null {
  return checks.find((c) => c.failed > 0) ?? null;
}

export type { Check };
