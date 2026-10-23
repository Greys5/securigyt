import type { RepoSummary } from "@/lib/github/collectors/repos";
import type { SecurityOverview } from "@/lib/github/collectors/security";
import type { CheckId, Grade, Score } from "@/lib/score";
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
