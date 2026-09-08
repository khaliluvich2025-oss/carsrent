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

export type ExtraRow = {
  id: string;
  name: string;
  description: string | null;
  priceType: "FLAT" | "PER_DAY";
  price: string;
  isActive: boolean;
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving…" : "Add extra"}
    </Button>
  );
}

export function ExtraEditor({
  extras,
  currency,
  createAction,
  deleteAction,
  toggleAction,
}: {
  extras: ExtraRow[];
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
      {extras.length === 0 && !adding ? (
        <p className="rounded-card border border-dashed border-line-strong bg-surface-sunken px-4 py-6 text-center text-sm text-ink-muted">
          No extras yet. Add things like a child seat, GPS or an additional
          driver.
        </p>
      ) : null}

      {extras.length > 0 ? (
        <ul className="space-y-2">
          {extras.map((extra) => (
            <li
              key={extra.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3.5"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-ink">{extra.name}</p>
                  {!extra.isActive ? <Badge>Off</Badge> : null}
                </div>
                <p className="mt-0.5 text-xs text-ink-muted">
                  <span className="font-medium text-ink-soft">
                    {extra.price} {currency}
                  </span>{" "}
                  {extra.priceType === "PER_DAY" ? "per day" : "one-off"}
                  {extra.description ? ` · ${extra.description}` : ""}
                </p>
              </div>

              <div className="flex items-center gap-1">
                <form action={toggleAction}>
                  <input type="hidden" name="extraId" value={extra.id} />
                  <input
                    type="hidden"
                    name="isActive"
                    value={extra.isActive ? "0" : "1"}
                  />
                  <Button type="submit" variant="ghost" size="sm">
                    {extra.isActive ? "Turn off" : "Turn on"}
                  </Button>
                </form>
                <form action={deleteAction}>
                  <input type="hidden" name="extraId" value={extra.id} />
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
          <CardHeader title="New extra" />
          <form action={formAction} className="space-y-4">
            <FormError>{errors._form}</FormError>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Name"
                htmlFor="extra-name"
                required
                error={errors.name}
              >
                <Input
                  id="extra-name"
                  name="name"
                  placeholder="Child seat"
                  aria-invalid={Boolean(errors.name)}
                  required
                />
              </Field>

              <Field
                label="Charged"
                htmlFor="extra-type"
                error={errors.priceType}
              >
                <Select id="extra-type" name="priceType" defaultValue="FLAT">
                  <option value="FLAT">Once per rental</option>
                  <option value="PER_DAY">Per day</option>
                </Select>
              </Field>

              <Field
                label="Price"
                htmlFor="extra-price"
                required
                error={errors.price}
              >
                <InputWithSuffix
                  id="extra-price"
                  name="price"
                  inputMode="decimal"
                  suffix={currency}
                  placeholder="100"
                  aria-invalid={Boolean(errors.price)}
                  required
                />
              </Field>

              <Field
                label="Description"
                htmlFor="extra-description"
                error={errors.description}
              >
                <Input
                  id="extra-description"
                  name="description"
                  placeholder="Group 1, up to 18 kg"
                />
              </Field>

              <label className="flex items-center gap-2.5 sm:col-span-2">
                <input
                  type="checkbox"
                  name="isActive"
                  defaultChecked
                  className="h-5 w-5 rounded border-line-strong"
                />
                <span className="text-sm text-ink">
                  Offered to customers at booking
                </span>
              </label>
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
              <SubmitButton />
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
          Add extra
        </Button>
      )}
    </div>
  );
}
