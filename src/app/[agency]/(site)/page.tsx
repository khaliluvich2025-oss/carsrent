import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Card } from "@/components/ui/card";
import { IconCheck } from "@/components/ui/icons";
import { addAgencyDays, formatInTimezone } from "@/lib/dates";
import { getMessages, getTranslator, resolveLocale } from "@/lib/i18n";
import {
  getPublicAgency,
  getPublicLocations,
  getPublicSettings,
} from "@/server/services/public/agency";
import { flattenParams } from "@/server/services/booking/search-params";
import { SearchForm, type LocationOption } from "./search-form";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ agency: string }>;
}): Promise<Metadata> {
  const { agency: slug } = await params;
  const agency = await getPublicAgency(slug);
  return {
    title: agency?.name ?? "Car rental",
    description: agency?.shortDescription ?? undefined,
  };
}

export default async function HomePage({
  params,
  searchParams,
}: {
  params: Promise<{ agency: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ agency: slug }, rawParams] = await Promise.all([
    params,
    searchParams,
  ]);

  const agency = await getPublicAgency(slug);
  if (!agency) notFound();

  const flat = flattenParams(rawParams);
  const locale = resolveLocale(flat.lang, agency);
  const t = getTranslator(locale);

  const [locations, settings] = await Promise.all([
    getPublicLocations(agency),
    getPublicSettings(agency),
  ]);

  // Sensible defaults: tomorrow morning to three days later, agency-local.
  const now = new Date();
  const defaultPickup = addAgencyDays(now, 1, agency.timezone);
  const defaultReturn = addAgencyDays(now, 4, agency.timezone);
  const isoDay = (value: Date) =>
    formatInTimezone(value, agency.timezone, "yyyy-MM-dd");

  const options: LocationOption[] = locations.map((location) => ({
    id: location.id,
    name: location.name,
    fee: location.pickupFee.toString(),
  }));

  return (
    <>
      {/* Hero */}
      <section className="relative isolate overflow-hidden border-b border-line">
        {agency.heroFile?.publicUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={agency.heroFile.publicUrl}
              alt=""
              className="absolute inset-0 -z-10 h-full w-full object-cover"
            />
            <div className="absolute inset-0 -z-10 bg-ink/55" />
          </>
        ) : (
          <div
            className="absolute inset-0 -z-10"
            style={{
              background: `linear-gradient(135deg, ${agency.primaryColor} 0%, ${agency.secondaryColor} 100%)`,
            }}
          />
        )}

        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <h1 className="max-w-xl text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            {t("home.title")} {agency.city ?? agency.name}
          </h1>
          <p className="mt-2 max-w-xl text-base text-white/85">
            {t("home.subtitle")}
          </p>
        </div>
      </section>

      {/* Search — pulled up over the hero edge.
          `relative z-10` is what puts it *over* rather than under: the hero above
          is positioned, so without a position of its own this card loses the
          paint order and the hero clips its top row. */}
      <section className="relative z-10 mx-auto -mt-8 max-w-3xl px-4 sm:px-6">
        <Card className="shadow-lg">
          {locations.length === 0 ? (
            <p className="py-4 text-center text-sm text-ink-muted">
              This agency has not published any pickup locations yet.
            </p>
          ) : (
            <SearchForm
              action={`/${slug}/cars`}
              locations={options}
              allowDifferentReturn={settings?.allowDifferentReturnSite ?? true}
              defaults={{
                pickupDate: isoDay(defaultPickup),
                pickupTime: "10:00",
                returnDate: isoDay(defaultReturn),
                returnTime: "10:00",
                pickupLocation: options[0].id,
                returnLocation: options[0].id,
                lang: locale,
              }}
              messages={getMessages(locale)}
              currency={agency.currency}
            />
          )}
        </Card>
      </section>

      {/* How booking works here — sets expectations for the phone call (spec §12) */}
      <section className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <h2 className="mb-4 text-sm font-semibold text-ink">
          {t("home.whyTitle")}
        </h2>
        <ul className="space-y-2.5">
          {[t("home.why1"), t("home.why2"), t("home.why3")].map((line) => (
            <li key={line} className="flex items-start gap-2.5 text-sm text-ink-soft">
              <span className="mt-0.5 shrink-0 text-[var(--brand)]">
                <IconCheck size={18} />
              </span>
              {line}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
