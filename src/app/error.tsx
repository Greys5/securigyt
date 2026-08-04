"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-2xl rounded-xl border border-bad/30 bg-bad/5 px-6 py-6">
      <h1 className="text-lg font-semibold text-bad">Something went wrong</h1>
      <p className="mt-2 font-mono text-sm text-muted">{error.message}</p>
      <p className="mt-3 text-sm text-muted">
        If this is a permission or credential problem, run{" "}
        <code className="font-mono text-foreground">npm run verify</code> to see exactly which
        endpoints are reachable.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-4 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm hover:border-info hover:text-info"
      >
        Try again
      </button>
    </div>
  );
}
