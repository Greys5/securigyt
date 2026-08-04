"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import type { ScoredRepo } from "@/lib/github/collectors/posture";
import type { Grade } from "@/lib/score";
import { Badge, EmptyState, Td, Th, type Tone } from "@/components/ui";

const GRADE_TONE: Record<Grade, Tone> = { A: "ok", B: "ok", C: "warn", D: "warn", F: "bad" };

export function GradeBadge({ grade, percent }: { grade: Grade; percent: number }) {
  return (
    <Badge tone={GRADE_TONE[grade]}>
      {grade} · {percent}%
    </Badge>
  );
}

export function ScoreTable({ scored }: { scored: ScoredRepo[] }) {
  const [query, setQuery] = useState("");
  const [grade, setGrade] = useState<"all" | Grade>("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return scored.filter((s) => {
      if (q && !s.repo.name.toLowerCase().includes(q)) return false;
      if (grade !== "all" && s.score.grade !== grade) return false;
      return true;
    });
  }, [scored, query, grade]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter repositories…"
          className="w-64 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm outline-none placeholder:text-muted focus:border-info"
        />
        <label className="flex items-center gap-2 text-xs">
          <span className="text-muted">Grade</span>
          <select
            value={grade}
            onChange={(e) => setGrade(e.target.value as typeof grade)}
            className="rounded-lg border border-border bg-surface-2 px-2 py-1 text-xs outline-none focus:border-info"
          >
            <option value="all">All</option>
            {(["A", "B", "C", "D", "F"] as Grade[]).map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
        <span className="ml-auto text-xs text-muted">
          {rows.length} of {scored.length} repositories · worst first
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
                <Th>Score</Th>
                <Th>Failing checks</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ repo, score }) => {
                const open = expanded === repo.name;
                return (
                  <Fragment key={repo.name}>
                    <tr
                      onClick={() => setExpanded(open ? null : repo.name)}
                      className="cursor-pointer hover:bg-surface-2/60"
                    >
                      <Td>
                        <span className="mr-2 text-xs text-muted">{open ? "▾" : "▸"}</span>
                        <Link
                          href={`/repos/${encodeURIComponent(repo.name)}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-info hover:underline"
                        >
                          {repo.name}
                        </Link>
                      </Td>
                      <Td>
                        <GradeBadge grade={score.grade} percent={score.percent} />
                      </Td>
                      <Td>
                        <span className="flex flex-wrap gap-1">
                          {score.failed.length === 0 ? (
                            <Badge tone="ok">none</Badge>
                          ) : (
                            score.failed.map((c) => (
                              <Badge key={c.id} tone={c.weight >= 2 ? "bad" : "warn"}>
                                {c.label}
                              </Badge>
                            ))
                          )}
                        </span>
                      </Td>
                    </tr>

                    {open && (
                      <tr>
                        <Td colSpan={3} className="bg-surface-2/40 p-0">
                          <div className="px-4 py-3">
                            <div className="mb-2 text-xs text-muted">
                              {score.earnedWeight} of {score.applicableWeight} applicable weight
                            </div>
                            <ul className="grid gap-1 sm:grid-cols-2">
                              {score.checks.map((c) => (
                                <li
                                  key={c.id}
                                  className="flex items-start justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2 text-xs"
                                >
                                  <span>
                                    <span className="block">{c.label}</span>
                                    <span className="text-muted">{c.detail}</span>
                                  </span>
                                  <Badge
                                    tone={
                                      c.status === "pass"
                                        ? "ok"
                                        : c.status === "fail"
                                          ? "bad"
                                          : "muted"
                                    }
                                  >
                                    {c.status}
                                  </Badge>
                                </li>
                              ))}
                            </ul>
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
