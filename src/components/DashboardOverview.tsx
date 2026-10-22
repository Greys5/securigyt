"use client";

import Link from "next/link";
import {
  ArrowRight,
  CheckCircle,
  Eye,
  Info,
  ShieldWarning,
  Warning,
  X,
} from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { repositoryAuditHrefForCheck } from "@/lib/remediationLinks";
import type { CheckId } from "@/lib/score";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Grade = "A" | "B" | "C" | "D" | "F";

export type OverviewFinding = {
  id: CheckId;
  control: string;
  detail: string;
  severity: "critical" | "high" | "medium" | "info";
  affected: number;
  measured: number;
  recommendation: string;
  action: string;
  repositories: string[];
};

export type OverviewData = {
  averagePercent: number;
  repoCount: number;
  activeCount: number;
  protectedCount: number;
  pinned: number;
  actionRefs: number;
  codeowners: number;
  distribution: Record<Grade, number>;
  findings: OverviewFinding[];
};

const GRADE_COLOR: Record<Grade, string> = {
  A: "var(--ok)",
  B: "#45a85a",
  C: "var(--warn)",
  D: "#e18a16",
  F: "var(--bad)",
};

const SEVERITY = {
  critical: { label: "Critical", icon: ShieldWarning, className: "text-bad" },
  high: { label: "High", icon: Warning, className: "text-warn" },
  medium: { label: "Medium", icon: Warning, className: "text-warn" },
  info: { label: "Info", icon: Info, className: "text-info" },
};

export function DashboardOverview({ data }: { data: OverviewData }) {
  const [selectedId, setSelectedId] = useState(data.findings[0]?.id ?? "");
  const [previewOpen, setPreviewOpen] = useState(false);
  const selected = data.findings.find((finding) => finding.id === selectedId) ?? data.findings[0];

  const gradeData = useMemo(
    () => (["A", "B", "C", "D", "F"] as Grade[]).map((grade) => ({ grade, value: data.distribution[grade] })),
    [data.distribution],
  );

  const coverageData = data.findings.slice(0, 5).map((finding) => ({
    name: finding.control.length > 24 ? `${finding.control.slice(0, 23)}…` : finding.control,
    covered: Math.max(0, finding.measured - finding.affected),
    missing: finding.affected,
  }));

  return (
    <>
      <section className="grid border-y border-border bg-surface md:grid-cols-5" aria-label="Organization posture summary">
        <Metric label="Average security score" value={`${data.averagePercent}%`} tone="bad" hint={`Across ${data.activeCount} repositories`} />
        <Metric label="Repositories" value={String(data.repoCount)} hint={`${data.activeCount} active`} />
        <Metric label="Protected branches" value={String(data.protectedCount)} tone="info" hint={`of ${data.activeCount} repositories`} />
        <Metric label="Actions SHA-pinned" value={`${data.pinned} / ${data.actionRefs}`} tone="bad" hint={`${Math.round((data.pinned / Math.max(1, data.actionRefs)) * 100)}% pinned`} />
        <Metric label="CODEOWNERS" value={`${data.codeowners} / ${data.activeCount}`} tone="bad" hint={`${Math.round((data.codeowners / Math.max(1, data.activeCount)) * 100)}% coverage`} />
      </section>

      <section className="grid border-b border-border bg-surface lg:grid-cols-[0.9fr_1.1fr]" aria-label="Security statistics">
        <div className="border-b border-border p-4 lg:border-b-0 lg:border-r">
          <div className="mb-3">
            <h2 className="text-xs font-semibold">Repository risk grades</h2>
            <p className="mt-0.5 text-[11px] text-muted">Across {data.activeCount} active repositories</p>
          </div>
          <div className="flex h-44 items-center gap-4">
            <div className="h-full min-w-0 flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={gradeData} dataKey="value" nameKey="grade" innerRadius={48} outerRadius={68} paddingAngle={1} stroke="var(--surface)">
                    {gradeData.map((entry) => <Cell key={entry.grade} fill={GRADE_COLOR[entry.grade]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="w-32 space-y-1.5">
              {gradeData.map(({ grade, value }) => (
                <div key={grade} className="flex items-center gap-2 text-[11px]">
                  <span className="h-2 w-2 rounded-sm" style={{ background: GRADE_COLOR[grade] }} />
                  <span className="font-semibold">{grade}</span>
                  <span className="ml-auto tabular-nums text-muted">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="p-4">
          <div className="mb-3">
            <h2 className="text-xs font-semibold">Control coverage</h2>
            <p className="mt-0.5 text-[11px] text-muted">Passing and failing repositories by control</p>
          </div>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={coverageData} layout="vertical" margin={{ left: 8, right: 8 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 10, fill: "var(--muted)" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="covered" name="Passing" stackId="coverage" fill="var(--ok)" radius={[3, 0, 0, 3]} />
                <Bar dataKey="missing" name="Failing" stackId="coverage" fill="var(--bad)" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <section id="findings" className="grid min-h-[520px] bg-surface xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 border-b border-border xl:border-b-0 xl:border-r">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3.5">
            <div>
              <h2 className="text-[13px] font-semibold">Top security findings</h2>
              <p className="mt-0.5 text-[11px] text-muted">Prioritized by severity and affected repositories</p>
            </div>
            <Link href="/security" className="inline-flex h-8 items-center gap-1.5 rounded-md bg-info px-3 text-xs font-semibold text-white hover:brightness-95">
              Review critical findings <ArrowRight size={14} aria-hidden />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-xs">
              <thead>
                <tr>
                  <TableHead className="w-9">#</TableHead>
                  <TableHead>Control</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Affected</TableHead>
                  <TableHead>Recommendation</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </tr>
              </thead>
              <tbody>
                {data.findings.map((finding, index) => {
                  const config = SEVERITY[finding.severity];
                  const SeverityIcon = config.icon;
                  const selectedRow = finding.id === selected?.id;
                  return (
                    <tr
                      key={finding.id}
                      onClick={() => setSelectedId(finding.id)}
                      className={`cursor-pointer transition-colors ${selectedRow ? "bg-info/[0.06]" : "hover:bg-surface-2"}`}
                    >
                      <td className="border-b border-border px-3 py-3 text-muted">{index + 1}</td>
                      <td className="border-b border-border px-3 py-3">
                        <div className="font-medium">{finding.control}</div>
                        <div className="mt-0.5 text-[10px] text-muted">{finding.detail}</div>
                      </td>
                      <td className="border-b border-border px-3 py-3">
                        <span className={`inline-flex items-center gap-1.5 font-medium ${config.className}`}>
                          <SeverityIcon size={14} weight="fill" aria-hidden /> {config.label}
                        </span>
                      </td>
                      <td className="border-b border-border px-3 py-3 tabular-nums">
                        <span className="font-semibold">{finding.affected}</span>
                        <span className="text-muted"> / {finding.measured}</span>
                      </td>
                      <td className="max-w-[330px] border-b border-border px-3 py-3 text-[11px] leading-4 text-muted">{finding.recommendation}</td>
                      <td className="border-b border-border px-3 py-3 text-right">
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedId(finding.id);
                            setPreviewOpen(true);
                          }}
                          className="inline-flex items-center gap-1 rounded-md border border-border-strong bg-surface px-2.5 py-1.5 text-[11px] font-medium text-info hover:bg-surface-2"
                        >
                          {finding.action} <ArrowRight size={12} aria-hidden />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {selected && (
          <aside className="bg-surface-2/40 p-4" aria-label="Finding details">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <span className={`text-[10px] font-semibold uppercase tracking-wide ${SEVERITY[selected.severity].className}`}>
                  {SEVERITY[selected.severity].label} finding
                </span>
                <h2 className="mt-1 text-base font-semibold tracking-tight">{selected.control}</h2>
                <p className="mt-1 text-xs text-muted">{selected.detail}</p>
              </div>
            </div>

            <Detail label="Why it matters">This control reduces preventable risk across repositories and keeps changes reviewable.</Detail>
            <Detail label="Evidence">{selected.affected} of {selected.measured} measured repositories currently fail this control.</Detail>
            <Detail label="Recommended change">{selected.recommendation}</Detail>

            <div className="mt-5">
              <div className="flex items-center justify-between text-xs font-semibold">
                Affected repositories
                <Link href={repositoryAuditHrefForCheck(selected.id)} className="font-medium text-info hover:underline">View all</Link>
              </div>
              <ul className="mt-2 divide-y divide-border border-y border-border">
                {selected.repositories.slice(0, 5).map((repo) => (
                  <li key={repo} className="py-2 text-[11px]">
                    <Link href={`/repos/${encodeURIComponent(repo)}`} className="text-info hover:underline">{repo}</Link>
                  </li>
                ))}
              </ul>
            </div>

            <button onClick={() => setPreviewOpen(true)} className="mt-5 flex h-9 w-full items-center justify-center gap-2 rounded-md bg-info px-3 text-xs font-semibold text-white hover:brightness-95">
              <Eye size={15} aria-hidden /> Preview remediation
            </button>
          </aside>
        )}
      </section>

      {previewOpen && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" role="presentation" onMouseDown={() => setPreviewOpen(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="remediation-title" onMouseDown={(event) => event.stopPropagation()} className="w-full max-w-lg rounded-lg border border-border bg-surface shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-info">Remediation preview</div>
                <h2 id="remediation-title" className="mt-1 text-base font-semibold">{selected.action}</h2>
              </div>
              <button onClick={() => setPreviewOpen(false)} className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-foreground" aria-label="Close preview"><X size={18} /></button>
            </div>
            <div className="space-y-4 px-5 py-5 text-sm">
              <div>
                <div className="text-xs font-semibold">Proposed change</div>
                <p className="mt-1 text-xs leading-5 text-muted">{selected.recommendation}</p>
              </div>
              <div className="rounded-md border border-info/25 bg-info/5 p-3 text-xs text-muted">
                <div className="flex items-center gap-2 font-medium text-info"><CheckCircle size={15} weight="fill" /> Review required</div>
                <p className="mt-1.5 leading-5">This preview does not modify GitHub. Applying remediations will be enabled after OAuth roles and the audited write path are implemented.</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
              <button onClick={() => setPreviewOpen(false)} className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium hover:bg-surface-2">Close</button>
              <Link href={repositoryAuditHrefForCheck(selected.id)} className="rounded-md bg-info px-3 py-1.5 text-xs font-semibold text-white">View affected repositories</Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Metric({ label, value, hint, tone = "default" }: { label: string; value: string; hint: string; tone?: "default" | "bad" | "info" }) {
  return (
    <div className="metric-divider px-4 py-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.07em] text-muted">{label}</div>
      <div className={`mt-1 text-[22px] font-semibold tracking-tight tabular-nums ${tone === "bad" ? "text-bad" : tone === "info" ? "text-info" : "text-foreground"}`}>{value}</div>
      <div className="mt-0.5 text-[10px] text-muted">{hint}</div>
    </div>
  );
}

function TableHead({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`border-b border-border bg-surface-2 px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.07em] text-muted ${className}`}>{children}</th>;
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-border py-3.5 last:border-b-0">
      <div className="text-xs font-semibold">{label}</div>
      <p className="mt-1 text-[11px] leading-5 text-muted">{children}</p>
    </div>
  );
}

const tooltipStyle = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "6px",
  color: "var(--foreground)",
  fontSize: "11px",
};
