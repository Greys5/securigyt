import type {
  BranchProtection,
  RepoSummary,
  RulesetBypassActor,
  RulesetSummary,
} from "@/lib/github/collectors/repos";

export type GovernanceTriFilter = "all" | "yes" | "no";
export type GovernanceCodeownersFilter = "all" | "present" | "missing" | "invalid";
export type GovernanceProtectionSource = "both" | "ruleset" | "branch-protection" | "none";
export type GovernanceSourceFilter = "all" | GovernanceProtectionSource;
export type GovernanceVisibilityFilter = "all" | "public" | "private" | "internal";

export type GovernanceFilters = {
  query: string;
  codeowners: GovernanceCodeownersFilter;
  protection: GovernanceTriFilter;
  bypassActors: GovernanceTriFilter;
  source: GovernanceSourceFilter;
  visibility: GovernanceVisibilityFilter;
  includeArchived: boolean;
};

export const DEFAULT_GOVERNANCE_FILTERS: GovernanceFilters = {
  query: "",
  codeowners: "all",
  protection: "all",
  bypassActors: "all",
  source: "all",
  visibility: "all",
  includeArchived: false,
};

export type GovernanceBypassActor = RulesetBypassActor & {
  key: string;
  label: string;
};

export type EffectiveProtection = {
  source: GovernanceProtectionSource;
  protected: boolean;
  scopes: string[];
  excludes: string[];
  rulesetNames: string[];
  rulesetSources: string[];
  ruleTypes: string[];
  restrictions: string[];
  requiredApprovals: number;
  codeownerReview: boolean;
  forcePushBlocked: boolean;
  deletionBlocked: boolean;
  statusChecks: boolean;
  conversationResolution: boolean;
  linearHistory: boolean;
  commitSignatures: boolean;
  bypassActors: GovernanceBypassActor[];
};

export type ProtectionProfile = EffectiveProtection & {
  id: string;
  label: string;
  repositoryCount: number;
  repositories: string[];
};

export type RepositoryProtectionDetail = {
  key: string;
  kind: "ruleset" | "classic" | "unprotected";
  name: string;
  origin: string;
  organizationLevel: boolean;
  scopes: string[];
  excludes: string[];
  restrictions: string[];
  bypassActors: GovernanceBypassActor[];
};

export type GovernanceOwnerGroup = {
  owner: string;
  type: "team" | "user";
  repositoryCount: number;
  repositories: string[];
  patterns: string[];
};

export type GovernanceBypassGroup = GovernanceBypassActor & {
  repositoryCount: number;
  repositories: string[];
};

export type GovernanceRepositoryIndex = {
  name: string;
  url: string;
  visibility: string;
  archived: boolean;
  defaultBranch: string;
  codeownersStatus: "missing" | "invalid" | "partial" | "valid";
  owners: string[];
  profileId: string;
  protected: boolean;
  source: GovernanceProtectionSource;
  bypassActorCount: number;
};

export type GovernanceReportModel = {
  total: number;
  codeownersPresent: number;
  codeownersMissing: number;
  protected: number;
  unprotected: number;
  governed: number;
  withBypassActors: number;
  profiles: ProtectionProfile[];
  owners: GovernanceOwnerGroup[];
  bypassActors: GovernanceBypassGroup[];
  controlCoverage: { key: string; label: string; value: number }[];
  repositoryIndex: GovernanceRepositoryIndex[];
};

const RULE_LABELS: Record<string, string> = {
  CREATION: "Branch creation controlled",
  UPDATE: "Branch updates controlled",
  DELETION: "Branch deletion blocked",
  NON_FAST_FORWARD: "Force pushes blocked",
  PULL_REQUEST: "Pull request required",
  REQUIRED_STATUS_CHECKS: "Status checks required",
  REQUIRED_REVIEW_THREAD_RESOLUTION: "Conversations resolved",
  REQUIRED_LINEAR_HISTORY: "Linear history required",
  REQUIRED_SIGNATURES: "Signed commits required",
  REQUIRED_DEPLOYMENTS: "Deployments required",
  COMMIT_MESSAGE_PATTERN: "Commit message pattern",
  COMMIT_AUTHOR_EMAIL_PATTERN: "Author email pattern",
  COMMITTER_EMAIL_PATTERN: "Committer email pattern",
  BRANCH_NAME_PATTERN: "Branch naming pattern",
};

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function readable(value: string): string {
  if (value === "~DEFAULT_BRANCH") return "Default branch";
  return value
    .replace(/^refs\/heads\//, "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function activeBranchRulesets(repo: RepoSummary) {
  return repo.rulesets.filter((ruleset) => ruleset.target === "BRANCH" && ruleset.enforcement === "ACTIVE");
}

function bypassActor(actor: RulesetBypassActor): GovernanceBypassActor {
  const key = `${actor.actorType}:${actor.actorName}:${actor.bypassMode}`;
  return {
    ...actor,
    key,
    label: `${actor.actorName} · ${readable(actor.actorType)} · ${readable(actor.bypassMode)}`,
  };
}

export function effectiveProtection(repo: RepoSummary): EffectiveProtection {
  const rulesets = activeBranchRulesets(repo);
  const branch = repo.branchProtection;
  const source: GovernanceProtectionSource = branch && rulesets.length > 0
    ? "both"
    : branch
      ? "branch-protection"
      : rulesets.length > 0
        ? "ruleset"
        : "none";
  const ruleTypes = unique(rulesets.flatMap((ruleset) => ruleset.ruleTypes));
  const pullRequestRules = rulesets.map((ruleset) => ruleset.pullRequest).filter(Boolean);
  const requiredApprovals = Math.max(
    branch?.requiredApprovingReviewCount ?? 0,
    ...pullRequestRules.map((rule) => rule?.requiredApprovingReviewCount ?? 0),
  );
  const codeownerReview = Boolean(branch?.requiresCodeOwnerReviews) || pullRequestRules.some((rule) => rule?.requireCodeOwnerReview);
  const forcePushBlocked = Boolean(branch && !branch.allowsForcePushes) || ruleTypes.includes("NON_FAST_FORWARD");
  const deletionBlocked = Boolean(branch && !branch.allowsDeletions) || ruleTypes.includes("DELETION");
  const statusChecks = Boolean(branch?.requiresStatusChecks) || ruleTypes.includes("REQUIRED_STATUS_CHECKS");
  const conversationResolution = Boolean(branch?.requiresConversationResolution) || ruleTypes.includes("REQUIRED_REVIEW_THREAD_RESOLUTION");
  const linearHistory = Boolean(branch?.requiresLinearHistory) || ruleTypes.includes("REQUIRED_LINEAR_HISTORY");
  const commitSignatures = Boolean(branch?.requiresCommitSignatures) || ruleTypes.includes("REQUIRED_SIGNATURES");
  const protectedBranch = source !== "none";
  const scopes = protectedBranch
    ? unique([
        ...(branch?.pattern ? [readable(branch.pattern)] : []),
        ...rulesets.flatMap((ruleset) => ruleset.includes.map(readable)),
      ])
    : [];
  if (protectedBranch && scopes.length === 0) scopes.push("All matching branches");

  const knownRuleTypes = new Set([
    "DELETION",
    "NON_FAST_FORWARD",
    "PULL_REQUEST",
    "REQUIRED_STATUS_CHECKS",
    "REQUIRED_REVIEW_THREAD_RESOLUTION",
    "REQUIRED_LINEAR_HISTORY",
    "REQUIRED_SIGNATURES",
  ]);
  const restrictions = protectedBranch
    ? unique([
        ...(forcePushBlocked ? ["Force pushes blocked"] : []),
        ...(deletionBlocked ? ["Branch deletion blocked"] : []),
        ...(requiredApprovals > 0 ? [`${requiredApprovals} approving review${requiredApprovals === 1 ? "" : "s"}`] : []),
        ...(codeownerReview ? ["CODEOWNERS review required"] : []),
        ...(statusChecks ? ["Status checks required"] : []),
        ...(conversationResolution ? ["Conversations resolved"] : []),
        ...(linearHistory ? ["Linear history required"] : []),
        ...(commitSignatures ? ["Signed commits required"] : []),
        ...(branch?.dismissesStaleReviews ? ["Stale reviews dismissed"] : []),
        ...(branch?.isAdminEnforced ? ["Administrators included"] : []),
        ...(branch?.restrictsPushes ? ["Push access restricted"] : []),
        ...ruleTypes.filter((rule) => !knownRuleTypes.has(rule)).map((rule) => RULE_LABELS[rule] ?? readable(rule)),
      ])
    : ["No enforced branch controls"];

  const actors = new Map<string, GovernanceBypassActor>();
  for (const actor of rulesets.flatMap((ruleset) => ruleset.bypassActors).map(bypassActor)) actors.set(actor.key, actor);

  return {
    source,
    protected: protectedBranch,
    scopes,
    excludes: unique(rulesets.flatMap((ruleset) => ruleset.excludes.map(readable))),
    rulesetNames: unique(rulesets.map((ruleset) => ruleset.name)),
    rulesetSources: unique(rulesets.map((ruleset) => ruleset.source)),
    ruleTypes,
    restrictions,
    requiredApprovals,
    codeownerReview,
    forcePushBlocked,
    deletionBlocked,
    statusChecks,
    conversationResolution,
    linearHistory,
    commitSignatures,
    bypassActors: [...actors.values()].sort((a, b) => a.label.localeCompare(b.label)),
  };
}

function effectiveSignature(protection: EffectiveProtection): string {
  return JSON.stringify({
    source: protection.source,
    scopes: protection.scopes,
    excludes: protection.excludes,
    ruleTypes: protection.ruleTypes,
    restrictions: protection.restrictions,
    requiredApprovals: protection.requiredApprovals,
    codeownerReview: protection.codeownerReview,
    bypassActors: protection.bypassActors.map((actor) => actor.key),
  });
}

function profileId(signature: string): string {
  let hash = 2166136261;
  for (let index = 0; index < signature.length; index += 1) {
    hash ^= signature.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `P-${(hash >>> 0).toString(36).toUpperCase().padStart(7, "0").slice(0, 7)}`;
}

function sourceLabel(source: GovernanceProtectionSource): string {
  if (source === "both") return "Classic protection + ruleset";
  if (source === "ruleset") return "Ruleset";
  if (source === "branch-protection") return "Classic branch protection";
  return "Unprotected";
}

export function protectionDisplayName(profile: ProtectionProfile): string {
  const rulesetNames = profile.rulesetNames.join(" + ");
  const branchScope = profile.scopes.join(" + ") || "matching branch";
  if (profile.source === "both") {
    return `Ruleset · ${rulesetNames || "Unnamed"} + Classic · ${branchScope}`;
  }
  if (profile.source === "ruleset") return `Ruleset · ${rulesetNames || "Unnamed"}`;
  if (profile.source === "branch-protection") return `Classic · ${branchScope}`;
  return "Unprotected";
}

function rulesetRestrictions(ruleset: RulesetSummary): string[] {
  const types = unique(ruleset.ruleTypes);
  const pullRequest = ruleset.pullRequest;
  const handled = new Set([
    "DELETION",
    "NON_FAST_FORWARD",
    "PULL_REQUEST",
    "REQUIRED_STATUS_CHECKS",
    "REQUIRED_REVIEW_THREAD_RESOLUTION",
    "REQUIRED_LINEAR_HISTORY",
    "REQUIRED_SIGNATURES",
  ]);
  return unique([
    ...(types.includes("DELETION") ? ["Branch deletion blocked"] : []),
    ...(types.includes("NON_FAST_FORWARD") ? ["Force pushes blocked"] : []),
    ...(types.includes("PULL_REQUEST") ? ["Pull request required"] : []),
    ...((pullRequest?.requiredApprovingReviewCount ?? 0) > 0 ? [`${pullRequest?.requiredApprovingReviewCount} approving review${pullRequest?.requiredApprovingReviewCount === 1 ? "" : "s"}`] : []),
    ...(pullRequest?.requireCodeOwnerReview ? ["CODEOWNERS review required"] : []),
    ...(pullRequest?.dismissStaleReviewsOnPush ? ["Stale reviews dismissed"] : []),
    ...(pullRequest?.requireLastPushApproval ? ["Last push approval required"] : []),
    ...(types.includes("REQUIRED_STATUS_CHECKS") ? ["Status checks required"] : []),
    ...(types.includes("REQUIRED_REVIEW_THREAD_RESOLUTION") ? ["Conversations resolved"] : []),
    ...(types.includes("REQUIRED_LINEAR_HISTORY") ? ["Linear history required"] : []),
    ...(types.includes("REQUIRED_SIGNATURES") ? ["Signed commits required"] : []),
    ...types.filter((type) => !handled.has(type)).map((type) => RULE_LABELS[type] ?? readable(type)),
  ]);
}

function classicRestrictions(branch: BranchProtection): string[] {
  return unique([
    ...(!branch.allowsForcePushes ? ["Force pushes blocked"] : []),
    ...(!branch.allowsDeletions ? ["Branch deletion blocked"] : []),
    ...(branch.requiresApprovingReviews ? ["Pull request reviews required"] : []),
    ...((branch.requiredApprovingReviewCount ?? 0) > 0 ? [`${branch.requiredApprovingReviewCount} approving review${branch.requiredApprovingReviewCount === 1 ? "" : "s"}`] : []),
    ...(branch.requiresCodeOwnerReviews ? ["CODEOWNERS review required"] : []),
    ...(branch.dismissesStaleReviews ? ["Stale reviews dismissed"] : []),
    ...(branch.requiresStatusChecks ? ["Status checks required"] : []),
    ...(branch.requiresConversationResolution ? ["Conversations resolved"] : []),
    ...(branch.requiresLinearHistory ? ["Linear history required"] : []),
    ...(branch.requiresCommitSignatures ? ["Signed commits required"] : []),
    ...(branch.isAdminEnforced ? ["Administrators included"] : []),
    ...(branch.restrictsPushes ? ["Push access restricted"] : []),
  ]);
}

export function repositoryProtectionDetails(repo: RepoSummary): RepositoryProtectionDetail[] {
  const rulesets = activeBranchRulesets(repo).map((ruleset): RepositoryProtectionDetail => {
    const organizationLevel = ruleset.source.toLowerCase().includes("organization");
    return {
      key: `ruleset:${ruleset.databaseId ?? ruleset.name}`,
      kind: "ruleset",
      name: `Ruleset · ${ruleset.name}`,
      origin: ruleset.source || "Repository",
      organizationLevel,
      scopes: ruleset.includes.length > 0 ? unique(ruleset.includes.map(readable)) : ["All matching branches"],
      excludes: unique(ruleset.excludes.map(readable)),
      restrictions: rulesetRestrictions(ruleset),
      bypassActors: ruleset.bypassActors.map(bypassActor).sort((a, b) => a.label.localeCompare(b.label)),
    };
  }).sort((a, b) => Number(b.organizationLevel) - Number(a.organizationLevel) || a.name.localeCompare(b.name));

  const classic: RepositoryProtectionDetail[] = repo.branchProtection ? [{
    key: `classic:${repo.branchProtection.pattern}`,
    kind: "classic",
    name: `Classic · ${readable(repo.branchProtection.pattern || repo.defaultBranch || "matching branch")}`,
    origin: "Repository",
    organizationLevel: false,
    scopes: [readable(repo.branchProtection.pattern || repo.defaultBranch || "matching branch")],
    excludes: [],
    restrictions: classicRestrictions(repo.branchProtection),
    bypassActors: [],
  }] : [];

  const details = [...rulesets, ...classic];
  return details.length > 0 ? details : [{
    key: "unprotected",
    kind: "unprotected",
    name: "Unprotected",
    origin: "None",
    organizationLevel: false,
    scopes: [],
    excludes: [],
    restrictions: ["No enforced branch controls"],
    bypassActors: [],
  }];
}

export function sortRepositoriesByRecency(repos: RepoSummary[]): RepoSummary[] {
  return [...repos].sort((a, b) => {
    const recency = (b.pushedAt ? Date.parse(b.pushedAt) : 0) - (a.pushedAt ? Date.parse(a.pushedAt) : 0);
    return recency || a.name.localeCompare(b.name);
  });
}

function codeownersStatus(repo: RepoSummary): GovernanceRepositoryIndex["codeownersStatus"] {
  if (!repo.hasCodeowners) return "missing";
  if (repo.codeownersErrorCount > 0) return "invalid";
  if (repo.codeowners?.truncated) return "partial";
  return "valid";
}

function matchesTriFilter(filter: GovernanceTriFilter, value: boolean): boolean {
  return filter === "all" || (filter === "yes") === value;
}

export function filterGovernanceRepositories(repos: RepoSummary[], filters: GovernanceFilters): RepoSummary[] {
  const query = filters.query.trim().toLowerCase();
  const filtered = repos.filter((repo) => {
    if (!filters.includeArchived && repo.archived) return false;
    if (filters.visibility !== "all" && repo.visibility.toLowerCase() !== filters.visibility) return false;
    if (filters.codeowners === "present" && !repo.hasCodeowners) return false;
    if (filters.codeowners === "missing" && repo.hasCodeowners) return false;
    if (filters.codeowners === "invalid" && (!repo.hasCodeowners || repo.codeownersErrorCount === 0)) return false;
    const protection = effectiveProtection(repo);
    if (!matchesTriFilter(filters.protection, protection.protected)) return false;
    if (!matchesTriFilter(filters.bypassActors, protection.bypassActors.length > 0)) return false;
    if (filters.source !== "all" && protection.source !== filters.source) return false;
    if (query) {
      const searchable = [
        repo.name,
        repo.description ?? "",
        repo.defaultBranch ?? "",
        ...(repo.codeowners?.owners ?? []),
        ...protection.scopes,
        ...protection.rulesetNames,
        ...protection.bypassActors.map((actor) => actor.label),
      ].join(" ").toLowerCase();
      if (!searchable.includes(query)) return false;
    }
    return true;
  });
  return sortRepositoriesByRecency(filtered);
}

export function buildGovernanceReport(repos: RepoSummary[]): GovernanceReportModel {
  const effectiveByRepo = new Map<string, EffectiveProtection>();
  const profileDrafts = new Map<string, { protection: EffectiveProtection; repositories: string[] }>();

  for (const repo of repos) {
    const protection = effectiveProtection(repo);
    effectiveByRepo.set(repo.name, protection);
    const signature = effectiveSignature(protection);
    const current = profileDrafts.get(signature) ?? { protection, repositories: [] };
    current.repositories.push(repo.name);
    current.protection.rulesetNames = unique([...current.protection.rulesetNames, ...protection.rulesetNames]);
    current.protection.rulesetSources = unique([...current.protection.rulesetSources, ...protection.rulesetSources]);
    profileDrafts.set(signature, current);
  }

  const profiles = [...profileDrafts.entries()].map(([signature, draft]): ProtectionProfile => ({
    ...draft.protection,
    id: profileId(signature),
    label: sourceLabel(draft.protection.source),
    repositoryCount: draft.repositories.length,
    repositories: draft.repositories.sort((a, b) => a.localeCompare(b)),
  })).sort((a, b) => Number(b.protected) - Number(a.protected) || b.repositoryCount - a.repositoryCount || a.id.localeCompare(b.id));

  const profileByRepo = new Map<string, ProtectionProfile>();
  for (const profile of profiles) {
    for (const repository of profile.repositories) profileByRepo.set(repository, profile);
  }

  const owners = new Map<string, { type: "team" | "user"; repositories: Set<string>; patterns: Set<string> }>();
  for (const repo of repos) {
    const codeowners = repo.codeowners;
    if (!codeowners) continue;
    const typedOwners = [
      ...codeowners.teams.map((owner) => ({ owner, type: "team" as const })),
      ...codeowners.users.map((owner) => ({ owner, type: "user" as const })),
    ];
    for (const { owner, type } of typedOwners) {
      const current = owners.get(owner) ?? { type, repositories: new Set<string>(), patterns: new Set<string>() };
      current.repositories.add(repo.name);
      codeowners.rules.filter((rule) => rule.owners.includes(owner)).forEach((rule) => current.patterns.add(rule.pattern));
      owners.set(owner, current);
    }
  }

  const ownerGroups: GovernanceOwnerGroup[] = [...owners.entries()].map(([owner, group]) => ({
    owner,
    type: group.type,
    repositoryCount: group.repositories.size,
    repositories: [...group.repositories].sort((a, b) => a.localeCompare(b)),
    patterns: [...group.patterns].sort((a, b) => a.localeCompare(b)),
  })).sort((a, b) => b.repositoryCount - a.repositoryCount || a.owner.localeCompare(b.owner));

  const bypasses = new Map<string, { actor: GovernanceBypassActor; repositories: Set<string> }>();
  for (const repo of repos) {
    const protection = effectiveByRepo.get(repo.name)!;
    for (const actor of protection.bypassActors) {
      const current = bypasses.get(actor.key) ?? { actor, repositories: new Set<string>() };
      current.repositories.add(repo.name);
      bypasses.set(actor.key, current);
    }
  }

  const bypassGroups: GovernanceBypassGroup[] = [...bypasses.values()].map(({ actor, repositories }) => ({
    ...actor,
    repositoryCount: repositories.size,
    repositories: [...repositories].sort((a, b) => a.localeCompare(b)),
  })).sort((a, b) => b.repositoryCount - a.repositoryCount || a.label.localeCompare(b.label));

  const repositoryIndex: GovernanceRepositoryIndex[] = repos.map((repo) => {
    const protection = effectiveByRepo.get(repo.name)!;
    return {
      name: repo.name,
      url: repo.url,
      visibility: repo.visibility.toLowerCase(),
      archived: repo.archived,
      defaultBranch: repo.defaultBranch ?? "—",
      codeownersStatus: codeownersStatus(repo),
      owners: unique([...(repo.codeowners?.teams ?? []), ...(repo.codeowners?.users ?? [])]),
      profileId: profileByRepo.get(repo.name)!.id,
      protected: protection.protected,
      source: protection.source,
      bypassActorCount: protection.bypassActors.length,
    };
  });

  const coverage = (predicate: (protection: EffectiveProtection) => boolean) =>
    repos.filter((repo) => predicate(effectiveByRepo.get(repo.name)!)).length;

  const codeownersPresent = repos.filter((repo) => repo.hasCodeowners).length;
  const protectedCount = coverage((protection) => protection.protected);
  return {
    total: repos.length,
    codeownersPresent,
    codeownersMissing: repos.length - codeownersPresent,
    protected: protectedCount,
    unprotected: repos.length - protectedCount,
    governed: repos.filter((repo) => repo.hasCodeowners && effectiveByRepo.get(repo.name)!.protected).length,
    withBypassActors: coverage((protection) => protection.bypassActors.length > 0),
    profiles,
    owners: ownerGroups,
    bypassActors: bypassGroups,
    controlCoverage: [
      { key: "protected", label: "Branch protection", value: protectedCount },
      { key: "force-push", label: "Force pushes blocked", value: coverage((protection) => protection.forcePushBlocked) },
      { key: "deletion", label: "Deletion blocked", value: coverage((protection) => protection.deletionBlocked) },
      { key: "approval", label: "Approval required", value: coverage((protection) => protection.requiredApprovals > 0) },
      { key: "codeowners-review", label: "CODEOWNERS review", value: coverage((protection) => protection.codeownerReview) },
      { key: "status-checks", label: "Status checks", value: coverage((protection) => protection.statusChecks) },
      { key: "conversations", label: "Conversation resolution", value: coverage((protection) => protection.conversationResolution) },
      { key: "signed-commits", label: "Signed commits", value: coverage((protection) => protection.commitSignatures) },
    ],
    repositoryIndex,
  };
}

function escapeHtml(value: string | number): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function percentage(value: number, total: number): number {
  return Math.round((value / Math.max(1, total)) * 100);
}

function csvCell(value: string | number): string {
  let text = String(value);
  if (/^[=+\-]/.test(text) || /^@(SUM|HYPERLINK|IMPORT|CMD)/i.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function createGroupedGovernanceCsv(repos: RepoSummary[]): string {
  const headers = [
    "repository",
    "last_push",
    "default_branch",
    "protection_names",
    "protection_origins",
    "branch_scopes",
    "restrictions_by_protection",
    "codeowners",
    "bypass_actors",
  ];
  const lines = [headers.map(csvCell).join(",")];
  for (const repo of sortRepositoriesByRecency(repos)) {
    const protections = repositoryProtectionDetails(repo);
    const bypassActors = unique(protections.flatMap((protection) => protection.bypassActors.map((actor) => actor.label)));
    lines.push([
      repo.name,
      repo.pushedAt ?? "",
      repo.defaultBranch ?? "",
      protections.map((protection) => protection.name).join(" | "),
      protections.map((protection) => `${protection.name}: ${protection.organizationLevel ? "Organization" : protection.origin}`).join(" | "),
      protections.map((protection) => `${protection.name}: ${protection.scopes.join(" + ") || "none"}`).join(" | "),
      protections.map((protection) => `${protection.name}: ${protection.restrictions.join(" + ")}`).join(" | "),
      repo.codeowners?.owners.join(" | ") ?? "",
      bypassActors.join(" | "),
    ].map(csvCell).join(","));
  }
  return `\uFEFF${lines.join("\r\n")}`;
}

export function createGovernanceReportHtml({
  repos,
  org,
  generatedAt,
  filterSummary,
}: {
  repos: RepoSummary[];
  org: string;
  generatedAt: Date;
  filterSummary: string;
}): string {
  const report = buildGovernanceReport(repos);
  const ownedPct = percentage(report.codeownersPresent, report.total);
  const protectedPct = percentage(report.protected, report.total);
  const governedPct = percentage(report.governed, report.total);
  const repositoryRowsHtml = sortRepositoriesByRecency(repos).map((repo) => {
    const protections = repositoryProtectionDetails(repo);
    const bypassActors = unique(protections.flatMap((protection) => protection.bypassActors.map((actor) => actor.label)));
    const status = codeownersStatus(repo);
    const protectionHtml = protections.map((protection) => `
      <div class="protection-item ${protection.organizationLevel ? "organization" : protection.kind === "unprotected" ? "unprotected" : ""}">
        <div><strong>${escapeHtml(protection.name)}</strong><span class="origin-badge">${escapeHtml(protection.organizationLevel ? "Organization ✓" : protection.origin)}</span></div>
        <small>Applies to ${escapeHtml(protection.scopes.join(" · ") || "no protected scope")}${protection.excludes.length > 0 ? ` · except ${escapeHtml(protection.excludes.join(" · "))}` : ""}</small>
        <p><b>Restricts:</b> ${escapeHtml(protection.restrictions.join(" · ") || "No restrictions returned")}</p>
      </div>`).join("");
    const bypassHtml = bypassActors.length > 0
      ? bypassActors.map((actor) => `<span class="bypass">${escapeHtml(actor)}</span>`).join("")
      : `<span class="status valid">None</span>`;
    const search = [
      repo.name,
      repo.defaultBranch ?? "",
      ...(repo.codeowners?.owners ?? []),
      ...protections.flatMap((protection) => [protection.name, protection.origin, ...protection.scopes, ...protection.restrictions]),
      ...bypassActors,
    ].join(" ").toLowerCase();
    return `<article class="report-repo-row" data-search="${escapeHtml(search)}">
      <div class="repo-identity"><a href="${escapeHtml(repo.url)}" target="_blank" rel="noreferrer">${escapeHtml(repo.name)}</a><small>Last push ${escapeHtml(repo.pushedAt?.slice(0, 10) ?? "never")}</small><small>Default: ${escapeHtml(repo.defaultBranch ?? "—")}</small>${repo.archived ? `<span class="status partial">Archived</span>` : ""}</div>
      <div class="protections">${protectionHtml}</div>
      <div><span class="status ${status}">${escapeHtml(status)}</span><small>${escapeHtml(repo.codeowners?.owners.join(" · ") || "No team or user owner")}</small></div>
      <div class="bypasses">${bypassHtml}</div>
    </article>`;
  }).join("");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(org)} governance report</title>
<style>
:root{--ink:#132238;--muted:#667085;--line:#d9e1ea;--soft:#f3f6f9;--blue:#2868d7;--teal:#13846f;--amber:#bf7000;--red:#cb3b48}*{box-sizing:border-box}body{margin:0;background:#eef2f6;color:var(--ink);font:13px/1.45 Inter,ui-sans-serif,system-ui,sans-serif}.wrap{max-width:1280px;margin:auto;padding:28px}.hero{padding:28px;border-radius:16px;background:linear-gradient(135deg,#111c2d,#183c58);color:white}.eyebrow,label{font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase}.hero h1{margin:5px 0;font-size:28px}.hero p{margin:0;color:#bdcad9}.meta{display:flex;gap:18px;margin-top:18px;font-size:11px}.toolbar{position:sticky;top:0;z-index:2;display:flex;flex-wrap:wrap;gap:8px;margin:16px 0;padding:10px;border:1px solid var(--line);border-radius:12px;background:#fff}.toolbar input,.toolbar select,.toolbar button{height:34px;border:1px solid var(--line);border-radius:7px;background:white;padding:0 10px;color:var(--ink)}.toolbar input{min-width:260px}.toolbar button{margin-left:auto;background:var(--blue);color:white;border-color:var(--blue);font-weight:700}.kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}.card,.profile,.table-card{margin-top:14px;border:1px solid var(--line);border-radius:12px;background:white;box-shadow:0 1px 2px #11213a0c}.kpi{padding:16px}.kpi label{color:var(--muted)}.kpi strong{display:block;margin-top:4px;font-size:25px}.kpi small,.muted{color:var(--muted)}.charts{display:grid;grid-template-columns:1fr 1.5fr;gap:14px}.card{padding:18px}.card h2,.table-card h2{margin:0;font-size:15px}.card>p,.table-card>header p{margin:3px 0 16px;color:var(--muted);font-size:11px}.donut-layout{display:flex;align-items:center;justify-content:center;gap:28px;min-height:230px}.donut{display:grid;width:150px;height:150px;place-items:center;border-radius:50%;background:conic-gradient(var(--teal) 0 ${governedPct}%,#dae2ea ${governedPct}% 100%)}.donut:after{content:"${governedPct}%";display:grid;width:92px;height:92px;place-items:center;border-radius:50%;background:white;font-size:23px;font-weight:800}.legend p{margin:8px 0}.dot{display:inline-block;width:9px;height:9px;margin-right:7px;border-radius:2px}.bar-row{display:grid;grid-template-columns:155px 1fr 66px;align-items:center;gap:10px;margin:12px 0}.track{height:9px;overflow:hidden;border-radius:5px;background:#e6ebf0}.track i{display:block;height:100%;border-radius:5px;background:linear-gradient(90deg,var(--blue),#16a0a0)}.bar-row strong{text-align:right}.bar-row small{color:var(--muted);font-weight:500}.section-head{display:flex;align-items:end;justify-content:space-between;margin:28px 0 8px}.section-head h2{margin:0;font-size:18px}.section-head p{margin:4px 0 0;color:var(--muted)}.profile{padding:18px}.profile-head{display:flex;align-items:start;justify-content:space-between}.profile-head h3{display:inline;margin:0 0 0 8px;font-size:15px}.profile-id{border-radius:5px;background:#e7effd;padding:4px 7px;color:var(--blue);font:700 10px ui-monospace,monospace}.profile-head>strong{color:var(--blue)}.profile-grid{display:grid;grid-template-columns:1fr 1.35fr 1fr;gap:18px;margin-top:16px}.profile-grid label{display:block;margin-bottom:7px;color:var(--muted)}.chips{display:flex;flex-wrap:wrap;gap:5px}.chip,.status{display:inline-block;border-radius:999px;background:var(--soft);padding:3px 7px;font-size:10px}.origin,.profile small{color:var(--muted);font-size:10px}.profile details{margin-top:12px;border-top:1px solid var(--line);padding-top:10px}.profile summary{cursor:pointer;color:var(--blue);font-weight:700}.profile details p{color:var(--muted);font-size:11px}.table-card{overflow:hidden}.table-card>header{padding:16px 18px 0}.table-wrap{overflow:auto;max-height:620px}table{width:100%;border-collapse:collapse}th,td{border-top:1px solid var(--line);padding:9px 12px;text-align:left;vertical-align:top}th{position:sticky;top:0;background:var(--soft);color:var(--muted);font-size:10px;text-transform:uppercase}td small{display:block;margin-top:2px;color:var(--muted);font-size:10px}td a{color:var(--blue);font-weight:700;text-decoration:none}.status.valid{background:#e0f4ee;color:#08705d}.status.invalid,.status.missing{background:#fde8ea;color:#a82d39}.status.partial{background:#fff2d9;color:#8b5900}.report-foot{padding:24px 0;color:var(--muted);font-size:10px;text-align:center}@media(max-width:800px){.wrap{padding:14px}.kpis{grid-template-columns:repeat(2,1fr)}.charts,.profile-grid{grid-template-columns:1fr}.toolbar{position:static}.toolbar input{min-width:100%;}.toolbar button{margin-left:0}.meta{flex-direction:column;gap:4px}}@media print{body{background:white}.wrap{max-width:none;padding:0}.toolbar{display:none}.hero{print-color-adjust:exact;-webkit-print-color-adjust:exact}.card,.profile,.table-card{break-inside:avoid;box-shadow:none}.table-wrap{max-height:none;overflow:visible}th{position:static}.report-foot{page-break-before:avoid}}
</style><style>
.wrap{max-width:1120px;padding:18px}.hero{padding:16px 18px;border-radius:10px}.hero h1{font-size:20px}.meta{margin-top:8px}.toolbar{margin:10px 0;padding:7px}.toolbar input{min-width:320px;flex:1}.summary{display:flex;flex-wrap:wrap;gap:8px 22px;margin:10px 0;padding:8px 12px;border:1px solid var(--line);border-radius:8px;background:#fff;font-size:11px}.summary strong{margin-right:4px}.section-head{margin:14px 0 6px}.section-head h2{font-size:14px}.profile{display:grid;grid-template-columns:70px minmax(260px,1.05fr) 18px minmax(0,1.5fr) 76px;align-items:center;gap:10px;margin-top:0;padding:8px 12px;border-radius:0;border-width:0 0 1px}.profile[hidden],.repo-row[hidden],.repo-list[hidden],.summary[hidden]{display:none!important}.profile:first-child{border-top:1px solid var(--line)}.profile .reach{font-size:17px}.profile .reach small,.profile small{display:block;color:var(--muted);font-size:9px}.profile h3{margin:0;font-size:11px;line-height:1.35}.profile .arrow{text-align:center;color:var(--muted)}.profile .restrictions{font-size:10px}.profile .warn{color:var(--amber)}.repo-toggle{border:0;background:transparent;padding:4px;color:var(--blue);font-size:9px;font-weight:700;cursor:pointer;text-align:right}.repo-list{grid-column:1/-1;display:grid;grid-template-columns:repeat(auto-fill,minmax(145px,1fr));gap:5px;border-top:1px solid var(--line);padding-top:8px}.repo-chip{overflow:hidden;border:1px solid var(--line);border-radius:5px;background:var(--soft);padding:4px 7px;color:var(--ink);font-size:9px;font-weight:600;text-decoration:none;text-overflow:ellipsis;white-space:nowrap}.repo-chip:hover{border-color:var(--blue);color:var(--blue)}.repo-lookup{margin-top:12px}.repo-lookup>summary{cursor:pointer;padding:10px 12px;font-weight:700}.repo-lookup[open]>summary{border-bottom:1px solid var(--line)}@media(max-width:800px){.profile{grid-template-columns:58px 1fr}.profile .arrow{display:none}.profile .restrictions{grid-column:2}.repo-toggle{grid-column:2;text-align:left}.repo-list{grid-column:1/-1}.toolbar input{min-width:100%}}@media print{.repo-lookup{display:none}.hero{padding:10px}.profile{break-inside:avoid}.repo-toggle,.repo-list{display:none!important}}
</style><style>
.repo-report-head,.report-repo-row{display:grid;grid-template-columns:minmax(150px,.7fr) minmax(380px,1.7fr) minmax(170px,.75fr) minmax(170px,.75fr);gap:12px}.repo-report-head{position:sticky;top:49px;z-index:1;border:1px solid var(--line);background:var(--soft);padding:6px 12px;color:var(--muted);font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}.report-repo-row{border:1px solid var(--line);border-top:0;background:#fff;padding:11px 12px}.report-repo-row[hidden]{display:none!important}.repo-identity a{display:block;overflow:hidden;color:var(--blue);font-weight:700;text-decoration:none;text-overflow:ellipsis}.repo-identity small,.report-repo-row small{display:block;margin-top:3px;color:var(--muted);font-size:9px}.protections{display:grid;gap:6px}.protection-item{border:1px solid var(--line);border-radius:6px;background:var(--soft);padding:7px 9px}.protection-item.organization{border-color:#9fd1c5;background:#f0faf7}.protection-item.unprotected{border-color:#efb8bf;background:#fff5f6}.protection-item strong{font-size:10px}.origin-badge{display:inline-block!important;margin:0 0 0 6px!important;border:1px solid var(--line);border-radius:999px;background:#fff;padding:1px 5px;color:var(--muted)!important}.organization .origin-badge{border-color:#9fd1c5;color:#08705d!important}.protection-item p{margin:4px 0 0;font-size:10px}.bypasses{display:grid;gap:5px}.bypass{border:1px solid #efc176;border-radius:5px;background:#fff8e8;padding:4px 6px;color:#8b5900;font-size:9px}@media(max-width:850px){.repo-report-head{display:none}.report-repo-row{grid-template-columns:1fr}.report-repo-row>div{border-bottom:1px solid var(--line);padding-bottom:8px}.report-repo-row>div:last-child{border:0;padding-bottom:0}}@media print{.report-repo-row{break-inside:avoid}.repo-report-head{position:static}}
</style></head><body><main class="wrap"><header class="hero"><div class="eyebrow">SecuriGit · developer governance</div><h1>${escapeHtml(org)} repository governance</h1><div class="meta"><span>Generated ${escapeHtml(generatedAt.toLocaleString("en-US"))}</span><span>${escapeHtml(filterSummary)}</span></div></header>
<div class="toolbar"><input id="search" type="search" placeholder="Find repository, ruleset, owner, branch, or bypass actor…"><span id="visible-count">${report.total} repos</span><button onclick="window.print()">Print / save PDF</button></div>
<section class="summary"><span><strong>${report.total}</strong> repositories</span><span><strong>${ownedPct}%</strong> CODEOWNERS</span><span><strong>${protectedPct}%</strong> protected</span><span><strong>${governedPct}%</strong> owned + protected</span><span><strong>${report.withBypassActors}</strong> with bypass</span></section>
<section><div class="section-head"><div><h2>Repositories → protections → restrictions</h2><p>Newest push first. Organization rulesets are checked and named explicitly.</p></div><strong><span id="report-count">${report.total}</span> repositories</strong></div><div class="repo-report-head"><span>Repository</span><span>Protection names and restrictions</span><span>CODEOWNERS</span><span>Bypasses</span></div><div id="repository-report">${repositoryRowsHtml}</div></section>
<footer class="report-foot">SecuriGit · ${escapeHtml(org)} · ${escapeHtml(generatedAt.toISOString())}</footer></main>
<script>(()=>{const search=document.getElementById("search");const summary=document.querySelector(".summary");const apply=()=>{const q=search.value.trim().toLowerCase();let visible=0;document.querySelectorAll(".report-repo-row").forEach(row=>{const show=!q||(row.dataset.search||"").includes(q);row.hidden=!show;if(show)visible+=1});document.getElementById("visible-count").textContent=visible+" repos";document.getElementById("report-count").textContent=visible;summary.hidden=Boolean(q)};search.addEventListener("input",apply);apply()})();</script></body></html>`;
}
