import { getRepoInventory } from "@/lib/github/collectors/repos";
import { isConfigured } from "@/lib/config";
import { SetupNotice } from "@/components/SetupNotice";
import { RefreshButton } from "@/components/RefreshButton";
import { RepoTable } from "./RepoTable";
import { formatAge } from "@/components/ui";
import { repositoryFiltersForView } from "@/lib/repositoryReport";

export const dynamic = "force-dynamic";

type ReposPageProps = {
  searchParams: Promise<{ view?: string | string[]; repository?: string | string[] }>;
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ReposPage({ searchParams }: ReposPageProps) {
  if (!isConfigured()) {
    return <SetupNotice message="Repository inventory needs GitHub App credentials." />;
  }

  const { value: inventory, fetchedAt } = await getRepoInventory();
  const active = inventory.repos.filter((r) => !r.archived);
  const params = await searchParams;
  const initialFilters = repositoryFiltersForView(first(params.view), first(params.repository) ?? "");

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

      {inventory.errors.length > 0 && (
        <div className="rounded-xl border border-warn/30 bg-warn/5 px-4 py-3 text-xs text-muted">
          <span className="font-medium text-warn">
            {inventory.errors.length} repositories returned partial data.
          </span>{" "}
          {inventory.errors.slice(0, 5).join(" · ")}
          {inventory.errors.length > 5 && " …"}
        </div>
      )}

      <RepoTable
        key={`${initialFilters.focus}:${initialFilters.repository}`}
        repos={inventory.repos}
        org={inventory.org}
        initialFilters={initialFilters}
      />
    </div>
  );
}
