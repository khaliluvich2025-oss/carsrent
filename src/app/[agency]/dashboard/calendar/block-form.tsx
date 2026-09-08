"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { IconAlert, IconPlus } from "@/components/ui/icons";
import type { BlockFormState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Checking…" : "Block vehicle"}
    </Button>
  );
}

export function BlockForm({
  action,
  vehicles,
  defaultDate,
}: {
  action: (
    state: BlockFormState,
    formData: FormData,
  ) => Promise<BlockFormState>;
  vehicles: { id: string; label: string }[];
  defaultDate: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<BlockFormState, FormData>(
    async (prev, formData) => {
      const result = await action(prev, formData);
      if (result.saved) setOpen(false);
      return result;
    },
    {},
  );
  const errors = state.errors ?? {};

  if (!open) {
    return (
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
      >
        <IconPlus size={16} />
        Block a vehicle
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Take a vehicle off the road"
        description="Maintenance and manual blocks stop the car being booked for that period."
      />

      {/* spec §58 — surface the conflicting bookings instead of just refusing */}
      {state.conflicts?.length ? (
        <div className="mb-4 rounded-lg border border-critical/20 bg-critical-soft p-3.5">
          <p className="flex items-center gap-2 text-sm font-semibold text-critical">
            <IconAlert size={18} />
            This period is already committed
          </p>
          <ul className="mt-2 space-y-1 text-sm text-critical/90">
            {state.conflicts.map((conflict) => (
              <li key={conflict}>· {conflict}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-critical/80">
            Move or cancel the booking first, or choose a different period.
          </p>
        </div>
      ) : null}

      <form action={formAction} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Vehicle"
            htmlFor="block-vehicle"
            required
            error={errors.vehicleId}
          >
            <Select id="block-vehicle" name="vehicleId" required>
              {vehicles.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Reason type" htmlFor="block-kind" error={errors.kind}>
            <Select id="block-kind" name="kind" defaultValue="MAINTENANCE">
              <option value="MAINTENANCE">Maintenance</option>
              <option value="MANUAL">Other (manual block)</option>
            </Select>
          </Field>

          <Field
            label="From"
            htmlFor="block-start-date"
            required
            error={errors.startDate}
          >
            <div className="flex gap-2">
              <Input
                id="block-start-date"
                name="startDate"
                type="date"
                defaultValue={defaultDate}
                required
              />
              <Input
                name="startTime"
                type="time"
                defaultValue="08:00"
                className="w-28"
                aria-label="Start time"
                required
              />
            </div>
          </Field>

          <Field
            label="Until"
            htmlFor="block-end-date"
            required
            error={errors.endDate}
          >
            <div className="flex gap-2">
              <Input
                id="block-end-date"
                name="endDate"
                type="date"
                defaultValue={defaultDate}
                required
              />
              <Input
                name="endTime"
                type="time"
                defaultValue="18:00"
                className="w-28"
                aria-label="End time"
                required
              />
            </div>
          </Field>

          <Field
            label="Note"
            htmlFor="block-reason"
            error={errors.reason}
            className="sm:col-span-2"
          >
            <Input
              id="block-reason"
              name="reason"
              placeholder="Oil change and brake pads"
            />
          </Field>
        </div>

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <SubmitButton />
        </div>
      </form>
    </Card>
  );
}
