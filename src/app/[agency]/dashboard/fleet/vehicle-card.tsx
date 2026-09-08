import Link from "next/link";

import { VehicleStatusBadge } from "@/components/ui/badge";
import { IconCar, IconGear, IconFuel, IconSeat } from "@/components/ui/icons";
import { formatMoney } from "@/lib/money";
import {
  FUEL_LABELS,
  TRANSMISSION_LABELS,
} from "@/server/services/fleet/schemas";
import type { FleetListItem } from "@/server/services/fleet/vehicles";

function Spec({ icon, children }: { icon: React.ReactNode; children: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
      <span className="text-ink-muted/70">{icon}</span>
      {children}
    </span>
  );
}

export function VehicleCard({
  vehicle,
  href,
  currency,
}: {
  vehicle: FleetListItem;
  href: string;
  currency: string;
}) {
  const cover = vehicle.images[0]?.file.publicUrl;

  return (
    <Link
      href={href}
      className="group flex flex-col overflow-hidden rounded-card border border-line bg-surface shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:border-line-strong hover:shadow-md"
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-surface-sunken">
        {cover ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={cover}
            alt={`${vehicle.brand} ${vehicle.model}`}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-ink-muted/40">
            <IconCar size={44} />
          </div>
        )}
        <div className="absolute top-2.5 left-2.5">
          <VehicleStatusBadge status={vehicle.currentStatus} />
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-ink">
              {vehicle.brand} {vehicle.model}
            </h3>
            <p className="text-xs text-ink-muted">
              {vehicle.year} · {vehicle.category}
            </p>
          </div>
          <span className="shrink-0 rounded-md bg-surface-sunken px-2 py-1 font-mono text-[11px] text-ink-soft">
            {vehicle.registrationNumber}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5">
          <Spec icon={<IconGear size={14} />}>
            {TRANSMISSION_LABELS[vehicle.transmission]}
          </Spec>
          <Spec icon={<IconFuel size={14} />}>
            {FUEL_LABELS[vehicle.fuelType]}
          </Spec>
          <Spec icon={<IconSeat size={14} />}>{`${vehicle.seats} seats`}</Spec>
        </div>

        <div className="mt-auto flex items-end justify-between gap-2 pt-4">
          <div>
            <p className="text-base font-semibold text-ink">
              {formatMoney(vehicle.dailyPrice, currency)}
            </p>
            <p className="text-[11px] text-ink-muted">per day</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-ink-soft">
              {formatMoney(vehicle.securityDeposit, currency)}
            </p>
            <p className="text-[11px] text-ink-muted">deposit</p>
          </div>
        </div>
      </div>
    </Link>
  );
}
