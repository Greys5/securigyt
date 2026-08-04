"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { CacheScope } from "@/lib/cache";

export function RefreshButton({
  scopes,
  cacheKey,
  label = "Refresh",
}: {
  scopes: CacheScope[];
  cacheKey?: string;
  label?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setBusy(true);
    try {
      await fetch("/api/refresh", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scopes, key: cacheKey }),
      });
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  const working = busy || pending;
  return (
    <button
      type="button"
      onClick={refresh}
      disabled={working}
      className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-foreground transition hover:border-info/50 hover:text-info disabled:opacity-50"
    >
      {working ? "Refreshing…" : label}
    </button>
  );
}
