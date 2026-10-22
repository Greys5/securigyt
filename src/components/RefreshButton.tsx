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
      className="h-8 rounded-md border border-border-strong bg-surface px-3 text-[11px] font-medium text-foreground transition hover:bg-surface-2 hover:text-info disabled:opacity-50"
    >
      {working ? "Refreshing…" : label}
    </button>
  );
}
