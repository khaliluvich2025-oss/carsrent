"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { LOCALE_NAMES, type Locale } from "@/lib/i18n";

/**
 * Language choice (spec §8).
 *
 * Plain links rather than a JS handler, so the site is usable before hydration —
 * but rendered on the client so the rest of the query string survives. Switching
 * language halfway through a search must not throw away the customer's dates.
 */
export function LanguageSwitcher({
  locales,
  current,
}: {
  locales: Locale[];
  current: Locale;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const hrefFor = (locale: Locale) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("lang", locale);
    return `${pathname}?${params.toString()}`;
  };

  if (locales.length < 2) return null;

  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-line p-0.5">
      {locales.map((locale) => (
        <Link
          key={locale}
          href={hrefFor(locale)}
          hrefLang={locale.toLowerCase()}
          aria-current={locale === current ? "true" : undefined}
          title={LOCALE_NAMES[locale]}
          className={`rounded px-2 py-1 text-xs font-semibold transition ${
            locale === current
              ? "bg-[var(--brand-soft)] text-[var(--brand)]"
              : "text-ink-muted hover:text-ink"
          }`}
        >
          {locale}
        </Link>
      ))}
    </div>
  );
}
