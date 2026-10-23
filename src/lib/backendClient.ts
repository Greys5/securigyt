import "server-only";

import type { CachedValue } from "@/lib/cache";
import type { RepoInventory } from "@/lib/github/collectors/repos";
import type { RepoDetail } from "@/lib/github/collectors/repoDetail";
import type { OrgOverview } from "@/lib/github/collectors/org";
import type { SecurityOverview } from "@/lib/github/collectors/security";
import type { ActionsInventory } from "@/lib/github/collectors/actionsInventory";
import type { Posture } from "@/lib/github/collectors/posture";
import type { Score } from "@/lib/score";
import type { AssessmentFinding } from "@/lib/securityAssessment";

const base = process.env.PYTHON_BACKEND_URL ?? "http://127.0.0.1:8000";

export class BackendError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function backend<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${base}${path}`, { cache: "no-store", ...init });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { detail?: string };
    throw new BackendError(response.status, body.detail ?? `Python backend returned HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export const getRepoInventory = () => backend<CachedValue<RepoInventory>>( "/inventory");
export const getRepoDetail = (name: string) => backend<CachedValue<RepoDetail & { score: Score }>>(`/repos/${encodeURIComponent(name)}`);
export const getOrgOverview = () => backend<CachedValue<OrgOverview>>("/org");
export const getSecurityOverview = () => backend<CachedValue<SecurityOverview>>("/security");
export const getActionsInventory = () => backend<CachedValue<ActionsInventory>>("/actions");
export const getPosture = () => backend<Posture>("/posture");
export const getAssessment = () => backend<AssessmentFinding[]>("/assessment");
export const getCachedInventory = (org: string) => backend<CachedValue<RepoInventory> | null>(`/cache/org-repos?key=${encodeURIComponent(org)}`);
export const getBackendConfig = () => backend<{ configured: true; org: string } | { configured: false; org: null }>("/config");
export const refreshBackend = (scopes: string[], key?: string) => backend<{ cleared: number; scopes: string[] | "all" }>("/refresh", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scopes, key }) });
export const getLatestRelease = (action: string) => backend<unknown>(`/actions/latest-release?action=${encodeURIComponent(action)}`);
