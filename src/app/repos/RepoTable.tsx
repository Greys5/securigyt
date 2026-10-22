"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  CaretDown,
  CaretRight,
  CheckCircle,
  DownloadSimple,
  FileCsv,
  FunnelSimple,
  GitBranch,
  ShieldCheck,
  UsersThree,
  Warning,
  X,
} from "@phosphor-icons/react";
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
import type { RepoSummary } from "@/lib/github/collectors/repos";
import {
  DEFAULT_REPOSITORY_FILTERS,
  REPOSITORY_FOCUS_LABELS,
  REPOSITORY_REPORT_HEADERS,
  basicRepositoryReportHeaders,
  createBasicRepositoryReportCsv,
  createRepositoryReportCsv,
  filterRepositories,
  repositoryRemediation,
  repositoryReportRecord,
  type RepositoryFilters,
  type ReportDepth,
  type SortKey,
  type TriFilter,
  type VisibilityFilter,
} from "@/lib/repositoryReport";
import { Badge, EmptyState, Td, Th } from "@/components/ui";

const TRI_LABELS: Record<TriFilter, string> = { all: "Any", yes: "Yes", no: "No" };
type Preset = "all" | "protection" | "codeowners" | "governed" | "gaps";

const PRESETS: { id: Preset; label: string; description: string }[] = [
  { id: "all", label: "All active", description: "Entire active inventory" },
  { id: "protection", label: "Branch protection", description: "Scope and restrictions" },
  { id: "codeowners", label: "Has CODEOWNERS", description: "Ownership coverage" },
  { id: "governed", label: "Owned + protected", description: "Ready governance baseline" },
  { id: "gaps", label: "Needs remediation", description: "Repositories with control gaps" },
];

function filtersForPreset(preset: Preset): RepositoryFilters {
  if (preset === "protection") return { ...DEFAULT_REPOSITORY_FILTERS, focus: "branch-protection", includeArchived: true, sort: "name" };
  if (preset === "codeowners") return { ...DEFAULT_REPOSITORY_FILTERS, codeowners: "yes" };
  if (preset === "governed") return { ...DEFAULT_REPOSITORY_FILTERS, codeowners: "yes", protection: "yes" };
  if (preset === "gaps") return { ...DEFAULT_REPOSITORY_FILTERS, remediation: "yes", sort: "remediation" };
  return { ...DEFAULT_REPOSITORY_FILTERS };
}

function SelectFilter<T extends string>({ label, value, options, onChange }: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <label className="space-y-1">
      <span className="block text-[10px] font-semibold uppercase tracking-[0.07em] text-muted">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value as T)} className="h-9 w-full rounded-md border border-border bg-surface px-2.5 text-xs text-foreground outline-none focus:border-info">
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

export function RepoTable({ repos, org, initialFilters = DEFAULT_REPOSITORY_FILTERS }: { repos: RepoSummary[]; org: string; initialFilters?: RepositoryFilters }) {
  const [filters, setFilters] = useState<RepositoryFilters>(() => ({ ...DEFAULT_REPOSITORY_FILTERS, ...initialFilters }));
  const [preset, setPreset] = useState<Preset | null>(initialFilters.focus === "all" && !initialFilters.repository ? "all" : null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selectedRemediations, setSelectedRemediations] = useState<Set<string>>(() => new Set());
  const [reportDepth, setReportDepth] = useState<ReportDepth>("basic");

  const rows = useMemo(() => filterRepositories(repos, filters), [repos, filters]);
  const analytics = useMemo(() => {
    const owners = rows.filter((repo) => repo.hasCodeowners).length;
    const protectedCount = rows.filter((repo) => repo.defaultBranchProtected).length;
    const governed = rows.filter((repo) => repo.hasCodeowners && repo.defaultBranchProtected).length;
    const remediation = rows.filter((repo) => repositoryRemediation(repo).length > 0).length;
    const bypasses = rows.reduce((count, repo) => count + repo.rulesets.reduce((sum, ruleset) => sum + ruleset.bypassActors.length, 0), 0);
    const ownerTypes = {
      teams: rows.reduce((count, repo) => count + (repo.codeowners?.teams.length ?? 0), 0),
      users: rows.reduce((count, repo) => count + (repo.codeowners?.users.length ?? 0), 0),
      emails: rows.reduce((count, repo) => count + (repo.codeowners?.emails.length ?? 0), 0),
    };
    const reportRecords = rows.map((repo) => repositoryReportRecord(repo, false));
    const branch = {
      forcePushBlocked: reportRecords.filter((record) => record.force_pushes_allowed === false).length,
      deletionBlocked: reportRecords.filter((record) => record.deletions_allowed === false).length,
      reviewRequired: reportRecords.filter((record) => Number(record.required_approvals) > 0).length,
      codeownerReview: reportRecords.filter((record) => record.codeowner_review_required === true).length,
      additionalScope: rows.filter((repo) => repo.rulesets.some((ruleset) => ruleset.target === "BRANCH" && ruleset.enforcement === "ACTIVE" && ruleset.includes.some((pattern) => pattern !== "~DEFAULT_BRANCH"))).length,
    };
    return { owners, protectedCount, governed, remediation, bypasses, ownerTypes, branch };
  }, [rows]);

  const updateFilter = <K extends keyof RepositoryFilters>(key: K, value: RepositoryFilters[K]) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPreset(null);
  };

  const applyPreset = (next: Preset) => {
    setPreset(next);
    setFilters(filtersForPreset(next));
    clearUrlContext();
  };

  const activeFilters = useMemo(() => {
    const active: { key: keyof RepositoryFilters; label: string }[] = [];
    if (filters.repository) active.push({ key: "repository", label: `Repository: ${filters.repository}` });
    if (filters.query) active.push({ key: "query", label: `Search: ${filters.query}` });
    if (filters.dotGithub !== "all") active.push({ key: "dotGithub", label: `.github: ${TRI_LABELS[filters.dotGithub]}` });
    if (filters.codeowners !== "all") active.push({ key: "codeowners", label: `CODEOWNERS: ${TRI_LABELS[filters.codeowners]}` });
    if (filters.protection !== "all") active.push({ key: "protection", label: `Protected: ${TRI_LABELS[filters.protection]}` });
    if (filters.rulesets !== "all") active.push({ key: "rulesets", label: `Rulesets: ${TRI_LABELS[filters.rulesets]}` });
    if (filters.bypassActors !== "all") active.push({ key: "bypassActors", label: `Bypasses: ${TRI_LABELS[filters.bypassActors]}` });
    if (filters.remediation !== "all") active.push({ key: "remediation", label: `Remediation: ${TRI_LABELS[filters.remediation]}` });
    if (filters.visibility !== "all") active.push({ key: "visibility", label: `Visibility: ${filters.visibility}` });
    if (filters.includeArchived) active.push({ key: "includeArchived", label: "Archived included" });
    if (filters.focus !== "all") active.push({ key: "focus", label: `Focus: ${REPOSITORY_FOCUS_LABELS[filters.focus]}` });
    return active;
  }, [filters]);

  const clearUrlContext = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("view");
    url.searchParams.delete("repository");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  };

  const clearFilter = (key: keyof RepositoryFilters) => {
    setFilters((current) => ({ ...current, [key]: DEFAULT_REPOSITORY_FILTERS[key] }));
    setPreset(null);
    if (key === "focus" || key === "repository") clearUrlContext();
  };

  const toggleRemediation = (repoName: string) => {
    setSelectedRemediations((current) => {
      const next = new Set(current);
      if (next.has(repoName)) next.delete(repoName);
      else next.add(repoName);
      return next;
    });
  };

  const selectableRows = rows.filter((repo) => repositoryRemediation(repo).length > 0);
  const allVisibleSelected = selectableRows.length > 0 && selectableRows.every((repo) => selectedRemediations.has(repo.name));
  const toggleAllVisible = () => {
    setSelectedRemediations((current) => {
      const next = new Set(current);
      if (allVisibleSelected) selectableRows.forEach((repo) => next.delete(repo.name));
      else selectableRows.forEach((repo) => next.add(repo.name));
      return next;
    });
  };

  const downloadReport = () => {
    const csv = reportDepth === "basic"
      ? createBasicRepositoryReportCsv(rows, selectedRemediations, filters)
      : createRepositoryReportCsv(rows, selectedRemediations);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const filterSlug = [
      filters.codeowners !== "all" ? `codeowners-${filters.codeowners}` : "",
      filters.protection !== "all" ? `protected-${filters.protection}` : "",
      filters.remediation !== "all" ? `remediation-${filters.remediation}` : "",
    ].filter(Boolean).join("-") || "all-repositories";
    anchor.href = url;
    anchor.download = `${org}-repository-audit-${filterSlug}-${reportDepth}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const reportColumnCount = reportDepth === "basic"
    ? basicRepositoryReportHeaders(filters, selectedRemediations.size > 0).length
    : REPOSITORY_REPORT_HEADERS.length;

  const governanceData = [
    { name: "Owned + protected", value: analytics.governed, color: "var(--ok)" },
    { name: "Owners only", value: rows.filter((repo) => repo.hasCodeowners && !repo.defaultBranchProtected).length, color: "var(--warn)" },
    { name: "Protection only", value: rows.filter((repo) => !repo.hasCodeowners && repo.defaultBranchProtected).length, color: "var(--info)" },
    { name: "Neither", value: rows.filter((repo) => !repo.hasCodeowners && !repo.defaultBranchProtected).length, color: "var(--bad)" },
  ];
  const protectionData = [
    { name: "Both", value: rows.filter((repo) => repo.branchProtection && repo.rulesets.some((ruleset) => ruleset.target === "BRANCH" && ruleset.enforcement === "ACTIVE")).length, color: "var(--ok)" },
    { name: "Ruleset only", value: rows.filter((repo) => !repo.branchProtection && repo.protectionSource === "ruleset").length, color: "var(--accent)" },
    { name: "Branch rule only", value: rows.filter((repo) => repo.branchProtection && !repo.rulesets.some((ruleset) => ruleset.target === "BRANCH" && ruleset.enforcement === "ACTIVE")).length, color: "var(--info)" },
    { name: "Unprotected", value: rows.filter((repo) => repo.protectionSource === "none").length, color: "var(--bad)" },
  ];
  const ownerData = [
    { name: "Teams", value: analytics.ownerTypes.teams, color: "var(--accent)" },
    { name: "Users", value: analytics.ownerTypes.users, color: "var(--info)" },
    { name: "Emails", value: analytics.ownerTypes.emails, color: "var(--warn)" },
  ];
  const restrictionData = [
    { name: "Force push blocked", value: analytics.branch.forcePushBlocked, color: "var(--ok)" },
    { name: "Deletion blocked", value: analytics.branch.deletionBlocked, color: "var(--accent)" },
    { name: "Approval required", value: analytics.branch.reviewRequired, color: "var(--info)" },
    { name: "CODEOWNERS review", value: analytics.branch.codeownerReview, color: "var(--warn)" },
  ];
  const scopeData = [
    { name: "Default protected", value: analytics.protectedCount, color: "var(--ok)" },
    { name: "Additional scopes", value: analytics.branch.additionalScope, color: "var(--accent)" },
    { name: "Unprotected", value: rows.length - analytics.protectedCount, color: "var(--bad)" },
  ];
  const branchProtectionView = filters.focus === "branch-protection";

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-lg border border-border bg-surface shadow-[var(--shadow)]">
        {filters.focus !== "all" && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-info/20 bg-info/[0.055] px-4 py-3">
            <div className="flex items-center gap-2.5">
              <UsersThree size={17} weight="duotone" className="text-info" aria-hidden />
              <div><div className="text-[10px] font-semibold uppercase tracking-[0.07em] text-info">{branchProtectionView ? "Developer report" : "CODEOWNERS remediation"}</div><div className="text-xs font-semibold">{REPOSITORY_FOCUS_LABELS[filters.focus]}</div></div>
            </div>
            <span className="text-[11px] text-muted">{branchProtectionView ? "All repositories are included, including archived repositories." : "Showing only repositories affected by this control."}</span>
          </div>
        )}
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border px-4 py-4">
          <div>
            <div className="flex items-center gap-2"><FunnelSimple size={18} className="text-info" weight="duotone" aria-hidden /><h2 className="text-sm font-semibold">Repository audit builder</h2></div>
            <p className="mt-1 text-xs text-muted">Combine controls, inspect the result, and export exactly what is visible.</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div role="group" aria-label="Report depth" className="inline-flex h-9 rounded-md border border-border bg-surface-2 p-0.5">
              {(["basic", "deep"] as ReportDepth[]).map((depth) => <button key={depth} type="button" onClick={() => setReportDepth(depth)} aria-pressed={reportDepth === depth} className={`rounded px-2.5 text-[11px] font-semibold capitalize ${reportDepth === depth ? "bg-surface text-info shadow-sm" : "text-muted hover:text-foreground"}`}>{depth}</button>)}
            </div>
            <button type="button" onClick={downloadReport} disabled={rows.length === 0} className="inline-flex h-9 items-center gap-2 rounded-md bg-info px-3.5 text-xs font-semibold text-white hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-45">
              <FileCsv size={17} weight="duotone" aria-hidden /> Download {reportDepth} <span className="rounded bg-white/15 px-1.5 py-0.5 tabular-nums">{rows.length}</span>
            </button>
            <span className="basis-full text-right text-[10px] text-muted">{reportDepth === "basic" ? "Focused developer report" : "Full audit evidence"} · {reportColumnCount} columns</span>
          </div>
        </div>

        <div className="border-b border-border bg-surface-2/50 px-4 py-3">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.07em] text-muted">Quick views</div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            {PRESETS.map((item) => (
              <button key={item.id} type="button" onClick={() => applyPreset(item.id)} className={`rounded-md border px-3 py-2 text-left transition-colors ${preset === item.id ? "border-info bg-info/8" : "border-border bg-surface hover:border-border-strong"}`}>
                <span className="block text-xs font-semibold">{item.label}</span><span className="mt-0.5 block text-[10px] text-muted">{item.description}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="p-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
            <label className="space-y-1 md:col-span-2">
              <span className="block text-[10px] font-semibold uppercase tracking-[0.07em] text-muted">Search repository or owner</span>
              <input value={filters.query} onChange={(event) => updateFilter("query", event.target.value)} placeholder="repo, @team, @user…" className="h-9 w-full rounded-md border border-border bg-surface px-3 text-xs outline-none placeholder:text-subtle focus:border-info" />
            </label>
            <TriSelect label=".github" value={filters.dotGithub} onChange={(value) => updateFilter("dotGithub", value)} />
            <TriSelect label="CODEOWNERS" value={filters.codeowners} onChange={(value) => updateFilter("codeowners", value)} />
            <TriSelect label="Protected" value={filters.protection} onChange={(value) => updateFilter("protection", value)} />
            <TriSelect label="Rulesets" value={filters.rulesets} onChange={(value) => updateFilter("rulesets", value)} />
            <TriSelect label="Bypass actors" value={filters.bypassActors} onChange={(value) => updateFilter("bypassActors", value)} />
            <TriSelect label="Needs remediation" value={filters.remediation} onChange={(value) => updateFilter("remediation", value)} />
            <SelectFilter<VisibilityFilter> label="Visibility" value={filters.visibility} onChange={(value) => updateFilter("visibility", value)} options={["all", "public", "private", "internal"].map((value) => ({ value: value as VisibilityFilter, label: value === "all" ? "Any" : value[0].toUpperCase() + value.slice(1) }))} />
            <SelectFilter<SortKey> label="Sort" value={filters.sort} onChange={(value) => updateFilter("sort", value)} options={[{ value: "name", label: "Repository name" }, { value: "remediation", label: "Most gaps first" }, { value: "pushedAt", label: "Latest push" }, { value: "workflows", label: "Workflow count" }]} />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="mr-1 flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={filters.includeArchived} onChange={(event) => updateFilter("includeArchived", event.target.checked)} className="accent-[var(--info)]" />Include archived</label>
            {activeFilters.map((filter) => <button key={filter.key} type="button" onClick={() => clearFilter(filter.key)} className="inline-flex items-center gap-1 rounded-full border border-info/25 bg-info/7 px-2 py-1 text-[10px] font-medium text-info hover:bg-info/12">{filter.label} <X size={10} aria-hidden /></button>)}
            {activeFilters.length > 0 && <button type="button" onClick={() => applyPreset("all")} className="text-[10px] font-medium text-muted hover:text-foreground">Clear filters</button>}
            <span className="ml-auto text-xs text-muted"><strong className="text-foreground">{rows.length}</strong> of {repos.length} repositories</span>
          </div>
        </div>
      </section>

      <section className="grid overflow-hidden rounded-lg border border-border bg-surface shadow-[var(--shadow)] sm:grid-cols-2 xl:grid-cols-5" aria-label="Filtered repository metrics">
        {branchProtectionView ? <>
          <AuditMetric icon={ShieldCheck} label="Repositories" value={rows.length} hint="including archived" tone="info" />
          <AuditMetric icon={GitBranch} label="Protected" value={analytics.protectedCount} hint={`${percentage(analytics.protectedCount, rows.length)} coverage`} tone="ok" />
          <AuditMetric icon={CheckCircle} label="Force push blocked" value={analytics.branch.forcePushBlocked} hint={`${percentage(analytics.branch.forcePushBlocked, rows.length)} coverage`} tone="ok" />
          <AuditMetric icon={CheckCircle} label="Deletion blocked" value={analytics.branch.deletionBlocked} hint={`${percentage(analytics.branch.deletionBlocked, rows.length)} coverage`} tone="accent" />
          <AuditMetric icon={UsersThree} label="Review required" value={analytics.branch.reviewRequired} hint={`${percentage(analytics.branch.reviewRequired, rows.length)} coverage`} tone="info" />
        </> : <>
          <AuditMetric icon={ShieldCheck} label="Matched" value={rows.length} hint="exported rows" tone="info" />
          <AuditMetric icon={UsersThree} label="CODEOWNERS" value={analytics.owners} hint={`${percentage(analytics.owners, rows.length)} coverage`} tone="accent" />
          <AuditMetric icon={GitBranch} label="Protected" value={analytics.protectedCount} hint={`${percentage(analytics.protectedCount, rows.length)} coverage`} tone="ok" />
          <AuditMetric icon={Warning} label="Need remediation" value={analytics.remediation} hint={`${selectedRemediations.size} selected`} tone={analytics.remediation > 0 ? "bad" : "ok"} />
          <AuditMetric icon={CheckCircle} label="Bypass actors" value={analytics.bypasses} hint="across active rulesets" tone={analytics.bypasses > 0 ? "warn" : "ok"} />
        </>}
      </section>

      <section className="grid gap-4 xl:grid-cols-3" aria-label="Filtered governance charts">
        {branchProtectionView ? <>
          <ChartCard title="Protection source" subtitle="Classic rules, rulesets, or both"><Donut data={protectionData} center={percentage(analytics.protectedCount, rows.length)} /></ChartCard>
          <ChartCard title="Restriction coverage" subtitle="Repositories where each safeguard is enforced"><CompactBars data={restrictionData} /></ChartCard>
          <ChartCard title="Protection scope" subtitle="Default branch coverage and additional branch patterns"><CompactBars data={scopeData} /></ChartCard>
        </> : <>
          <ChartCard title="Governance matrix" subtitle="How CODEOWNERS and protection overlap">
            <ResponsiveContainer width="100%" height="100%"><BarChart data={governanceData} layout="vertical" margin={{ left: 4, right: 12 }}><XAxis type="number" hide /><YAxis type="category" dataKey="name" width={105} tick={{ fontSize: 10, fill: "var(--muted)" }} axisLine={false} tickLine={false} /><Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--surface-2)" }} /><Bar dataKey="value" name="Repositories" radius={[0, 4, 4, 0]}>{governanceData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}</Bar></BarChart></ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Protection source" subtitle="Which mechanism protects the filtered set"><Donut data={protectionData} center={percentage(analytics.protectedCount, rows.length)} /></ChartCard>
          <ChartCard title="Ownership attribution" subtitle="Owner references across matching repositories">{ownerData.some((entry) => entry.value > 0) ? <Donut data={ownerData} center={String(ownerData.reduce((sum, entry) => sum + entry.value, 0))} /> : <EmptyState>No owner references in this filtered set.</EmptyState>}</ChartCard>
        </>}
      </section>

      <section className="overflow-hidden rounded-lg border border-border bg-surface shadow-[var(--shadow)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3.5">
          <div><h2 className="text-[13px] font-semibold">{branchProtectionView ? "Branch protection by repository" : "Repository evidence"}</h2><p className="mt-0.5 text-[11px] text-muted">{branchProtectionView ? "Scope, restrictions, review requirements, and bypasses in one developer-focused view." : "Expand a row for ownership patterns, applied rules, branches, and bypass actors."}</p></div>
          <div className="flex items-center gap-3 text-xs text-muted">{!branchProtectionView && <span>{selectedRemediations.size} remediation rows selected</span>}<button type="button" onClick={downloadReport} disabled={rows.length === 0} className="inline-flex items-center gap-1.5 rounded-md border border-border-strong bg-surface px-2.5 py-1.5 font-medium text-info hover:bg-surface-2 disabled:opacity-45"><DownloadSimple size={14} aria-hidden /> Export {reportDepth} CSV</button></div>
        </div>

        {rows.length === 0 ? <EmptyState>No repositories match this audit view.</EmptyState> : (
          <div className="max-h-[72vh] overflow-auto">
            {branchProtectionView ? <BranchProtectionTable repos={rows} /> : <table className="w-full min-w-[1120px] text-xs">
                <thead><tr><Th className="w-10"><span className="sr-only">Expand</span></Th><Th className="w-10"><input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} aria-label="Select all visible remediations" className="accent-[var(--info)]" /></Th><Th>Repository</Th><Th>CODEOWNERS attribution</Th><Th>Branch protection</Th><Th>Bypass actors</Th><Th>Remediation plan</Th></tr></thead>
                <tbody>
                  {rows.map((repo) => {
                    const isExpanded = expanded === repo.name;
                    const remediations = repositoryRemediation(repo);
                    return <RepoEvidenceRows key={repo.name} repo={repo} expanded={isExpanded} selected={selectedRemediations.has(repo.name)} remediations={remediations} bypassActors={repo.rulesets.flatMap((ruleset) => ruleset.bypassActors)} onExpand={() => setExpanded(isExpanded ? null : repo.name)} onSelect={() => toggleRemediation(repo.name)} />;
                  })}
                </tbody>
              </table>}
          </div>
        )}
      </section>
    </div>
  );
}

function TriSelect({ label, value, onChange }: { label: string; value: TriFilter; onChange: (value: TriFilter) => void }) {
  return <SelectFilter label={label} value={value} onChange={onChange} options={(Object.keys(TRI_LABELS) as TriFilter[]).map((key) => ({ value: key, label: TRI_LABELS[key] }))} />;
}

function AuditMetric({ icon: Icon, label, value, hint, tone }: { icon: typeof ShieldCheck; label: string; value: number; hint: string; tone: "ok" | "warn" | "bad" | "info" | "accent" }) {
  const color = { ok: "text-ok", warn: "text-warn", bad: "text-bad", info: "text-info", accent: "text-accent" }[tone];
  return <div className="metric-divider flex items-center gap-3 px-4 py-3.5"><span className={`flex h-9 w-9 items-center justify-center rounded-md bg-surface-2 ${color}`}><Icon size={19} weight="duotone" aria-hidden /></span><span className="min-w-0"><span className="block text-[10px] font-semibold uppercase tracking-[0.07em] text-muted">{label}</span><span className={`mt-0.5 block text-xl font-semibold tabular-nums ${color}`}>{value}</span><span className="block truncate text-[10px] text-muted">{hint}</span></span></div>;
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <div className="h-[250px] rounded-lg border border-border bg-surface p-4 shadow-[var(--shadow)]"><h3 className="text-xs font-semibold">{title}</h3><p className="mt-0.5 text-[10px] text-muted">{subtitle}</p><div className="mt-3 h-[185px]">{children}</div></div>;
}

function CompactBars({ data }: { data: { name: string; value: number; color: string }[] }) {
  return <ResponsiveContainer width="100%" height="100%"><BarChart data={data} layout="vertical" margin={{ left: 8, right: 12 }}><XAxis type="number" hide /><YAxis type="category" dataKey="name" width={112} tick={{ fontSize: 10, fill: "var(--muted)" }} axisLine={false} tickLine={false} /><Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--surface-2)" }} /><Bar dataKey="value" name="Repositories" radius={[0, 4, 4, 0]}>{data.map((entry) => <Cell key={entry.name} fill={entry.color} />)}</Bar></BarChart></ResponsiveContainer>;
}

function Donut({ data, center }: { data: { name: string; value: number; color: string }[]; center: string }) {
  return <div className="flex h-full items-center gap-3"><div className="relative h-full min-w-0 flex-1"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data} dataKey="value" nameKey="name" innerRadius={44} outerRadius={65} paddingAngle={2} stroke="var(--surface)">{data.map((entry) => <Cell key={entry.name} fill={entry.color} />)}</Pie><Tooltip contentStyle={tooltipStyle} /></PieChart></ResponsiveContainer><span className="pointer-events-none absolute inset-0 flex items-center justify-center text-lg font-semibold tabular-nums">{center}</span></div><div className="w-28 space-y-2">{data.map((entry) => <div key={entry.name} className="flex items-center gap-2 text-[10px]"><span className="h-2 w-2 rounded-sm" style={{ background: entry.color }} /><span className="truncate text-muted">{entry.name}</span><span className="ml-auto font-semibold tabular-nums">{entry.value}</span></div>)}</div></div>;
}

function BranchProtectionTable({ repos }: { repos: RepoSummary[] }) {
  return <table className="w-full min-w-[1180px] text-xs">
    <thead><tr><Th>Repository</Th><Th>Default branch</Th><Th>Protection</Th><Th>Scope</Th><Th>Restrictions</Th><Th>Review policy</Th><Th>Bypass actors</Th></tr></thead>
    <tbody>{repos.map((repo) => <BranchProtectionRow key={repo.name} repo={repo} />)}</tbody>
  </table>;
}

function BranchProtectionRow({ repo }: { repo: RepoSummary }) {
  const record = repositoryReportRecord(repo, false);
  const patterns = String(record.protected_patterns || "").split(" | ").filter(Boolean);
  const bypasses = String(record.bypass_actors || "").split(" | ").filter(Boolean);
  const forcePushBlocked = record.force_pushes_allowed === false;
  const deletionBlocked = record.deletions_allowed === false;
  const approvals = Number(record.required_approvals ?? 0);
  const codeownerReview = record.codeowner_review_required === true;

  return <tr className="hover:bg-surface-2/60">
    <Td><Link href={`/repos/${encodeURIComponent(repo.name)}`} className="font-semibold text-info hover:underline">{repo.name}</Link><div className="mt-1 flex gap-1.5"><Badge tone={repo.visibility.toLowerCase() === "public" ? "warn" : "muted"}>{repo.visibility.toLowerCase()}</Badge>{repo.archived && <Badge tone="warn">archived</Badge>}</div></Td>
    <Td><code className="text-[11px] text-foreground">{repo.defaultBranch ?? "—"}</code></Td>
    <Td>{repo.defaultBranchProtected ? <><Badge tone="ok">Protected</Badge><div className="mt-1 text-[10px] text-muted">{String(record.protection_source).replaceAll("-", " ")}</div></> : <Badge tone="bad">Unprotected</Badge>}</Td>
    <Td className="max-w-[260px]">{patterns.length > 0 ? <div className="flex flex-wrap gap-1">{patterns.slice(0, 3).map((pattern) => <span key={pattern} className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[9px] text-muted">{pattern}</span>)}{patterns.length > 3 && <Badge tone="muted">+{patterns.length - 3}</Badge>}</div> : <span className="text-muted">No protected scope</span>}</Td>
    <Td><div className="flex flex-wrap gap-1"><Badge tone={forcePushBlocked ? "ok" : "bad"}>{forcePushBlocked ? "Force push blocked" : "Force push allowed"}</Badge><Badge tone={deletionBlocked ? "ok" : "bad"}>{deletionBlocked ? "Deletion blocked" : "Deletion allowed"}</Badge></div></Td>
    <Td><div className="flex flex-wrap gap-1">{approvals > 0 ? <Badge tone="info">{approvals} approval{approvals === 1 ? "" : "s"}</Badge> : <Badge tone="warn">No approval required</Badge>}<Badge tone={codeownerReview ? "ok" : "muted"}>{codeownerReview ? "CODEOWNERS review" : "No owner review"}</Badge></div></Td>
    <Td>{bypasses.length > 0 ? <div className="max-w-[230px] space-y-1">{bypasses.slice(0, 2).map((bypass) => <div key={bypass} className="truncate text-[10px] text-warn">{bypass}</div>)}{bypasses.length > 2 && <Badge tone="muted">+{bypasses.length - 2}</Badge>}</div> : <Badge tone="ok">None returned</Badge>}</Td>
  </tr>;
}

function RepoEvidenceRows({ repo, expanded, selected, remediations, bypassActors, onExpand, onSelect }: {
  repo: RepoSummary;
  expanded: boolean;
  selected: boolean;
  remediations: string[];
  bypassActors: RepoSummary["rulesets"][number]["bypassActors"];
  onExpand: () => void;
  onSelect: () => void;
}) {
  const owners = repo.codeowners?.teams.length ? repo.codeowners.teams : repo.codeowners?.owners ?? [];
  const activeRulesets = repo.rulesets.filter((ruleset) => ruleset.target === "BRANCH" && ruleset.enforcement === "ACTIVE");
  const protectedScope = repo.branchProtection?.pattern ?? (activeRulesets.flatMap((ruleset) => ruleset.includes).join(", ") || "Default branch");
  return (
    <>
      <tr className={selected ? "bg-info/[0.045]" : "hover:bg-surface-2/60"}>
        <Td><button type="button" onClick={onExpand} aria-expanded={expanded} aria-label={`${expanded ? "Collapse" : "Expand"} ${repo.name}`} className="rounded p-1 text-muted hover:bg-surface-2 hover:text-foreground">{expanded ? <CaretDown size={14} /> : <CaretRight size={14} />}</button></Td>
        <Td><input type="checkbox" checked={selected} disabled={remediations.length === 0} onChange={onSelect} aria-label={`Select remediation for ${repo.name}`} className="accent-[var(--info)] disabled:opacity-30" /></Td>
        <Td><Link href={`/repos/${encodeURIComponent(repo.name)}`} className="font-semibold text-info hover:underline">{repo.name}</Link><div className="mt-1 flex items-center gap-1.5"><Badge tone={repo.visibility.toLowerCase() === "public" ? "warn" : "muted"}>{repo.visibility.toLowerCase()}</Badge><span className="text-[10px] text-muted">{repo.defaultBranch ?? "no default branch"}</span></div></Td>
        <Td className="max-w-[280px]">{repo.hasCodeowners ? <div><div className="flex flex-wrap gap-1">{owners.slice(0, 2).map((owner) => <Badge key={owner} tone="accent">{owner}</Badge>)}{owners.length > 2 && <Badge tone="muted">+{owners.length - 2}</Badge>}</div><div className="mt-1 text-[10px] text-muted">{repo.codeowners?.ruleCount ?? 0} patterns · {repo.codeowners?.truncated ? "partial" : repo.codeownersErrorCount ? `${repo.codeownersErrorCount} errors` : "valid"}</div></div> : <Badge tone="bad">Missing CODEOWNERS</Badge>}</Td>
        <Td className="max-w-[260px]">{repo.defaultBranchProtected ? <div><Badge tone="ok">{repo.branchProtection && activeRulesets.length > 0 ? "Branch + rulesets" : repo.protectionSource === "ruleset" ? "Ruleset" : "Branch rule"}</Badge><div className="mt-1 truncate text-[10px] text-muted">{protectedScope}</div></div> : <Badge tone="bad">Unprotected</Badge>}</Td>
        <Td>{bypassActors.length > 0 ? <Badge tone="warn">{bypassActors.length} configured</Badge> : <Badge tone="ok">None returned</Badge>}</Td>
        <Td className="max-w-[300px]">{remediations.length > 0 ? <div className="flex items-start gap-2"><Warning size={14} weight="fill" className="mt-0.5 shrink-0 text-warn" aria-hidden /><span><span className="font-medium text-warn">{remediations.length} action{remediations.length === 1 ? "" : "s"}</span><span className="mt-0.5 block truncate text-[10px] text-muted">{remediations.join(" · ")}</span></span></div> : <span className="inline-flex items-center gap-1.5 font-medium text-ok"><CheckCircle size={14} weight="fill" /> Baseline met</span>}</Td>
      </tr>
      {expanded && <tr><Td colSpan={7} className="bg-surface-2/55 p-0"><div className="grid gap-4 px-5 py-4 lg:grid-cols-3">
        <EvidencePanel title="CODEOWNERS scope" icon={UsersThree}>{repo.codeowners ? <><EvidenceLine label="Path" value={repo.codeowners.path} /><EvidenceLine label="Teams" value={repo.codeowners.teams.join(", ") || "None"} /><EvidenceLine label="Users" value={repo.codeowners.users.join(", ") || "None"} /><div className="mt-2 max-h-28 overflow-auto rounded border border-border bg-surface">{repo.codeowners.rules.map((rule) => <div key={`${rule.pattern}-${rule.owners.join()}`} className="grid grid-cols-[minmax(100px,0.8fr)_1.2fr] gap-3 border-b border-border/70 px-2.5 py-1.5 text-[10px] last:border-0"><code className="truncate text-foreground">{rule.pattern}</code><span className="truncate text-muted">{rule.owners.join(", ")}</span></div>)}</div></> : <p className="text-[11px] text-muted">No CODEOWNERS ownership map exists.</p>}</EvidencePanel>
        <EvidencePanel title="Protected branches and rules" icon={GitBranch}><EvidenceLine label="Default branch" value={repo.defaultBranch ?? "Unknown"} />{repo.branchProtection && <><EvidenceLine label="Pattern" value={repo.branchProtection.pattern} /><EvidenceLine label="Approvals" value={String(repo.branchProtection.requiredApprovingReviewCount ?? 0)} /></>}{activeRulesets.length > 0 ? activeRulesets.map((ruleset) => <div key={`${ruleset.name}-${ruleset.source}`} className="mt-2 rounded border border-border bg-surface p-2.5"><div className="font-medium">{ruleset.name} <span className="text-[10px] font-normal text-muted">· {ruleset.source}</span></div><div className="mt-1 text-[10px] text-muted">Branches: {ruleset.includes.join(", ") || "all matching refs"}</div><div className="mt-1 flex flex-wrap gap-1">{ruleset.ruleTypes.map((rule) => <span key={rule} className="rounded bg-surface-3 px-1.5 py-0.5 text-[9px] text-muted">{humanRule(rule)}</span>)}</div></div>) : !repo.branchProtection && <p className="mt-2 text-[11px] text-muted">No active branch ruleset applies.</p>}</EvidencePanel>
        <EvidencePanel title="Bypasses and remediation" icon={ShieldCheck}>{bypassActors.length > 0 ? <div className="space-y-1.5">{bypassActors.map((actor, index) => <div key={`${actor.actorType}-${actor.actorName}-${index}`} className="flex items-center justify-between rounded border border-warn/20 bg-warn/5 px-2.5 py-2 text-[10px]"><span className="font-medium text-warn">{actor.actorName}</span><span className="text-muted">{actor.actorType} · {actor.bypassMode}</span></div>)}</div> : <div className="flex items-center gap-2 text-[11px] text-ok"><CheckCircle size={14} weight="fill" /> No bypass actors returned.</div>}<div className="mt-3 space-y-2">{remediations.length > 0 ? <><label className="flex items-center gap-2 rounded border border-border bg-surface px-2.5 py-2 text-[10px] font-medium"><input type="checkbox" checked={selected} onChange={onSelect} className="accent-[var(--info)]" /><span>Include repository in the remediation plan</span></label><div className="space-y-1.5">{remediations.map((action) => <div key={action} className="flex items-start gap-2 text-[10px] text-muted"><Warning size={12} weight="fill" className="mt-0.5 shrink-0 text-warn" aria-hidden /><span>{action}</span></div>)}</div></> : <p className="text-[11px] text-muted">No baseline remediation recommended.</p>}</div></EvidencePanel>
      </div></Td></tr>}
    </>
  );
}

function EvidencePanel({ title, icon: Icon, children }: { title: string; icon: typeof ShieldCheck; children: React.ReactNode }) {
  return <div className="min-w-0"><div className="mb-2 flex items-center gap-2 text-[11px] font-semibold"><Icon size={15} className="text-info" weight="duotone" aria-hidden />{title}</div>{children}</div>;
}

function EvidenceLine({ label, value }: { label: string; value: string }) {
  return <div className="flex gap-3 border-b border-border/60 py-1.5 text-[10px] last:border-0"><span className="w-24 shrink-0 text-muted">{label}</span><span className="min-w-0 break-words font-medium">{value}</span></div>;
}

function humanRule(value: string): string { return value.toLowerCase().replaceAll("_", " "); }
function percentage(value: number, total: number): string { return `${Math.round((value / Math.max(1, total)) * 100)}%`; }

const tooltipStyle = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "6px", color: "var(--foreground)", fontSize: "11px" };
