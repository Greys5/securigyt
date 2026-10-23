import type { Maybe } from "@/lib/github/client";
import type { ParsedWorkflow } from "@/lib/parse/workflow";
import type { RepoSummary } from "@/lib/github/collectors/repos";
export type Collaborator = {
  login: string;
  type: string;
  role: string;
  admin: boolean;
  htmlUrl: string;
  avatarUrl: string;
};

export type TeamAccess = {
  name: string;
  slug: string;
  permission: string;
};

export type RulesetRule = {
  type: string;
  parameters: Record<string, unknown> | null;
};

export type RulesetDetail = {
  id: number;
  name: string;
  target: string;
  enforcement: string;
  sourceType: string;
  source: string;
  /** Ref patterns the ruleset applies to, e.g. `~DEFAULT_BRANCH`. */
  includes: string[];
  excludes: string[];
  rules: RulesetRule[];
  bypassActors: { actorType: string; bypassMode: string; actorId: number | null }[];
  htmlUrl: string | null;
};

export type CodeownersFile = {
  path: string;
  text: string;
  /** Non-comment, non-blank rule lines. */
  ruleCount: number;
  owners: string[];
};

export type SecurityAnalysis = {
  advancedSecurity: string | null;
  secretScanning: string | null;
  secretScanningPushProtection: string | null;
  dependabotSecurityUpdates: string | null;
  codeSecurity: string | null;
};

export type RepoDetail = {
  summary: RepoSummary;
  workflows: ParsedWorkflow[];
  workflowsTruncated: string[];
  codeowners: CodeownersFile | null;
  codeownersErrors: { kind: string; line: number; message: string; path: string }[];
  collaborators: Maybe<Collaborator[]>;
  teams: Maybe<TeamAccess[]>;
  rulesets: Maybe<RulesetDetail[]>;
  security: Maybe<SecurityAnalysis>;
};
