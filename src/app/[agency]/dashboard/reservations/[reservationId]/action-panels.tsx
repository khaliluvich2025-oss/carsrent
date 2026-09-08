"use client";

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
import { IconAlert } from "@/components/ui/icons";
import type { ReservationActionState } from "../actions";

type Action = (
  state: ReservationActionState,
  formData: FormData,
) => Promise<ReservationActionState>;

function Submit({ label, variant = "primary" }: { label: string; variant?: "primary" | "danger" }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant={variant} disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

function Conflicts({ conflicts }: { conflicts?: string[] }) {
  if (!conflicts?.length) return null;
  return (
    <div className="mb-4 rounded-lg border border-critical/20 bg-critical-soft p-3.5">
      <p className="flex items-center gap-2 text-sm font-semibold text-critical">
        <IconAlert size={18} />
        Not available for that period
      </p>
      <ul className="mt-2 space-y-1 text-sm text-critical/90">
        {conflicts.map((conflict) => (
          <li key={conflict}>· {conflict}</li>
        ))}
      </ul>
    </div>
  );
}

/** Cancel with a required reason (spec §53). */
export function CancelPanel({
  action,
  reservationId,
}: {
  action: Action;
  reservationId: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<ReservationActionState, FormData>(
    action,
    {},
  );

  if (!open) {
    return (
      <Button
        type="button"
        variant="danger"
        size="sm"
        onClick={() => setOpen(true)}
      >
        Cancel reservation
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Cancel reservation"
        description="The held dates are released immediately. Payments already taken stay in the financial history — refund them separately."
      />
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="reservationId" value={reservationId} />
        <FormError>{state.message}</FormError>

        <Field label="Reason" htmlFor="cancel-reason" required>
          <Select id="cancel-reason" name="reason" defaultValue="CUSTOMER_REQUEST">
            <option value="CUSTOMER_REQUEST">Customer request</option>
            <option value="PAYMENT_ISSUE">Payment issue</option>
            <option value="AGENCY_DECISION">Agency decision</option>
            <option value="OTHER">Other</option>
          </Select>
        </Field>

        <Field label="Note" htmlFor="cancel-note">
          <Textarea id="cancel-note" name="note" rows={2} />
        </Field>

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setOpen(false)}
          >
            Keep reservation
          </Button>
          <Submit label="Cancel reservation" variant="danger" />
        </div>
      </form>
    </Card>
  );
}

/** Change dates, vehicle or locations (spec §55). */
export function ModifyPanel({
  action,
  reservationId,
  vehicles,
  locations,
  values,
}: {
  action: Action;
  reservationId: string;
  vehicles: { id: string; label: string }[];
  locations: { id: string; name: string }[];
  values: {
    vehicleId: string;
    pickupLocationId: string;
    returnLocationId: string;
    pickupDate: string;
    pickupTime: string;
    returnDate: string;
    returnTime: string;
  };
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<ReservationActionState, FormData>(
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
        Modify
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Modify reservation"
        description="Availability is re-checked and the price recalculated before saving."
      />
      <Conflicts conflicts={state.conflicts} />
      <FormError>{state.message}</FormError>

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="reservationId" value={reservationId} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Vehicle"
            htmlFor="modify-vehicle"
            error={errors.vehicleId}
            className="sm:col-span-2"
          >
            <Select
              id="modify-vehicle"
              name="vehicleId"
              defaultValue={values.vehicleId}
            >
              {vehicles.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Pickup"
            htmlFor="modify-pickup-date"
            error={errors.pickupDate}
          >
            <div className="flex gap-2">
              <Input
                id="modify-pickup-date"
                name="pickupDate"
                type="date"
                defaultValue={values.pickupDate}
                required
              />
              <Input
                name="pickupTime"
                type="time"
                defaultValue={values.pickupTime}
                className="w-28"
                aria-label="Pickup time"
                required
              />
            </div>
          </Field>

          <Field
            label="Return"
            htmlFor="modify-return-date"
            error={errors.returnDate}
          >
            <div className="flex gap-2">
              <Input
                id="modify-return-date"
                name="returnDate"
                type="date"
                defaultValue={values.returnDate}
                required
              />
              <Input
                name="returnTime"
                type="time"
                defaultValue={values.returnTime}
                className="w-28"
                aria-label="Return time"
                required
              />
            </div>
          </Field>

          <Field
            label="Pickup location"
            htmlFor="modify-pickup-location"
            error={errors.pickupLocationId}
          >
            <Select
              id="modify-pickup-location"
              name="pickupLocationId"
              defaultValue={values.pickupLocationId}
            >
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Return location"
            htmlFor="modify-return-location"
            error={errors.returnLocationId}
          >
            <Select
              id="modify-return-location"
              name="returnLocationId"
              defaultValue={values.returnLocationId}
            >
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Reason"
            htmlFor="modify-reason"
            error={errors.reason}
            className="sm:col-span-2"
          >
            <Input
              id="modify-reason"
              name="reason"
              placeholder="Customer asked to collect a day later"
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
          <Submit label="Save changes" />
        </div>
      </form>
    </Card>
  );
}

/** Extend a rental in progress (spec §56). */
export function ExtendPanel({
  action,
  reservationId,
  currentReturn,
}: {
  action: Action;
  reservationId: string;
  currentReturn: { date: string; time: string };
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<ReservationActionState, FormData>(
    action,
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
        Extend rental
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Extend rental"
        description="Checks the vehicle is free for the extra days before approving."
      />
      <Conflicts conflicts={state.conflicts} />
      <FormError>{state.message}</FormError>
      {state.saved && state.message ? (
        <p className="mb-3 text-sm text-positive">{state.message}</p>
      ) : null}

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="reservationId" value={reservationId} />

        <Field
          label="New return"
          htmlFor="extend-date"
          required
          error={errors.returnDate}
        >
          <div className="flex gap-2">
            <Input
              id="extend-date"
              name="returnDate"
              type="date"
              defaultValue={currentReturn.date}
              required
            />
            <Input
              name="returnTime"
              type="time"
              defaultValue={currentReturn.time}
              className="w-28"
              aria-label="Return time"
              required
            />
          </div>
        </Field>

        <Field label="Reason" htmlFor="extend-reason" error={errors.reason}>
          <Input id="extend-reason" name="reason" placeholder="Customer staying longer" />
        </Field>

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Submit label="Extend" />
        </div>
      </form>
    </Card>
  );
}

/** Owner-only negotiated price (spec §26). */
export function OverridePanel({
  action,
  reservationId,
  calculatedTotal,
  currentTotal,
  currency,
}: {
  action: Action;
  reservationId: string;
  calculatedTotal: string;
  currentTotal: string;
  currency: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<ReservationActionState, FormData>(
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
        Override price
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Negotiated price"
        description="The calculated price is kept alongside this, with who changed it and why."
      />
      <FormError>{state.message}</FormError>

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="reservationId" value={reservationId} />

        <p className="text-sm text-ink-muted">
          System total:{" "}
          <span className="font-medium text-ink tabular-nums">
            {calculatedTotal} {currency}
          </span>
        </p>

        <Field
          label="Negotiated total"
          htmlFor="override-total"
          required
          error={errors.newTotal}
        >
          <InputWithSuffix
            id="override-total"
            name="newTotal"
            inputMode="decimal"
            suffix={currency}
            defaultValue={currentTotal}
            aria-invalid={Boolean(errors.newTotal)}
            required
          />
        </Field>

        <Field
          label="Reason"
          htmlFor="override-reason"
          required
          error={errors.reason}
          hint="Recorded in the audit log."
        >
          <Input
            id="override-reason"
            name="reason"
            placeholder="Returning customer discount"
            aria-invalid={Boolean(errors.reason)}
            required
          />
        </Field>

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Submit label="Apply price" />
        </div>
      </form>
    </Card>
  );
}
