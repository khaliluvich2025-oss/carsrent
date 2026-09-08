"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import {
  Field,
  FormError,
  Input,
  InputWithSuffix,
  Select,
} from "@/components/ui/field";
import { IconPlus } from "@/components/ui/icons";
import type { SettingsFormState } from "../actions";

export type SeasonRow = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  dailyPrice: string;
  priority: number;
  isActive: boolean;
  vehicleLabel: string | null;
};

export type VehicleOption = { id: string; label: string };

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

export function SeasonEditor({
  seasons,
  vehicles,
  currency,
  createAction,
  deleteAction,
  toggleAction,
}: {
  seasons: SeasonRow[];
  vehicles: VehicleOption[];
  currency: string;
  createAction: (
    state: SettingsFormState,
    formData: FormData,
  ) => Promise<SettingsFormState>;
  deleteAction: (formData: FormData) => Promise<void>;
  toggleAction: (formData: FormData) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [state, formAction] = useActionState<SettingsFormState, FormData>(
    async (prev, formData) => {
      const result = await createAction(prev, formData);
      if (result.saved) setAdding(false);
      return result;
    },
    {},
  );
  const errors = state.errors ?? {};

  return (
    <div className="space-y-3">
      {seasons.length === 0 && !adding ? (
        <p className="rounded-card border border-dashed border-line-strong bg-surface-sunken px-4 py-6 text-center text-sm text-ink-muted">
          No seasons yet. Without one, every rental uses the vehicle&rsquo;s
          standard rates.
        </p>
      ) : null}

      {seasons.length > 0 ? (
        <ul className="space-y-2">
          {seasons.map((season) => (
            <li
              key={season.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3.5"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-ink">{season.name}</p>
                  {!season.isActive ? <Badge>Off</Badge> : null}
                  {season.priority > 0 ? (
                    <Badge tone="info">Priority {season.priority}</Badge>
                  ) : null}
                </div>
                <p className="mt-0.5 text-xs text-ink-muted">
                  {season.startDate} → {season.endDate} ·{" "}
                  <span className="font-medium text-ink-soft">
                    {season.dailyPrice} {currency}/day
                  </span>{" "}
                  · {season.vehicleLabel ?? "Whole fleet"}
                </p>
              </div>

              <div className="flex items-center gap-1">
                <form action={toggleAction}>
                  <input type="hidden" name="seasonId" value={season.id} />
                  <input
                    type="hidden"
                    name="isActive"
                    value={season.isActive ? "0" : "1"}
                  />
                  <Button type="submit" variant="ghost" size="sm">
                    {season.isActive ? "Turn off" : "Turn on"}
                  </Button>
                </form>
                <form action={deleteAction}>
                  <input type="hidden" name="seasonId" value={season.id} />
                  <Button type="submit" variant="ghost" size="sm">
                    Delete
                  </Button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {adding ? (
        <Card>
          <CardHeader title="New season" />
          <form action={formAction} className="space-y-4">
            <FormError>{errors._form}</FormError>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Name"
                htmlFor="season-name"
                required
                error={errors.name}
                className="sm:col-span-2"
              >
                <Input
                  id="season-name"
                  name="name"
                  placeholder="High season"
                  aria-invalid={Boolean(errors.name)}
                  required
                />
              </Field>

              <Field
                label="Starts"
                htmlFor="season-start"
                required
                error={errors.startDate}
              >
                <Input
                  id="season-start"
                  name="startDate"
                  type="date"
                  aria-invalid={Boolean(errors.startDate)}
                  required
                />
              </Field>

              <Field
                label="Ends"
                htmlFor="season-end"
                required
                error={errors.endDate}
              >
                <Input
                  id="season-end"
                  name="endDate"
                  type="date"
                  aria-invalid={Boolean(errors.endDate)}
                  required
                />
              </Field>

              <Field
                label="Daily price"
                htmlFor="season-price"
                required
                error={errors.dailyPrice}
              >
                <InputWithSuffix
                  id="season-price"
                  name="dailyPrice"
                  inputMode="decimal"
                  suffix={currency}
                  placeholder="600"
                  aria-invalid={Boolean(errors.dailyPrice)}
                  required
                />
              </Field>

              <Field
                label="Priority"
                htmlFor="season-priority"
                error={errors.priority}
                hint="Higher wins when two seasons overlap."
              >
                <Input
                  id="season-priority"
                  name="priority"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={100}
                  defaultValue="0"
                />
              </Field>

              <Field
                label="Applies to"
                htmlFor="season-vehicle"
                error={errors.vehicleId}
                className="sm:col-span-2"
              >
                <Select id="season-vehicle" name="vehicleId" defaultValue="">
                  <option value="">Whole fleet</option>
                  {vehicles.map((vehicle) => (
                    <option key={vehicle.id} value={vehicle.id}>
                      {vehicle.label}
                    </option>
                  ))}
                </Select>
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
              <SubmitButton label="Add season" />
            </div>
          </form>
        </Card>
      ) : (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setAdding(true)}
        >
          <IconPlus size={16} />
          Add season
        </Button>
      )}
    </div>
  );
}
