import type { CheckId } from "@/lib/score";

const CODEOWNERS_VIEWS: Partial<Record<CheckId, string>> = {
  "codeowners-present": "codeowners-missing",
  "codeowners-valid": "codeowners-invalid",
  "code-owner-review": "codeowner-review",
};

export function repositoryAuditHrefForCheck(checkId: CheckId, repository?: string): string {
  const view = CODEOWNERS_VIEWS[checkId];
  if (!view) return "/#findings";

  const params = new URLSearchParams({ view });
  if (repository) params.set("repository", repository);
  return `/repos?${params.toString()}`;
}
