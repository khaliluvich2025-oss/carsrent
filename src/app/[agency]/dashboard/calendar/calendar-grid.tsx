"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IconCar, IconClose } from "@/components/ui/icons";
import { placeInWindow, type CalendarView } from "@/server/services/availability/range";

export type GridBlock = {
  id: string;
  vehicleId: string;
  kind: "RESERVATION" | "MAINTENANCE" | "MANUAL" | "PAYMENT_HOLD";
  /** ISO strings — Dates do not survive the server/client boundary as Dates */
  startsAt: string;
  endsAt: string;
  bufferMinutes: number;
  label: string;
  detail: string | null;
  bookingReference: string | null;
  customerName: string | null;
  reservationStatus: string | null;
  removable: boolean;
  /** Preformatted in the agency timezone on the server */
  startLabel: string;
  endLabel: string;
};

export type GridVehicle = {
  id: string;
  brand: string;
  model: string;
  registrationNumber: string;
};

export type GridColumn = { label: string; sublabel?: string; isToday?: boolean };

const KIND_STYLES = {
  RESERVATION: "bg-[var(--brand)] text-[var(--brand-ink)]",
  // Slate rather than amber: against a warm brand colour the two were
  // indistinguishable, and "booked" versus "off the road" is the single most
  // important distinction on this screen.
  MAINTENANCE:
    "bg-ink-soft text-white [background-image:repeating-linear-gradient(45deg,transparent,transparent_5px,rgba(255,255,255,0.16)_5px,rgba(255,255,255,0.16)_10px)]",
  MANUAL: "bg-ink-muted text-white",
  PAYMENT_HOLD:
    "bg-surface text-ink-soft ring-1 ring-inset ring-line-strong [background-image:repeating-linear-gradient(45deg,transparent,transparent_4px,rgba(15,23,42,0.06)_4px,rgba(15,23,42,0.06)_8px)]",
} as const;

const KIND_TONE = {
  RESERVATION: "brand",
  MAINTENANCE: "caution",
  MANUAL: "neutral",
  PAYMENT_HOLD: "neutral",
} as const;

export function CalendarGrid({
  vehicles,
  blocks,
  columns,
  windowStart,
  windowEnd,
  view,
  removeAction,
}: {
  vehicles: GridVehicle[];
  blocks: GridBlock[];
  columns: GridColumn[];
  windowStart: string;
  windowEnd: string;
  view: CalendarView;
  removeAction: (formData: FormData) => Promise<void>;
}) {
  const [selected, setSelected] = useState<GridBlock | null>(null);

  const start = new Date(windowStart);
  const end = new Date(windowEnd);

  // Wide enough that a month still reads clearly; the container scrolls.
  const trackWidth =
    view === "month" ? "min-w-[900px]" : view === "week" ? "min-w-[680px]" : "min-w-[720px]";

  return (
    <>
      <div className="overflow-hidden rounded-card border border-line bg-surface">
        <div className="overflow-x-auto">
          <div className={trackWidth}>
            {/* Column headers */}
            <div className="flex border-b border-line bg-surface-sunken">
              <div className="sticky left-0 z-20 w-36 shrink-0 border-r border-line bg-surface-sunken px-3 py-2 text-xs font-semibold text-ink-muted sm:w-48">
                Vehicle
              </div>
              <div className="flex flex-1">
                {columns.map((column, index) => (
                  <div
                    key={index}
                    className={`flex-1 border-r border-line px-1 py-2 text-center last:border-r-0 ${
                      column.isToday ? "bg-[var(--brand-soft)]" : ""
                    }`}
                  >
                    <p
                      className={`text-[11px] font-semibold ${column.isToday ? "text-[var(--brand)]" : "text-ink-soft"}`}
                    >
                      {column.label}
                    </p>
                    {column.sublabel ? (
                      <p className="text-[10px] text-ink-muted">
                        {column.sublabel}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>

            {/* Vehicle rows */}
            {vehicles.map((vehicle) => {
              const rowBlocks = blocks.filter((b) => b.vehicleId === vehicle.id);

              return (
                <div
                  key={vehicle.id}
                  className="flex border-b border-line last:border-b-0"
                >
                  <div className="sticky left-0 z-20 w-36 shrink-0 border-r border-line bg-surface px-3 py-2.5 sm:w-48">
                    <p className="truncate text-xs font-semibold text-ink">
                      {vehicle.brand} {vehicle.model}
                    </p>
                    <p className="truncate font-mono text-[10px] text-ink-muted">
                      {vehicle.registrationNumber}
                    </p>
                  </div>

                  <div className="relative flex-1">
                    {/* Column guides */}
                    <div className="absolute inset-0 flex">
                      {columns.map((column, index) => (
                        <div
                          key={index}
                          className={`flex-1 border-r border-line/60 last:border-r-0 ${
                            column.isToday ? "bg-[var(--brand-soft)]/40" : ""
                          }`}
                        />
                      ))}
                    </div>

                    <div className="relative h-12">
                      {rowBlocks.map((block) => {
                        const placement = placeInWindow(
                          new Date(block.startsAt),
                          new Date(block.endsAt),
                          start,
                          end,
                        );
                        if (!placement) return null;

                        return (
                          <button
                            key={block.id}
                            type="button"
                            onClick={() => setSelected(block)}
                            title={`${block.label} · ${block.startLabel} → ${block.endLabel}`}
                            className={`absolute top-1.5 flex h-9 items-center overflow-hidden px-2 text-[11px] font-medium transition hover:brightness-110 ${KIND_STYLES[block.kind]} ${
                              placement.clippedStart
                                ? "rounded-l-none"
                                : "rounded-l-md"
                            } ${placement.clippedEnd ? "rounded-r-none" : "rounded-r-md"}`}
                            style={{
                              left: `${placement.leftPct}%`,
                              width: `${placement.widthPct}%`,
                            }}
                          >
                            <span className="truncate">{block.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}

            {vehicles.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
                <span className="text-ink-muted/50">
                  <IconCar size={32} />
                </span>
                <p className="text-sm text-ink-muted">
                  No active vehicles to show.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Block detail — spec §65 wants clicking an event to open its details */}
      {selected ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <button
            type="button"
            aria-label="Close"
            onClick={() => setSelected(null)}
            className="absolute inset-0 bg-ink/40"
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative w-full max-w-md rounded-t-2xl border border-line bg-surface p-5 shadow-2xl sm:rounded-2xl"
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <Badge tone={KIND_TONE[selected.kind]}>
                  {selected.kind === "RESERVATION"
                    ? "Reservation"
                    : selected.kind === "MAINTENANCE"
                      ? "Maintenance"
                      : selected.kind === "MANUAL"
                        ? "Manual block"
                        : "Checkout hold"}
                </Badge>
                <h2 className="mt-2 text-base font-semibold text-ink">
                  {selected.label}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="-m-2 rounded-lg p-2 text-ink-muted"
                aria-label="Close"
              >
                <IconClose />
              </button>
            </div>

            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-ink-muted">From</dt>
                <dd className="font-medium text-ink">{selected.startLabel}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-muted">Until</dt>
                <dd className="font-medium text-ink">{selected.endLabel}</dd>
              </div>
              {selected.bufferMinutes > 0 ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-muted">Includes turnaround</dt>
                  <dd className="font-medium text-ink">
                    {selected.bufferMinutes / 60}h
                  </dd>
                </div>
              ) : null}
              {selected.bookingReference ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-muted">Reference</dt>
                  <dd className="font-mono text-xs font-medium text-ink">
                    {selected.bookingReference}
                  </dd>
                </div>
              ) : null}
              {selected.reservationStatus ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-muted">Status</dt>
                  <dd className="font-medium text-ink">
                    {selected.reservationStatus.replace(/_/g, " ").toLowerCase()}
                  </dd>
                </div>
              ) : null}
              {selected.detail ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-muted">Note</dt>
                  <dd className="text-right font-medium text-ink">
                    {selected.detail}
                  </dd>
                </div>
              ) : null}
            </dl>

            {selected.removable ? (
              <form
                action={removeAction}
                className="mt-5 flex justify-end"
                onSubmit={() => setSelected(null)}
              >
                <input type="hidden" name="blockId" value={selected.id} />
                <Button type="submit" variant="danger" size="sm">
                  Release this block
                </Button>
              </form>
            ) : (
              <p className="mt-4 text-xs text-ink-muted">
                {selected.kind === "RESERVATION"
                  ? "Cancel or modify this from the reservation itself, so the customer is not left holding a booking that no longer exists."
                  : selected.kind === "MAINTENANCE"
                    ? "Remove this from the vehicle's maintenance record."
                    : "This hold expires on its own if the customer does not finish paying."}
              </p>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
