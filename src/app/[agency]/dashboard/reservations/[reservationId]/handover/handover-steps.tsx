"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Field,
  FormError,
  Input,
  InputWithSuffix,
  Select,
  Textarea,
} from "@/components/ui/field";
import { IconAlert, IconCheck, IconPlus } from "@/components/ui/icons";
import type { HandoverState } from "./actions";

type Action = (
  state: HandoverState,
  formData: FormData,
) => Promise<HandoverState>;

function Save({ label = "Save" }: { label?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

/** A handover step, with its own done/pending state and requirement level. */
export function StepCard({
  index,
  title,
  description,
  done,
  requirement,
  children,
}: {
  index: number;
  title: string;
  description?: string;
  done: boolean;
  requirement?: "REQUIRED" | "OPTIONAL" | "DISABLED";
  children: React.ReactNode;
}) {
  return (
    <Card className={done ? "border-positive/30" : undefined}>
      <div className="mb-3 flex items-start gap-3">
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
            done
              ? "bg-positive text-white"
              : "bg-surface-sunken text-ink-muted ring-1 ring-line"
          }`}
        >
          {done ? <IconCheck size={16} /> : index}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-ink">{title}</h2>
            {requirement === "OPTIONAL" ? (
              <Badge>Optional</Badge>
            ) : requirement === "REQUIRED" && !done ? (
              <Badge tone="caution">Required</Badge>
            ) : null}
          </div>
          {description ? (
            <p className="mt-0.5 text-sm text-ink-muted">{description}</p>
          ) : null}
        </div>
      </div>
      {children}
    </Card>
  );
}

/** Documents (spec §36) — the file is optional, the check is not. */
export function DocumentStep({
  action,
  reservationId,
  documents,
}: {
  action: Action;
  reservationId: string;
  documents: {
    type: string;
    label: string;
    number: string | null;
    expiry: string | null;
    status: string;
  }[];
}) {
  const [state, formAction] = useActionState<HandoverState, FormData>(
    action,
    {},
  );
  const errors = state.errors ?? {};

  return (
    <div className="space-y-3">
      {documents.length > 0 ? (
        <ul className="space-y-2">
          {documents.map((document) => (
            <li
              key={document.type}
              className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">{document.label}</p>
                <p className="text-xs text-ink-muted">
                  {document.number ?? "No number"}
                  {document.expiry ? ` · expires ${document.expiry}` : ""}
                </p>
              </div>
              <Badge
                tone={
                  document.status === "VERIFIED"
                    ? "positive"
                    : document.status === "REJECTED"
                      ? "critical"
                      : "neutral"
                }
              >
                {document.status.toLowerCase()}
              </Badge>
            </li>
          ))}
        </ul>
      ) : null}

      <form action={formAction} className="space-y-3">
        <input type="hidden" name="reservationId" value={reservationId} />
        <FormError>{state.message}</FormError>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Document" htmlFor="doc-type" required>
            <Select id="doc-type" name="documentType" defaultValue="DRIVING_LICENCE">
              <option value="DRIVING_LICENCE">Driving licence</option>
              <option value="CIN">National ID (CIN)</option>
              <option value="PASSPORT">Passport</option>
              <option value="OTHER">Other</option>
            </Select>
          </Field>

          <Field label="Number" htmlFor="doc-number" error={errors.documentNumber}>
            <Input id="doc-number" name="documentNumber" autoCapitalize="characters" />
          </Field>

          <Field label="Expires" htmlFor="doc-expiry" error={errors.expiryDate}>
            <Input id="doc-expiry" name="expiryDate" type="date" />
          </Field>

          <Field label="Result" htmlFor="doc-verified">
            <Select id="doc-verified" name="verified" defaultValue="yes">
              <option value="yes">Checked and valid</option>
              <option value="no">Rejected</option>
            </Select>
          </Field>
        </div>

        <div className="flex justify-end">
          <Save label="Record check" />
        </div>
      </form>
    </div>
  );
}

/** Odometer, fuel and general condition (spec §38). */
export function ConditionStep({
  action,
  reservationId,
  values,
}: {
  action: Action;
  reservationId: string;
  values: {
    mileage: string;
    fuelLevel: string;
    condition: string;
    notes: string;
  };
}) {
  const [state, formAction] = useActionState<HandoverState, FormData>(
    action,
    {},
  );
  const [fuel, setFuel] = useState(values.fuelLevel || "100");
  const errors = state.errors ?? {};

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="reservationId" value={reservationId} />
      <FormError>{state.message}</FormError>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Odometer"
          htmlFor="h-mileage"
          required
          error={errors.mileage}
        >
          <InputWithSuffix
            id="h-mileage"
            name="mileage"
            type="number"
            inputMode="numeric"
            min={0}
            suffix="km"
            defaultValue={values.mileage}
            aria-invalid={Boolean(errors.mileage)}
            required
          />
        </Field>

        <Field label={`Fuel — ${fuel}%`} htmlFor="h-fuel" required>
          <input
            id="h-fuel"
            name="fuelLevel"
            type="range"
            min={0}
            max={100}
            step={5}
            value={fuel}
            onChange={(event) => setFuel(event.target.value)}
            className="h-11 w-full accent-[var(--brand)]"
          />
        </Field>

        <Field
          label="General condition"
          htmlFor="h-condition"
          error={errors.condition}
          className="sm:col-span-2"
        >
          <Input
            id="h-condition"
            name="condition"
            defaultValue={values.condition}
            placeholder="Clean, no visible issues"
          />
        </Field>

        <Field
          label="Notes"
          htmlFor="h-notes"
          error={errors.notes}
          className="sm:col-span-2"
        >
          <Textarea
            id="h-notes"
            name="notes"
            rows={2}
            defaultValue={values.notes}
          />
        </Field>
      </div>

      <div className="flex items-center justify-end gap-2">
        {state.saved ? (
          <span className="text-sm text-positive">Saved</span>
        ) : null}
        <Save />
      </div>
    </form>
  );
}

/** Existing damage (spec §39). */
export function DamageStep({
  addAction,
  confirmAction,
  reservationId,
  damages,
  confirmed,
}: {
  addAction: Action;
  confirmAction: (formData: FormData) => Promise<void>;
  reservationId: string;
  damages: { id: string; location: string; type: string; description: string | null }[];
  confirmed: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [state, formAction] = useActionState<HandoverState, FormData>(
    async (prev, formData) => {
      const result = await addAction(prev, formData);
      if (result.saved) setAdding(false);
      return result;
    },
    {},
  );
  const errors = state.errors ?? {};

  return (
    <div className="space-y-3">
      {damages.length > 0 ? (
        <ul className="space-y-2">
          {damages.map((damage) => (
            <li
              key={damage.id}
              className="rounded-lg border border-line px-3 py-2.5"
            >
              <p className="text-sm font-medium text-ink">
                {damage.type} — {damage.location}
              </p>
              {damage.description ? (
                <p className="text-xs text-ink-muted">{damage.description}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-muted">
          No existing damage recorded. Anything you note here will not be charged
          to this customer at return.
        </p>
      )}

      {adding ? (
        <form action={formAction} className="space-y-3 rounded-lg bg-surface-sunken p-3">
          <input type="hidden" name="reservationId" value={reservationId} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Where" htmlFor="d-location" required error={errors.location}>
              <Input
                id="d-location"
                name="location"
                placeholder="Front left door"
                required
              />
            </Field>
            <Field label="What" htmlFor="d-type" required error={errors.damageType}>
              <Input id="d-type" name="damageType" placeholder="Scratch" required />
            </Field>
            <Field
              label="Description"
              htmlFor="d-description"
              className="sm:col-span-2"
            >
              <Input
                id="d-description"
                name="description"
                placeholder="Small existing scratch, about 5 cm"
              />
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setAdding(false)}
            >
              Cancel
            </Button>
            <Save label="Add damage" />
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setAdding(true)}
          >
            <IconPlus size={16} />
            Record damage
          </Button>

          {!confirmed ? (
            <form action={confirmAction}>
              <input type="hidden" name="reservationId" value={reservationId} />
              <Button type="submit" size="sm">
                <IconCheck size={16} />
                Walk-around done
              </Button>
            </form>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-sm text-positive">
              <IconCheck size={16} />
              Walk-around confirmed
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** Rental payment and security deposit (spec §31, §28). */
export function MoneyStep({
  action,
  reservationId,
  suggested,
  currency,
  label,
  hint,
}: {
  action: Action;
  reservationId: string;
  suggested: string;
  currency: string;
  label: string;
  hint?: string;
}) {
  const [state, formAction] = useActionState<HandoverState, FormData>(
    action,
    {},
  );
  const errors = state.errors ?? {};

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="reservationId" value={reservationId} />
      <FormError>{state.message}</FormError>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={label} htmlFor={`m-${label}`} required error={errors.amount} hint={hint}>
          <InputWithSuffix
            id={`m-${label}`}
            name="amount"
            inputMode="decimal"
            suffix={currency}
            defaultValue={suggested}
            aria-invalid={Boolean(errors.amount)}
            required
          />
        </Field>

        <Field label="Method" htmlFor={`method-${label}`}>
          <Select id={`method-${label}`} name="method" defaultValue="CASH">
            <option value="CASH">Cash</option>
            <option value="CARD">Card</option>
            <option value="BANK_TRANSFER">Bank transfer</option>
            <option value="OTHER">Other</option>
          </Select>
        </Field>
      </div>

      <div className="flex items-center justify-end gap-2">
        {state.saved ? (
          <span className="text-sm text-positive">Recorded</span>
        ) : null}
        <Save label="Record" />
      </div>
    </form>
  );
}

/** The completion gate (spec §40). */
export function CompleteStep({
  action,
  reservationId,
  canComplete,
  blockers,
}: {
  action: Action;
  reservationId: string;
  canComplete: boolean;
  blockers: string[];
}) {
  const [state, formAction] = useActionState<HandoverState, FormData>(
    action,
    {},
  );
  const shown = state.blockers ?? blockers;

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="reservationId" value={reservationId} />

      {shown.length > 0 ? (
        <div className="rounded-lg border border-caution/20 bg-caution-soft p-3.5">
          <p className="flex items-center gap-2 text-sm font-semibold text-caution">
            <IconAlert size={18} />
            Not ready to hand over
          </p>
          <ul className="mt-2 space-y-1 text-sm text-caution/90">
            {shown.map((blocker) => (
              <li key={blocker}>· {blocker}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-ink-muted">
          Everything required is done. Completing marks the rental active and the
          car as rented.
        </p>
      )}

      <FormError>{state.message}</FormError>

      <Button type="submit" size="lg" className="w-full" disabled={!canComplete}>
        Complete handover
      </Button>
    </form>
  );
}
