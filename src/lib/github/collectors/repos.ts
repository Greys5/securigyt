import type { CodeownerRule } from "@/lib/parse/codeowners";
export type PullRequestRuleParams = {
  requiredApprovingReviewCount: number | null;
  requireCodeOwnerReview: boolean;
  dismissStaleReviewsOnPush: boolean;
  requireLastPushApproval: boolean;
};

export type RulesetSummary = {
  name: string;
  enforcement: string;
  target: string;
  databaseId: number | null;
  source: string;
  /** Uppercase rule types, e.g. DELETION, NON_FAST_FORWARD, PULL_REQUEST. */
  ruleTypes: string[];
  pullRequest: PullRequestRuleParams | null;
  includes: string[];
  excludes: string[];
  bypassActors: RulesetBypassActor[];
};

export type RulesetBypassActor = {
  actorType: string;
  actorName: string;
  bypassMode: string;
};

export type CodeownersSummary = {
  path: string;
  ruleCount: number;
  owners: string[];
  teams: string[];
  users: string[];
  emails: string[];
  rules: CodeownerRule[];
  truncated: boolean;
};

export type BranchProtection = {
  pattern: string;
  allowsForcePushes: boolean;
  allowsDeletions: boolean;
  requiresApprovingReviews: boolean;
  requiredApprovingReviewCount: number | null;
  requiresCodeOwnerReviews: boolean;
  dismissesStaleReviews: boolean;
  requiresStatusChecks: boolean;
  requiresConversationResolution: boolean;
  requiresLinearHistory: boolean;
  requiresCommitSignatures: boolean;
  isAdminEnforced: boolean;
  restrictsPushes: boolean;
};

export type ProtectionSource = "branch-protection" | "ruleset" | "none";

export type RepoSummary = {
  name: string;
  url: string;
  description: string | null;
  archived: boolean;
  isPrivate: boolean;
  isFork: boolean;
  visibility: string;
  pushedAt: string | null;
  defaultBranch: string | null;

  hasDotGithub: boolean;
  dotGithubEntries: string[];
  workflowFiles: string[];

  hasCodeowners: boolean;
  codeownersErrorCount: number;
  codeowners: CodeownersSummary | null;

  hasSecurityPolicy: boolean;
  dependabotAlertsEnabled: boolean;

  branchProtection: BranchProtection | null;
  rulesets: RulesetSummary[];
  protectionSource: ProtectionSource;
  defaultBranchProtected: boolean;
};

export type RepoInventory = {
  org: string;
  totalCount: number;
  repos: RepoSummary[];
  /** Repos GitHub refused to resolve, so the UI can say so instead of silently dropping them. */
  errors: string[];
};
