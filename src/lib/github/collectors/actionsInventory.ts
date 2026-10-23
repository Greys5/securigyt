import type { RefType, UsesKind } from "@/lib/parse/workflow";
export type ActionUsageSite = {
  repo: string;
  workflow: string;
  job: string;
  step: string | null;
  ref: string | null;
  refType: RefType;
  pinned: boolean;
};

export type ActionVersion = {
  ref: string | null;
  refType: RefType;
  pinned: boolean;
  count: number;
  repos: string[];
};

export type ActionUsage = {
  name: string;
  kind: UsesKind;
  firstParty: boolean;
  totalRefs: number;
  repoCount: number;
  unpinnedRefs: number;
  versions: ActionVersion[];
  sites: ActionUsageSite[];
};

export type WorkflowFlag = {
  repo: string;
  workflow: string;
  name: string | null;
  reason: string;
  detail: string;
};

export type ActionsInventory = {
  scannedRepos: number;
  workflowCount: number;
  totalRefs: number;
  unpinnedRefs: number;
  distinctActions: number;
  actions: ActionUsage[];
  /** Workflows worth a second look: risky triggers or broad token permissions. */
  flagged: WorkflowFlag[];
  errors: string[];
};
