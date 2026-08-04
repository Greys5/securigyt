/**
 * Repository security score.
 *
 * Weighted checks over the facts the inventory already knows, plus optional
 * enrichment (action pinning, alerts, security settings, admin collaborators)
 * that is only available on deeper scans.
 *
 * Checks whose data is missing are "unknown" and drop out of the denominator
 * rather than counting as failures — a permission gap must never look like a
 * security problem.
 */

import type { RepoSummary, RulesetSummary } from "@/lib/github/collectors/repos";

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

/** Only actively-enforced branch rulesets change what can happen on a push. */
function activeBranchRulesets(rulesets: RulesetSummary[]): RulesetSummary[] {
  return rulesets.filter((r) => r.target === "BRANCH" && r.enforcement === "ACTIVE");
}

function hasRule(rulesets: RulesetSummary[], type: string): boolean {
  return activeBranchRulesets(rulesets).some((r) => r.ruleTypes.includes(type));
}

export function gradeFor(percent: number): Grade {
  if (percent >= 90) return "A";
  if (percent >= 75) return "B";
  if (percent >= 60) return "C";
  if (percent >= 40) return "D";
  return "F";
}

export function computeScore(input: ScoreInput): Score {
  const { repo, actionRefs, alerts, security, adminCollaborators } = input;
  const bp = repo.branchProtection;
  const active = activeBranchRulesets(repo.rulesets);
  const prRule = active.find((r) => r.pullRequest)?.pullRequest ?? null;

  const check = (
    id: CheckId,
    label: string,
    weight: number,
    status: CheckStatus,
    detail: string,
  ): Check => ({ id, label, weight, status, detail });

  const pass = (ok: boolean): CheckStatus => (ok ? "pass" : "fail");

  const reviewRequired =
    (bp?.requiresApprovingReviews && (bp.requiredApprovingReviewCount ?? 0) > 0) ||
    (prRule != null && (prRule.requiredApprovingReviewCount ?? 0) > 0);

  const codeOwnerReview =
    Boolean(bp?.requiresCodeOwnerReviews) || Boolean(prRule?.requireCodeOwnerReview);

  const checks: Check[] = [
    check(
      "branch-protected",
      "Default branch is protected",
      3,
      pass(repo.defaultBranchProtected),
      repo.protectionSource === "none"
        ? "No branch protection rule or active ruleset covers the default branch"
        : `Protected via ${repo.protectionSource === "ruleset" ? "ruleset" : "branch protection rule"}`,
    ),
    check(
      "force-push-blocked",
      "Force pushes blocked",
      2,
      pass((bp != null && !bp.allowsForcePushes) || hasRule(repo.rulesets, "NON_FAST_FORWARD")),
      "History rewrites on the default branch",
    ),
    check(
      "deletion-blocked",
      "Branch deletion blocked",
      1,
      pass((bp != null && !bp.allowsDeletions) || hasRule(repo.rulesets, "DELETION")),
      "Deleting the default branch",
    ),
    check(
      "review-required",
      "Pull request review required",
      2,
      pass(Boolean(reviewRequired)),
      prRule != null && (prRule.requiredApprovingReviewCount ?? 0) === 0
        ? "A pull request is required but zero approvals are needed"
        : "At least one approving review before merge",
    ),
    check(
      "code-owner-review",
      "Code owner review required",
      1,
      pass(codeOwnerReview),
      "CODEOWNERS approval enforced on merge",
    ),
    check(
      "codeowners-present",
      "CODEOWNERS file present",
      2,
      pass(repo.hasCodeowners),
      repo.hasCodeowners ? "Found on the default branch" : "No CODEOWNERS file",
    ),
    check(
      "codeowners-valid",
      "CODEOWNERS has no errors",
      1,
      repo.hasCodeowners ? pass(repo.codeownersErrorCount === 0) : "n/a",
      repo.codeownersErrorCount > 0
        ? `${repo.codeownersErrorCount} validation error(s)`
        : "No syntax or ownership errors",
    ),
    check(
      "dependabot-alerts",
      "Dependabot alerts enabled",
      2,
      pass(repo.dependabotAlertsEnabled),
      "Vulnerable dependency detection",
    ),
    check(
      "security-policy",
      "Security policy published",
      1,
      pass(repo.hasSecurityPolicy),
      "SECURITY.md tells people how to report issues",
    ),
    check(
      "actions-pinned",
      "Actions pinned to a commit SHA",
      2,
      actionRefs === undefined
        ? "unknown"
        : actionRefs.total === 0
          ? "n/a"
          : pass(actionRefs.unpinned === 0),
      actionRefs === undefined
        ? "Workflow scan has not run"
        : actionRefs.total === 0
          ? "No workflows in this repository"
          : `${actionRefs.unpinned} of ${actionRefs.total} references are not SHA-pinned`,
    ),
    check(
      "secret-scanning",
      "Secret scanning enabled",
      2,
      security === undefined ? "unknown" : pass(security.secretScanning),
      security === undefined ? "Needs repository admin access" : "Detects committed credentials",
    ),
    check(
      "push-protection",
      "Secret push protection enabled",
      2,
      security === undefined ? "unknown" : pass(security.pushProtection),
      security === undefined ? "Needs repository admin access" : "Blocks pushes containing secrets",
    ),
    check(
      "no-admin-collaborators",
      "No direct admin collaborators",
      1,
      adminCollaborators === undefined ? "unknown" : pass(adminCollaborators === 0),
      adminCollaborators === undefined
        ? "Collaborator list not loaded"
        : `${adminCollaborators} collaborator(s) hold the admin role directly`,
    ),
    check(
      "no-severe-alerts",
      "No critical or high alerts open",
      2,
      alerts === undefined ? "unknown" : pass(alerts.critical === 0 && alerts.high === 0),
      alerts === undefined
        ? "Alert data not available"
        : `${alerts.critical} critical, ${alerts.high} high open`,
    ),
  ];

  const scored = checks.filter((c) => c.status === "pass" || c.status === "fail");
  const applicableWeight = scored.reduce((sum, c) => sum + c.weight, 0);
  const earnedWeight = scored
    .filter((c) => c.status === "pass")
    .reduce((sum, c) => sum + c.weight, 0);

  const percent =
    applicableWeight === 0 ? 0 : Math.round((earnedWeight / applicableWeight) * 100);

  return {
    percent,
    grade: gradeFor(percent),
    earnedWeight,
    applicableWeight,
    checks,
    failed: checks.filter((c) => c.status === "fail"),
  };
}
