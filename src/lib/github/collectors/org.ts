import type { Maybe } from "@/lib/github/client";
export type OrgProfile = {
  login: string;
  name: string | null;
  plan: string | null;
  publicRepos: number;
  privateRepos: number;
  twoFactorRequired: boolean | null;
  defaultRepositoryPermission: string | null;
  membersCanCreateRepositories: boolean | null;
  membersCanCreatePublicRepositories: boolean | null;
  membersCanForkPrivateRepositories: boolean | null;
  webCommitSignoffRequired: boolean | null;
  advancedSecurityEnabledForNewRepos: boolean | null;
  secretScanningEnabledForNewRepos: boolean | null;
  secretScanningPushProtectionForNewRepos: boolean | null;
  dependabotAlertsEnabledForNewRepos: boolean | null;
  dependabotSecurityUpdatesEnabledForNewRepos: boolean | null;
};

export type OrgRuleset = {
  id: number;
  name: string;
  target: string;
  enforcement: string;
  ruleTypes: string[];
  bypassActorCount: number;
  htmlUrl: string | null;
};

export type InstalledApp = {
  id: number;
  appId: number;
  appSlug: string;
  repositorySelection: string;
  permissions: Record<string, string>;
  events: string[];
  createdAt: string | null;
  suspendedAt: string | null;
  htmlUrl: string | null;
};

export type OrgToken = {
  id: number;
  owner: string;
  repositorySelection: string;
  repositoryCount: number | null;
  permissions: Record<string, string>;
  accessGrantedAt: string | null;
  tokenExpired: boolean | null;
  tokenExpiresAt: string | null;
};

export type OrgWebhook = {
  id: number;
  name: string;
  active: boolean;
  events: string[];
  url: string | null;
  insecureSsl: boolean;
  hasSecret: boolean;
};

export type OrgMemberStats = {
  total: number;
  admins: number;
  members: number;
  outsideCollaborators: number | null;
  twoFactorDisabled: number | null;
  adminLogins: string[];
};

export type ActionsPolicy = {
  enabledRepositories: string;
  allowedActions: string | null;
  githubOwnedAllowed: boolean | null;
  verifiedAllowed: boolean | null;
  patternsAllowed: string[] | null;
  defaultWorkflowPermissions: string | null;
  canApprovePullRequestReviews: boolean | null;
};

export type OrgOverview = {
  profile: Maybe<OrgProfile>;
  rulesets: Maybe<OrgRuleset[]>;
  apps: Maybe<InstalledApp[]>;
  tokens: Maybe<OrgToken[]>;
  pendingTokenRequests: Maybe<number>;
  webhooks: Maybe<OrgWebhook[]>;
  members: Maybe<OrgMemberStats>;
  actionsPolicy: Maybe<ActionsPolicy>;
};
