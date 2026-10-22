import { describe, expect, it } from "vitest";
import type { RepoSummary } from "@/lib/github/collectors/repos";
import {
  DEFAULT_GOVERNANCE_FILTERS,
  buildGovernanceReport,
  createGovernanceReportHtml,
  createGroupedGovernanceCsv,
  filterGovernanceRepositories,
  protectionDisplayName,
  repositoryProtectionDetails,
} from "./governanceReport";

function repo(overrides: Partial<RepoSummary> = {}): RepoSummary {
  return {
    name: "service-a",
    url: "https://github.com/acme/service-a",
    description: null,
    archived: false,
    isPrivate: true,
    isFork: false,
    visibility: "PRIVATE",
    pushedAt: "2026-09-01T00:00:00Z",
    defaultBranch: "main",
    hasDotGithub: true,
    dotGithubEntries: ["CODEOWNERS"],
    workflowFiles: [],
    hasCodeowners: true,
    codeownersErrorCount: 0,
    codeowners: {
      path: ".github/CODEOWNERS",
      ruleCount: 1,
      owners: ["@acme/platform"],
      teams: ["@acme/platform"],
      users: [],
      emails: [],
      rules: [{ pattern: "*", owners: ["@acme/platform"] }],
      truncated: false,
    },
    hasSecurityPolicy: true,
    dependabotAlertsEnabled: true,
    branchProtection: null,
    rulesets: [{
      name: "organization-default",
      enforcement: "ACTIVE",
      target: "BRANCH",
      databaseId: 1,
      source: "Organization",
      ruleTypes: ["DELETION", "NON_FAST_FORWARD", "PULL_REQUEST", "REQUIRED_STATUS_CHECKS"],
      pullRequest: {
        requiredApprovingReviewCount: 2,
        requireCodeOwnerReview: true,
        dismissStaleReviewsOnPush: false,
        requireLastPushApproval: false,
      },
      includes: ["~DEFAULT_BRANCH"],
      excludes: [],
      bypassActors: [{ actorType: "Team", actorName: "release-admins", bypassMode: "always" }],
    }],
    protectionSource: "ruleset",
    defaultBranchProtected: true,
    ...overrides,
  };
}

describe("grouped governance report", () => {
  it("describes identical effective branch policies once across repositories", () => {
    const report = buildGovernanceReport([
      repo(),
      repo({
        name: "service-b",
        url: "https://github.com/acme/service-b",
        rulesets: [{ ...repo().rulesets[0], name: "renamed-but-equivalent", databaseId: 2 }],
      }),
    ]);

    expect(report.profiles).toHaveLength(1);
    expect(report.profiles[0].repositoryCount).toBe(2);
    expect(report.profiles[0].repositories).toEqual(["service-a", "service-b"]);
    expect(report.profiles[0].scopes).toEqual(["Default branch"]);
    expect(report.profiles[0].restrictions).toContain("Force pushes blocked");
    expect(report.profiles[0].rulesetNames).toEqual(["organization-default", "renamed-but-equivalent"]);
    expect(protectionDisplayName(report.profiles[0])).toBe("Ruleset · organization-default + renamed-but-equivalent");
  });

  it("groups CODEOWNERS and bypass reach without repeating policy rows", () => {
    const report = buildGovernanceReport([repo(), repo({ name: "service-b", url: "https://github.com/acme/service-b" })]);

    expect(report.owners[0]).toMatchObject({ owner: "@acme/platform", repositoryCount: 2 });
    expect(report.bypassActors[0]).toMatchObject({ actorName: "release-admins", repositoryCount: 2 });
    expect(report.repositoryIndex.every((entry) => entry.profileId === report.profiles[0].id)).toBe(true);
  });

  it("filters by owner, source, and bypass exposure", () => {
    const unprotected = repo({
      name: "sandbox",
      url: "https://github.com/acme/sandbox",
      hasCodeowners: false,
      codeowners: null,
      rulesets: [],
      protectionSource: "none",
      defaultBranchProtected: false,
    });
    const rows = [repo(), unprotected];

    expect(filterGovernanceRepositories(rows, { ...DEFAULT_GOVERNANCE_FILTERS, query: "platform" }).map((item) => item.name)).toEqual(["service-a"]);
    expect(filterGovernanceRepositories(rows, { ...DEFAULT_GOVERNANCE_FILTERS, source: "none" }).map((item) => item.name)).toEqual(["sandbox"]);
    expect(filterGovernanceRepositories(rows, { ...DEFAULT_GOVERNANCE_FILTERS, bypassActors: "yes" }).map((item) => item.name)).toEqual(["service-a"]);
  });

  it("orders repositories by latest push and identifies organization protection details", () => {
    const older = repo({ name: "service-a", pushedAt: "2026-09-01T00:00:00Z" });
    const newer = repo({ name: "service-b", pushedAt: "2026-09-12T00:00:00Z" });
    const sorted = filterGovernanceRepositories([older, newer], DEFAULT_GOVERNANCE_FILTERS);
    const protection = repositoryProtectionDetails(newer)[0];

    expect(sorted.map((item) => item.name)).toEqual(["service-b", "service-a"]);
    expect(protection).toMatchObject({
      name: "Ruleset · organization-default",
      origin: "Organization",
      organizationLevel: true,
    });
    expect(protection.restrictions).toContain("CODEOWNERS review required");
  });

  it("exports one CSV row per profile and escapes untrusted HTML", () => {
    const rows = [repo(), repo({ name: "service-b", url: "https://github.com/acme/service-b" })];
    const csv = createGroupedGovernanceCsv(rows);
    expect(csv.trim().split("\n")).toHaveLength(3);
    expect(csv).toContain('"repository"');
    expect(csv).toContain('"protection_names"');
    expect(csv).toContain('"Ruleset · organization-default"');
    expect(csv).not.toContain('"profile_id"');

    const html = createGovernanceReportHtml({
      repos: [repo({ name: "<script>alert(1)</script>" })],
      org: "acme<script>",
      generatedAt: new Date("2026-09-16T12:00:00Z"),
      filterSummary: "all repositories",
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("organization-default");
    expect(html).not.toContain(buildGovernanceReport(rows).profiles[0].id);
    expect(html).toContain(".report-repo-row[hidden]");
    expect(html).toContain("Organization ✓");
    expect(html).toContain("Protection names and restrictions");
  });
});
