"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import type { ActionUsage } from "@/lib/github/collectors/actionsInventory";
import { Badge, EmptyState, Td, Th, type Tone } from "@/components/ui";
import { LatestRelease } from "./LatestRelease";

function versionTone(refType: string, pinned: boolean): Tone {
  if (pinned) return "ok";
  if (refType === "branch") return "bad";
  if (refType === "none") return "muted";
  return "warn";
}

export function ActionsTable({ actions }: { actions: ActionUsage[] }) {
  const [query, setQuery] = useState("");
  const [only, setOnly] = useState<"all" | "unpinned" | "third-party" | "multi-version">("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return actions.filter((a) => {
      if (q && !a.name.toLowerCase().includes(q)) return false;
      if (only === "unpinned" && a.unpinnedRefs === 0) return false;
      if (only === "third-party" && (a.firstParty || a.kind === "local")) return false;
      if (only === "multi-version" && a.versions.length < 2) return false;
      return true;
    });
  }, [actions, query, only]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter actions…"
          className="w-64 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm outline-none placeholder:text-muted focus:border-info"
        />
        <label className="flex items-center gap-2 text-xs">
          <span className="text-muted">Show</span>
          <select
            value={only}
            onChange={(e) => setOnly(e.target.value as typeof only)}
            className="rounded-lg border border-border bg-surface-2 px-2 py-1 text-xs outline-none focus:border-info"
          >
            <option value="all">All actions</option>
            <option value="unpinned">With unpinned refs</option>
            <option value="third-party">Third-party only</option>
            <option value="multi-version">Used at 2+ versions</option>
          </select>
        </label>
        <span className="ml-auto text-xs text-muted">
          {rows.length} of {actions.length} actions
        </span>
      </div>

      {rows.length === 0 ? (
        <EmptyState>No actions match these filters.</EmptyState>
      ) : (
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <Th>Action</Th>
                <Th>Kind</Th>
                <Th>Repos</Th>
                <Th>Refs</Th>
                <Th>Unpinned</Th>
                <Th>Versions in use</Th>
                <Th>Latest stable release</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => {
                const open = expanded === a.name;
                return (
                  <Fragment key={a.name}>
                    <tr
                      onClick={() => setExpanded(open ? null : a.name)}
                      className="cursor-pointer hover:bg-surface-2/60"
                    >
                      <Td className="font-mono">
                        <span className="mr-2 text-xs text-muted">{open ? "▾" : "▸"}</span>
                        {a.name}
                      </Td>
                      <Td>
                        <Badge tone={a.firstParty ? "info" : a.kind === "local" ? "muted" : "accent"}>
                          {a.firstParty ? "first-party" : a.kind}
                        </Badge>
                      </Td>
                      <Td className="tabular-nums">{a.repoCount}</Td>
                      <Td className="tabular-nums">{a.totalRefs}</Td>
                      <Td>
                        {a.unpinnedRefs === 0 ? (
                          <Badge tone="ok">0</Badge>
                        ) : (
                          <Badge tone={a.unpinnedRefs === a.totalRefs ? "bad" : "warn"}>
                            {a.unpinnedRefs}/{a.totalRefs}
                          </Badge>
                        )}
                      </Td>
                      <Td>
                        <span className="flex flex-wrap gap-1">
                          {a.versions.slice(0, 6).map((v) => (
                            <Badge
                              key={v.ref ?? "none"}
                              tone={versionTone(v.refType, v.pinned)}
                              title={v.repos.join(", ")}
                            >
                              {v.ref
                                ? v.refType === "sha"
                                  ? `${v.ref.slice(0, 7)}…`
                                  : v.ref
                                : "no ref"}{" "}
                              ×{v.count}
                            </Badge>
                          ))}
                          {a.versions.length > 6 && (
                            <Badge tone="muted">+{a.versions.length - 6}</Badge>
                          )}
                        </span>
                      </Td>
                      <Td><LatestRelease action={a.name} supported={a.kind === "action" || a.kind === "reusable-workflow"} /></Td>
                    </tr>

                    {open && (
                      <tr>
                        <Td colSpan={7} className="bg-surface-2/40 p-0">
                          <div className="px-4 py-3">
                            <div className="mb-2 text-xs font-medium text-muted">
                              {a.sites.length} usage site(s)
                            </div>
                            <div className="max-h-64 overflow-auto rounded-lg border border-border">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr>
                                    <Th>Repository</Th>
                                    <Th>Workflow</Th>
                                    <Th>Job / step</Th>
                                    <Th>Version</Th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {a.sites.map((s, i) => (
                                    <tr key={`${s.repo}-${s.workflow}-${i}`}>
                                      <Td>
                                        <Link
                                          href={`/repos/${encodeURIComponent(s.repo)}`}
                                          className="text-info hover:underline"
                                        >
                                          {s.repo}
                                        </Link>
                                      </Td>
                                      <Td className="font-mono">{s.workflow}</Td>
                                      <Td className="text-muted">
                                        {s.job}
                                        {s.step ? ` › ${s.step}` : ""}
                                      </Td>
                                      <Td>
                                        <Badge tone={versionTone(s.refType, s.pinned)}>
                                          {s.ref ?? "no ref"}
                                        </Badge>
                                      </Td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </Td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
