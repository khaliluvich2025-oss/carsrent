"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
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
import {
  FUEL_LABELS,
  FUEL_TYPES,
  TRANSMISSION_LABELS,
  TRANSMISSIONS,
  VEHICLE_CATEGORIES,
  VEHICLE_STATUSES,
} from "@/server/services/fleet/schemas";
import { VEHICLE_STATUS_LABELS } from "@/components/ui/badge";
import type { VehicleFormState } from "./actions";

export type VehicleFormValues = {
  brand: string;
  model: string;
  year: string;
  category: string;
  transmission: string;
  fuelType: string;
  seats: string;
  doors: string;
  color: string;
  features: string;
  registrationNumber: string;
  vin: string;
  currentMileage: string;
  dailyPrice: string;
  weeklyPrice: string;
  monthlyPrice: string;
  securityDeposit: string;
  mileagePolicy: string;
  mileageKmPerDay: string;
  extraKmPrice: string;
  currentStatus: string;
  isActive: boolean;
  insuranceExpiryAt: string;
  technicalInspectionExpiryAt: string;
  nextServiceMileage: string;
};

export const EMPTY_VEHICLE: VehicleFormValues = {
  brand: "",
  model: "",
  year: String(new Date().getFullYear()),
  category: "Economy",
  transmission: "MANUAL",
  fuelType: "DIESEL",
  seats: "5",
  doors: "5",
  color: "",
  features: "",
  registrationNumber: "",
  vin: "",
  currentMileage: "0",
  dailyPrice: "",
  weeklyPrice: "",
  monthlyPrice: "",
  securityDeposit: "",
  mileagePolicy: "",
  mileageKmPerDay: "",
  extraKmPrice: "",
  currentStatus: "AVAILABLE",
  isActive: true,
  insuranceExpiryAt: "",
  technicalInspectionExpiryAt: "",
  nextServiceMileage: "",
};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

export function VehicleForm({
  action,
  values,
  currency,
  cancelHref,
  submitLabel,
}: {
  action: (
    state: VehicleFormState,
    formData: FormData,
  ) => Promise<VehicleFormState>;
  values: VehicleFormValues;
  currency: string;
  cancelHref: string;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState<VehicleFormState, FormData>(
    action,
    {},
  );
  const [mileagePolicy, setMileagePolicy] = useState(values.mileagePolicy);
  const errors = state.errors ?? {};

  return (
    <form action={formAction} className="space-y-5">
      <FormError>{state.message ?? errors._form}</FormError>

      <Card>
        <CardHeader
          title="Vehicle"
          description="How this car is presented to customers."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Brand" htmlFor="brand" required error={errors.brand}>
            <Input
              id="brand"
              name="brand"
              defaultValue={values.brand}
              placeholder="Dacia"
              aria-invalid={Boolean(errors.brand)}
              required
            />
          </Field>

          <Field label="Model" htmlFor="model" required error={errors.model}>
            <Input
              id="model"
              name="model"
              defaultValue={values.model}
              placeholder="Duster"
              aria-invalid={Boolean(errors.model)}
              required
            />
          </Field>

          <Field label="Year" htmlFor="year" required error={errors.year}>
            <Input
              id="year"
              name="year"
              type="number"
              inputMode="numeric"
              defaultValue={values.year}
              aria-invalid={Boolean(errors.year)}
              required
            />
          </Field>

          <Field
            label="Category"
            htmlFor="category"
            required
            error={errors.category}
            hint="Used by the website filters."
          >
            <Input
              id="category"
              name="category"
              list="vehicle-categories"
              defaultValue={values.category}
              aria-invalid={Boolean(errors.category)}
              required
            />
            <datalist id="vehicle-categories">
              {VEHICLE_CATEGORIES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>

          <Field label="Colour" htmlFor="color" error={errors.color}>
            <Input
              id="color"
              name="color"
              defaultValue={values.color}
              placeholder="Gris"
            />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Specification" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Transmission"
            htmlFor="transmission"
            required
            error={errors.transmission}
          >
            <Select
              id="transmission"
              name="transmission"
              defaultValue={values.transmission}
            >
              {TRANSMISSIONS.map((t) => (
                <option key={t} value={t}>
                  {TRANSMISSION_LABELS[t]}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Fuel"
            htmlFor="fuelType"
            required
            error={errors.fuelType}
          >
            <Select id="fuelType" name="fuelType" defaultValue={values.fuelType}>
              {FUEL_TYPES.map((f) => (
                <option key={f} value={f}>
                  {FUEL_LABELS[f]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Seats" htmlFor="seats" required error={errors.seats}>
            <Input
              id="seats"
              name="seats"
              type="number"
              inputMode="numeric"
              min={1}
              max={9}
              defaultValue={values.seats}
              aria-invalid={Boolean(errors.seats)}
              required
            />
          </Field>

          <Field label="Doors" htmlFor="doors" required error={errors.doors}>
            <Input
              id="doors"
              name="doors"
              type="number"
              inputMode="numeric"
              min={1}
              max={7}
              defaultValue={values.doors}
              aria-invalid={Boolean(errors.doors)}
              required
            />
          </Field>

          <Field
            label="Features"
            htmlFor="features"
            error={errors.features}
            hint="Comma separated, e.g. Air conditioning, Bluetooth, GPS"
            className="sm:col-span-2"
          >
            <Textarea
              id="features"
              name="features"
              rows={2}
              defaultValue={values.features}
              placeholder="Air conditioning, Bluetooth, GPS"
            />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Registration & odometer"
          description="Used on the rental contract and at handover."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Registration number"
            htmlFor="registrationNumber"
            required
            error={errors.registrationNumber}
          >
            <Input
              id="registrationNumber"
              name="registrationNumber"
              defaultValue={values.registrationNumber}
              placeholder="12345-A-6"
              autoCapitalize="characters"
              aria-invalid={Boolean(errors.registrationNumber)}
              required
            />
          </Field>

          <Field label="VIN" htmlFor="vin" error={errors.vin}>
            <Input
              id="vin"
              name="vin"
              defaultValue={values.vin}
              autoCapitalize="characters"
            />
          </Field>

          <Field
            label="Current mileage"
            htmlFor="currentMileage"
            required
            error={errors.currentMileage}
          >
            <InputWithSuffix
              id="currentMileage"
              name="currentMileage"
              type="number"
              inputMode="numeric"
              min={0}
              suffix="km"
              defaultValue={values.currentMileage}
              aria-invalid={Boolean(errors.currentMileage)}
              required
            />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Pricing"
          description="Weekly and monthly rates apply automatically to longer rentals."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Daily price"
            htmlFor="dailyPrice"
            required
            error={errors.dailyPrice}
          >
            <InputWithSuffix
              id="dailyPrice"
              name="dailyPrice"
              inputMode="decimal"
              suffix={currency}
              defaultValue={values.dailyPrice}
              placeholder="450"
              aria-invalid={Boolean(errors.dailyPrice)}
              required
            />
          </Field>

          <Field
            label="Security deposit"
            htmlFor="securityDeposit"
            required
            error={errors.securityDeposit}
            hint="Held, not revenue. Refunded after the return inspection."
          >
            <InputWithSuffix
              id="securityDeposit"
              name="securityDeposit"
              inputMode="decimal"
              suffix={currency}
              defaultValue={values.securityDeposit}
              placeholder="3000"
              aria-invalid={Boolean(errors.securityDeposit)}
              required
            />
          </Field>

          <Field
            label="Weekly price / day"
            htmlFor="weeklyPrice"
            error={errors.weeklyPrice}
            hint="Applies from 7 days. Leave blank to always use the daily rate."
          >
            <InputWithSuffix
              id="weeklyPrice"
              name="weeklyPrice"
              inputMode="decimal"
              suffix={currency}
              defaultValue={values.weeklyPrice}
              placeholder="420"
            />
          </Field>

          <Field
            label="Monthly price / day"
            htmlFor="monthlyPrice"
            error={errors.monthlyPrice}
            hint="Applies from 30 days."
          >
            <InputWithSuffix
              id="monthlyPrice"
              name="monthlyPrice"
              inputMode="decimal"
              suffix={currency}
              defaultValue={values.monthlyPrice}
              placeholder="350"
            />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Mileage policy"
          description="Overrides the agency default for this vehicle only."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Policy"
            htmlFor="mileagePolicy"
            error={errors.mileagePolicy}
          >
            <Select
              id="mileagePolicy"
              name="mileagePolicy"
              value={mileagePolicy}
              onChange={(e) => setMileagePolicy(e.target.value)}
            >
              <option value="">Use agency default</option>
              <option value="UNLIMITED">Unlimited mileage</option>
              <option value="LIMITED">Limited — allowance per day</option>
            </Select>
          </Field>

          {mileagePolicy === "LIMITED" ? (
            <>
              <Field
                label="Allowance per day"
                htmlFor="mileageKmPerDay"
                required
                error={errors.mileageKmPerDay}
              >
                <InputWithSuffix
                  id="mileageKmPerDay"
                  name="mileageKmPerDay"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  suffix="km"
                  defaultValue={values.mileageKmPerDay}
                  aria-invalid={Boolean(errors.mileageKmPerDay)}
                />
              </Field>

              <Field
                label="Price per extra km"
                htmlFor="extraKmPrice"
                required
                error={errors.extraKmPrice}
              >
                <InputWithSuffix
                  id="extraKmPrice"
                  name="extraKmPrice"
                  inputMode="decimal"
                  suffix={currency}
                  defaultValue={values.extraKmPrice}
                  aria-invalid={Boolean(errors.extraKmPrice)}
                />
              </Field>
            </>
          ) : (
            <>
              <input
                type="hidden"
                name="mileageKmPerDay"
                value={values.mileageKmPerDay}
              />
              <input
                type="hidden"
                name="extraKmPrice"
                value={values.extraKmPrice}
              />
            </>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Status & compliance"
          description="Status is what staff see. Availability is always calculated from the calendar."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Operational status"
            htmlFor="currentStatus"
            error={errors.currentStatus}
          >
            <Select
              id="currentStatus"
              name="currentStatus"
              defaultValue={values.currentStatus}
            >
              {VEHICLE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {VEHICLE_STATUS_LABELS[s].label}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Next service at"
            htmlFor="nextServiceMileage"
            error={errors.nextServiceMileage}
          >
            <InputWithSuffix
              id="nextServiceMileage"
              name="nextServiceMileage"
              type="number"
              inputMode="numeric"
              min={0}
              suffix="km"
              defaultValue={values.nextServiceMileage}
            />
          </Field>

          <Field
            label="Insurance expires"
            htmlFor="insuranceExpiryAt"
            error={errors.insuranceExpiryAt}
          >
            <Input
              id="insuranceExpiryAt"
              name="insuranceExpiryAt"
              type="date"
              defaultValue={values.insuranceExpiryAt}
            />
          </Field>

          <Field
            label="Technical inspection expires"
            htmlFor="technicalInspectionExpiryAt"
            error={errors.technicalInspectionExpiryAt}
          >
            <Input
              id="technicalInspectionExpiryAt"
              name="technicalInspectionExpiryAt"
              type="date"
              defaultValue={values.technicalInspectionExpiryAt}
            />
          </Field>

          <label className="flex items-start gap-3 sm:col-span-2">
            <input
              type="checkbox"
              name="isActive"
              defaultChecked={values.isActive}
              className="mt-0.5 h-5 w-5 rounded border-line-strong text-[var(--brand)]"
            />
            <span className="text-sm">
              <span className="font-medium text-ink">Active in the fleet</span>
              <span className="block text-ink-muted">
                Inactive vehicles stay in history but are hidden from the website
                and from new reservations.
              </span>
            </span>
          </label>
        </div>
      </Card>

      <div className="sticky bottom-20 z-10 flex items-center justify-end gap-3 rounded-card border border-line bg-surface/95 p-3 backdrop-blur md:bottom-4">
        <Link
          href={cancelHref}
          className="rounded-lg px-4 py-2.5 text-sm font-medium text-ink-soft hover:text-ink"
        >
          Cancel
        </Link>
        <SubmitButton label={submitLabel} />
      </div>
    </form>
  );
}
