export type RefType = "sha" | "tag" | "branch" | "none";

export type RefInfo = {
  ref: string | null;
  type: RefType;
  /** Only a full 40-character commit SHA is an immutable pin. */
  pinned: boolean;
};

export type UsesKind = "action" | "reusable-workflow" | "local" | "docker";

export type UsesRef = {
  raw: string;
  kind: UsesKind;
  /** `owner/repo` for remote refs, the literal path for local ones. */
  name: string;
  owner: string | null;
  /** Subdirectory (composite action) or workflow file (reusable workflow). */
  path: string | null;
  ref: string | null;
  refType: RefType;
  pinned: boolean;
  /** Published by GitHub itself (`actions/*`, `github/*`). */
  firstParty: boolean;
  job: string;
  step: string | null;
};

export type WorkflowPermissions = Record<string, string> | "read-all" | "write-all" | null;

export type ParsedWorkflow = {
  file: string;
  name: string | null;
  triggers: string[];
  /** Triggers that run with repository secrets in a fork-PR context. */
  riskyTriggers: string[];
  permissions: WorkflowPermissions;
  jobs: { name: string; permissions: WorkflowPermissions }[];
  uses: UsesRef[];
  parseError: string | null;
};
