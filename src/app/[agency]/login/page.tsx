import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { db } from "@/server/db";
import { getSession } from "@/server/auth/session";
import { login } from "./actions";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ agency: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ agency: slug }, query] = await Promise.all([params, searchParams]);
  const rawNext = query.next;
  const next = (Array.isArray(rawNext) ? rawNext[0] : rawNext) ?? "";

  const agency = await db.agency.findUnique({
    where: { slug },
    select: {
      name: true,
      isActive: true,
      primaryColor: true,
      city: true,
      logoFile: { select: { publicUrl: true } },
    },
  });

  if (!agency?.isActive) notFound();

  const session = await getSession();
  if (session?.agencySlug === slug) {
    redirect(`/${slug}/dashboard`);
  }

  const brand = agency.primaryColor || "#4f46e5";

  return (
    <main
      className="flex min-h-dvh items-center justify-center px-4 py-12"
      style={
        {
          "--brand": brand,
          "--brand-soft": `color-mix(in srgb, ${brand} 8%, white)`,
          "--brand-line": `color-mix(in srgb, ${brand} 22%, white)`,
        } as React.CSSProperties
      }
    >
      <div className="w-full max-w-sm">
        <div className="mb-7 text-center">
          {agency.logoFile?.publicUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={agency.logoFile.publicUrl}
              alt={agency.name}
              className="mx-auto mb-4 h-12 w-auto object-contain"
            />
          ) : (
            <div
              className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl text-lg font-semibold text-white"
              style={{ backgroundColor: brand }}
            >
              {agency.name.charAt(0).toUpperCase()}
            </div>
          )}
          <h1 className="text-xl font-semibold tracking-tight text-ink">
            {agency.name}
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            {agency.city ? `${agency.city} · ` : ""}Staff sign in
          </p>
        </div>

        <div className="rounded-card border border-line bg-surface p-6 shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
          <LoginForm action={login.bind(null, slug, next)} />
        </div>

        <p className="mt-5 text-center text-xs text-ink-muted">
          Forgot your password? Ask the agency owner to reset it.
        </p>
      </div>
    </main>
  );
}
