"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, FormError, InputWithSuffix } from "@/components/ui/field";
import { BILLING_RULE_LABELS } from "@/server/services/settings/schemas";
import type { SettingsFormState } from "../actions";

export type BillingValues = {
  billingRule: keyof typeof BILLING_RULE_LABELS;
  gracePeriodMinutes: string;
  extraHourPrice: string;
  bufferMinutes: string;
  noShowWaitingMinutes: string;
  securityDepositEnabled: boolean;
};

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Save changes"}
    </Button>
  );
}

export function BillingForm({
  action,
  values,
  currency,
}: {
  action: (
    state: SettingsFormState,
    formData: FormData,
  ) => Promise<SettingsFormState>;
  values: BillingValues;
  currency: string;
}) {
  const [state, formAction] = useActionState<SettingsFormState, FormData>(
    action,
    {},
  );
  const [rule, setRule] = useState(values.billingRule);
  const errors = state.errors ?? {};

  return (
    <form action={formAction} className="space-y-5">
      <Card>
        <CardHeader
          title="Billing rule"
          description="How a rental that runs past its return time is charged."
        />

        <div className="space-y-2">
          {(
            Object.keys(BILLING_RULE_LABELS) as (keyof typeof BILLING_RULE_LABELS)[]
          ).map((key) => (
            <label
              key={key}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3.5 transition ${
                rule === key
                  ? "border-[var(--brand-line)] bg-[var(--brand-soft)]"
                  : "border-line hover:border-line-strong"
              }`}
            >
              <input
                type="radio"
                name="billingRule"
                value={key}
                checked={rule === key}
                onChange={() => setRule(key)}
                className="mt-0.5 h-4 w-4"
              />
              <span className="text-sm">
                <span className="font-medium text-ink">
                  {BILLING_RULE_LABELS[key].label}
                </span>
                <span className="block text-ink-muted">
                  {BILLING_RULE_LABELS[key].hint}
                </span>
              </span>
            </label>
          ))}
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {rule !== "DAY_ROUND_UP" ? (
            <Field
              label="Grace period"
              htmlFor="gracePeriodMinutes"
              error={errors.gracePeriodMinutes}
              hint="Overrun within this window is free."
            >
              <InputWithSuffix
                id="gracePeriodMinutes"
                name="gracePeriodMinutes"
                type="number"
                inputMode="numeric"
                min={0}
                suffix="min"
                defaultValue={values.gracePeriodMinutes}
                aria-invalid={Boolean(errors.gracePeriodMinutes)}
              />
            </Field>
          ) : (
            <input
              type="hidden"
              name="gracePeriodMinutes"
              value={values.gracePeriodMinutes}
            />
          )}

          {rule === "EXTRA_HOURLY" ? (
            <Field
              label="Price per extra hour"
              htmlFor="extraHourPrice"
              required
              error={errors.extraHourPrice}
            >
              <InputWithSuffix
                id="extraHourPrice"
                name="extraHourPrice"
                inputMode="decimal"
                suffix={currency}
                defaultValue={values.extraHourPrice}
                aria-invalid={Boolean(errors.extraHourPrice)}
              />
            </Field>
          ) : (
            <input
              type="hidden"
              name="extraHourPrice"
              value={values.extraHourPrice}
            />
          )}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Turnaround & no-shows"
          description="Time the car needs between rentals, and how long to hold a booking for a customer who has not arrived."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Turnaround buffer"
            htmlFor="bufferMinutes"
            error={errors.bufferMinutes}
            hint="Blocked after every return for cleaning, fuel and inspection."
          >
            <InputWithSuffix
              id="bufferMinutes"
              name="bufferMinutes"
              type="number"
              inputMode="numeric"
              min={0}
              suffix="min"
              defaultValue={values.bufferMinutes}
              aria-invalid={Boolean(errors.bufferMinutes)}
            />
          </Field>

          <Field
            label="No-show waiting period"
            htmlFor="noShowWaitingMinutes"
            error={errors.noShowWaitingMinutes}
            hint="How long to wait past pickup before releasing the car."
          >
            <InputWithSuffix
              id="noShowWaitingMinutes"
              name="noShowWaitingMinutes"
              type="number"
              inputMode="numeric"
              min={0}
              suffix="min"
              defaultValue={values.noShowWaitingMinutes}
              aria-invalid={Boolean(errors.noShowWaitingMinutes)}
            />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Security deposit"
          description="Deposits are money held on behalf of the customer. They are never counted as revenue."
        />
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            name="securityDepositEnabled"
            defaultChecked={values.securityDepositEnabled}
            className="mt-0.5 h-5 w-5 rounded border-line-strong"
          />
          <span className="text-sm">
            <span className="font-medium text-ink">
              Collect a security deposit
            </span>
            <span className="block text-ink-muted">
              The amount is set per vehicle and can be overridden on an
              individual reservation.
            </span>
          </span>
        </label>
      </Card>

      <FormError>{errors._form}</FormError>

      <div className="flex items-center justify-end gap-3">
        {state.saved ? (
          <span className="text-sm text-positive">Saved</span>
        ) : null}
        <SaveButton />
      </div>
    </form>
  );
}
