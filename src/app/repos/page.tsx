import { getRepoInventory } from "@/lib/github/collectors/repos";
import { isConfigured } from "@/lib/config";
import { SetupNotice } from "@/components/SetupNotice";
import { RefreshButton } from "@/components/RefreshButton";
import { RepoTable } from "./RepoTable";
import { Card, Stat, formatAge, ratioTone } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ReposPage() {
  if (!isConfigured()) {
    return <SetupNotice message="Repository inventory needs GitHub App credentials." />;
  }

  const { value: inventory, fetchedAt } = await getRepoInventory();
  const active = inventory.repos.filter((r) => !r.archived);

  const counts = {
    withDotGithub: active.filter((r) => r.hasDotGithub).length,
    withCodeowners: active.filter((r) => r.hasCodeowners).length,
    protected: active.filter((r) => r.defaultBranchProtected).length,
    withWorkflows: active.filter((r) => r.workflowFiles.length > 0).length,
  };

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Repositories</h1>
          <p className="mt-1 text-sm text-muted">
            {inventory.totalCount} repositories in {inventory.org} · {active.length} active ·
            updated {formatAge(fetchedAt)}
          </p>
        </div>
        <RefreshButton scopes={["org-repos"]} cacheKey={inventory.org} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Have .github"
          value={`${counts.withDotGithub}/${active.length}`}
          tone="info"
        />
        <Stat
          label="Have CODEOWNERS"
          value={`${counts.withCodeowners}/${active.length}`}
          tone={ratioTone(counts.withCodeowners, active.length)}
        />
        <Stat
          label="Default branch protected"
          value={`${counts.protected}/${active.length}`}
          tone={ratioTone(counts.protected, active.length)}
        />
        <Stat label="Have workflows" value={`${counts.withWorkflows}/${active.length}`} tone="info" />
      </div>

      {inventory.errors.length > 0 && (
        <div className="rounded-xl border border-warn/30 bg-warn/5 px-4 py-3 text-xs text-muted">
          <span className="font-medium text-warn">
            {inventory.errors.length} repositories returned partial data.
          </span>{" "}
          {inventory.errors.slice(0, 5).join(" · ")}
          {inventory.errors.length > 5 && " …"}
        </div>
      )}

      <Card className="p-0">
        <RepoTable repos={inventory.repos} />
      </Card>
    </div>
  );
}
