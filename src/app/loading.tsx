export default function Loading() {
  return (
    <div className="space-y-5">
      <div className="h-8 w-64 animate-pulse rounded-lg bg-surface-2" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-surface" />
        ))}
      </div>
      <div className="h-96 animate-pulse rounded-xl bg-surface" />
      <p className="text-center text-sm text-muted">
        Scanning the organization… the first load populates the cache; later loads are instant.
      </p>
    </div>
  );
}
