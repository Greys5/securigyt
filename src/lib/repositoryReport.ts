import type { RepoSummary, RulesetSummary } from "@/lib/github/collectors/repos";

export type TriFilter = "all" | "yes" | "no";
export type VisibilityFilter = "all" | "public" | "private" | "internal";
export type SortKey = "name" | "pushedAt" | "workflows" | "remediation";
export type RepositoryFocus = "all" | "branch-protection" | "codeowners-missing" | "codeowners-invalid" | "codeowner-review";
export type ReportDepth = "basic" | "deep";

export const REPOSITORY_FOCUS_LABELS: Record<RepositoryFocus, string> = {
  all: "All controls",
  "branch-protection": "Branch protection scope and restrictions",
  "codeowners-missing": "Missing CODEOWNERS",
  "codeowners-invalid": "Invalid CODEOWNERS",
  "codeowner-review": "CODEOWNERS review not enforced",
};

export type RepositoryFilters = {
  query: string;
  repository: string;
  dotGithub: TriFilter;
  codeowners: TriFilter;
  protection: TriFilter;
  rulesets: TriFilter;
  bypassActors: TriFilter;
  remediation: TriFilter;
  visibility: VisibilityFilter;
  includeArchived: boolean;
  sort: SortKey;
  focus: RepositoryFocus;
};

export const DEFAULT_REPOSITORY_FILTERS: RepositoryFilters = {
  query: "",
  repository: "",
  dotGithub: "all",
  codeowners: "all",
  protection: "all",
  rulesets: "all",
  bypassActors: "all",
  remediation: "all",
  visibility: "all",
  includeArchived: false,
  sort: "name",
  focus: "all",
};

function matches(filter: TriFilter, value: boolean): boolean {
  return filter === "all" || (filter === "yes") === value;
}

function activeBranchRulesets(repo: RepoSummary): RulesetSummary[] {
  return repo.rulesets.filter((ruleset) => ruleset.target === "BRANCH" && ruleset.enforcement === "ACTIVE");
}

function rulesetHas(repo: RepoSummary, type: string): boolean {
  return activeBranchRulesets(repo).some((ruleset) => ruleset.ruleTypes.includes(type));
}

function forcePushesAllowed(repo: RepoSummary): boolean {
  return (repo.branchProtection?.allowsForcePushes ?? true) && !rulesetHas(repo, "NON_FAST_FORWARD");
}

function deletionsAllowed(repo: RepoSummary): boolean {
  return (repo.branchProtection?.allowsDeletions ?? true) && !rulesetHas(repo, "DELETION");
}

function matchesFocus(repo: RepoSummary, focus: RepositoryFocus): boolean {
  if (focus === "codeowners-missing") return !repo.hasCodeowners;
  if (focus === "codeowners-invalid") return repo.hasCodeowners && repo.codeownersErrorCount > 0;
  if (focus === "codeowner-review") return repositoryRemediation(repo).includes("Require CODEOWNERS review");
  return true;
}

export function repositoryFiltersForView(view: string | undefined, repository = ""): RepositoryFilters {
  const focus = Object.hasOwn(REPOSITORY_FOCUS_LABELS, view ?? "") ? view as RepositoryFocus : "all";
  return {
    ...DEFAULT_REPOSITORY_FILTERS,
    repository,
    focus,
    includeArchived: focus === "branch-protection",
    sort: focus === "all" || focus === "branch-protection" ? "name" : "remediation",
  };
}

export function repositoryRemediation(repo: RepoSummary): string[] {
  const actions: string[] = [];
  const protection = repo.branchProtection;
  const pullRequestRules = activeBranchRulesets(repo).map((ruleset) => ruleset.pullRequest).filter(Boolean);
  const reviewRequired =
    Boolean(protection?.requiresApprovingReviews && (protection.requiredApprovingReviewCount ?? 0) > 0) ||
    pullRequestRules.some((rule) => (rule?.requiredApprovingReviewCount ?? 0) > 0);
  const codeOwnerReview =
    Boolean(protection?.requiresCodeOwnerReviews) || pullRequestRules.some((rule) => rule?.requireCodeOwnerReview);

  if (!repo.hasCodeowners) actions.push("Add CODEOWNERS");
  else if (repo.codeownersErrorCount > 0) actions.push("Fix CODEOWNERS validation errors");
  if (!repo.defaultBranchProtected) actions.push("Protect the default branch");
  if (repo.defaultBranchProtected && forcePushesAllowed(repo)) {
    actions.push("Block force pushes");
  }
  if (repo.defaultBranchProtected && deletionsAllowed(repo)) {
    actions.push("Block branch deletion");
  }
  if (repo.defaultBranchProtected && !reviewRequired) actions.push("Require an approving pull request review");
  if (repo.hasCodeowners && repo.defaultBranchProtected && !codeOwnerReview) actions.push("Require CODEOWNERS review");

  return actions;
}

export function filterRepositories(repos: RepoSummary[], filters: RepositoryFilters): RepoSummary[] {
  const query = filters.query.trim().toLowerCase();
  return repos
    .filter((repo) => {
      if (!filters.includeArchived && repo.archived) return false;
      if (filters.repository && repo.name !== filters.repository) return false;
      if (
        query &&
        !repo.name.toLowerCase().includes(query) &&
        !(repo.description ?? "").toLowerCase().includes(query) &&
        !repo.codeowners?.owners.some((owner) => owner.toLowerCase().includes(query))
      ) return false;
      if (filters.visibility !== "all" && repo.visibility.toLowerCase() !== filters.visibility) return false;
      if (!matches(filters.dotGithub, repo.hasDotGithub)) return false;
      if (!matches(filters.codeowners, repo.hasCodeowners)) return false;
      if (!matches(filters.protection, repo.defaultBranchProtected)) return false;
      if (!matches(filters.rulesets, repo.rulesets.length > 0)) return false;
      if (!matches(filters.bypassActors, repo.rulesets.some((ruleset) => ruleset.bypassActors.length > 0))) return false;
      if (!matches(filters.remediation, repositoryRemediation(repo).length > 0)) return false;
      if (!matchesFocus(repo, filters.focus)) return false;
      return true;
    })
    .sort((a, b) => {
      if (filters.sort === "name") return a.name.localeCompare(b.name);
      if (filters.sort === "workflows") return b.workflowFiles.length - a.workflowFiles.length;
      if (filters.sort === "remediation") return repositoryRemediation(b).length - repositoryRemediation(a).length;
      return (b.pushedAt ?? "").localeCompare(a.pushedAt ?? "");
    });
}

function join(values: string[]): string {
  return values.join(" | ");
}

function csvCell(value: string | number | boolean | null | undefined): string {
  let text = value == null ? "" : String(value);
  if (/^[=+\-]/.test(text) || /^@(SUM|HYPERLINK|IMPORT|CMD)/i.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export const REPOSITORY_REPORT_HEADERS = [
  "repository",
  "url",
  "visibility",
  "archived",
  "default_branch",
  "has_codeowners",
  "codeowners_path",
  "codeowners_rule_count",
  "codeowners_rules",
  "codeowners_owners",
  "codeowners_teams",
  "codeowners_users",
  "codeowners_emails",
  "codeowners_validation_errors",
  "codeowners_truncated",
  "default_branch_protected",
  "protection_source",
  "protected_patterns",
  "protection_rules",
  "required_approvals",
  "codeowner_review_required",
  "ruleset_names",
  "ruleset_sources",
  "ruleset_includes",
  "ruleset_excludes",
  "bypass_actors",
  "force_pushes_allowed",
  "deletions_allowed",
  "remediation_needed",
  "remediation_actions",
  "remediation_selected",
  "last_push",
] as const;

const BASIC_BASE_HEADERS = ["repository", "url", "default_branch"] as const;
const BASIC_CODEOWNERS_HEADERS = ["codeowners_status", "codeowners_teams", "codeowners_scope"] as const;
const BASIC_PROTECTION_HEADERS = ["protection_status", "protection_source", "protected_patterns", "required_approvals", "codeowner_review_required", "bypass_actors"] as const;
const BASIC_REMEDIATION_HEADERS = ["remediation_actions", "remediation_selected"] as const;

export function basicRepositoryReportHeaders(filters: RepositoryFilters, hasSelections = false): string[] {
  const codeownersScoped = filters.codeowners !== "all" || filters.focus.startsWith("codeowner");
  const protectionScoped = filters.protection !== "all" || filters.rulesets !== "all" || filters.bypassActors !== "all" || filters.focus === "branch-protection";
  const remediationScoped = filters.remediation !== "all" || (filters.focus !== "all" && filters.focus !== "branch-protection") || hasSelections;

  if (!codeownersScoped && !protectionScoped && !remediationScoped) {
    return [...BASIC_BASE_HEADERS, "visibility", "codeowners_status", "codeowners_teams", "protection_status", "remediation_actions"];
  }

  return [
    ...BASIC_BASE_HEADERS,
    ...(codeownersScoped ? BASIC_CODEOWNERS_HEADERS : []),
    ...(protectionScoped ? BASIC_PROTECTION_HEADERS : []),
    ...(remediationScoped ? BASIC_REMEDIATION_HEADERS : []),
  ];
}

export function repositoryReportRecord(repo: RepoSummary, selected: boolean): Record<(typeof REPOSITORY_REPORT_HEADERS)[number], string | number | boolean | null> {
  const rulesets = activeBranchRulesets(repo);
  const pullRequestRules = rulesets.map((ruleset) => ruleset.pullRequest).filter(Boolean);
  const requiredApprovals = Math.max(
    repo.branchProtection?.requiredApprovingReviewCount ?? 0,
    ...pullRequestRules.map((rule) => rule?.requiredApprovingReviewCount ?? 0),
  );
  const codeownerReview =
    Boolean(repo.branchProtection?.requiresCodeOwnerReviews) || pullRequestRules.some((rule) => rule?.requireCodeOwnerReview);
  const remediations = repositoryRemediation(repo);
  const patterns = [
    ...(repo.branchProtection?.pattern ? [repo.branchProtection.pattern] : []),
    ...rulesets.flatMap((ruleset) => ruleset.includes),
  ];
  const ruleTypes = [
    ...(repo.branchProtection
      ? [
          repo.branchProtection.requiresApprovingReviews ? "PULL_REQUEST" : "",
          !repo.branchProtection.allowsDeletions ? "DELETION" : "",
          !repo.branchProtection.allowsForcePushes ? "NON_FAST_FORWARD" : "",
          repo.branchProtection.requiresStatusChecks ? "REQUIRED_STATUS_CHECKS" : "",
          repo.branchProtection.requiresConversationResolution ? "REQUIRED_REVIEW_THREAD_RESOLUTION" : "",
          repo.branchProtection.requiresLinearHistory ? "REQUIRED_LINEAR_HISTORY" : "",
          repo.branchProtection.requiresCommitSignatures ? "REQUIRED_SIGNATURES" : "",
        ].filter(Boolean)
      : []),
    ...rulesets.flatMap((ruleset) => ruleset.ruleTypes),
  ];

  return {
    repository: repo.name,
    url: repo.url,
    visibility: repo.visibility.toLowerCase(),
    archived: repo.archived,
    default_branch: repo.defaultBranch,
    has_codeowners: repo.hasCodeowners,
    codeowners_path: repo.codeowners?.path ?? null,
    codeowners_rule_count: repo.codeowners?.ruleCount ?? 0,
    codeowners_rules: join(repo.codeowners?.rules.map((rule) => `${rule.pattern} => ${rule.owners.join(" ")}`) ?? []),
    codeowners_owners: join(repo.codeowners?.owners ?? []),
    codeowners_teams: join(repo.codeowners?.teams ?? []),
    codeowners_users: join(repo.codeowners?.users ?? []),
    codeowners_emails: join(repo.codeowners?.emails ?? []),
    codeowners_validation_errors: repo.codeownersErrorCount,
    codeowners_truncated: repo.codeowners?.truncated ?? false,
    default_branch_protected: repo.defaultBranchProtected,
    protection_source: repo.branchProtection && rulesets.length > 0 ? "branch-protection + ruleset" : repo.protectionSource,
    protected_patterns: join([...new Set(patterns)]),
    protection_rules: join([...new Set(ruleTypes)]),
    required_approvals: requiredApprovals,
    codeowner_review_required: codeownerReview,
    ruleset_names: join(rulesets.map((ruleset) => ruleset.name)),
    ruleset_sources: join(rulesets.map((ruleset) => ruleset.source)),
    ruleset_includes: join(rulesets.flatMap((ruleset) => ruleset.includes)),
    ruleset_excludes: join(rulesets.flatMap((ruleset) => ruleset.excludes)),
    bypass_actors: join(rulesets.flatMap((ruleset) => ruleset.bypassActors.map((actor) => `${actor.actorType}:${actor.actorName} (${actor.bypassMode})`))),
    force_pushes_allowed: forcePushesAllowed(repo),
    deletions_allowed: deletionsAllowed(repo),
    remediation_needed: remediations.length > 0,
    remediation_actions: join(remediations),
    remediation_selected: selected,
    last_push: repo.pushedAt,
  };
}

export function createRepositoryReportCsv(repos: RepoSummary[], selectedNames: ReadonlySet<string>): string {
  const lines = [REPOSITORY_REPORT_HEADERS.map(csvCell).join(",")];
  for (const repo of repos) {
    const record = repositoryReportRecord(repo, selectedNames.has(repo.name));
    lines.push(REPOSITORY_REPORT_HEADERS.map((header) => csvCell(record[header])).join(","));
  }
  return `\uFEFF${lines.join("\r\n")}`;
}

export function createBasicRepositoryReportCsv(
  repos: RepoSummary[],
  selectedNames: ReadonlySet<string>,
  filters: RepositoryFilters,
): string {
  const headers = basicRepositoryReportHeaders(filters, selectedNames.size > 0);
  const lines = [headers.map(csvCell).join(",")];

  for (const repo of repos) {
    const deep = repositoryReportRecord(repo, selectedNames.has(repo.name));
    const record: Record<string, string | number | boolean | null> = {
      ...deep,
      codeowners_status: repo.hasCodeowners ? "present" : "missing",
      codeowners_scope: deep.codeowners_rules,
      protection_status: repo.defaultBranchProtected ? "protected" : "unprotected",
    };
    lines.push(headers.map((header) => csvCell(record[header])).join(","));
  }

  return `\uFEFF${lines.join("\r\n")}`;
}
