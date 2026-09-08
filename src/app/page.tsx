/**
 * Platform root.
 *
 * Each agency lives at its own `/{slug}` (or its own host — see src/middleware.ts),
 * so there is nothing tenant-specific to show here. Self-serve signup is out of
 * V1 scope; agencies are provisioned by the seed script for now
 * (docs/ARCHITECTURE.md §11.1).
 */
export default function RootPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-slate-900">Car Rental</h1>
        <p className="mt-2 text-sm text-slate-600">
          Rental operations platform. Each agency has its own address — open your
          agency&rsquo;s link to reach its website or staff sign-in.
        </p>
      </div>
    </main>
  );
}
