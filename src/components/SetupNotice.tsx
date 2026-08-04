/** Shown instead of a page body when the GitHub App credentials are missing. */

export function SetupNotice({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-2xl rounded-xl border border-warn/30 bg-warn/5 px-6 py-6">
      <h1 className="text-lg font-semibold text-warn">Setup required</h1>
      <p className="mt-2 text-sm text-muted">{message}</p>
      <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-muted">
        <li>Create a GitHub App in your organization (see README).</li>
        <li>
          Copy <code className="font-mono text-foreground">.env.local.example</code> to{" "}
          <code className="font-mono text-foreground">.env.local</code> and fill it in.
        </li>
        <li>
          Run <code className="font-mono text-foreground">npm run verify</code> to confirm every
          permission.
        </li>
      </ol>
    </div>
  );
}
