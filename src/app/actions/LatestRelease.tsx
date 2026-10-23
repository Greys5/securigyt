"use client";

import { useState } from "react";
import type { ActionRelease } from "@/lib/github/actionRelease";

export function LatestRelease({ action, supported }: { action: string; supported: boolean }) {
  const [result, setResult] = useState<ActionRelease | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  async function refresh() {
    setBusy(true); setError(""); setResult(null); setCopied(false);
    try {
      const response = await fetch(`/api/actions/latest-release?action=${encodeURIComponent(action)}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Lookup failed.");
      setResult(data);
    } catch (e) { setError(e instanceof Error ? e.message : "Lookup failed."); }
    finally { setBusy(false); }
  }
  if (!supported) return <span className="text-[10px] text-muted">GitHub releases unavailable</span>;
  return <div className="min-w-52 space-y-1.5" onClick={(e) => e.stopPropagation()}>
    <button type="button" disabled={busy} onClick={refresh} className="rounded border border-border px-2 py-1 text-xs font-semibold text-info hover:bg-surface-2 disabled:opacity-50">{busy ? "Checking GitHub…" : "Refresh latest stable"}</button>
    <div aria-live="polite">
      {error && <p role="alert" className="max-w-64 text-[10px] text-bad">{error}</p>}
      {result && <div className="space-y-1 text-[10px]">
        <a href={result.releaseUrl} target="_blank" rel="noreferrer" className="font-semibold text-info hover:underline">{result.tag}</a>
        <p className={result.immutable ? "text-ok" : "text-warn"}>{result.immutable === true ? "Immutable release" : result.immutable === false ? "Mutable tag · use SHA pin" : "Tag immutability unknown · use SHA pin"}</p>
        <code className="block max-w-64 break-all text-muted">{result.sha}</code>
        <button type="button" className="text-info hover:underline" onClick={async () => { try { await navigator.clipboard.writeText(result.pin); setCopied(true); } catch { setError("Clipboard unavailable. Copy the SHA above."); } }}>{copied ? "Copied" : "Copy immutable pin"}</button>
        <p className="text-muted">Checked {new Date(result.checkedAt).toLocaleTimeString()}</p>
      </div>}
    </div>
  </div>;
}
