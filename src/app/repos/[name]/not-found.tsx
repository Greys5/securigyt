import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl rounded-xl border border-border bg-surface px-6 py-6 text-center">
      <h1 className="text-lg font-semibold">Repository not found</h1>
      <p className="mt-2 text-sm text-muted">
        It is not in the cached inventory. It may be new, archived out of view, or outside the
        installation&apos;s scope.
      </p>
      <Link
        href="/repos"
        className="mt-4 inline-block rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm hover:border-info hover:text-info"
      >
        Back to repositories
      </Link>
    </div>
  );
}
