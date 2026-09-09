/**
 * Placeholder blocks for `loading.tsx` route fallbacks.
 *
 * Without a fallback, clicking a link leaves the previous page on screen and
 * frozen until the server has finished — which reads as a broken button rather
 * than as a slow one. These give the click something to land on.
 */

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`animate-pulse rounded-lg bg-surface-sunken ${className}`}
    />
  );
}

/**
 * The default export for `loading.tsx`.
 *
 * These have to sit on the leaf routes, not only on the dashboard segment: a
 * Suspense boundary that is already mounted keeps showing the old page during a
 * transition, so a boundary shared by every dashboard route would never fall
 * back. One per route means each navigation mounts a fresh one.
 */
export function RouteLoading() {
  return <PageSkeleton rows={3} />;
}

/** Same, inside the public site's content column. */
export function SiteRouteLoading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <PageSkeleton rows={2} />
    </div>
  );
}

/** A page header plus a few cards — close enough to almost any screen here. */
export function PageSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-5" role="status" aria-label="Loading">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="rounded-xl border border-line bg-surface p-4 sm:p-5"
        >
          <Skeleton className="h-5 w-40" />
          <div className="mt-4 space-y-2.5">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
