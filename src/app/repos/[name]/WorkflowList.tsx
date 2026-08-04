"use client";

import { useState } from "react";
import type { ParsedWorkflow, UsesRef, WorkflowPermissions } from "@/lib/parse/workflow";
import { Badge, EmptyState, Td, Th } from "@/components/ui";

function PinBadge({ use }: { use: UsesRef }) {
  if (use.kind === "local") return <Badge tone="muted">local</Badge>;
  if (use.kind === "docker") return <Badge tone="warn">docker tag</Badge>;
  if (use.pinned) return <Badge tone="ok">SHA pinned</Badge>;
  if (use.refType === "none") return <Badge tone="bad">no version</Badge>;
  if (use.refType === "branch") return <Badge tone="bad">branch ref</Badge>;
  // A moving tag on a first-party action is the common, accepted trade-off.
  return <Badge tone={use.firstParty ? "warn" : "bad"}>mutable tag</Badge>;
}

function PermissionsCell({ permissions }: { permissions: WorkflowPermissions }) {
  if (permissions === null) return <span className="text-muted">inherited (default)</span>;
  if (typeof permissions === "string") {
    return <Badge tone={permissions === "write-all" ? "bad" : "warn"}>{permissions}</Badge>;
  }
  const entries = Object.entries(permissions);
  if (entries.length === 0) return <Badge tone="ok">none</Badge>;
  return (
    <span className="flex flex-wrap gap-1">
      {entries.map(([scope, level]) => (
        <Badge key={scope} tone={level === "write" ? "warn" : "muted"}>
          {scope}: {level}
        </Badge>
      ))}
    </span>
  );
}

export function WorkflowList({ workflows }: { workflows: ParsedWorkflow[] }) {
  const [open, setOpen] = useState<string | null>(workflows[0]?.file ?? null);

  if (workflows.length === 0) {
    return <EmptyState>This repository has no workflow files under .github/workflows.</EmptyState>;
  }

  return (
    <div className="divide-y divide-border">
      {workflows.map((wf) => {
        const expanded = open === wf.file;
        const unpinned = wf.uses.filter((u) => !u.pinned && u.kind !== "docker").length;

        return (
          <div key={wf.file}>
            <button
              type="button"
              onClick={() => setOpen(expanded ? null : wf.file)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2/60"
            >
              <span className="text-xs text-muted">{expanded ? "▾" : "▸"}</span>
              <span className="font-mono text-sm">{wf.file}</span>
              {wf.name && <span className="truncate text-xs text-muted">{wf.name}</span>}

              <span className="ml-auto flex flex-wrap items-center gap-1.5">
                {wf.parseError && <Badge tone="bad">parse error</Badge>}
                {wf.riskyTriggers.map((t) => (
                  <Badge key={t} tone="bad" title="Runs with repository secrets in a fork context">
                    {t}
                  </Badge>
                ))}
                <Badge tone="muted">{wf.uses.length} uses</Badge>
                {unpinned > 0 && <Badge tone="warn">{unpinned} unpinned</Badge>}
              </span>
            </button>

            {expanded && (
              <div className="border-t border-border bg-surface-2/40 px-4 py-3">
                <dl className="mb-3 grid gap-2 text-xs sm:grid-cols-2">
                  <div>
                    <dt className="text-muted">Triggers</dt>
                    <dd className="mt-1 flex flex-wrap gap-1">
                      {wf.triggers.length === 0 ? (
                        <span className="text-muted">none</span>
                      ) : (
                        wf.triggers.map((t) => (
                          <Badge key={t} tone={wf.riskyTriggers.includes(t) ? "bad" : "muted"}>
                            {t}
                          </Badge>
                        ))
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Workflow permissions</dt>
                    <dd className="mt-1">
                      <PermissionsCell permissions={wf.permissions} />
                    </dd>
                  </div>
                </dl>

                {wf.parseError && (
                  <p className="mb-3 rounded-lg border border-bad/30 bg-bad/5 px-3 py-2 text-xs text-bad">
                    {wf.parseError}
                  </p>
                )}

                {wf.uses.length > 0 && (
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-xs">
                      <thead>
                        <tr>
                          <Th>Action</Th>
                          <Th>Version</Th>
                          <Th>Pinning</Th>
                          <Th>Kind</Th>
                          <Th>Job / step</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {wf.uses.map((use, i) => (
                          <tr key={`${use.raw}-${i}`} className="hover:bg-surface-2/60">
                            <Td className="font-mono">
                              {use.kind === "action" || use.kind === "reusable-workflow" ? (
                                <a
                                  href={`https://github.com/${use.name}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-info hover:underline"
                                >
                                  {use.name}
                                </a>
                              ) : (
                                use.name
                              )}
                              {use.path && use.kind !== "local" && (
                                <span className="text-muted">/{use.path}</span>
                              )}
                            </Td>
                            <Td className="font-mono">
                              {use.ref ? (
                                use.refType === "sha" ? (
                                  <span title={use.ref}>{use.ref.slice(0, 10)}…</span>
                                ) : (
                                  use.ref
                                )
                              ) : (
                                <span className="text-muted">—</span>
                              )}
                            </Td>
                            <Td>
                              <PinBadge use={use} />
                            </Td>
                            <Td>
                              <Badge tone={use.firstParty ? "info" : "muted"}>
                                {use.firstParty ? "first-party" : use.kind}
                              </Badge>
                            </Td>
                            <Td className="text-muted">
                              {use.job}
                              {use.step ? ` › ${use.step}` : ""}
                            </Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {wf.jobs.some((j) => j.permissions !== null) && (
                  <div className="mt-3 space-y-1 text-xs">
                    <div className="text-muted">Job permissions</div>
                    {wf.jobs
                      .filter((j) => j.permissions !== null)
                      .map((j) => (
                        <div key={j.name} className="flex items-center gap-2">
                          <span className="font-mono">{j.name}</span>
                          <PermissionsCell permissions={j.permissions} />
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
