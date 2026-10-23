export type CacheScope =
  | "org-meta"
  | "org-repos"
  | "org-rulesets"
  | "org-apps"
  | "org-pats"
  | "org-hooks"
  | "org-members"
  | "org-alerts"
  | "org-billing"
  | "org-audit"
  | "repo-detail"
  | "repo-workflows"
  | "repo-collaborators"
  | "repo-rulesets"
  | "repo-codeowners"
  | "repo-security";

export type CachedValue<T> = {
  value: T;
  fetchedAt: number;
  stale: boolean;
};
