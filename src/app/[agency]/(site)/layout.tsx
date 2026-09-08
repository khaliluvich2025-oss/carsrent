import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";

import { LanguageSwitcher } from "@/components/site/language-switcher";
import { IconMapPin } from "@/components/ui/icons";
import {
  getTranslator,
  localeDir,
  LOCALE_TAGS,
  resolveLocale,
} from "@/lib/i18n";
import { toWhatsAppNumber } from "@/lib/phone";
import { LANG_HEADER } from "@/proxy";
import { getPublicAgency } from "@/server/services/public/agency";

/**
 * The public client website shell (spec §8, §76).
 *
 * Branding comes from the agency record, so every agency gets its own logo,
 * colours and contact details on identical product structure. The language
 * choice lives in the URL rather than a cookie so a customer can share a link in
 * the language they were reading.
 */
export default async function SiteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ agency: string }>;
}) {
  const [{ agency: slug }, headerList] = await Promise.all([params, headers()]);

  const agency = await getPublicAgency(slug);
  if (!agency) notFound();

  // Layouts do not receive searchParams; the proxy forwards `?lang=` as a header.
  const locale = resolveLocale(headerList.get(LANG_HEADER) ?? undefined, agency);
  const t = getTranslator(locale);
  const dir = localeDir(locale);

  const base = `/${slug}`;
  const brand = agency.primaryColor || "#4f46e5";
  const enabled =
    agency.enabledLocales.length > 0 ? agency.enabledLocales : [locale];

  return (
    <div
      lang={LOCALE_TAGS[locale]}
      dir={dir}
      className="flex min-h-dvh flex-col bg-surface"
      style={
        {
          "--brand": brand,
          "--brand-soft": `color-mix(in srgb, ${brand} 8%, white)`,
          "--brand-line": `color-mix(in srgb, ${brand} 22%, white)`,
        } as React.CSSProperties
      }
    >
      <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link href={base} className="flex min-w-0 items-center gap-2.5">
            {agency.logoFile?.publicUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={agency.logoFile.publicUrl}
                alt={agency.name}
                className="h-9 w-auto object-contain"
              />
            ) : (
              <span
                className="flex h-9 w-9 items-center justify-center rounded-lg text-sm font-semibold text-white"
                style={{ backgroundColor: brand }}
              >
                {agency.name.charAt(0).toUpperCase()}
              </span>
            )}
            <span className="truncate text-sm font-semibold text-ink">
              {agency.name}
            </span>
          </Link>

          <nav className="ms-auto flex items-center gap-1">
            <Link
              href={`${base}/my-booking?lang=${locale}`}
              className="rounded-lg px-2.5 py-2 text-sm font-medium text-ink-soft transition hover:text-ink sm:px-3"
            >
              {t("nav.myBooking")}
            </Link>

            <LanguageSwitcher locales={enabled} current={locale} />
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="mt-12 border-t border-line bg-surface-sunken">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          <div className="flex flex-col gap-6 sm:flex-row sm:justify-between">
            <div className="max-w-sm">
              <p className="text-sm font-semibold text-ink">{agency.name}</p>
              {agency.shortDescription ? (
                <p className="mt-1 text-sm text-ink-muted">
                  {agency.shortDescription}
                </p>
              ) : null}
              {agency.address || agency.city ? (
                <p className="mt-3 flex items-start gap-1.5 text-sm text-ink-muted">
                  <span className="mt-0.5 shrink-0">
                    <IconMapPin size={16} />
                  </span>
                  {[agency.address, agency.city].filter(Boolean).join(", ")}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-2">
              {agency.phone ? (
                <a
                  href={`tel:${agency.phone.replace(/\s/g, "")}`}
                  className="text-sm font-medium text-ink transition hover:text-[var(--brand)]"
                >
                  {t("nav.call")}: {agency.phone}
                </a>
              ) : null}
              {agency.whatsapp ? (
                <a
                  href={`https://wa.me/${toWhatsAppNumber(agency.whatsapp)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-ink transition hover:text-[var(--brand)]"
                >
                  {t("nav.whatsapp")}: {agency.whatsapp}
                </a>
              ) : null}
              {agency.email ? (
                <a
                  href={`mailto:${agency.email}`}
                  className="text-sm text-ink-muted transition hover:text-ink"
                >
                  {agency.email}
                </a>
              ) : null}
            </div>
          </div>
        </div>
      </footer>

      {/* Sticky call bar — on a phone, calling is the fastest path to a booking */}
      {agency.phone ? (
        <div
          className="sticky bottom-0 z-40 border-t border-line bg-surface/95 p-3 backdrop-blur sm:hidden"
          style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
        >
          <div className="flex gap-2">
            <a
              href={`tel:${agency.phone.replace(/\s/g, "")}`}
              className="flex h-11 flex-1 items-center justify-center rounded-lg border border-line font-medium text-ink"
            >
              {t("nav.call")}
            </a>
            {agency.whatsapp ? (
              <a
                href={`https://wa.me/${toWhatsAppNumber(agency.whatsapp)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-11 flex-1 items-center justify-center rounded-lg bg-[var(--brand)] font-medium text-[var(--brand-ink)]"
              >
                {t("nav.whatsapp")}
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
