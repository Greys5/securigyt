"use client";

import { useState } from "react";
import Link from "next/link";
import { assessmentCsv, type AssessmentFinding, type AssessmentStatus } from "@/lib/securityAssessment";
import { Badge, EmptyState } from "@/components/ui";

const tones = { observed: "ok", gap: "bad", conditional: "warn", "not assessed": "muted" } as const;

export function Assessment({ findings, org, fetchedAt, stale }: { findings: AssessmentFinding[]; org: string; fetchedAt: number; stale: boolean }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [lens, setLens] = useState("SDLC");
  const visible = findings.filter((f) => (status === "all" || f.status === status) && Object.values(f).join(" ").toLowerCase().includes(query.trim().toLowerCase()));
  const download = () => {
    const url = URL.createObjectURL(new Blob([assessmentCsv(visible)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `${org}-assessment-${new Date().toISOString().slice(0,10)}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <div className="space-y-4">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-xl font-semibold">Security assessment</h1><p className="mt-1 text-xs text-muted">{org} · {stale ? "Cached" : "Fresh"} evidence from {new Date(fetchedAt).toISOString().slice(0,16).replace("T", " ")} UTC</p></div><button onClick={download} className="rounded-md bg-info px-3 py-2 text-xs font-semibold text-white">Export filtered evidence</button></header>
    <div className="rounded-lg border border-border bg-surface p-4 text-xs leading-5 text-muted">Repository configuration evidence for developer remediation and audit preparation. “Observed” confirms a setting, subject to branch scope and bypasses. CSA mappings indicate relevant domains and require assessor review; STAR/CAIQ answers and certification are not inferred.</div>
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">{(["gap", "conditional", "observed", "not assessed"] as AssessmentStatus[]).map((s) => <button key={s} onClick={() => setStatus(status === s ? "all" : s)} className={`rounded-lg border bg-surface p-3 text-left ${status === s ? "border-info" : "border-border"}`}><Badge tone={tones[s]}>{s}</Badge><strong className="mt-2 block text-xl">{findings.filter((f) => f.status === s).length}</strong><span className="text-[10px] text-muted">repository controls</span></button>)}</div>
    <div className="flex flex-wrap gap-2"><input aria-label="Search assessment evidence" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search repositories, controls, threats, evidence…" className="min-w-64 flex-1 rounded-md border border-border bg-surface px-3 py-2 text-xs" /><select aria-label="Assessment lens" value={lens} onChange={(e) => setLens(e.target.value)} className="rounded-md border border-border bg-surface px-3 text-xs">{["SDLC", "STRIDE", "CSA / STAR"].map((l) => <option key={l}>{l}</option>)}</select><button onClick={() => {setStatus("all");setQuery("");}} className="px-2 text-xs text-info">Clear filters</button></div>
    <p className="text-xs text-muted">{visible.length} matching controls · {new Set(visible.map((f) => f.repo)).size} repositories</p>
    <div className="overflow-auto rounded-lg border border-border bg-surface"><table className="w-full min-w-[850px] text-xs"><thead className="bg-surface-2 text-left text-muted"><tr>{["Repository / control", "Status", lens === "SDLC" ? "Lifecycle" : lens === "STRIDE" ? "Threat scenario" : "CSA evidence domain", "Evidence and next step"].map((h) => <th key={h} className="p-3">{h}</th>)}</tr></thead><tbody>{visible.map((f) => <tr key={`${f.repo}:${f.control}`} className="border-t border-border align-top"><td className="p-3"><Link className="font-semibold text-info" href={`/repos/${encodeURIComponent(f.repo)}`}>{f.repo}</Link><span className="mt-1 block">{f.control}</span></td><td className="p-3"><Badge tone={tones[f.status]}>{f.status}</Badge></td><td className="p-3 text-muted">{lens === "SDLC" ? f.stage : lens === "STRIDE" ? f.stride : f.csa}</td><td className="max-w-xl p-3 leading-5"><p>{f.evidence}</p><details className="mt-1"><summary className="cursor-pointer font-semibold text-info">Recommended remediation</summary><p className="mt-1 text-muted">{f.remediation}</p></details></td></tr>)}</tbody></table>{visible.length === 0 && <EmptyState>No controls match these filters.</EmptyState>}</div>
    <footer className="flex flex-wrap gap-4 text-[10px] text-muted"><a href="https://cloudsecurityalliance.org/artifacts/cloud-controls-matrix-v4/" target="_blank" rel="noreferrer">CSA CCM reference</a><a href="https://cloudsecurityalliance.org/artifacts/star-program-overview" target="_blank" rel="noreferrer">STAR assessment reference</a><a href="https://learn.microsoft.com/en-us/windows-hardware/drivers/driversecurity/threat-modeling-for-drivers" target="_blank" rel="noreferrer">STRIDE reference</a><a href="https://csrc.nist.gov/pubs/sp/800/218/final" target="_blank" rel="noreferrer">NIST SSDF / secure SDLC reference</a></footer>
  </div>;
}
