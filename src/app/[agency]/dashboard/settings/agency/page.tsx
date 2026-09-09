import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import { requirePermission } from "@/server/auth/guards";
import { db } from "@/server/db";
import { isStorageConfigured } from "@/server/storage";
import {
  saveBrandingAction,
  saveLocalisationAction,
  saveOperationsAction,
  saveProfileAction,
  uploadBrandImageAction,
} from "./actions";
import {
  BrandingForm,
  LocalisationForm,
  OperationsForm,
  ProfileForm,
  type DayHours,
} from "./settings-forms";

export const metadata: Metadata = { title: "Agency settings" };

/**
 * Four settings screens behind one route, chosen by `?section=`.
 *
 * They share a data load and a tab strip, and each form posts only its own
 * fields — so saving branding can never blank out an address the screen did not
 * show.
 */
const SECTIONS = [
  { key: "profile", label: "Profile" },
  { key: "branding", label: "Branding" },
  { key: "localisation", label: "Languages" },
  { key: "operations", label: "Hours & conditions" },
] as const;

type SectionKey = (typeof SECTIONS)[number]["key"];

/** A short, curated list beats every IANA zone in a dropdown nobody can scroll. */
const TIMEZONES = [
  "Africa/Casablanca",
  "Africa/Algiers",
  "Africa/Tunis",
  "Africa/Cairo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Madrid",
  "Europe/Lisbon",
  "Europe/Rome",
  "Atlantic/Canary",
  "UTC",
];

export default async function AgencySettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ agency: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ agency: slug }, rawParams] = await Promise.all([params, searchParams]);
  const ctx = await requirePermission("settings.manage");

  const raw = rawParams.section;
  const requested = (Array.isArray(raw) ? raw[0] : raw) ?? "profile";
  const section: SectionKey = SECTIONS.some((s) => s.key === requested)
    ? (requested as SectionKey)
    : "profile";

  const [agency, settings, contractSettings, hours] = await Promise.all([
    db.agency.findUnique({
      where: { id: ctx.user.agencyId },
      select: {
        name: true,
        phone: true,
        whatsapp: true,
        email: true,
        address: true,
        city: true,
        googleMapsUrl: true,
        shortDescription: true,
        primaryColor: true,
        secondaryColor: true,
        timezone: true,
        currency: true,
        defaultLocale: true,
        enabledLocales: true,
        logoFile: { select: { publicUrl: true } },
        heroFile: { select: { publicUrl: true } },
      },
    }),
    ctx.db.agencySettings.findFirst({
      select: {
        minDriverAge: true,
        minLicenceYears: true,
        mileagePolicy: true,
        mileageKmPerDay: true,
        fuelPolicy: true,
      },
    }),
    ctx.db.contractSettings.findFirst({
      select: {
        legalName: true,
        registrationNumber: true,
        taxId: true,
        termsAndConditions: true,
        fuelPolicyText: true,
        mileagePolicyText: true,
        damagePolicyText: true,
        cancellationText: true,
        depositPolicyText: true,
        footerText: true,
      },
    }),
    ctx.db.workingHours.findMany({ orderBy: { dayOfWeek: "asc" } }),
  ]);

  if (!agency) notFound();

  const base = `/${slug}/dashboard/settings`;

  // Every weekday has a row, whether or not one was ever saved.
  const days: DayHours[] = Array.from({ length: 7 }, (_, dayOfWeek) => {
    const saved = hours.find((h) => h.dayOfWeek === dayOfWeek);
    return {
      dayOfWeek,
      isClosed: saved?.isClosed ?? false,
      opensAt: saved?.opensAt ?? "08:00",
      closesAt: saved?.closesAt ?? "20:00",
    };
  });

  const text = (value: string | null | undefined) => value ?? "";

  return (
    <>
      <PageHeader
        title="Agency"
        description="Your identity, look, languages and operating rules."
        back={{ href: base, label: "Settings" }}
      />

      <div className="no-scrollbar -mx-4 mb-5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex gap-2">
          {SECTIONS.map((item) => (
            <a
              key={item.key}
              href={`${base}/agency?section=${item.key}`}
              className={`shrink-0 rounded-full border px-3.5 py-2 text-sm font-medium transition ${
                section === item.key
                  ? "border-[var(--brand-line)] bg-[var(--brand-soft)] text-[var(--brand)]"
                  : "border-line bg-surface text-ink-soft hover:border-line-strong"
              }`}
            >
              {item.label}
            </a>
          ))}
        </div>
      </div>

      {section === "profile" ? (
        <ProfileForm
          action={saveProfileAction.bind(null, slug)}
          values={{
            name: agency.name,
            phone: text(agency.phone),
            whatsapp: text(agency.whatsapp),
            email: text(agency.email),
            address: text(agency.address),
            city: text(agency.city),
            googleMapsUrl: text(agency.googleMapsUrl),
            shortDescription: text(agency.shortDescription),
          }}
        />
      ) : null}

      {section === "branding" ? (
        <BrandingForm
          action={saveBrandingAction.bind(null, slug)}
          uploadAction={uploadBrandImageAction.bind(null, slug)}
          storageReady={isStorageConfigured()}
          values={{
            primaryColor: agency.primaryColor,
            secondaryColor: agency.secondaryColor,
            logoUrl: agency.logoFile?.publicUrl ?? null,
            heroUrl: agency.heroFile?.publicUrl ?? null,
          }}
        />
      ) : null}

      {section === "localisation" ? (
        <LocalisationForm
          action={saveLocalisationAction.bind(null, slug)}
          timezones={
            TIMEZONES.includes(agency.timezone)
              ? TIMEZONES
              : [agency.timezone, ...TIMEZONES]
          }
          values={{
            timezone: agency.timezone,
            currency: agency.currency,
            defaultLocale: agency.defaultLocale,
            enabledLocales: agency.enabledLocales,
          }}
        />
      ) : null}

      {section === "operations" ? (
        <OperationsForm
          action={saveOperationsAction.bind(null, slug)}
          days={days}
          conditions={{
            minDriverAge: String(settings?.minDriverAge ?? 21),
            minLicenceYears: String(settings?.minLicenceYears ?? 2),
            mileagePolicy: settings?.mileagePolicy ?? "UNLIMITED",
            mileageKmPerDay:
              settings?.mileageKmPerDay == null ? "" : String(settings.mileageKmPerDay),
            fuelPolicy: settings?.fuelPolicy ?? "FULL_TO_FULL",
            legalName: text(contractSettings?.legalName),
            registrationNumber: text(contractSettings?.registrationNumber),
            taxId: text(contractSettings?.taxId),
            termsAndConditions: text(contractSettings?.termsAndConditions),
            fuelPolicyText: text(contractSettings?.fuelPolicyText),
            mileagePolicyText: text(contractSettings?.mileagePolicyText),
            damagePolicyText: text(contractSettings?.damagePolicyText),
            cancellationText: text(contractSettings?.cancellationText),
            depositPolicyText: text(contractSettings?.depositPolicyText),
            footerText: text(contractSettings?.footerText),
          }}
        />
      ) : null}
    </>
  );
}
