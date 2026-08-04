import type { RulesetDetail } from "@/lib/github/collectors/repoDetail";
import { Badge, EmptyState } from "@/components/ui";

/** Human labels for the ruleset rule types GitHub returns. */
const RULE_LABELS: Record<string, string> = {
  creation: "Restrict creation",
  update: "Restrict updates",
  deletion: "Block deletion",
  non_fast_forward: "Block force push",
  required_linear_history: "Require linear history",
  required_signatures: "Require signed commits",
  required_deployments: "Require deployments",
  required_status_checks: "Require status checks",
  pull_request: "Require pull request",
  commit_message_pattern: "Commit message pattern",
  commit_author_email_pattern: "Author email pattern",
  committer_email_pattern: "Committer email pattern",
  branch_name_pattern: "Branch name pattern",
  tag_name_pattern: "Tag name pattern",
  workflows: "Require workflows to pass",
  code_scanning: "Require code scanning results",
};

/** Pull the few pull-request parameters worth showing inline. */
function summarizeRule(rule: RulesetDetail["rules"][number]): string | null {
  if (rule.type !== "pull_request" || !rule.parameters) return null;
  const p = rule.parameters as {
    required_approving_review_count?: number;
    require_code_owner_review?: boolean;
    dismiss_stale_reviews_on_push?: boolean;
    require_last_push_approval?: boolean;
  };
  const parts: string[] = [`${p.required_approving_review_count ?? 0} approval(s)`];
  if (p.require_code_owner_review) parts.push("code owner review");
  if (p.dismiss_stale_reviews_on_push) parts.push("dismiss stale");
  if (p.require_last_push_approval) parts.push("last-push approval");
  return parts.join(" · ");
}

export function RulesetList({ rulesets }: { rulesets: RulesetDetail[] }) {
  if (rulesets.length === 0) {
    return <EmptyState>No rulesets apply to this repository.</EmptyState>;
  }

  return (
    <div className="divide-y divide-border">
      {rulesets.map((rs) => (
        <div key={`${rs.sourceType}-${rs.id}`} className="px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            {rs.htmlUrl ? (
              <a
                href={rs.htmlUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-medium text-info hover:underline"
              >
                {rs.name}
              </a>
            ) : (
              <span className="text-sm font-medium">{rs.name}</span>
            )}
            <Badge tone={rs.enforcement === "active" ? "ok" : "warn"}>{rs.enforcement}</Badge>
            <Badge tone={rs.sourceType === "Organization" ? "accent" : "muted"}>
              {rs.sourceType === "Organization" ? `org: ${rs.source}` : "repository"}
            </Badge>
            <Badge tone="muted">{rs.target}</Badge>
            {rs.bypassActors.length > 0 && (
              <Badge
                tone="warn"
                title={rs.bypassActors.map((a) => `${a.actorType} (${a.bypassMode})`).join(", ")}
              >
                {rs.bypassActors.length} bypass actor(s)
              </Badge>
            )}
          </div>

          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            <span>
              Applies to:{" "}
              <span className="font-mono text-foreground">
                {rs.includes.length > 0 ? rs.includes.join(", ") : "—"}
              </span>
              {rs.excludes.length > 0 && (
                <>
                  {" "}
                  except <span className="font-mono">{rs.excludes.join(", ")}</span>
                </>
              )}
            </span>
          </div>

          <ul className="mt-2 flex flex-wrap gap-1.5">
            {rs.rules.map((rule, i) => {
              const detail = summarizeRule(rule);
              return (
                <li key={`${rule.type}-${i}`}>
                  <Badge tone="info" title={detail ?? undefined}>
                    {RULE_LABELS[rule.type] ?? rule.type}
                    {detail && <span className="font-normal opacity-80"> · {detail}</span>}
                  </Badge>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
