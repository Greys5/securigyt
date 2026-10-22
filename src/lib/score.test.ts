import { describe, expect, it } from "vitest";
import { computeScore, gradeFor, type ScoreInput } from "./score";
import type { RepoSummary } from "@/lib/github/collectors/repos";

function repo(overrides: Partial<RepoSummary> = {}): RepoSummary {
  return {
    name: "demo",
    url: "https://github.com/org/demo",
    description: null,
    archived: false,
    isPrivate: true,
    isFork: false,
    visibility: "PRIVATE",
    pushedAt: "2026-01-01T00:00:00Z",
    defaultBranch: "main",
    hasDotGithub: false,
    dotGithubEntries: [],
    workflowFiles: [],
    hasCodeowners: false,
    codeownersErrorCount: 0,
    codeowners: null,
    hasSecurityPolicy: false,
    dependabotAlertsEnabled: false,
    branchProtection: null,
    rulesets: [],
    protectionSource: "none",
    defaultBranchProtected: false,
    ...overrides,
  };
}

function scoreOf(input: ScoreInput) {
  return computeScore(input).percent;
}

describe("computeScore", () => {
  it("gives a bare repository a low score", () => {
    const result = computeScore({ repo: repo() });
    expect(result.percent).toBeLessThan(30);
    expect(result.grade).toBe("F");
  });

  it("credits branch protection delivered through a ruleset", () => {
    const withRuleset = repo({
      defaultBranchProtected: true,
      protectionSource: "ruleset",
      rulesets: [
        {
          name: "default",
          enforcement: "ACTIVE",
          target: "BRANCH",
          databaseId: 1,
          source: "Organization",
          ruleTypes: ["DELETION", "NON_FAST_FORWARD", "PULL_REQUEST"],
          pullRequest: {
            requiredApprovingReviewCount: 1,
            requireCodeOwnerReview: true,
            dismissStaleReviewsOnPush: false,
            requireLastPushApproval: false,
          },
          includes: ["~DEFAULT_BRANCH"],
          excludes: [],
          bypassActors: [],
        },
      ],
    });

    const result = computeScore({ repo: withRuleset });
    const byId = Object.fromEntries(result.checks.map((c) => [c.id, c.status]));

    expect(byId["branch-protected"]).toBe("pass");
    expect(byId["force-push-blocked"]).toBe("pass");
    expect(byId["deletion-blocked"]).toBe("pass");
    expect(byId["review-required"]).toBe("pass");
    expect(byId["code-owner-review"]).toBe("pass");
  });

  it("credits equivalent classic branch protection the same way", () => {
    const classic = repo({
      defaultBranchProtected: true,
      protectionSource: "branch-protection",
      branchProtection: {
        pattern: "main",
        allowsForcePushes: false,
        allowsDeletions: false,
        requiresApprovingReviews: true,
        requiredApprovingReviewCount: 2,
        requiresCodeOwnerReviews: true,
        dismissesStaleReviews: true,
        requiresStatusChecks: true,
        requiresConversationResolution: true,
        requiresLinearHistory: false,
        requiresCommitSignatures: false,
        isAdminEnforced: true,
        restrictsPushes: false,
      },
    });

    const byId = Object.fromEntries(
      computeScore({ repo: classic }).checks.map((c) => [c.id, c.status]),
    );
    expect(byId["branch-protected"]).toBe("pass");
    expect(byId["force-push-blocked"]).toBe("pass");
    expect(byId["review-required"]).toBe("pass");
    expect(byId["code-owner-review"]).toBe("pass");
  });

  it("treats a ruleset requiring zero approvals as not requiring review", () => {
    const zeroApprovals = repo({
      defaultBranchProtected: true,
      protectionSource: "ruleset",
      rulesets: [
        {
          name: "default",
          enforcement: "ACTIVE",
          target: "BRANCH",
          databaseId: 1,
          source: "Organization",
          ruleTypes: ["PULL_REQUEST"],
          pullRequest: {
            requiredApprovingReviewCount: 0,
            requireCodeOwnerReview: false,
            dismissStaleReviewsOnPush: false,
            requireLastPushApproval: false,
          },
          includes: ["~DEFAULT_BRANCH"],
          excludes: [],
          bypassActors: [],
        },
      ],
    });

    const byId = Object.fromEntries(
      computeScore({ repo: zeroApprovals }).checks.map((c) => [c.id, c.status]),
    );
    expect(byId["review-required"]).toBe("fail");
  });

  it("ignores rulesets that are not actively enforced", () => {
    const evaluateOnly = repo({
      rulesets: [
        {
          name: "draft",
          enforcement: "EVALUATE",
          target: "BRANCH",
          databaseId: 1,
          source: "Repository",
          ruleTypes: ["DELETION", "NON_FAST_FORWARD"],
          pullRequest: null,
          includes: ["~DEFAULT_BRANCH"],
          excludes: [],
          bypassActors: [],
        },
      ],
    });

    const byId = Object.fromEntries(
      computeScore({ repo: evaluateOnly }).checks.map((c) => [c.id, c.status]),
    );
    expect(byId["force-push-blocked"]).toBe("fail");
  });

  it("excludes unknown checks from the denominator instead of failing them", () => {
    const base = repo();
    const withoutData = computeScore({ repo: base });
    const withPinning = computeScore({ repo: base, actionRefs: { total: 4, unpinned: 0 } });

    // Adding a passing check can only raise the score.
    expect(withPinning.percent).toBeGreaterThan(withoutData.percent);
    expect(withoutData.checks.find((c) => c.id === "actions-pinned")?.status).toBe("unknown");
    expect(withoutData.applicableWeight).toBeLessThan(withPinning.applicableWeight);
  });

  it("scores a repository with no workflows as not applicable for pinning", () => {
    const result = computeScore({ repo: repo(), actionRefs: { total: 0, unpinned: 0 } });
    expect(result.checks.find((c) => c.id === "actions-pinned")?.status).toBe("n/a");
  });

  it("fails the alerts check when critical or high alerts are open", () => {
    const result = computeScore({
      repo: repo(),
      alerts: { critical: 1, high: 0, medium: 3, low: 0 },
    });
    expect(result.checks.find((c) => c.id === "no-severe-alerts")?.status).toBe("fail");
  });

  it("passes the alerts check with only medium and low findings", () => {
    const result = computeScore({ repo: repo(), alerts: { critical: 0, high: 0, medium: 2, low: 5 } });
    expect(result.checks.find((c) => c.id === "no-severe-alerts")?.status).toBe("pass");
  });

  it("penalizes invalid CODEOWNERS but still credits its presence", () => {
    const valid = scoreOf({ repo: repo({ hasCodeowners: true }) });
    const invalid = scoreOf({ repo: repo({ hasCodeowners: true, codeownersErrorCount: 3 }) });
    const missing = scoreOf({ repo: repo({ hasCodeowners: false }) });

    expect(valid).toBeGreaterThan(invalid);
    expect(invalid).toBeGreaterThan(missing);
  });

  it("awards a perfect score when every applicable check passes", () => {
    const perfect = computeScore({
      repo: repo({
        defaultBranchProtected: true,
        protectionSource: "branch-protection",
        hasCodeowners: true,
        hasSecurityPolicy: true,
        dependabotAlertsEnabled: true,
        branchProtection: {
          pattern: "main",
          allowsForcePushes: false,
          allowsDeletions: false,
          requiresApprovingReviews: true,
          requiredApprovingReviewCount: 2,
          requiresCodeOwnerReviews: true,
          dismissesStaleReviews: true,
          requiresStatusChecks: true,
          requiresConversationResolution: true,
          requiresLinearHistory: true,
          requiresCommitSignatures: true,
          isAdminEnforced: true,
          restrictsPushes: true,
        },
      }),
      actionRefs: { total: 3, unpinned: 0 },
      alerts: { critical: 0, high: 0, medium: 0, low: 0 },
      security: { secretScanning: true, pushProtection: true },
      adminCollaborators: 0,
    });

    expect(perfect.percent).toBe(100);
    expect(perfect.grade).toBe("A");
    expect(perfect.checks.every((c) => c.status !== "fail")).toBe(true);
  });

  it("maps percentages onto letter grades at the boundaries", () => {
    expect(gradeFor(100)).toBe("A");
    expect(gradeFor(90)).toBe("A");
    expect(gradeFor(89)).toBe("B");
    expect(gradeFor(75)).toBe("B");
    expect(gradeFor(74)).toBe("C");
    expect(gradeFor(60)).toBe("C");
    expect(gradeFor(59)).toBe("D");
    expect(gradeFor(40)).toBe("D");
    expect(gradeFor(39)).toBe("F");
    expect(gradeFor(0)).toBe("F");
  });
});
