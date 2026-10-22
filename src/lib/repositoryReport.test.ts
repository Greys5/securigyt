import { describe, expect, it } from "vitest";
import type { RepoSummary } from "@/lib/github/collectors/repos";
import {
  DEFAULT_REPOSITORY_FILTERS,
  basicRepositoryReportHeaders,
  createBasicRepositoryReportCsv,
  createRepositoryReportCsv,
  filterRepositories,
  repositoryFiltersForView,
  repositoryRemediation,
  repositoryReportRecord,
} from "./repositoryReport";

function repo(overrides: Partial<RepoSummary> = {}): RepoSummary {
  return {
    name: "demo",
    url: "https://github.com/acme/demo",
    description: null,
    archived: false,
    isPrivate: true,
    isFork: false,
    visibility: "PRIVATE",
    pushedAt: "2026-08-01T00:00:00Z",
    defaultBranch: "main",
    hasDotGithub: true,
    dotGithubEntries: ["CODEOWNERS"],
    workflowFiles: [],
    hasCodeowners: true,
    codeownersErrorCount: 0,
    codeowners: {
      path: ".github/CODEOWNERS",
      ruleCount: 1,
      owners: ["@acme/security"],
      teams: ["@acme/security"],
      users: [],
      emails: [],
      rules: [{ pattern: "*", owners: ["@acme/security"] }],
      truncated: false,
    },
    hasSecurityPolicy: true,
    dependabotAlertsEnabled: true,
    branchProtection: null,
    rulesets: [{
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
      bypassActors: [{ actorType: "Team", actorName: "security-admins", bypassMode: "always" }],
    }],
    protectionSource: "ruleset",
    defaultBranchProtected: true,
    ...overrides,
  };
}

describe("repository reporting", () => {
  it("combines CODEOWNERS and protection filters", () => {
    const rows = [repo(), repo({ name: "owners-only", defaultBranchProtected: false, protectionSource: "none", rulesets: [] }), repo({ name: "neither", hasCodeowners: false, codeowners: null, defaultBranchProtected: false, protectionSource: "none", rulesets: [] })];
    const filtered = filterRepositories(rows, { ...DEFAULT_REPOSITORY_FILTERS, codeowners: "yes", protection: "yes" });
    expect(filtered.map((row) => row.name)).toEqual(["demo"]);
  });

  it("searches by CODEOWNERS handle", () => {
    const rows = filterRepositories([repo()], { ...DEFAULT_REPOSITORY_FILTERS, query: "security" });
    expect(rows).toHaveLength(1);
  });

  it("exports normalized owners, rules, protections, bypass actors, and remediation selection", () => {
    const record = repositoryReportRecord(repo(), true);
    expect(record.codeowners_teams).toBe("@acme/security");
    expect(record.codeowners_rules).toBe("* => @acme/security");
    expect(record.protected_patterns).toBe("~DEFAULT_BRANCH");
    expect(record.bypass_actors).toContain("Team:security-admins (always)");
    expect(record.codeowners_truncated).toBe(false);
    expect(record.remediation_selected).toBe(true);

    const csv = createRepositoryReportCsv([repo()], new Set(["demo"]));
    expect(csv).toContain('"codeowners_teams"');
    expect(csv).toContain('"@acme/security"');
    expect(csv).toContain('"true"');
  });

  it("creates a focused Basic CODEOWNERS report without audit-only columns", () => {
    const filters = { ...DEFAULT_REPOSITORY_FILTERS, codeowners: "yes" as const };
    const headers = basicRepositoryReportHeaders(filters);
    const csv = createBasicRepositoryReportCsv([repo()], new Set(), filters);

    expect(headers).toEqual([
      "repository",
      "url",
      "default_branch",
      "codeowners_status",
      "codeowners_teams",
      "codeowners_scope",
    ]);
    expect(csv).toContain('"codeowners_teams"');
    expect(csv).not.toContain('"codeowners_emails"');
    expect(csv).not.toContain('"codeowners_validation_errors"');
  });

  it("creates an all-repository Basic branch protection report", () => {
    const filters = repositoryFiltersForView("branch-protection");
    const archived = repo({ name: "archived", archived: true });
    const rows = filterRepositories([archived], filters);
    const headers = basicRepositoryReportHeaders(filters);

    expect(rows).toHaveLength(1);
    expect(filters.includeArchived).toBe(true);
    expect(headers).toEqual([
      "repository",
      "url",
      "default_branch",
      "protection_status",
      "protection_source",
      "protected_patterns",
      "required_approvals",
      "codeowner_review_required",
      "bypass_actors",
    ]);
  });

  it("scopes CODEOWNERS remediation views to the requested finding", () => {
    const missing = repo({ name: "missing", hasCodeowners: false, codeowners: null });
    const invalid = repo({ name: "invalid", codeownersErrorCount: 2 });
    const valid = repo({ name: "valid" });

    expect(filterRepositories([missing, invalid, valid], repositoryFiltersForView("codeowners-missing")).map((row) => row.name)).toEqual(["missing"]);
    expect(filterRepositories([missing, invalid, valid], repositoryFiltersForView("codeowners-invalid")).map((row) => row.name)).toEqual(["invalid"]);
  });

  it("recommends the missing governance controls", () => {
    const actions = repositoryRemediation(repo({ hasCodeowners: false, codeowners: null, defaultBranchProtected: false, protectionSource: "none", rulesets: [] }));
    expect(actions).toEqual(["Add CODEOWNERS", "Protect the default branch"]);
  });

  it("uses the most restrictive branch rule and ruleset combination", () => {
    const record = repositoryReportRecord(repo({
      branchProtection: {
        pattern: "main",
        allowsForcePushes: true,
        allowsDeletions: true,
        requiresApprovingReviews: true,
        requiredApprovingReviewCount: 1,
        requiresCodeOwnerReviews: true,
        dismissesStaleReviews: false,
        requiresStatusChecks: false,
        requiresConversationResolution: false,
        requiresLinearHistory: false,
        requiresCommitSignatures: false,
        isAdminEnforced: true,
        restrictsPushes: false,
      },
    }), false);

    expect(record.protection_source).toBe("branch-protection + ruleset");
    expect(record.force_pushes_allowed).toBe(false);
    expect(record.deletions_allowed).toBe(false);
  });

  it("neutralizes spreadsheet formulas in exported cells", () => {
    const csv = createRepositoryReportCsv([repo({ name: "=HYPERLINK(\"bad\")" })], new Set());
    expect(csv).toContain("'=HYPERLINK");
  });
});
