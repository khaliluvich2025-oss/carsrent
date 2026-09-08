import type { ReactNode } from "react";
import type { ReservationStatus, VehicleStatus } from "@prisma/client";

export type Tone = "neutral" | "positive" | "caution" | "critical" | "info" | "brand";

const TONES: Record<Tone, string> = {
  neutral: "bg-surface-sunken text-ink-soft ring-line",
  positive: "bg-positive-soft text-positive ring-positive/20",
  caution: "bg-caution-soft text-caution ring-caution/20",
  critical: "bg-critical-soft text-critical ring-critical/20",
  info: "bg-info-soft text-info ring-info/20",
  brand: "bg-[var(--brand-soft)] text-[var(--brand)] ring-[var(--brand-line)]",
};

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${TONES[tone]} ${className ?? ""}`}
    >
      {children}
    </span>
  );
}

/** A vehicle's operational display status (spec §18). */
const VEHICLE_STATUS: Record<VehicleStatus, { label: string; tone: Tone }> = {
  AVAILABLE: { label: "Available", tone: "positive" },
  RESERVED: { label: "Reserved", tone: "info" },
  RENTED: { label: "Rented", tone: "brand" },
  MAINTENANCE: { label: "Maintenance", tone: "caution" },
  UNAVAILABLE: { label: "Unavailable", tone: "neutral" },
};

export function VehicleStatusBadge({ status }: { status: VehicleStatus }) {
  const { label, tone } = VEHICLE_STATUS[status];
  return <Badge tone={tone}>{label}</Badge>;
}

export const VEHICLE_STATUS_LABELS = VEHICLE_STATUS;

/** Internal reservation status (spec §14). Never shown to customers. */
const RESERVATION_STATUS: Record<
  ReservationStatus,
  { label: string; tone: Tone }
> = {
  AWAITING_CONFIRMATION: { label: "Awaiting call", tone: "caution" },
  CONFIRMED: { label: "Confirmed", tone: "info" },
  READY_FOR_PICKUP: { label: "Ready for pickup", tone: "info" },
  ACTIVE: { label: "Active", tone: "brand" },
  RETURN_DUE: { label: "Return due", tone: "caution" },
  OVERDUE: { label: "Overdue", tone: "critical" },
  RETURN_INSPECTION: { label: "Inspecting", tone: "caution" },
  COMPLETED: { label: "Completed", tone: "positive" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
  NO_SHOW: { label: "No-show", tone: "neutral" },
};

export function ReservationStatusBadge({
  status,
}: {
  status: ReservationStatus;
}) {
  const { label, tone } = RESERVATION_STATUS[status];
  return <Badge tone={tone}>{label}</Badge>;
}

export const RESERVATION_STATUS_LABELS = RESERVATION_STATUS;
