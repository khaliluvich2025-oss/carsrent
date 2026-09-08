import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card, StatTile } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { formatInTimezone } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { requirePermission } from "@/server/auth/guards";
import { db } from "@/server/db";
import { computeDepositBalance } from "@/server/services/payments/rollup";
import {
  checkCompletion,
  getReturnContext,
  proposeCharges,
} from "@/server/services/returns/complete";
import {
  addChargeAction,
  addReturnDamageAction,
  collectBalanceAction,
  completeRentalAction,
  confirmReturnDamageAction,
  removeChargeAction,
  saveReturnInspectionAction,
  settleDepositAction,
} from "./actions";
import {
  ChargeStep,
  CompleteRentalStep,
  ReturnDamageStep,
  ReturnInspectionStep,
  SettleStep,
} from "./return-steps";

export const metadata: Metadata = { title: "Return" };

function Step({
  index,
  title,
  description,
  done,
  children,
}: {
  index: number;
  title: string;
  description?: string;
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card className={done ? "border-positive/30" : undefined}>
      <div className="mb-3 flex items-start gap-3">
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
            done
              ? "bg-positive text-white"
              : "bg-surface-sunken text-ink-muted ring-1 ring-line"
          }`}
        >
          {index}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-sm text-ink-muted">{description}</p>
          ) : null}
        </div>
      </div>
      {children}
    </Card>
  );
}

export default async function ReturnPage({
  params,
}: {
  params: Promise<{ agency: string; reservationId: string }>;
}) {
  const { agency: slug, reservationId } = await params;
  const ctx = await requirePermission("returns.perform");

  const reservation = await getReturnContext(ctx.db, reservationId);
  if (!reservation) notFound();

  const detailHref = `/${slug}/dashboard/reservations/${reservationId}`;

  // A return only makes sense for a car that is actually out.
  const returnable = [
    "ACTIVE",
    "RETURN_DUE",
    "OVERDUE",
    "RETURN_INSPECTION",
  ];
  if (!returnable.includes(reservation.status)) {
    redirect(detailHref);
  }

  const [agency, proposals] = await Promise.all([
    db.agency.findUnique({
      where: { id: ctx.user.agencyId },
      select: { timezone: true, currency: true },
    }),
    proposeCharges(ctx.db, reservation),
  ]);

  const timezone = agency?.timezone ?? "Africa/Casablanca";
  const currency = agency?.currency ?? "MAD";

  const pickup = reservation.inspections.find((i) => i.type === "PICKUP");
  const ret = reservation.inspections.find((i) => i.type === "RETURN");
  const deposit = reservation.securityDeposit;
  const depositHeld = deposit ? computeDepositBalance(deposit) : "0.00";

  const check = checkCompletion(
    reservation,
    Number(reservation.securityDepositRequired) > 0,
  );

  const now = new Date();
  const isoDate = (value: Date) =>
    formatInTimezone(value, timezone, "yyyy-MM-dd");
  const isoTime = (value: Date) => formatInTimezone(value, timezone, "HH:mm");

  const isLate = now.getTime() > reservation.returnDatetime.getTime();

  // Charges the calculators propose — offered, never applied automatically.
  const proposalRows = proposals
    ? [
        proposals.late.lateMinutes > 0 && Number(proposals.late.amount) > 0
          ? {
              type: "LATE_RETURN",
              label: "Late return",
              detail: `${proposals.late.delayLabel} late${
                proposals.late.gracedMinutes > 0
                  ? ` · ${proposals.late.gracedMinutes}m within grace`
                  : ""
              }`,
              amount: proposals.late.amount,
            }
          : null,
        proposals.mileage && Number(proposals.mileage.amount) > 0
          ? {
              type: "EXTRA_MILEAGE",
              label: "Extra mileage",
              detail: `${proposals.mileage.distance.toLocaleString()} km driven · ${proposals.mileage.excess.toLocaleString()} km over the ${proposals.mileage.allowance?.toLocaleString()} km allowance`,
              amount: proposals.mileage.amount,
            }
          : null,
        proposals.fuel && Number(proposals.fuel.amount) > 0
          ? {
              type: "FUEL",
              label: "Fuel",
              detail: `Out at ${proposals.fuel.pickupLevel}%, back at ${proposals.fuel.returnLevel}% · ${proposals.fuel.missingPercent}% missing`,
              amount: proposals.fuel.amount,
            }
          : null,
      ].filter((row): row is NonNullable<typeof row> => row !== null)
    : [];

  return (
    <>
      <PageHeader
        back={{ href: detailHref, label: reservation.bookingReference }}
        title="Return"
        description={`${reservation.customer.fullName} · ${reservation.vehicle.brand} ${reservation.vehicle.model} · ${reservation.vehicle.registrationNumber}`}
        meta={
          isLate && !reservation.actualReturnDatetime ? (
            <Badge tone="critical">Overdue</Badge>
          ) : null
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Due back"
          value={formatInTimezone(
            reservation.returnDatetime,
            timezone,
            "d MMM HH:mm",
          )}
          hint={reservation.returnLocation.name}
        />
        <StatTile
          label="Out at"
          value={
            pickup?.mileage != null
              ? `${pickup.mileage.toLocaleString()} km`
              : "—"
          }
          hint={pickup?.fuelLevel != null ? `Fuel ${pickup.fuelLevel}%` : undefined}
        />
        <StatTile
          label="Outstanding"
          value={formatMoney(reservation.amountRemaining, currency)}
          tone={Number(reservation.amountRemaining) > 0 ? "caution" : "neutral"}
        />
        <StatTile
          label="Deposit held"
          value={formatMoney(depositHeld, currency)}
        />
      </div>

      <div className="space-y-4">
        <Step
          index={1}
          title="Return inspection"
          description="Time, odometer and fuel as the car comes back."
          done={check.state.mileageRecorded && check.state.fuelRecorded}
        >
          <ReturnInspectionStep
            action={saveReturnInspectionAction.bind(null, slug)}
            reservationId={reservation.id}
            values={{
              returnDate: isoDate(ret?.performedAt ?? now),
              returnTime: isoTime(ret?.performedAt ?? now),
              mileage:
                ret?.mileage != null
                  ? String(ret.mileage)
                  : String(reservation.vehicle.currentMileage),
              fuelLevel: ret?.fuelLevel != null ? String(ret.fuelLevel) : "100",
              condition: ret?.condition ?? "",
              notes: ret?.notes ?? "",
            }}
            pickup={{
              mileage: pickup?.mileage ?? null,
              fuelLevel: pickup?.fuelLevel ?? null,
            }}
          />
        </Step>

        <Step
          index={2}
          title="Damage"
          description="Compare against how the car went out. Anything already recorded at pickup is not chargeable."
          done={check.state.damageReviewed}
        >
          <ReturnDamageStep
            addAction={addReturnDamageAction.bind(null, slug)}
            confirmAction={confirmReturnDamageAction.bind(null, slug)}
            reservationId={reservation.id}
            currency={currency}
            canRecord={Boolean(ret)}
            confirmed={Boolean(ret?.damageCheckedAt)}
            damages={reservation.damageRecords.map((damage) => ({
              id: damage.id,
              location: damage.location,
              type: damage.damageType,
              description: damage.description,
              estimate: damage.estimatedCharge?.toString() ?? null,
              preExisting: damage.isPreExisting,
            }))}
          />
        </Step>

        <Step
          index={3}
          title="Charges"
          description="Late return, mileage and fuel are calculated from the readings. You decide what is actually charged."
          done={reservation.additionalCharges.length > 0 || proposalRows.length === 0}
        >
          {ret ? (
            <ChargeStep
              action={addChargeAction.bind(null, slug)}
              removeAction={removeChargeAction.bind(null, slug, reservation.id)}
              reservationId={reservation.id}
              currency={currency}
              proposals={proposalRows}
              depositHeld={depositHeld}
              charges={reservation.additionalCharges.map((charge) => ({
                id: charge.id,
                type: charge.type,
                description: charge.description,
                amount: charge.amount.toString(),
                fromDeposit: charge.settleFromDeposit,
              }))}
            />
          ) : (
            <p className="text-sm text-ink-muted">
              Record the return reading first — the charges are calculated from
              it.
            </p>
          )}
        </Step>

        <Step
          index={4}
          title="Settle"
          description="Collect what is owed, then release or retain the deposit."
          done={check.state.paymentsSettled && check.state.depositSettled}
        >
          <SettleStep
            collectAction={collectBalanceAction.bind(null, slug)}
            depositAction={settleDepositAction.bind(null, slug)}
            reservationId={reservation.id}
            currency={currency}
            outstanding={reservation.amountRemaining.toString()}
            depositHeld={depositHeld}
          />
        </Step>

        <Card>
          <h2 className="mb-3 text-sm font-semibold text-ink">
            Complete rental
          </h2>
          <CompleteRentalStep
            action={completeRentalAction.bind(null, slug)}
            reservationId={reservation.id}
            canComplete={check.canComplete}
            blockers={check.blockers}
          />
        </Card>
      </div>
    </>
  );
}
