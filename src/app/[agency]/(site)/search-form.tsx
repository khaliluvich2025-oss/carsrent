"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { IconSearch } from "@/components/ui/icons";

export type LocationOption = { id: string; name: string; fee: string };

/**
 * The search form (spec §8).
 *
 * A plain GET form: the search lands in the URL, which makes results shareable,
 * back-button-safe and bookmarkable, and works before JavaScript loads. The only
 * client state is the "same return location" toggle.
 */
export function SearchForm({
  action,
  locations,
  allowDifferentReturn,
  defaults,
  messages,
  currency,
}: {
  action: string;
  locations: LocationOption[];
  allowDifferentReturn: boolean;
  defaults: {
    pickupDate: string;
    pickupTime: string;
    returnDate: string;
    returnTime: string;
    pickupLocation: string;
    returnLocation: string;
    lang: string;
  };
  messages: Record<string, string>;
  currency: string;
}) {
  // A function cannot cross the server/client boundary, so the translator is
  // rebuilt here from the plain message map the server passed down.
  const labels = (key: string) => messages[key] ?? key;

  const [sameLocation, setSameLocation] = useState(
    defaults.pickupLocation === defaults.returnLocation,
  );
  const [pickupLocation, setPickupLocation] = useState(
    defaults.pickupLocation,
  );

  const label = (location: LocationOption) =>
    Number(location.fee) > 0
      ? `${location.name} · +${location.fee} ${currency}`
      : location.name;

  return (
    <form action={action} method="get" className="space-y-4">
      <input type="hidden" name="lang" value={defaults.lang} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={labels("home.pickupLocation")}
          htmlFor="pickupLocation"
          required
        >
          <Select
            id="pickupLocation"
            name="pickupLocation"
            value={pickupLocation}
            onChange={(event) => setPickupLocation(event.target.value)}
            required
          >
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {label(location)}
              </option>
            ))}
          </Select>
        </Field>

        {allowDifferentReturn && !sameLocation ? (
          <Field
            label={labels("home.returnLocation")}
            htmlFor="returnLocation"
            required
          >
            <Select
              id="returnLocation"
              name="returnLocation"
              defaultValue={defaults.returnLocation}
              required
            >
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                  {Number(location.fee) > 0
                    ? ` · +${location.fee} ${currency}`
                    : ""}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <input type="hidden" name="returnLocation" value={pickupLocation} />
        )}
      </div>

      {allowDifferentReturn ? (
        <label className="flex items-center gap-2.5">
          <input
            type="checkbox"
            checked={sameLocation}
            onChange={(event) => setSameLocation(event.target.checked)}
            className="h-5 w-5 rounded border-line-strong"
          />
          <span className="text-sm text-ink-soft">
            {labels("home.sameLocation")}
          </span>
        </label>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={labels("home.pickupDate")} htmlFor="pickupDate" required>
          <div className="flex gap-2">
            <Input
              id="pickupDate"
              name="pickupDate"
              type="date"
              defaultValue={defaults.pickupDate}
              required
            />
            <Input
              name="pickupTime"
              type="time"
              step={1800}
              defaultValue={defaults.pickupTime}
              className="w-32"
              aria-label={labels("home.pickupTime")}
              required
            />
          </div>
        </Field>

        <Field label={labels("home.returnDate")} htmlFor="returnDate" required>
          <div className="flex gap-2">
            <Input
              id="returnDate"
              name="returnDate"
              type="date"
              defaultValue={defaults.returnDate}
              required
            />
            <Input
              name="returnTime"
              type="time"
              step={1800}
              defaultValue={defaults.returnTime}
              className="w-32"
              aria-label={labels("home.returnTime")}
              required
            />
          </div>
        </Field>
      </div>

      <Button type="submit" size="lg" className="w-full">
        <IconSearch size={18} />
        {labels("home.search")}
      </Button>
    </form>
  );
}
