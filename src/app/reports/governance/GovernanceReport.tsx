"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  FileCsv,
  FileHtml,
  MagnifyingGlass,
  Printer,
  ShieldCheck,
  X,
} from "@phosphor-icons/react";
import type { RepoSummary } from "@/lib/github/collectors/repos";
import {
  DEFAULT_GOVERNANCE_FILTERS,
  buildGovernanceReport,
  createGovernanceReportHtml,
  createGroupedGovernanceCsv,
  filterGovernanceRepositories,
  repositoryProtectionDetails,
  type GovernanceFilters,
  type RepositoryProtectionDetail,
} from "@/lib/governanceReport";
import { Badge, EmptyState } from "@/components/ui";

function downloadBlob(contents: string, type: string, filename: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function percent(value: number, total: number): string {
  return `${Math.round((value / Math.max(1, total)) * 100)}%`;
}

function utcTimestamp(value: number): string {
  return `${new Date(value).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function pushedDate(value: string | null): string {
  return value ? value.slice(0, 10) : "never";
}

function uniqueBypassActors(protections: RepositoryProtectionDetail[]) {
  return [...new Map(
    protections.flatMap((protection) => protection.bypassActors).map((actor) => [actor.key, actor]),
  ).values()];
}

export function GovernanceReport({
  repos,
  org,
  fetchedAt,
  stale,
}: {
  repos: RepoSummary[];
  org: string;
  fetchedAt: number;
  stale: boolean;
}) {
  const [filters, setFilters] = useState<GovernanceFilters>({
    ...DEFAULT_GOVERNANCE_FILTERS,
    includeArchived: true,
  });
  const rows = useMemo(() => filterGovernanceRepositories(repos, filters), [repos, filters]);
  const report = useMemo(() => buildGovernanceReport(rows), [rows]);
  const query = filters.query.trim();

  const filterSummary = query
    ? `${rows.length} of ${repos.length} repositories · search: ${query}`
    : `${rows.length} repositories · newest activity first`;
  const filenameBase = `${org}-governance-${new Date().toISOString().slice(0, 10)}`;
  const createHtml = () => createGovernanceReportHtml({ repos: rows, org, generatedAt: new Date(), filterSummary });
  const downloadHtml = () => downloadBlob(createHtml(), "text/html;charset=utf-8", `${filenameBase}.html`);
  const downloadCsv = () => downloadBlob(createGroupedGovernanceCsv(rows), "text/csv;charset=utf-8", `${filenameBase}-repositories.csv`);
  const openPrintReport = () => {
    const url = URL.createObjectURL(new Blob([createHtml()], { type: "text/html;charset=utf-8" }));
    window.open(url, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  return (
    <div className="space-y-3">
      <section className="overflow-hidden rounded-lg border border-border bg-surface shadow-[var(--shadow)]">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-info/10 text-info"><ShieldCheck size={18} weight="duotone" aria-hidden /></span>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold">Repository governance</h1>
              <p className="truncate text-[10px] text-muted">{org} · {stale ? "cached" : "fresh"} snapshot {utcTimestamp(fetchedAt)}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={downloadHtml} disabled={rows.length === 0} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-info px-2.5 text-[11px] font-semibold text-white hover:brightness-95 disabled:opacity-40"><FileHtml size={15} aria-hidden /> Visual report</button>
            <button type="button" onClick={openPrintReport} disabled={rows.length === 0} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-strong bg-surface px-2.5 text-[11px] font-semibold hover:bg-surface-2 disabled:opacity-40"><Printer size={14} aria-hidden /> PDF</button>
            <button type="button" onClick={downloadCsv} disabled={rows.length === 0} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-strong bg-surface px-2.5 text-[11px] font-semibold hover:bg-surface-2 disabled:opacity-40"><FileCsv size={14} aria-hidden /> CSV</button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-border bg-surface-2/35 px-4 py-2.5">
          <label className="relative min-w-[260px] flex-1">
            <span className="sr-only">Find a repository</span>
            <MagnifyingGlass size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
            <input
              type="search"
              value={filters.query}
              onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
              placeholder="Find repository, ruleset, organization policy, owner, or bypass actor…"
              className="h-9 w-full rounded-md border border-border bg-surface pl-8 pr-8 text-xs outline-none placeholder:text-subtle focus:border-info"
            />
            {filters.query && <button type="button" onClick={() => setFilters((current) => ({ ...current, query: "" }))} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"><X size={14} aria-hidden /></button>}
          </label>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted">
            <span><strong className="text-foreground">{report.total}</strong> repos</span>
            <span><strong className="text-foreground">{percent(report.codeownersPresent, report.total)}</strong> CODEOWNERS</span>
            <span><strong className="text-foreground">{percent(report.protected, report.total)}</strong> protected</span>
            <span><strong className={report.withBypassActors > 0 ? "text-warn" : "text-ok"}>{report.withBypassActors}</strong> with bypass</span>
          </div>
        </div>
      </section>

      {rows.length === 0 ? <EmptyState>No repository matches “{query}”.</EmptyState> : (
        <section className="overflow-hidden rounded-lg border border-border bg-surface shadow-[var(--shadow)]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
            <div>
              <h2 className="text-xs font-semibold">Repositories → protections → restrictions</h2>
              <p className="text-[10px] text-muted">Newest push first. Organization rulesets are checked and named explicitly.</p>
            </div>
            <span className="text-[10px] text-muted">{rows.length} repositories</span>
          </div>
          <div className="hidden grid-cols-[minmax(150px,0.7fr)_minmax(380px,1.7fr)_minmax(170px,0.75fr)_minmax(170px,0.75fr)] gap-3 border-b border-border bg-surface-2/55 px-4 py-1.5 text-[9px] font-semibold uppercase tracking-[0.07em] text-muted lg:grid">
            <span>Repository</span><span>Protection names and restrictions</span><span>CODEOWNERS</span><span>Bypasses</span>
          </div>
          <div className="max-h-[72vh] divide-y divide-border overflow-auto">
            {rows.map((repo) => {
              const protections = repositoryProtectionDetails(repo);
              const bypassActors = uniqueBypassActors(protections);
              const codeownersStatus = !repo.hasCodeowners ? "missing" : repo.codeownersErrorCount > 0 ? "invalid" : repo.codeowners?.truncated ? "partial" : "valid";
              return (
                <article key={repo.name} className="grid gap-3 px-4 py-3 hover:bg-surface-2/35 lg:grid-cols-[minmax(150px,0.7fr)_minmax(380px,1.7fr)_minmax(170px,0.75fr)_minmax(170px,0.75fr)]">
                  <div className="min-w-0">
                    <Link href={`/repos/${encodeURIComponent(repo.name)}`} className="block truncate text-xs font-semibold text-info hover:underline" title={repo.name}>{repo.name}</Link>
                    <div className="mt-1 text-[9px] text-muted">Last push {pushedDate(repo.pushedAt)}</div>
                    <div className="mt-0.5 text-[9px] text-muted">Default branch: {repo.defaultBranch ?? "—"}</div>
                    {repo.archived && <div className="mt-1"><Badge tone="warn">Archived</Badge></div>}
                  </div>
                  <div className="space-y-1.5">
                    {protections.map((protection) => <ProtectionDetail key={protection.key} protection={protection} />)}
                  </div>
                  <div className="min-w-0">
                    <Badge tone={codeownersStatus === "valid" ? "ok" : codeownersStatus === "partial" ? "warn" : "bad"}>{codeownersStatus}</Badge>
                    <div className="mt-1.5 text-[10px] leading-4 text-muted">{repo.codeowners?.owners.join(" · ") || "No team or user owner"}</div>
                  </div>
                  <div className="min-w-0">
                    {bypassActors.length > 0 ? (
                      <div className="space-y-1">{bypassActors.map((actor) => <div key={actor.key} className="rounded border border-warn/25 bg-warn/5 px-2 py-1 text-[9px] text-warn"><strong>{actor.actorName}</strong><span className="block opacity-80">{actor.actorType} · {actor.bypassMode}</span></div>)}</div>
                    ) : <Badge tone="ok">None</Badge>}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function ProtectionDetail({ protection }: { protection: RepositoryProtectionDetail }) {
  const scope = protection.scopes.join(" · ") || "No protected scope";
  return (
    <div className={`rounded-md border px-2.5 py-2 ${protection.organizationLevel ? "border-ok/30 bg-ok/[0.04]" : protection.kind === "unprotected" ? "border-bad/25 bg-bad/[0.035]" : "border-border bg-surface-2/45"}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <strong className="text-[10px]">{protection.name}</strong>
        <Badge tone={protection.organizationLevel ? "ok" : protection.kind === "unprotected" ? "bad" : "muted"}>{protection.organizationLevel ? "Organization ✓" : protection.origin}</Badge>
      </div>
      <div className="mt-1 text-[9px] text-muted">Applies to {scope}{protection.excludes.length > 0 ? ` · except ${protection.excludes.join(" · ")}` : ""}</div>
      <div className="mt-1 text-[10px] leading-4"><span className="font-semibold text-muted">Restricts:</span> {protection.restrictions.join(" · ") || "No restrictions returned"}</div>
    </div>
  );
}
