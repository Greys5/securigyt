import type { RepoSummary } from "@/lib/github/collectors/repos";
export type CheckStatus = "pass" | "fail" | "unknown" | "n/a";

export type CheckId =
  | "branch-protected"
  | "force-push-blocked"
  | "deletion-blocked"
  | "review-required"
  | "code-owner-review"
  | "codeowners-present"
  | "codeowners-valid"
  | "dependabot-alerts"
  | "security-policy"
  | "actions-pinned"
  | "secret-scanning"
  | "push-protection"
  | "no-admin-collaborators"
  | "no-severe-alerts";

export type Check = {
  id: CheckId;
  label: string;
  weight: number;
  status: CheckStatus;
  detail: string;
};

export type Grade = "A" | "B" | "C" | "D" | "F";

export type Score = {
  percent: number;
  grade: Grade;
  earnedWeight: number;
  applicableWeight: number;
  checks: Check[];
  failed: Check[];
};

export type ScoreInput = {
  repo: RepoSummary;
  /** From the org actions inventory. Omit when workflows have not been scanned. */
  actionRefs?: { total: number; unpinned: number };
  /** Open alert counts by severity, from the security collector. */
  alerts?: { critical: number; high: number; medium: number; low: number };
  /** From repo security settings; needs admin access. */
  security?: { secretScanning: boolean; pushProtection: boolean };
  /** Number of collaborators with the admin role. */
  adminCollaborators?: number;
};
