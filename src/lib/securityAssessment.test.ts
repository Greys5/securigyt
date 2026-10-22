import { describe, it, expect } from "vitest";
import type { RepoSummary, RulesetSummary } from "./github/collectors/repos";
import { assessRepository, assessmentCsv } from "./securityAssessment";

const rule = (includes: string[], count = 0): RulesetSummary => ({ name: "review", enforcement: "ACTIVE", target: "BRANCH", databaseId: 1, source: "Organization", ruleTypes: ["PULL_REQUEST"], pullRequest: { requiredApprovingReviewCount: count, requireCodeOwnerReview: true, dismissStaleReviewsOnPush: false, requireLastPushApproval: false }, includes, excludes: [], bypassActors: [] });
const repo = (rulesets: RulesetSummary[], hasCodeowners = true) => ({ name: "service", defaultBranch: "main", rulesets, branchProtection: null, hasCodeowners, codeownersErrorCount: 0, codeowners: hasCodeowners ? { rules: [{ pattern: "*", owners: ["@org/team"] }], ruleCount: 1 } : null, dependabotAlertsEnabled: true, hasSecurityPolicy: false }) as RepoSummary;

describe("security assessment enforcement", () => {
  it("treats zero approvals plus owner review as conditional", () => {
    expect(assessRepository(repo([rule(["~DEFAULT_BRANCH"])]))[0].status).toBe("conditional");
    expect(assessRepository(repo([rule(["~DEFAULT_BRANCH"])], false))[0].status).toBe("gap");
  });
  it("does not count approvals on a different branch", () => {
    expect(assessRepository(repo([rule(["refs/heads/release"], 2)]))[0].status).toBe("gap");
  });
  it("uses the strongest applicable approval requirement", () => {
    expect(assessRepository(repo([rule(["~DEFAULT_BRANCH"]), rule(["main"], 2)]))[0].status).toBe("observed");
  });
  it("keeps complex scope and missing audit evidence unassessed", () => {
    const findings = assessRepository(repo([rule(["release/*"], 2)]));
    expect(findings[0].status).toBe("not assessed");
    expect(findings.find((f) => f.control === "Audit trail")?.status).toBe("not assessed");
    expect(assessmentCsv([{ ...findings[0], repo: "=HYPERLINK()" }])).toContain("'=HYPERLINK()");
  });
});
