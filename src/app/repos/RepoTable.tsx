"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { RepoSummary } from "@/lib/github/collectors/repos";
import { Badge, EmptyState, Td, Th } from "@/components/ui";

type TriFilter = "all" | "yes" | "no";

const TRI_LABELS: Record<TriFilter, string> = { all: "All", yes: "Yes", no: "No" };

function TriToggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: TriFilter;
  onChange: (v: TriFilter) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs">
      <span className="text-muted">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as TriFilter)}
        className="rounded-lg border border-border bg-surface-2 px-2 py-1 text-xs text-foreground outline-none focus:border-info"
      >
        {(Object.keys(TRI_LABELS) as TriFilter[]).map((k) => (
          <option key={k} value={k}>
            {TRI_LABELS[k]}
          </option>
        ))}
      </select>
    </label>
  );
}

function matches(filter: TriFilter, value: boolean): boolean {
  return filter === "all" || (filter === "yes") === value;
}

type SortKey = "name" | "pushedAt" | "workflows";

export function RepoTable({ repos }: { repos: RepoSummary[] }) {
  const [query, setQuery] = useState("");
  const [dotGithub, setDotGithub] = useState<TriFilter>("all");
  const [codeowners, setCodeowners] = useState<TriFilter>("all");
  const [protection, setProtection] = useState<TriFilter>("all");
  const [visibility, setVisibility] = useState<"all" | "public" | "private" | "internal">("all");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [sort, setSort] = useState<SortKey>("name");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = repos.filter((r) => {
      if (!includeArchived && r.archived) return false;
      if (q && !r.name.toLowerCase().includes(q) && !(r.description ?? "").toLowerCase().includes(q))
        return false;
      if (visibility !== "all" && r.visibility.toLowerCase() !== visibility) return false;
      if (!matches(dotGithub, r.hasDotGithub)) return false;
      if (!matches(codeowners, r.hasCodeowners)) return false;
      if (!matches(protection, r.defaultBranchProtected)) return false;
      return true;
    });

    return filtered.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "workflows") return b.workflowFiles.length - a.workflowFiles.length;
      return (b.pushedAt ?? "").localeCompare(a.pushedAt ?? "");
    });
  }, [repos, query, dotGithub, codeowners, protection, visibility, includeArchived, sort]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 border-b border-border bg-surface px-4 py-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by name or description…"
          className="w-64 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm outline-none placeholder:text-muted focus:border-info"
        />
        <TriToggle label=".github" value={dotGithub} onChange={setDotGithub} />
        <TriToggle label="CODEOWNERS" value={codeowners} onChange={setCodeowners} />
        <TriToggle label="Protected" value={protection} onChange={setProtection} />

        <label className="flex items-center gap-2 text-xs">
          <span className="text-muted">Visibility</span>
          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as typeof visibility)}
            className="rounded-lg border border-border bg-surface-2 px-2 py-1 text-xs outline-none focus:border-info"
          >
            <option value="all">All</option>
            <option value="public">Public</option>
            <option value="private">Private</option>
            <option value="internal">Internal</option>
          </select>
        </label>

        <label className="flex items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => setIncludeArchived(e.target.checked)}
            className="accent-[var(--info)]"
          />
          Include archived
        </label>

        <label className="flex items-center gap-2 text-xs">
          <span className="text-muted">Sort</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded-lg border border-border bg-surface-2 px-2 py-1 text-xs outline-none focus:border-info"
          >
            <option value="name">Name</option>
            <option value="pushedAt">Last push</option>
            <option value="workflows">Workflow count</option>
          </select>
        </label>

        <span className="ml-auto text-xs text-muted">
          {rows.length} of {repos.length} repos
        </span>
      </div>

      {rows.length === 0 ? (
        <EmptyState>No repositories match these filters.</EmptyState>
      ) : (
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <Th>Repository</Th>
                <Th>Visibility</Th>
                <Th>.github</Th>
                <Th>Workflows</Th>
                <Th>CODEOWNERS</Th>
                <Th>Default branch protection</Th>
                <Th>Rulesets</Th>
                <Th>Security policy</Th>
                <Th>Last push</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name} className="hover:bg-surface-2/60">
                  <Td>
                    <Link
                      href={`/repos/${encodeURIComponent(r.name)}`}
                      className="font-medium text-info hover:underline"
                    >
                      {r.name}
                    </Link>
                    {r.archived && (
                      <span className="ml-2 text-xs text-muted">archived</span>
                    )}
                  </Td>
                  <Td>
                    <Badge tone={r.visibility.toLowerCase() === "public" ? "warn" : "muted"}>
                      {r.visibility.toLowerCase()}
                    </Badge>
                  </Td>
                  <Td>
                    {r.hasDotGithub ? (
                      <Badge tone="ok" title={r.dotGithubEntries.join(", ")}>
                        {r.dotGithubEntries.length}{" "}
                        {r.dotGithubEntries.length === 1 ? "entry" : "entries"}
                      </Badge>
                    ) : (
                      <Badge tone="muted">none</Badge>
                    )}
                  </Td>
                  <Td className="tabular-nums">
                    {r.workflowFiles.length > 0 ? (
                      <Badge tone="info" title={r.workflowFiles.join(", ")}>
                        {r.workflowFiles.length}
                      </Badge>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </Td>
                  <Td>
                    {r.hasCodeowners ? (
                      r.codeownersErrorCount > 0 ? (
                        <Badge tone="warn">{r.codeownersErrorCount} errors</Badge>
                      ) : (
                        <Badge tone="ok">valid</Badge>
                      )
                    ) : (
                      <Badge tone="bad">missing</Badge>
                    )}
                  </Td>
                  <Td>
                    {r.protectionSource === "none" ? (
                      <Badge tone="bad">unprotected</Badge>
                    ) : (
                      <Badge tone="ok">
                        {r.protectionSource === "ruleset" ? "ruleset" : "branch rule"}
                      </Badge>
                    )}
                  </Td>
                  <Td className="tabular-nums">
                    {r.rulesets.length > 0 ? (
                      <Badge
                        tone="accent"
                        title={r.rulesets.map((rs) => `${rs.name} (${rs.source})`).join(", ")}
                      >
                        {r.rulesets.length}
                      </Badge>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </Td>
                  <Td>
                    {r.hasSecurityPolicy ? (
                      <Badge tone="ok">yes</Badge>
                    ) : (
                      <Badge tone="muted">no</Badge>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap text-xs text-muted">
                    {r.pushedAt ? r.pushedAt.slice(0, 10) : "—"}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
