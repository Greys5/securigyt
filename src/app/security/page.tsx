import Link from "next/link";
import { repositoryAuditHrefForCheck } from "@/lib/remediationLinks";
import { getPosture, getBackendConfig } from "@/lib/backendClient";
import { SEVERITIES, type AlertsSummary, type RepoAlertCounts } from "@/lib/github/collectors/security";
import { SetupNotice } from "@/components/SetupNotice";
import { RefreshButton } from "@/components/RefreshButton";
import {
  Badge,
  Card,
  EmptyState,
  Stat,
  Td,
  Th,
  UnavailableNotice,
  formatAge,
  ratioTone,
  type Tone,
} from "@/components/ui";
import type { Maybe } from "@/lib/github/client";
import type { Grade } from "@/lib/score";
import { ScoreTable } from "./ScoreTable";

export const dynamic = "force-dynamic";

const SEVERITY_TONE: Record<string, Tone> = {
  critical: "bad",
  high: "bad",
  medium: "warn",
  low: "info",
  unknown: "muted",
};

function SeverityRow({ counts }: { counts: Record<string, number> }) {
  return (
    <span className="flex flex-wrap gap-1">
      {SEVERITIES.filter((s) => counts[s] > 0).map((s) => (
        <Badge key={s} tone={SEVERITY_TONE[s]}>
          {counts[s]} {s}
        </Badge>
      ))}
      {SEVERITIES.every((s) => counts[s] === 0) && <Badge tone="ok">none open</Badge>}
    </span>
  );
}

function AlertsCard({
  title,
  subtitle,
  summary,
}: {
  title: string;
  subtitle: string;
  summary: Maybe<AlertsSummary | { total: number; byRepo: RepoAlertCounts[]; truncated: boolean }>;
}) {
  if (!summary.available) {
    return (
      <Card title={title} subtitle={subtitle}>
        <div className="p-4">
          <UnavailableNotice info={summary} />
        </div>
      </Card>
    );
  }

  const data = summary.data;
  const counts = "counts" in data ? data.counts : null;

  return (
    <Card title={title} subtitle={`${data.total} open · ${subtitle}`} className="p-0">
      {counts && (
        <div className="border-b border-border px-4 py-3">
          <SeverityRow counts={counts} />
        </div>
      )}
      {data.truncated && (
        <div className="border-b border-border bg-warn/5 px-4 py-2 text-xs text-warn">
          Result capped — counts are a lower bound.
        </div>
      )}
      {data.byRepo.length === 0 ? (
        <EmptyState>No open alerts.</EmptyState>
      ) : (
        <div className="max-h-72 overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <Th>Repository</Th>
                <Th>Open</Th>
                <Th>Severity</Th>
              </tr>
            </thead>
            <tbody>
              {data.byRepo.slice(0, 50).map((r) => (
                <tr key={r.repo} className="hover:bg-surface-2/60">
                  <Td>
                    <Link
                      href={`/repos/${encodeURIComponent(r.repo)}`}
                      className="text-info hover:underline"
                    >
                      {r.repo}
                    </Link>
                  </Td>
                  <Td className="tabular-nums">{r.total}</Td>
                  <Td>
                    <SeverityRow counts={r.counts} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export default async function SecurityPage() {
  if (!(await getBackendConfig()).configured) {
    return <SetupNotice message="The security hub needs GitHub App credentials." />;
  }

  const posture = await getPosture();
  const { security } = posture;

  const gradeTone: Record<Grade, Tone> = { A: "ok", B: "ok", C: "warn", D: "warn", F: "bad" };
  const atRisk = posture.scored.filter((s) => s.score.grade === "F" || s.score.grade === "D").length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Security</h1>
          <p className="mt-1 text-sm text-muted">
            {posture.scored.length} active repositories scored · updated{" "}
            {formatAge(posture.fetchedAt)}
          </p>
        </div>
        <RefreshButton
          scopes={["org-alerts", "org-repos", "repo-workflows"]}
          label="Rescan everything"
        />
      </div>

      <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-border bg-surface shadow-[var(--shadow)] md:grid-cols-4">
        <Stat
          label="Average score"
          value={`${posture.averagePercent}%`}
          tone={ratioTone(posture.averagePercent, 100)}
        />
        <Stat
          label="At risk (D or F)"
          value={atRisk}
          tone={atRisk === 0 ? "ok" : "bad"}
          hint="Repositories failing most checks"
        />
        <Stat
          label="Open Dependabot alerts"
          value={security.dependabot.available ? security.dependabot.data.total : "—"}
          tone={
            security.dependabot.available && security.dependabot.data.counts.critical > 0
              ? "bad"
              : "info"
          }
        />
        <Stat
          label="Open secret alerts"
          value={security.secretScanning.available ? security.secretScanning.data.total : "—"}
          tone={
            security.secretScanning.available && security.secretScanning.data.total > 0
              ? "bad"
              : "ok"
          }
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Grade distribution" subtitle="How the org's repositories score">
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
                        gradeTone[g] === "ok"
                          ? "bg-ok"
                          : gradeTone[g] === "warn"
                            ? "bg-warn"
                            : "bg-bad"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-16 text-right text-xs tabular-nums text-muted">
                    {count} ({pct}%)
                  </span>
                </div>
              );
            })}
          </div>
        </Card>

        <Card title="Check coverage" subtitle="How many repositories pass each control">
          <div className="max-h-80 overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <Th>Control</Th>
                  <Th>Passing</Th>
                  <Th>Failing</Th>
                  <Th>Next step</Th>
                </tr>
              </thead>
              <tbody>
                {posture.checkRollup.map((c) => {
                  const scored = c.passed + c.failed;
                  return (
                    <tr key={c.id} className="hover:bg-surface-2/60">
                      <Td>
                        {c.label}
                        {c.unknown > 0 && (
                          <span className="ml-2 text-xs text-muted">
                            ({c.unknown} not measurable)
                          </span>
                        )}
                      </Td>
                      <Td>
                        {scored === 0 ? (
                          <Badge tone="muted">no data</Badge>
                        ) : (
                          <Badge tone={ratioTone(c.passed, scored)}>
                            {c.passed}/{scored}
                          </Badge>
                        )}
                      </Td>
                      <Td className="tabular-nums">
                        {c.failed > 0 ? (
                          <span className="text-bad">{c.failed}</span>
                        ) : (
                          <span className="text-muted">0</span>
                        )}
                      </Td>
                      <Td>
                        <Link href={repositoryAuditHrefForCheck(c.id)} className="text-[11px] font-medium text-info hover:underline">
                          Review remediation
                        </Link>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <AlertsCard
          title="Dependabot alerts"
          subtitle="vulnerable dependencies"
          summary={security.dependabot}
        />
        <AlertsCard
          title="Code scanning alerts"
          subtitle="static analysis findings"
          summary={security.codeScanning}
        />
      </div>

      <Card
        title="Secret scanning"
        subtitle="Leaked credentials detected in repository content"
        className="p-0"
      >
        {security.secretScanning.available ? (
          security.secretScanning.data.total === 0 ? (
            <EmptyState>No open secret scanning alerts.</EmptyState>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
                <Badge tone="bad">{security.secretScanning.data.total} open</Badge>
                {security.secretScanning.data.bypassedCount > 0 && (
                  <Badge tone="bad">
                    {security.secretScanning.data.bypassedCount} push protection bypassed
                  </Badge>
                )}
                {security.secretScanning.data.byType.slice(0, 8).map((t) => (
                  <Badge key={t.type} tone="warn">
                    {t.type} ×{t.count}
                  </Badge>
                ))}
              </div>
              <div className="max-h-72 overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <Th>Repository</Th>
                      <Th>Secret type</Th>
                      <Th>Validity</Th>
                      <Th>Detected</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {security.secretScanning.data.alerts.slice(0, 100).map((a, i) => (
                      <tr key={`${a.repo}-${i}`} className="hover:bg-surface-2/60">
                        <Td>
                          <Link
                            href={`/repos/${encodeURIComponent(a.repo)}`}
                            className="text-info hover:underline"
                          >
                            {a.repo}
                          </Link>
                        </Td>
                        <Td>{a.secretType}</Td>
                        <Td>
                          <Badge tone={a.validity === "active" ? "bad" : "muted"}>
                            {a.validity ?? "unknown"}
                          </Badge>
                        </Td>
                        <Td className="text-xs text-muted">
                          {a.createdAt ? a.createdAt.slice(0, 10) : "—"}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )
        ) : (
          <div className="p-4">
            <UnavailableNotice info={security.secretScanning} />
          </div>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Audit log" subtitle="Recent organization events" className="p-0">
          {security.auditLog.available ? (
            security.auditLog.data.length === 0 ? (
              <EmptyState>No audit events returned.</EmptyState>
            ) : (
              <div className="max-h-72 overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <Th>When</Th>
                      <Th>Action</Th>
                      <Th>Actor</Th>
                      <Th>Repository</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {security.auditLog.data.map((e, i) => (
                      <tr key={i} className="hover:bg-surface-2/60">
                        <Td className="whitespace-nowrap text-xs text-muted">
                          {e.createdAt ? e.createdAt.slice(0, 16).replace("T", " ") : "—"}
                        </Td>
                        <Td className="font-mono text-xs">{e.action}</Td>
                        <Td>{e.actor ?? "—"}</Td>
                        <Td className="text-muted">{e.repo ?? "—"}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            <div className="p-4">
              <UnavailableNotice info={security.auditLog} />
            </div>
          )}
        </Card>

        <Card title="Costs" subtitle="Actions, packages and storage usage this cycle">
          {security.billing.available ? (
            <ul className="divide-y divide-border">
              {(
                [
                  ["Actions minutes used", security.billing.data.actionsMinutesUsed],
                  ["Included minutes", security.billing.data.actionsIncludedMinutes],
                  ["Paid minutes used", security.billing.data.actionsPaidMinutesUsed],
                  ["Packages bandwidth (GB)", security.billing.data.packagesBytes],
                  ["Estimated paid storage", security.billing.data.storageEstimatedPaid],
                  ["Days left in cycle", security.billing.data.storageDaysUsed],
                ] as const
              ).map(([label, value]) => (
                <li key={label} className="flex items-center justify-between px-4 py-2 text-sm">
                  <span>{label}</span>
                  <span className="tabular-nums">{value ?? "—"}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-4">
              <UnavailableNotice info={security.billing} />
            </div>
          )}
        </Card>
      </div>

      <Card
        title="Repository scores"
        subtitle="Worst first — click a row for the full check breakdown"
        className="p-0"
      >
        <ScoreTable scored={posture.scored} />
      </Card>
    </div>
  );
}
