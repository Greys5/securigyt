import Link from "next/link";
import { getActionsInventory } from "@/lib/github/collectors/actionsInventory";
import { isConfigured } from "@/lib/config";
import { SetupNotice } from "@/components/SetupNotice";
import { RefreshButton } from "@/components/RefreshButton";
import { ActionsTable } from "./ActionsTable";
import { Badge, Card, EmptyState, Stat, Td, Th, formatAge, ratioTone } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ActionsPage() {
  if (!isConfigured()) {
    return <SetupNotice message="The actions inventory needs GitHub App credentials." />;
  }

  const { value: inv, fetchedAt } = await getActionsInventory();
  const pinned = inv.totalRefs - inv.unpinnedRefs;
  const thirdPartyUnpinned = inv.actions
    .filter((a) => !a.firstParty && a.kind !== "local")
    .reduce((sum, a) => sum + a.unpinnedRefs, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Actions inventory</h1>
          <p className="mt-1 text-sm text-muted">
            {inv.workflowCount} workflows across {inv.scannedRepos} repositories · updated{" "}
            {formatAge(fetchedAt)}
          </p>
        </div>
        <RefreshButton scopes={["repo-workflows"]} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Distinct actions" value={inv.distinctActions} tone="info" />
        <Stat label="Action references" value={inv.totalRefs} tone="info" />
        <Stat
          label="SHA-pinned"
          value={`${pinned}/${inv.totalRefs}`}
          tone={ratioTone(pinned, inv.totalRefs)}
          hint="Only a full commit SHA is immutable"
        />
        <Stat
          label="Third-party unpinned"
          value={thirdPartyUnpinned}
          tone={thirdPartyUnpinned === 0 ? "ok" : "bad"}
          hint="Highest supply-chain exposure"
        />
      </div>

      <Card
        title="Flagged workflows"
        subtitle="Risky triggers, broad token permissions, and files that failed to parse"
        className="p-0"
      >
        {inv.flagged.length === 0 ? (
          <EmptyState>No workflows flagged.</EmptyState>
        ) : (
          <div className="max-h-80 overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <Th>Repository</Th>
                  <Th>Workflow</Th>
                  <Th>Issue</Th>
                  <Th>Detail</Th>
                </tr>
              </thead>
              <tbody>
                {inv.flagged.map((f, i) => (
                  <tr key={`${f.repo}-${f.workflow}-${i}`} className="hover:bg-surface-2/60">
                    <Td>
                      <Link
                        href={`/repos/${encodeURIComponent(f.repo)}`}
                        className="text-info hover:underline"
                      >
                        {f.repo}
                      </Link>
                    </Td>
                    <Td className="font-mono text-xs">{f.workflow}</Td>
                    <Td>
                      <Badge tone={f.reason === "Parse error" ? "muted" : "bad"}>{f.reason}</Badge>
                    </Td>
                    <Td className="text-xs text-muted">{f.detail}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {inv.errors.length > 0 && (
        <div className="rounded-xl border border-warn/30 bg-warn/5 px-4 py-3 text-xs text-muted">
          <span className="font-medium text-warn">{inv.errors.length} scan warning(s).</span>{" "}
          {inv.errors.slice(0, 5).join(" · ")}
          {inv.errors.length > 5 && " …"}
        </div>
      )}

      <Card title="Actions used" subtitle="Click a row to see every usage site" className="p-0">
        <ActionsTable actions={inv.actions} />
      </Card>
    </div>
  );
}
