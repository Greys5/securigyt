/**
 * GitHub Actions workflow parser.
 *
 * Extracts every `uses:` reference plus the security-relevant workflow
 * metadata (triggers, permissions) so the UI can answer "which actions, at
 * which versions, and are they pinned?" without a second network round trip.
 */

import { parse as parseYaml } from "yaml";

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

const SHA_RE = /^[0-9a-f]{40}$/i;
const TAG_RE = /^v?\d+(\.\d+)*([-+][0-9A-Za-z.-]+)?$/;

/**
 * Triggers that grant a write token / secrets to code that an outside
 * contributor controls. Worth surfacing next to unpinned actions.
 */
const RISKY_TRIGGERS = new Set(["pull_request_target", "workflow_run"]);

const FIRST_PARTY_OWNERS = new Set(["actions", "github"]);

export function classifyRef(ref: string | null | undefined): RefInfo {
  if (!ref) return { ref: null, type: "none", pinned: false };
  if (SHA_RE.test(ref)) return { ref, type: "sha", pinned: true };
  if (TAG_RE.test(ref)) return { ref, type: "tag", pinned: false };
  return { ref, type: "branch", pinned: false };
}

/** Parse one `uses:` value into its identity + version parts. */
export function parseUses(raw: string, job: string, step: string | null): UsesRef {
  const value = raw.trim();

  if (value.startsWith("docker://")) {
    return {
      raw: value,
      kind: "docker",
      name: value.slice("docker://".length),
      owner: null,
      path: null,
      ref: null,
      refType: "none",
      pinned: false,
      firstParty: false,
      job,
      step,
    };
  }

  if (value.startsWith("./") || value.startsWith("../")) {
    // Local actions live in the repo itself, so they move with its own history.
    return {
      raw: value,
      kind: "local",
      name: value,
      owner: null,
      path: value,
      ref: null,
      refType: "none",
      pinned: true,
      firstParty: false,
      job,
      step,
    };
  }

  const at = value.lastIndexOf("@");
  const identity = at > 0 ? value.slice(0, at) : value;
  const refInfo = classifyRef(at > 0 ? value.slice(at + 1) : null);

  const segments = identity.split("/");
  const owner = segments[0] ?? null;
  const repo = segments[1] ?? null;
  const path = segments.length > 2 ? segments.slice(2).join("/") : null;

  const kind: UsesKind = path?.startsWith(".github/workflows/")
    ? "reusable-workflow"
    : "action";

  return {
    raw: value,
    kind,
    name: owner && repo ? `${owner}/${repo}` : identity,
    owner,
    path,
    ref: refInfo.ref,
    refType: refInfo.type,
    pinned: refInfo.pinned,
    firstParty: owner != null && FIRST_PARTY_OWNERS.has(owner.toLowerCase()),
    job,
    step,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readTriggers(on: unknown): string[] {
  if (typeof on === "string") return [on];
  if (Array.isArray(on)) return on.filter((t): t is string => typeof t === "string");
  if (isRecord(on)) return Object.keys(on);
  return [];
}

function readPermissions(value: unknown): WorkflowPermissions {
  if (value === "read-all" || value === "write-all") return value;
  if (!isRecord(value)) return null;
  const out: Record<string, string> = {};
  for (const [scope, level] of Object.entries(value)) {
    if (typeof level === "string") out[scope] = level;
  }
  return out;
}

export function parseWorkflow(file: string, contents: string): ParsedWorkflow {
  const empty: ParsedWorkflow = {
    file,
    name: null,
    triggers: [],
    riskyTriggers: [],
    permissions: null,
    jobs: [],
    uses: [],
    parseError: null,
  };

  let doc: unknown;
  try {
    doc = parseYaml(contents);
  } catch (error) {
    return { ...empty, parseError: error instanceof Error ? error.message : String(error) };
  }

  if (!isRecord(doc)) return empty;

  // `on` is parsed as the boolean true by YAML 1.1 loaders; the `yaml` package
  // is YAML 1.2 so the key stays a string, but accept both to be safe.
  const onValue = "on" in doc ? doc.on : doc[String(true)];
  const triggers = readTriggers(onValue);

  const uses: UsesRef[] = [];
  const jobs: ParsedWorkflow["jobs"] = [];

  if (isRecord(doc.jobs)) {
    for (const [jobName, jobValue] of Object.entries(doc.jobs)) {
      if (!isRecord(jobValue)) continue;
      jobs.push({ name: jobName, permissions: readPermissions(jobValue.permissions) });

      // A job-level `uses:` is a reusable workflow call.
      if (typeof jobValue.uses === "string") {
        uses.push(parseUses(jobValue.uses, jobName, null));
      }

      if (Array.isArray(jobValue.steps)) {
        for (const step of jobValue.steps) {
          if (!isRecord(step) || typeof step.uses !== "string") continue;
          uses.push(
            parseUses(step.uses, jobName, typeof step.name === "string" ? step.name : null),
          );
        }
      }
    }
  }

  return {
    file,
    name: typeof doc.name === "string" ? doc.name : null,
    triggers,
    riskyTriggers: triggers.filter((t) => RISKY_TRIGGERS.has(t)),
    permissions: readPermissions(doc.permissions),
    jobs,
    uses,
    parseError: null,
  };
}
