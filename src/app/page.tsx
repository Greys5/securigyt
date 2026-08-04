import Link from "next/link";
import { getPosture } from "@/lib/github/collectors/posture";
import { getActionsInventory } from "@/lib/github/collectors/actionsInventory";
import { getOrgOverview } from "@/lib/github/collectors/org";
import { isConfigured, getConfig } from "@/lib/config";
import { SetupNotice } from "@/components/SetupNotice";
import { RefreshButton } from "@/components/RefreshButton";
import {
  Badge,
  Card,
  EmptyState,
  Stat,
  Td,
  Th,
  formatAge,
  ratioTone,
  type Tone,
} from "@/components/ui";
import type { Grade } from "@/lib/score";

export const dynamic = "force-dynamic";

const GRADE_TONE: Record<Grade, Tone> = { A: "ok", B: "ok", C: "warn", D: "warn", F: "bad" };

export default async function Home() {
  if (!isConfigured()) {
    return <SetupNotice message="SecuriGit needs credentials to read your organization." />;
  }

  const { org } = getConfig();
  const [posture, actions, orgOverview] = await Promise.all([
    getPosture(),
    getActionsInventory(),
    getOrgOverview(),
  ]);

  const worst = posture.scored.slice(0, 8);
  const topGaps = posture.checkRollup.filter((c) => c.failed > 0).slice(0, 6);
  const pinned = actions.value.totalRefs - actions.value.unpinnedRefs;

  const unavailableSections = [
    ["Organization rulesets", orgOverview.value.rulesets],
    ["Installed apps", orgOverview.value.apps],
    ["Fine-grained tokens", orgOverview.value.tokens],
    ["Webhooks", orgOverview.value.webhooks],
    ["Actions policy", orgOverview.value.actionsPolicy],
    ["Dependabot alerts", posture.security.dependabot],
    ["Code scanning alerts", posture.security.codeScanning],
    ["Secret scanning alerts", posture.security.secretScanning],
    ["Audit log", posture.security.auditLog],
    ["Billing", posture.security.billing],
  ].filter(([, section]) => !(section as { available: boolean }).available) as [string, never][];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{org}</h1>
          <p className="mt-1 text-sm text-muted">
            {posture.scored.length} active repositories · updated {formatAge(posture.fetchedAt)}
          </p>
        </div>
        <RefreshButton
          scopes={["org-repos", "repo-workflows", "org-alerts", "org-meta"]}
          label="Rescan everything"
        />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Average security score"
          value={`${posture.averagePercent}%`}
          tone={ratioTone(posture.averagePercent, 100)}
        />
        <Stat
          label="Repositories with .github"
          value={`${posture.scored.filter((s) => s.repo.hasDotGithub).length}/${posture.scored.length}`}
          tone="info"
        />
        <Stat
          label="Default branch protected"
          value={`${posture.scored.filter((s) => s.repo.defaultBranchProtected).length}/${posture.scored.length}`}
          tone={ratioTone(
            posture.scored.filter((s) => s.repo.defaultBranchProtected).length,
            posture.scored.length,
          )}
        />
        <Stat
          label="Actions SHA-pinned"
          value={`${pinned}/${actions.value.totalRefs}`}
          tone={ratioTone(pinned, actions.value.totalRefs)}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card
          title="Biggest gaps"
          subtitle="Controls failing on the most repositories"
          className="lg:col-span-2"
        >
          {topGaps.length === 0 ? (
            <EmptyState>Every measurable control passes across the org.</EmptyState>
          ) : (
            <ul className="divide-y divide-border">
              {topGaps.map((c) => {
                const scored = c.passed + c.failed;
                const pct = scored ? Math.round((c.failed / scored) * 100) : 0;
                return (
                  <li key={c.id} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span>{c.label}</span>
                      <Badge tone={pct > 50 ? "bad" : "warn"}>
                        {c.failed} of {scored} failing
                      </Badge>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
                      <div className="h-full rounded-full bg-bad" style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title="Grades" subtitle="Distribution across active repositories">
          <div className="space-y-2 px-4 py-4">
            {(["A", "B", "C", "D", "F"] as Grade[]).map((g) => {
              const count = posture.distribution[g];
              const pct = posture.scored.length
                ? Math.round((count / posture.scored.length) * 100)
                : 0;
              return (
                <div key={g} className="flex items-center gap-3">
                  <span className="w-4 text-sm font-semibold">{g}</span>
                  <div className="h-3 flex-1 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className={`h-full rounded-full ${
                        GRADE_TONE[g] === "ok"
                          ? "bg-ok"
                          : GRADE_TONE[g] === "warn"
                            ? "bg-warn"
                            : "bg-bad"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-14 text-right text-xs tabular-nums text-muted">{count}</span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card
          title="Lowest scoring repositories"
          subtitle="Start here"
          className="p-0"
          actions={
            <Link href="/security" className="text-xs text-info hover:underline">
              See all →
            </Link>
          }
        >
          <table className="w-full text-sm">
            <thead>
              <tr>
                <Th>Repository</Th>
                <Th>Score</Th>
                <Th>Top failure</Th>
              </tr>
            </thead>
            <tbody>
              {worst.map(({ repo, score }) => (
                <tr key={repo.name} className="hover:bg-surface-2/60">
                  <Td>
                    <Link
                      href={`/repos/${encodeURIComponent(repo.name)}`}
                      className="text-info hover:underline"
                    >
                      {repo.name}
                    </Link>
                  </Td>
                  <Td>
                    <Badge tone={GRADE_TONE[score.grade]}>
                      {score.grade} · {score.percent}%
                    </Badge>
                  </Td>
                  <Td className="text-xs text-muted">{score.failed[0]?.label ?? "—"}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card
          title="Flagged workflows"
          subtitle="Risky triggers and broad permissions"
          className="p-0"
          actions={
            <Link href="/actions" className="text-xs text-info hover:underline">
              Actions inventory →
            </Link>
          }
        >
          {actions.value.flagged.length === 0 ? (
            <EmptyState>No workflows flagged.</EmptyState>
          ) : (
            <div className="max-h-72 overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <Th>Repository</Th>
                    <Th>Workflow</Th>
                    <Th>Issue</Th>
                  </tr>
                </thead>
                <tbody>
                  {actions.value.flagged.slice(0, 20).map((f, i) => (
                    <tr key={`${f.repo}-${i}`} className="hover:bg-surface-2/60">
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {unavailableSections.length > 0 && (
        <Card
          title="Not measurable with the current credentials"
          subtitle="These sections need broader permissions — run npm run verify for details"
        >
          <div className="flex flex-wrap gap-1.5 px-4 py-3">
            {unavailableSections.map(([label]) => (
              <Badge key={label} tone="muted">
                {label}
              </Badge>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
