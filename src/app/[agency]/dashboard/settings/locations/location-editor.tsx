"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, FormError, Input, InputWithSuffix } from "@/components/ui/field";
import { IconMapPin, IconPencil, IconPlus } from "@/components/ui/icons";
import type { SettingsFormState } from "../actions";

export type LocationRow = {
  id: string;
  name: string;
  address: string | null;
  pickupFee: string;
  returnFee: string;
  isActive: boolean;
  usageCount: number;
};

function SaveButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

function LocationForm({
  action,
  initial,
  currency,
  onDone,
  submitLabel,
}: {
  action: (
    state: SettingsFormState,
    formData: FormData,
  ) => Promise<SettingsFormState>;
  initial?: LocationRow;
  currency: string;
  onDone: () => void;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState<SettingsFormState, FormData>(
    async (prev, formData) => {
      const result = await action(prev, formData);
      if (result.saved) onDone();
      return result;
    },
    {},
  );
  const errors = state.errors ?? {};

  return (
    <form action={formAction} className="space-y-4">
      <FormError>{state.message}</FormError>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Name"
          htmlFor={`name-${initial?.id ?? "new"}`}
          required
          error={errors.name}
          className="sm:col-span-2"
        >
          <Input
            id={`name-${initial?.id ?? "new"}`}
            name="name"
            defaultValue={initial?.name}
            placeholder="Marrakech Airport"
            aria-invalid={Boolean(errors.name)}
            required
          />
        </Field>

        <Field
          label="Address"
          htmlFor={`address-${initial?.id ?? "new"}`}
          error={errors.address}
          className="sm:col-span-2"
        >
          <Input
            id={`address-${initial?.id ?? "new"}`}
            name="address"
            defaultValue={initial?.address ?? ""}
            placeholder="Aéroport Marrakech-Ménara"
          />
        </Field>

        <Field
          label="Pickup fee"
          htmlFor={`pickupFee-${initial?.id ?? "new"}`}
          required
          error={errors.pickupFee}
        >
          <InputWithSuffix
            id={`pickupFee-${initial?.id ?? "new"}`}
            name="pickupFee"
            inputMode="decimal"
            suffix={currency}
            defaultValue={initial?.pickupFee ?? "0"}
            aria-invalid={Boolean(errors.pickupFee)}
            required
          />
        </Field>

        <Field
          label="Return fee"
          htmlFor={`returnFee-${initial?.id ?? "new"}`}
          required
          error={errors.returnFee}
        >
          <InputWithSuffix
            id={`returnFee-${initial?.id ?? "new"}`}
            name="returnFee"
            inputMode="decimal"
            suffix={currency}
            defaultValue={initial?.returnFee ?? "0"}
            aria-invalid={Boolean(errors.returnFee)}
            required
          />
        </Field>

        <label className="flex items-center gap-2.5 sm:col-span-2">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={initial?.isActive ?? true}
            className="h-5 w-5 rounded border-line-strong"
          />
          <span className="text-sm text-ink">
            Offered to customers on the website
          </span>
        </label>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <SaveButton label={submitLabel} />
      </div>
    </form>
  );
}

export function LocationEditor({
  locations,
  currency,
  createAction,
  updateActions,
  removeAction,
}: {
  locations: LocationRow[];
  currency: string;
  createAction: (
    state: SettingsFormState,
    formData: FormData,
  ) => Promise<SettingsFormState>;
  /**
   * One action per location, already bound to its id on the server. A factory
   * cannot cross the server/client boundary, but a bound action reference can.
   */
  updateActions: Record<
    string,
    (state: SettingsFormState, formData: FormData) => Promise<SettingsFormState>
  >;
  removeAction: (formData: FormData) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      {locations.length === 0 && !adding ? (
        <div className="rounded-card border border-dashed border-line-strong bg-surface-sunken px-6 py-10 text-center">
          <span className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-surface text-ink-muted ring-1 ring-line">
            <IconMapPin />
          </span>
          <p className="text-sm font-semibold text-ink">No locations yet</p>
          <p className="mt-1 text-sm text-ink-muted">
            Add at least one pickup point before customers can book.
          </p>
        </div>
      ) : null}

      <ul className="space-y-2">
        {locations.map((location) =>
          editingId === location.id && updateActions[location.id] ? (
            <li key={location.id}>
              <Card>
                <CardHeader title={`Edit ${location.name}`} />
                <LocationForm
                  action={updateActions[location.id]}
                  initial={location}
                  currency={currency}
                  onDone={() => setEditingId(null)}
                  submitLabel="Save changes"
                />
              </Card>
            </li>
          ) : (
            <li
              key={location.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3.5"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-ink">
                    {location.name}
                  </p>
                  {!location.isActive ? <Badge>Hidden</Badge> : null}
                </div>
                <p className="mt-0.5 text-xs text-ink-muted">
                  {location.address ? `${location.address} · ` : ""}
                  Pickup {location.pickupFee} {currency} · Return{" "}
                  {location.returnFee} {currency}
                  {location.usageCount > 0
                    ? ` · used by ${location.usageCount} reservation${location.usageCount === 1 ? "" : "s"}`
                    : ""}
                </p>
              </div>

              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditingId(location.id)}
                >
                  <IconPencil size={16} />
                  Edit
                </Button>
                <form action={removeAction}>
                  <input
                    type="hidden"
                    name="locationId"
                    value={location.id}
                  />
                  <Button type="submit" variant="ghost" size="sm">
                    {location.usageCount > 0 ? "Hide" : "Delete"}
                  </Button>
                </form>
              </div>
            </li>
          ),
        )}
      </ul>

      {adding ? (
        <Card>
          <CardHeader title="New location" />
          <LocationForm
            action={createAction}
            currency={currency}
            onDone={() => setAdding(false)}
            submitLabel="Add location"
          />
        </Card>
      ) : (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setAdding(true)}
        >
          <IconPlus size={16} />
          Add location
        </Button>
      )}
    </div>
  );
}
