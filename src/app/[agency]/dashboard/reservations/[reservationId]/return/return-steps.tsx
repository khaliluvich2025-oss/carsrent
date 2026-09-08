"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

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
import type { ReturnState } from "./actions";

type Action = (
  state: ReturnState,
  formData: FormData,
) => Promise<ReturnState>;

function Save({ label = "Save" }: { label?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

export function ReturnInspectionStep({
  action,
  reservationId,
  values,
  pickup,
}: {
  action: Action;
  reservationId: string;
  values: {
    returnDate: string;
    returnTime: string;
    mileage: string;
    fuelLevel: string;
    condition: string;
    notes: string;
  };
  pickup: { mileage: number | null; fuelLevel: number | null };
}) {
  const [state, formAction] = useActionState<ReturnState, FormData>(action, {});
  const [fuel, setFuel] = useState(values.fuelLevel || "100");
  const errors = state.errors ?? {};

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="reservationId" value={reservationId} />
      <FormError>{state.message}</FormError>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Returned at"
          htmlFor="r-date"
          required
          error={errors.returnDate}
          hint="The real time the car came back — every late charge is measured from this."
        >
          <div className="flex gap-2">
            <Input
              id="r-date"
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
          label="Closing odometer"
          htmlFor="r-mileage"
          required
          error={errors.mileage}
          hint={
            pickup.mileage != null
              ? `Out at ${pickup.mileage.toLocaleString()} km`
              : undefined
          }
        >
          <InputWithSuffix
            id="r-mileage"
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

        <Field
          label={`Fuel — ${fuel}%`}
          htmlFor="r-fuel"
          required
          hint={
            pickup.fuelLevel != null ? `Out at ${pickup.fuelLevel}%` : undefined
          }
        >
          <input
            id="r-fuel"
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

        <Field label="Condition" htmlFor="r-condition" error={errors.condition}>
          <Input
            id="r-condition"
            name="condition"
            defaultValue={values.condition}
            placeholder="Clean, no new marks"
          />
        </Field>

        <Field
          label="Notes"
          htmlFor="r-notes"
          error={errors.notes}
          className="sm:col-span-2"
        >
          <Textarea
            id="r-notes"
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

/** New damage found at return (spec §47). */
export function ReturnDamageStep({
  addAction,
  confirmAction,
  reservationId,
  currency,
  damages,
  confirmed,
  canRecord,
}: {
  addAction: Action;
  confirmAction: (formData: FormData) => Promise<void>;
  reservationId: string;
  currency: string;
  damages: {
    id: string;
    location: string;
    type: string;
    description: string | null;
    estimate: string | null;
    preExisting: boolean;
  }[];
  confirmed: boolean;
  canRecord: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [state, formAction] = useActionState<ReturnState, FormData>(
    async (prev, formData) => {
      const result = await addAction(prev, formData);
      if (result.saved) setAdding(false);
      return result;
    },
    {},
  );
  const errors = state.errors ?? {};

  const existing = damages.filter((damage) => damage.preExisting);
  const fresh = damages.filter((damage) => !damage.preExisting);

  return (
    <div className="space-y-3">
      {existing.length > 0 ? (
        <div className="rounded-lg bg-surface-sunken p-3">
          <p className="mb-1.5 text-xs font-medium text-ink-muted">
            Already there at pickup — not chargeable
          </p>
          <ul className="space-y-1">
            {existing.map((damage) => (
              <li key={damage.id} className="text-sm text-ink-soft">
                {damage.type} — {damage.location}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {fresh.length > 0 ? (
        <ul className="space-y-2">
          {fresh.map((damage) => (
            <li
              key={damage.id}
              className="rounded-lg border border-critical/20 bg-critical-soft px-3 py-2.5"
            >
              <div className="flex justify-between gap-3">
                <p className="text-sm font-medium text-critical">
                  {damage.type} — {damage.location}
                </p>
                {damage.estimate ? (
                  <span className="shrink-0 text-sm font-medium text-critical tabular-nums">
                    ~{damage.estimate} {currency}
                  </span>
                ) : null}
              </div>
              {damage.description ? (
                <p className="text-xs text-critical/80">{damage.description}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {!canRecord ? (
        <p className="text-sm text-ink-muted">
          Record the return reading above first.
        </p>
      ) : adding ? (
        <form
          action={formAction}
          className="space-y-3 rounded-lg bg-surface-sunken p-3"
        >
          <input type="hidden" name="reservationId" value={reservationId} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Where" htmlFor="rd-location" required error={errors.location}>
              <Input id="rd-location" name="location" placeholder="Rear bumper" required />
            </Field>
            <Field label="What" htmlFor="rd-type" required error={errors.damageType}>
              <Input id="rd-type" name="damageType" placeholder="Dent" required />
            </Field>
            <Field
              label="Description"
              htmlFor="rd-description"
              className="sm:col-span-2"
            >
              <Input id="rd-description" name="description" />
            </Field>
            <Field
              label="Estimated repair"
              htmlFor="rd-estimate"
              error={errors.estimatedCharge}
              hint="An estimate only. Charge it below once you have decided."
            >
              <InputWithSuffix
                id="rd-estimate"
                name="estimatedCharge"
                inputMode="decimal"
                suffix={currency}
              />
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(false)}>
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
            Record new damage
          </Button>

          {!confirmed ? (
            <form action={confirmAction}>
              <input type="hidden" name="reservationId" value={reservationId} />
              <Button type="submit" size="sm">
                <IconCheck size={16} />
                Before/after compared
              </Button>
            </form>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-sm text-positive">
              <IconCheck size={16} />
              Inspection confirmed
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** A proposed charge the employee confirms or edits (spec §44, §48). */
export function ChargeStep({
  action,
  removeAction,
  reservationId,
  currency,
  proposals,
  charges,
  depositHeld,
}: {
  action: Action;
  removeAction: (formData: FormData) => Promise<void>;
  reservationId: string;
  currency: string;
  proposals: {
    type: string;
    label: string;
    detail: string;
    amount: string;
  }[];
  charges: {
    id: string;
    type: string;
    description: string | null;
    amount: string;
    fromDeposit: boolean;
  }[];
  depositHeld: string;
}) {
  const [state, formAction] = useActionState<ReturnState, FormData>(action, {});
  const [selected, setSelected] = useState(proposals[0]?.type ?? "OTHER");
  const errors = state.errors ?? {};

  const proposal = proposals.find((item) => item.type === selected);
  const hasDeposit = Number(depositHeld) > 0;

  return (
    <div className="space-y-4">
      {proposals.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-ink-muted">
            Calculated from the readings — nothing is charged until you add it.
          </p>
          {proposals.map((item) => (
            <div
              key={item.type}
              className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">{item.label}</p>
                <p className="text-xs text-ink-muted">{item.detail}</p>
              </div>
              <span className="shrink-0 text-sm font-semibold text-ink tabular-nums">
                {item.amount} {currency}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {charges.length > 0 ? (
        <ul className="divide-y divide-line border-t border-line pt-2">
          {charges.map((charge) => (
            <li key={charge.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">
                  {charge.type.replace(/_/g, " ").toLowerCase()}
                </p>
                <p className="text-xs text-ink-muted">
                  {charge.description ?? "—"}
                  {charge.fromDeposit ? " · from deposit" : " · customer pays"}
                </p>
              </div>
              <span className="shrink-0 text-sm font-medium text-ink tabular-nums">
                {charge.amount} {currency}
              </span>
              <form action={removeAction} className="shrink-0">
                <input type="hidden" name="chargeId" value={charge.id} />
                <button
                  type="submit"
                  className="text-xs font-medium text-ink-muted transition hover:text-critical"
                >
                  Remove
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : null}

      <form action={formAction} className="space-y-3 border-t border-line pt-3">
        <input type="hidden" name="reservationId" value={reservationId} />
        <FormError>{state.message}</FormError>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Charge" htmlFor="ch-type">
            <Select
              id="ch-type"
              name="type"
              value={selected}
              onChange={(event) => setSelected(event.target.value)}
            >
              <option value="LATE_RETURN">Late return</option>
              <option value="EXTRA_MILEAGE">Extra mileage</option>
              <option value="FUEL">Fuel</option>
              <option value="DAMAGE">Damage</option>
              <option value="OTHER">Other</option>
            </Select>
          </Field>

          <Field label="Amount" htmlFor="ch-amount" required error={errors.amount}>
            <InputWithSuffix
              id="ch-amount"
              name="amount"
              inputMode="decimal"
              suffix={currency}
              defaultValue={proposal?.amount ?? ""}
              key={proposal?.amount ?? selected}
              aria-invalid={Boolean(errors.amount)}
              required
            />
          </Field>

          <Field
            label="Description"
            htmlFor="ch-description"
            className="sm:col-span-2"
          >
            <Input
              id="ch-description"
              name="description"
              defaultValue={proposal?.detail ?? ""}
              key={`d-${proposal?.detail ?? selected}`}
            />
          </Field>

          {hasDeposit ? (
            <label className="flex items-start gap-3 sm:col-span-2">
              <input
                type="checkbox"
                name="settleFromDeposit"
                defaultChecked
                className="mt-0.5 h-5 w-5 rounded border-line-strong"
              />
              <span className="text-sm">
                <span className="font-medium text-ink">
                  Take this from the security deposit
                </span>
                <span className="block text-ink-muted">
                  {depositHeld} {currency} held. Unticked, the customer pays it
                  separately.
                </span>
              </span>
            </label>
          ) : null}
        </div>

        <div className="flex justify-end">
          <Save label="Add charge" />
        </div>
      </form>
    </div>
  );
}

export function SettleStep({
  collectAction,
  depositAction,
  reservationId,
  currency,
  outstanding,
  depositHeld,
}: {
  collectAction: Action;
  depositAction: Action;
  reservationId: string;
  currency: string;
  outstanding: string;
  depositHeld: string;
}) {
  const [collectState, collectFormAction] = useActionState<
    ReturnState,
    FormData
  >(collectAction, {});
  const [depositState, depositFormAction] = useActionState<
    ReturnState,
    FormData
  >(depositAction, {});

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 text-sm font-medium text-ink">
          Outstanding balance: {outstanding} {currency}
        </p>
        {Number(outstanding) <= 0 ? (
          <p className="text-sm text-positive">Nothing left to collect.</p>
        ) : (
          <form action={collectFormAction} className="space-y-3">
            <input type="hidden" name="reservationId" value={reservationId} />
            <FormError>{collectState.message}</FormError>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Collect"
                htmlFor="s-amount"
                required
                error={collectState.errors?.amount}
              >
                <InputWithSuffix
                  id="s-amount"
                  name="amount"
                  inputMode="decimal"
                  suffix={currency}
                  defaultValue={outstanding}
                  required
                />
              </Field>
              <Field label="Method" htmlFor="s-method">
                <Select id="s-method" name="method" defaultValue="CASH">
                  <option value="CASH">Cash</option>
                  <option value="CARD">Card</option>
                  <option value="BANK_TRANSFER">Bank transfer</option>
                  <option value="OTHER">Other</option>
                </Select>
              </Field>
            </div>
            <div className="flex justify-end">
              <Save label="Record payment" />
            </div>
          </form>
        )}
      </div>

      <div className="border-t border-line pt-4">
        <p className="mb-2 text-sm font-medium text-ink">
          Security deposit: {depositHeld} {currency} held
        </p>
        {Number(depositHeld) <= 0 ? (
          <p className="text-sm text-positive">Deposit already settled.</p>
        ) : (
          <form action={depositFormAction} className="space-y-2">
            <input type="hidden" name="reservationId" value={reservationId} />
            <p className="text-sm text-ink-muted">
              Retains whatever you charged to the deposit above and refunds the
              rest to the customer.
            </p>
            {depositState.message ? (
              <p className="text-sm text-positive">{depositState.message}</p>
            ) : null}
            <div className="flex justify-end">
              <Save label="Settle deposit" />
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export function CompleteRentalStep({
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
  const [state, formAction] = useActionState<ReturnState, FormData>(action, {});
  const shown = state.blockers ?? blockers;

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="reservationId" value={reservationId} />

      {shown.length > 0 ? (
        <div className="rounded-lg border border-caution/20 bg-caution-soft p-3.5">
          <p className="flex items-center gap-2 text-sm font-semibold text-caution">
            <IconAlert size={18} />
            Not ready to close
          </p>
          <ul className="mt-2 space-y-1 text-sm text-caution/90">
            {shown.map((blocker) => (
              <li key={blocker}>· {blocker}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-ink-muted">
          Everything is settled. Completing frees the car after the turnaround
          buffer — or sends it to maintenance if new damage was recorded.
        </p>
      )}

      <FormError>{state.message}</FormError>

      <Button type="submit" size="lg" className="w-full" disabled={!canComplete}>
        Complete rental
      </Button>
    </form>
  );
}

export { Card };
