"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import {
  Field,
  FormError,
  Input,
  InputWithSuffix,
  Select,
  Textarea,
} from "@/components/ui/field";
import { IconCheck, IconImage } from "@/components/ui/icons";
import type { SettingsState } from "./actions";

type Action = (
  state: SettingsState,
  formData: FormData,
) => Promise<SettingsState>;

function SaveBar({ saved }: { saved?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <div className="flex items-center justify-end gap-3">
      {saved && !pending ? (
        <span className="inline-flex items-center gap-1.5 text-sm text-positive">
          <IconCheck size={16} />
          Saved
        </span>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save changes"}
      </Button>
    </div>
  );
}

/** Identity and contact details (spec §75). */
export function ProfileForm({
  action,
  values,
}: {
  action: Action;
  values: Record<string, string>;
}) {
  const [state, formAction] = useActionState<SettingsState, FormData>(action, {});
  const e = state.errors ?? {};

  return (
    <form action={formAction} className="space-y-5">
      <Card>
        <CardHeader
          title="Agency details"
          description="Used on your website, on contracts, and wherever customers see your name."
        />
        <FormError>{state.message}</FormError>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Agency name" htmlFor="name" required error={e.name} className="sm:col-span-2">
            <Input id="name" name="name" defaultValue={values.name} required />
          </Field>

          <Field label="Phone" htmlFor="phone" error={e.phone}>
            <Input id="phone" name="phone" type="tel" defaultValue={values.phone} />
          </Field>

          <Field
            label="WhatsApp"
            htmlFor="whatsapp"
            error={e.whatsapp}
            hint="Used by the message buttons on reservations."
          >
            <Input id="whatsapp" name="whatsapp" type="tel" defaultValue={values.whatsapp} />
          </Field>

          <Field label="Email" htmlFor="email" error={e.email}>
            <Input id="email" name="email" type="email" defaultValue={values.email} />
          </Field>

          <Field label="City" htmlFor="city" error={e.city}>
            <Input id="city" name="city" defaultValue={values.city} />
          </Field>

          <Field label="Address" htmlFor="address" error={e.address} className="sm:col-span-2">
            <Input id="address" name="address" defaultValue={values.address} />
          </Field>

          <Field
            label="Google Maps link"
            htmlFor="googleMapsUrl"
            error={e.googleMapsUrl}
            className="sm:col-span-2"
          >
            <Input id="googleMapsUrl" name="googleMapsUrl" defaultValue={values.googleMapsUrl} />
          </Field>

          <Field
            label="Short description"
            htmlFor="shortDescription"
            error={e.shortDescription}
            hint="One line, shown in the website footer."
            className="sm:col-span-2"
          >
            <Textarea
              id="shortDescription"
              name="shortDescription"
              rows={2}
              defaultValue={values.shortDescription}
            />
          </Field>
        </div>
      </Card>

      <SaveBar saved={state.saved} />
    </form>
  );
}

function ColourField({
  name,
  label,
  hint,
  defaultValue,
  error,
}: {
  name: string;
  label: string;
  hint: string;
  defaultValue: string;
  error?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  return (
    <Field label={label} htmlFor={name} error={error} hint={hint}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="h-11 w-14 cursor-pointer rounded-lg border border-line bg-surface p-1"
          aria-label={label + " picker"}
        />
        <Input
          id={name}
          name={name}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="font-mono"
          required
        />
      </div>
    </Field>
  );
}

/** Mirrors MAX_IMAGE_BYTES in src/server/storage/driver.ts, which enforces it. */
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

/**
 * Picking a photo IS the upload.
 *
 * Choosing a file and then remembering to press a second button was a step
 * people skipped, so the picker submits the form itself. The chosen file is
 * previewed from the browser's own copy straight away, which means the new
 * photo is on screen while the bytes are still travelling.
 */
function ImageUpload({
  action,
  kind,
  label,
  hint,
  currentUrl,
  storageReady,
  fit,
}: {
  action: Action;
  kind: "logo" | "hero";
  label: string;
  hint: string;
  currentUrl: string | null;
  storageReady: boolean;
  fit: "contain" | "cover";
}) {
  const [state, formAction, pending] = useActionState<SettingsState, FormData>(
    action,
    {},
  );
  const formRef = useRef<HTMLFormElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const previewRef = useRef<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    };
  }, []);

  const choose = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Both checks are repeated on the server; catching them here saves the
    // round trip and gives a sentence instead of a failed request.
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setLocalError("Use a JPEG, PNG, WebP or AVIF image.");
      event.target.value = "";
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setLocalError(
        `That image is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 8 MB.`,
      );
      event.target.value = "";
      return;
    }

    setLocalError(null);
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = URL.createObjectURL(file);
    setPreview(previewRef.current);
    formRef.current?.requestSubmit();
  };

  // While the bytes are in flight the browser's own copy is the truth; once the
  // upload lands the stored URL is; and if it failed, whatever is really saved.
  const shown = pending
    ? (preview ?? currentUrl)
    : state.message
      ? currentUrl
      : (state.imageUrl ?? preview ?? currentUrl);

  return (
    <form ref={formRef} action={formAction} className="space-y-2">
      <input type="hidden" name="kind" value={kind} />
      <p className="text-sm font-medium text-ink-soft">{label}</p>

      <div className="flex items-center gap-3">
        <div className="relative flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-surface-sunken">
          {shown ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={shown}
              alt=""
              className={`h-full w-full ${fit === "cover" ? "object-cover" : "object-contain"} ${
                pending ? "opacity-40" : ""
              }`}
            />
          ) : (
            <span className="text-ink-muted/50">
              <IconImage size={22} />
            </span>
          )}
          {pending ? (
            <span className="absolute inset-0 flex items-center justify-center bg-surface/60 text-[11px] font-medium text-ink-soft">
              Uploading…
            </span>
          ) : null}
        </div>

        <div className="min-w-0 flex-1">
          <input
            ref={inputRef}
            type="file"
            name="image"
            accept={ACCEPTED_TYPES.join(",")}
            disabled={!storageReady || pending}
            onChange={choose}
            className="sr-only"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!storageReady || pending}
              onClick={() => inputRef.current?.click()}
            >
              {pending
                ? "Uploading…"
                : shown
                  ? "Replace photo"
                  : "Choose photo"}
            </Button>
            {state.saved && !pending ? (
              <span className="inline-flex items-center gap-1.5 text-sm text-positive">
                <IconCheck size={16} />
                Updated
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-ink-muted">{hint}</p>
        </div>
      </div>

      <FormError>{localError ?? state.message}</FormError>
    </form>
  );
}

/** Branding (spec §76). */
export function BrandingForm({
  action,
  uploadAction,
  values,
  storageReady,
}: {
  action: Action;
  uploadAction: Action;
  values: {
    primaryColor: string;
    secondaryColor: string;
    logoUrl: string | null;
    heroUrl: string | null;
  };
  storageReady: boolean;
}) {
  const [state, formAction] = useActionState<SettingsState, FormData>(action, {});
  const e = state.errors ?? {};

  return (
    <div className="space-y-5">
      <form action={formAction} className="space-y-5">
        <Card>
          <CardHeader
            title="Colours"
            description="The primary colour runs through your dashboard and your public website."
          />
          <FormError>{state.message}</FormError>
          <div className="grid gap-4 sm:grid-cols-2">
            <ColourField
              name="primaryColor"
              label="Primary"
              defaultValue={values.primaryColor}
              hint="Buttons, links and highlights."
              error={e.primaryColor}
            />
            <ColourField
              name="secondaryColor"
              label="Secondary"
              defaultValue={values.secondaryColor}
              hint="The website hero gradient."
              error={e.secondaryColor}
            />
          </div>
        </Card>
        <SaveBar saved={state.saved} />
      </form>

      <Card>
        <CardHeader
          title="Images"
          description="Shown on your website and printed on contracts."
        />
        {!storageReady ? (
          <p className="mb-4 rounded-lg border border-caution/20 bg-caution-soft px-3 py-2.5 text-sm text-caution">
            Image upload needs object storage. Set STORAGE_DRIVER to local in
            .env for development, or the S3 variables for production.
          </p>
        ) : null}
        <div className="space-y-5">
          <ImageUpload
            action={uploadAction}
            kind="logo"
            label="Logo"
            hint="Square or wide, on a transparent background if you have one."
            fit="contain"
            currentUrl={values.logoUrl}
            storageReady={storageReady}
          />
          <div className="border-t border-line pt-5">
            <ImageUpload
              action={uploadAction}
              kind="hero"
              label="Hero image"
              hint="The photo behind your homepage headline. Wide, at least 1600px."
              fit="cover"
              currentUrl={values.heroUrl}
              storageReady={storageReady}
            />
          </div>
        </div>
      </Card>
    </div>
  );
}

const LOCALE_NAMES: Record<string, string> = {
  EN: "English",
  FR: "Français",
  AR: "العربية",
};

/** Languages, currency and timezone (spec §8, §74, §93, §94). */
export function LocalisationForm({
  action,
  values,
  timezones,
}: {
  action: Action;
  values: {
    timezone: string;
    currency: string;
    defaultLocale: string;
    enabledLocales: string[];
  };
  timezones: string[];
}) {
  const [state, formAction] = useActionState<SettingsState, FormData>(action, {});
  const [enabled, setEnabled] = useState<string[]>(values.enabledLocales);
  const [defaultLocale, setDefaultLocale] = useState(values.defaultLocale);
  const e = state.errors ?? {};

  const toggle = (locale: string, on: boolean) => {
    const next = on ? [...enabled, locale] : enabled.filter((l) => l !== locale);
    setEnabled(next);
    // The default has to stay a language the agency actually offers.
    if (!on && locale === defaultLocale && next.length > 0) {
      setDefaultLocale(next[0]);
    }
  };

  return (
    <form action={formAction} className="space-y-5">
      <Card>
        <CardHeader
          title="Languages"
          description="Which languages your website offers. Arabic renders right to left."
        />
        <FormError>{state.message ?? e.enabledLocales}</FormError>

        <div className="space-y-2">
          {["EN", "FR", "AR"].map((locale) => (
            <label
              key={locale}
              className="flex cursor-pointer items-center gap-3 rounded-lg border border-line p-3"
            >
              <input
                type="checkbox"
                name="enabledLocales"
                value={locale}
                checked={enabled.includes(locale)}
                onChange={(event) => toggle(locale, event.target.checked)}
                className="h-5 w-5 rounded border-line-strong"
              />
              <span className="flex-1 text-sm font-medium text-ink">
                {LOCALE_NAMES[locale]}
              </span>
              {enabled.includes(locale) ? (
                <span className="flex items-center gap-1.5 text-xs text-ink-muted">
                  <input
                    type="radio"
                    name="defaultLocale"
                    value={locale}
                    checked={defaultLocale === locale}
                    onChange={() => setDefaultLocale(locale)}
                    className="h-4 w-4"
                  />
                  Default
                </span>
              ) : null}
            </label>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Currency and timezone" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Currency"
            htmlFor="currency"
            required
            error={e.currency}
            hint="Three-letter code. Changing it does not convert existing prices."
          >
            <Input
              id="currency"
              name="currency"
              defaultValue={values.currency}
              maxLength={3}
              className="font-mono uppercase"
              required
            />
          </Field>

          <Field
            label="Timezone"
            htmlFor="timezone"
            required
            error={e.timezone}
            hint="Every pickup and return time is shown in this zone."
          >
            <Select id="timezone" name="timezone" defaultValue={values.timezone}>
              {timezones.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      <SaveBar saved={state.saved} />
    </form>
  );
}

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export type DayHours = {
  dayOfWeek: number;
  isClosed: boolean;
  opensAt: string;
  closesAt: string;
};

const CLAUSES: [string, string][] = [
  ["fuelPolicyText", "Fuel clause"],
  ["mileagePolicyText", "Mileage clause"],
  ["damagePolicyText", "Damage clause"],
  ["depositPolicyText", "Security deposit clause"],
  ["cancellationText", "Cancellation clause"],
  ["termsAndConditions", "General terms"],
  ["footerText", "Contract footer"],
];

/** Working hours, rental conditions and contract text (spec §51, §77, §78). */
export function OperationsForm({
  action,
  days,
  conditions,
}: {
  action: Action;
  days: DayHours[];
  conditions: Record<string, string>;
}) {
  const [state, formAction] = useActionState<SettingsState, FormData>(action, {});
  const [closed, setClosed] = useState<Record<number, boolean>>(
    Object.fromEntries(days.map((d) => [d.dayOfWeek, d.isClosed])),
  );
  const [mileagePolicy, setMileagePolicy] = useState(conditions.mileagePolicy);
  const e = state.errors ?? {};

  return (
    <form action={formAction} className="space-y-5">
      <Card>
        <CardHeader
          title="Working hours"
          description="When customers can collect and return."
        />
        <div className="space-y-2">
          {days.map((day) => (
            <div
              key={day.dayOfWeek}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-line px-3 py-2.5"
            >
              <span className="w-24 shrink-0 text-sm font-medium text-ink">
                {DAY_NAMES[day.dayOfWeek]}
              </span>
              <label className="flex items-center gap-2 text-sm text-ink-soft">
                <input
                  type="checkbox"
                  name={`closed-${day.dayOfWeek}`}
                  checked={closed[day.dayOfWeek] ?? false}
                  onChange={(event) =>
                    setClosed({ ...closed, [day.dayOfWeek]: event.target.checked })
                  }
                  className="h-5 w-5 rounded border-line-strong"
                />
                Closed
              </label>
              {closed[day.dayOfWeek] ? (
                <>
                  <input type="hidden" name={`opens-${day.dayOfWeek}`} value={day.opensAt} />
                  <input type="hidden" name={`closes-${day.dayOfWeek}`} value={day.closesAt} />
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <Input
                    name={`opens-${day.dayOfWeek}`}
                    type="time"
                    defaultValue={day.opensAt}
                    className="w-32"
                    aria-label={DAY_NAMES[day.dayOfWeek] + " opens"}
                  />
                  <span className="text-ink-muted">–</span>
                  <Input
                    name={`closes-${day.dayOfWeek}`}
                    type="time"
                    defaultValue={day.closesAt}
                    className="w-32"
                    aria-label={DAY_NAMES[day.dayOfWeek] + " closes"}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Rental conditions"
          description="Shown before booking and written into every contract."
        />
        <FormError>{state.message}</FormError>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Minimum driver age" htmlFor="minDriverAge" required error={e.minDriverAge}>
            <InputWithSuffix
              id="minDriverAge"
              name="minDriverAge"
              type="number"
              min={16}
              max={99}
              suffix="years"
              defaultValue={conditions.minDriverAge}
              required
            />
          </Field>

          <Field
            label="Licence held for at least"
            htmlFor="minLicenceYears"
            required
            error={e.minLicenceYears}
          >
            <InputWithSuffix
              id="minLicenceYears"
              name="minLicenceYears"
              type="number"
              min={0}
              max={50}
              suffix="years"
              defaultValue={conditions.minLicenceYears}
              required
            />
          </Field>

          <Field label="Mileage policy" htmlFor="mileagePolicy" error={e.mileagePolicy}>
            <Select
              id="mileagePolicy"
              name="mileagePolicy"
              value={mileagePolicy}
              onChange={(event) => setMileagePolicy(event.target.value)}
            >
              <option value="UNLIMITED">Unlimited</option>
              <option value="LIMITED">Limited — allowance per day</option>
            </Select>
          </Field>

          {mileagePolicy === "LIMITED" ? (
            <Field label="Allowance per day" htmlFor="mileageKmPerDay" error={e.mileageKmPerDay}>
              <InputWithSuffix
                id="mileageKmPerDay"
                name="mileageKmPerDay"
                type="number"
                min={0}
                suffix="km"
                defaultValue={conditions.mileageKmPerDay}
              />
            </Field>
          ) : (
            <input type="hidden" name="mileageKmPerDay" value={conditions.mileageKmPerDay} />
          )}

          <Field label="Fuel policy" htmlFor="fuelPolicy" error={e.fuelPolicy} className="sm:col-span-2">
            <Select id="fuelPolicy" name="fuelPolicy" defaultValue={conditions.fuelPolicy}>
              <option value="FULL_TO_FULL">Full to full</option>
              <option value="SAME_AS_PICKUP">Same level as pickup</option>
              <option value="PREPAID">Prepaid</option>
            </Select>
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Contract text"
          description="Your legal identity and the clauses printed on every rental contract."
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Legal name" htmlFor="legalName" error={e.legalName}>
            <Input id="legalName" name="legalName" defaultValue={conditions.legalName} />
          </Field>
          <Field label="Registration no." htmlFor="registrationNumber" error={e.registrationNumber}>
            <Input
              id="registrationNumber"
              name="registrationNumber"
              defaultValue={conditions.registrationNumber}
            />
          </Field>
          <Field label="Tax ID" htmlFor="taxId" error={e.taxId}>
            <Input id="taxId" name="taxId" defaultValue={conditions.taxId} />
          </Field>
        </div>

        <div className="mt-4 space-y-4">
          {CLAUSES.map(([name, label]) => (
            <Field key={name} label={label} htmlFor={name} error={e[name]}>
              <Textarea
                id={name}
                name={name}
                rows={name === "termsAndConditions" ? 4 : 2}
                defaultValue={conditions[name]}
              />
            </Field>
          ))}
        </div>
      </Card>

      <SaveBar saved={state.saved} />
    </form>
  );
}
