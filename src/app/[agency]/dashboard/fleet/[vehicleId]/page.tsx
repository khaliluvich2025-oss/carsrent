import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Badge, VehicleStatusBadge, VEHICLE_STATUS_LABELS } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardHeader, DetailRow, StatTile } from "@/components/ui/card";
import { Select } from "@/components/ui/field";
import { IconAlert, IconPencil } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { formatInTimezone } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { requirePermission } from "@/server/auth/guards";
import { db } from "@/server/db";
import {
  getUpcomingBlocks,
  getVehicleTimeline,
} from "@/server/services/fleet/history";
import {
  FUEL_LABELS,
  TRANSMISSION_LABELS,
  VEHICLE_STATUSES,
} from "@/server/services/fleet/schemas";
import { getVehicle } from "@/server/services/fleet/vehicles";
import { isStorageConfigured } from "@/server/storage";
import { setVehicleArchivedAction, setVehicleStatusAction } from "../actions";
import {
  deleteVehicleImageAction,
  setCoverImageAction,
  uploadVehicleImagesAction,
} from "./gallery-actions";
import { VehicleGallery } from "./vehicle-gallery";

export const metadata: Metadata = { title: "Vehicle" };

const BLOCK_TONE = {
  RESERVATION: "info",
  MAINTENANCE: "caution",
  MANUAL: "neutral",
  PAYMENT_HOLD: "neutral",
} as const;

const TIMELINE_TONE = {
  RESERVATION: "info",
  MAINTENANCE: "caution",
  BLOCK: "neutral",
  DAMAGE: "critical",
  EXPENSE: "neutral",
} as const;

function daysUntil(date: Date): number {
  return Math.ceil((date.getTime() - Date.now()) / 86_400_000);
}

export default async function VehicleDetailPage({
  params,
}: {
  params: Promise<{ agency: string; vehicleId: string }>;
}) {
  const { agency: slug, vehicleId } = await params;
  const ctx = await requirePermission("fleet.view");

  const vehicle = await getVehicle(ctx.db, vehicleId);
  if (!vehicle) notFound();

  const [agency, timeline, upcoming] = await Promise.all([
    db.agency.findUnique({
      where: { id: ctx.user.agencyId },
      select: { currency: true, timezone: true },
    }),
    getVehicleTimeline(ctx.db, vehicleId),
    getUpcomingBlocks(ctx.db, vehicleId),
  ]);

  const currency = agency?.currency ?? "MAD";
  const timezone = agency?.timezone ?? "Africa/Casablanca";
  const base = `/${slug}/dashboard/fleet`;
  const canManage = ctx.can("fleet.manage");

  const alerts: { label: string; tone: "caution" | "critical" }[] = [];
  if (vehicle.insuranceExpiryAt) {
    const days = daysUntil(vehicle.insuranceExpiryAt);
    if (days <= 30) {
      alerts.push({
        label:
          days < 0
            ? "Insurance has expired"
            : `Insurance expires in ${days} day${days === 1 ? "" : "s"}`,
        tone: days < 0 ? "critical" : "caution",
      });
    }
  }
  if (vehicle.technicalInspectionExpiryAt) {
    const days = daysUntil(vehicle.technicalInspectionExpiryAt);
    if (days <= 30) {
      alerts.push({
        label:
          days < 0
            ? "Technical inspection has expired"
            : `Technical inspection due in ${days} day${days === 1 ? "" : "s"}`,
        tone: days < 0 ? "critical" : "caution",
      });
    }
  }
  if (
    vehicle.nextServiceMileage !== null &&
    vehicle.nextServiceMileage - vehicle.currentMileage <= 1000
  ) {
    const remaining = vehicle.nextServiceMileage - vehicle.currentMileage;
    alerts.push({
      label:
        remaining <= 0
          ? "Service is overdue"
          : `Service due in ${remaining.toLocaleString()} km`,
      tone: remaining <= 0 ? "critical" : "caution",
    });
  }

  return (
    <>
      <PageHeader
        back={{ href: base, label: "Fleet" }}
        title={`${vehicle.brand} ${vehicle.model}`}
        description={`${vehicle.year} · ${vehicle.category} · ${vehicle.registrationNumber}`}
        meta={
          <>
            <VehicleStatusBadge status={vehicle.currentStatus} />
            {!vehicle.isActive ? <Badge>Archived</Badge> : null}
          </>
        }
        action={
          canManage ? (
            <ButtonLink href={`${base}/${vehicle.id}/edit`} variant="secondary">
              <IconPencil size={16} />
              Edit
            </ButtonLink>
          ) : null
        }
      />

      {alerts.length > 0 ? (
        <div className="mb-5 space-y-2">
          {alerts.map((alert) => (
            <div
              key={alert.label}
              className={`flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm ${
                alert.tone === "critical"
                  ? "border-critical/20 bg-critical-soft text-critical"
                  : "border-caution/20 bg-caution-soft text-caution"
              }`}
            >
              <IconAlert size={18} />
              {alert.label}
            </div>
          ))}
        </div>
      ) : null}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Daily rate"
          value={formatMoney(vehicle.dailyPrice, currency)}
        />
        <StatTile
          label="Deposit"
          value={formatMoney(vehicle.securityDeposit, currency)}
          hint="Held, not revenue"
        />
        <StatTile
          label="Odometer"
          value={`${vehicle.currentMileage.toLocaleString()} km`}
        />
        <StatTile
          label="Upcoming"
          value={upcoming.length}
          hint={upcoming.length === 1 ? "commitment" : "commitments"}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader
              title="Photos"
              description="The cover image is what customers see in search results."
            />
            <VehicleGallery
              images={vehicle.images.map((image) => ({
                id: image.id,
                url: image.file.publicUrl,
                isCover: image.isCover,
              }))}
              canManage={canManage}
              storageReady={isStorageConfigured()}
              uploadAction={uploadVehicleImagesAction.bind(
                null,
                slug,
                vehicle.id,
              )}
              setCoverAction={setCoverImageAction.bind(null, slug, vehicle.id)}
              deleteAction={deleteVehicleImageAction.bind(
                null,
                slug,
                vehicle.id,
              )}
            />
          </Card>

          <Card>
            <CardHeader title="Upcoming commitments" />
            {upcoming.length === 0 ? (
              <p className="py-2 text-sm text-ink-muted">
                Nothing booked or blocked ahead. This vehicle is free to
                reserve.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {upcoming.map((block) => (
                  <li
                    key={block.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3.5 py-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge tone={BLOCK_TONE[block.kind]}>
                          {block.kind === "RESERVATION"
                            ? (block.reservation?.bookingReference ??
                              "Reservation")
                            : block.kind === "MAINTENANCE"
                              ? "Maintenance"
                              : block.kind === "MANUAL"
                                ? "Blocked"
                                : "Checkout hold"}
                        </Badge>
                        {block.reservation?.customer ? (
                          <span className="truncate text-sm text-ink">
                            {block.reservation.customer.fullName}
                          </span>
                        ) : null}
                      </div>
                      {block.reason ? (
                        <p className="mt-1 text-xs text-ink-muted">
                          {block.reason}
                        </p>
                      ) : null}
                    </div>
                    <p className="text-xs whitespace-nowrap text-ink-soft tabular-nums">
                      {formatInTimezone(block.startsAt, timezone, "dd MMM HH:mm")}
                      {" → "}
                      {formatInTimezone(block.endsAt, timezone, "dd MMM HH:mm")}
                      {block.bufferMinutes > 0 ? (
                        <span className="text-ink-muted">
                          {" "}
                          (incl. {block.bufferMinutes / 60}h buffer)
                        </span>
                      ) : null}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader
              title="History"
              description="Everything this vehicle has been through."
            />
            {timeline.length === 0 ? (
              <p className="py-2 text-sm text-ink-muted">
                No history yet. Reservations, maintenance, damage and expenses
                will appear here as they happen.
              </p>
            ) : (
              <ol className="relative space-y-4 border-l border-line pl-5">
                {timeline.map((entry) => (
                  <li key={entry.id} className="relative">
                    <span
                      className={`absolute -left-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-surface ${
                        TIMELINE_TONE[entry.kind] === "critical"
                          ? "bg-critical"
                          : TIMELINE_TONE[entry.kind] === "caution"
                            ? "bg-caution"
                            : TIMELINE_TONE[entry.kind] === "info"
                              ? "bg-info"
                              : "bg-line-strong"
                      }`}
                    />
                    <p className="text-sm font-medium text-ink capitalize">
                      {entry.title}
                    </p>
                    {entry.detail ? (
                      <p className="text-sm text-ink-muted">{entry.detail}</p>
                    ) : null}
                    <p className="mt-0.5 text-xs text-ink-muted tabular-nums">
                      {formatInTimezone(entry.at, timezone)}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          {canManage ? (
            <Card>
              <CardHeader
                title="Operational status"
                description="What staff see. Availability is always calculated from the calendar."
              />
              <form
                action={setVehicleStatusAction.bind(null, slug)}
                className="flex gap-2"
              >
                <input type="hidden" name="vehicleId" value={vehicle.id} />
                <Select
                  name="status"
                  defaultValue={vehicle.currentStatus}
                  aria-label="Operational status"
                >
                  {VEHICLE_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {VEHICLE_STATUS_LABELS[status].label}
                    </option>
                  ))}
                </Select>
                <Button type="submit" variant="secondary">
                  Update
                </Button>
              </form>
              <p className="mt-2 text-xs text-ink-muted">
                To stop this car being booked for a period, add a maintenance or
                manual block on the calendar instead.
              </p>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Specification" />
            <dl>
              <DetailRow label="Transmission">
                {TRANSMISSION_LABELS[vehicle.transmission]}
              </DetailRow>
              <DetailRow label="Fuel">
                {FUEL_LABELS[vehicle.fuelType]}
              </DetailRow>
              <DetailRow label="Seats">{vehicle.seats}</DetailRow>
              <DetailRow label="Doors">{vehicle.doors}</DetailRow>
              {vehicle.color ? (
                <DetailRow label="Colour">{vehicle.color}</DetailRow>
              ) : null}
              <DetailRow label="Registration">
                <span className="font-mono">{vehicle.registrationNumber}</span>
              </DetailRow>
              {vehicle.vin ? (
                <DetailRow label="VIN">
                  <span className="font-mono text-xs">{vehicle.vin}</span>
                </DetailRow>
              ) : null}
            </dl>
            {vehicle.features.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {vehicle.features.map((feature) => (
                  <Badge key={feature}>{feature}</Badge>
                ))}
              </div>
            ) : null}
          </Card>

          <Card>
            <CardHeader title="Pricing" />
            <dl>
              <DetailRow label="Daily">
                {formatMoney(vehicle.dailyPrice, currency)}
              </DetailRow>
              <DetailRow label="Weekly (7+ days)">
                {vehicle.weeklyPrice
                  ? `${formatMoney(vehicle.weeklyPrice, currency)} / day`
                  : "Daily rate"}
              </DetailRow>
              <DetailRow label="Monthly (30+ days)">
                {vehicle.monthlyPrice
                  ? `${formatMoney(vehicle.monthlyPrice, currency)} / day`
                  : "Daily rate"}
              </DetailRow>
              <DetailRow label="Security deposit">
                {formatMoney(vehicle.securityDeposit, currency)}
              </DetailRow>
            </dl>
          </Card>

          <Card>
            <CardHeader title="Mileage & compliance" />
            <dl>
              <DetailRow label="Mileage policy">
                {vehicle.mileagePolicy === "LIMITED"
                  ? `${vehicle.mileageKmPerDay} km/day`
                  : vehicle.mileagePolicy === "UNLIMITED"
                    ? "Unlimited"
                    : "Agency default"}
              </DetailRow>
              {vehicle.mileagePolicy === "LIMITED" && vehicle.extraKmPrice ? (
                <DetailRow label="Extra km">
                  {formatMoney(vehicle.extraKmPrice, currency)} / km
                </DetailRow>
              ) : null}
              <DetailRow label="Odometer">
                {vehicle.currentMileage.toLocaleString()} km
              </DetailRow>
              <DetailRow label="Next service">
                {vehicle.nextServiceMileage
                  ? `${vehicle.nextServiceMileage.toLocaleString()} km`
                  : "Not set"}
              </DetailRow>
              <DetailRow label="Insurance">
                {vehicle.insuranceExpiryAt
                  ? formatInTimezone(
                      vehicle.insuranceExpiryAt,
                      timezone,
                      "dd MMM yyyy",
                    )
                  : "Not set"}
              </DetailRow>
              <DetailRow label="Technical inspection">
                {vehicle.technicalInspectionExpiryAt
                  ? formatInTimezone(
                      vehicle.technicalInspectionExpiryAt,
                      timezone,
                      "dd MMM yyyy",
                    )
                  : "Not set"}
              </DetailRow>
            </dl>
          </Card>

          {canManage ? (
            <Card>
              <CardHeader
                title={vehicle.isActive ? "Archive" : "Restore"}
                description={
                  vehicle.isActive
                    ? "Hides the car from the website and new reservations. Its history is kept."
                    : "Puts the car back into the active fleet."
                }
              />
              <form action={setVehicleArchivedAction.bind(null, slug)}>
                <input type="hidden" name="vehicleId" value={vehicle.id} />
                <input
                  type="hidden"
                  name="archived"
                  value={vehicle.isActive ? "1" : "0"}
                />
                <Button
                  type="submit"
                  variant={vehicle.isActive ? "danger" : "secondary"}
                  size="sm"
                >
                  {vehicle.isActive ? "Archive vehicle" : "Restore vehicle"}
                </Button>
              </form>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
