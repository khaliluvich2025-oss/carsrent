import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { IconImage } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { formatInTimezone } from "@/lib/dates";
import { formatMoney, subtract } from "@/lib/money";
import { requirePermission } from "@/server/auth/guards";
import { db } from "@/server/db";
import {
  getChecklist,
  getHandover,
} from "@/server/services/handover/pickup";
import { computeDepositBalance } from "@/server/services/payments/rollup";
import { isStorageConfigured } from "@/server/storage";
import {
  addDamageAction,
  collectDepositAction,
  completeHandoverAction,
  confirmDamageCheckAction,
  recordPaymentAction,
  saveDocumentAction,
  saveInspectionAction,
} from "./actions";
import {
  CompleteStep,
  ConditionStep,
  DamageStep,
  DocumentStep,
  MoneyStep,
  StepCard,
} from "./handover-steps";

export const metadata: Metadata = { title: "Handover" };

const DOC_LABELS: Record<string, string> = {
  DRIVING_LICENCE: "Driving licence",
  CIN: "National ID",
  PASSPORT: "Passport",
  OTHER: "Other document",
};

export default async function HandoverPage({
  params,
}: {
  params: Promise<{ agency: string; reservationId: string }>;
}) {
  const { agency: slug, reservationId } = await params;
  const ctx = await requirePermission("pickup.perform");

  const reservation = await getHandover(ctx.db, reservationId);
  if (!reservation) notFound();

  const detailHref = `/${slug}/dashboard/reservations/${reservationId}`;

  // Handover only makes sense before the car has left.
  if (
    reservation.status !== "CONFIRMED" &&
    reservation.status !== "READY_FOR_PICKUP"
  ) {
    redirect(detailHref);
  }

  const [agency, checklist] = await Promise.all([
    db.agency.findUnique({
      where: { id: ctx.user.agencyId },
      select: { timezone: true, currency: true },
    }),
    getChecklist(ctx.db, reservation),
  ]);

  const timezone = agency?.timezone ?? "Africa/Casablanca";
  const currency = agency?.currency ?? "MAD";

  const inspection = reservation.inspections[0];
  const deposit = reservation.securityDeposit;
  const depositHeld = deposit ? computeDepositBalance(deposit) : "0.00";
  const depositOutstanding = subtract(
    reservation.securityDepositRequired,
    depositHeld,
  );

  const stepByKey = Object.fromEntries(
    checklist.steps.map((step) => [step.key, step]),
  );
  const isShown = (key: string) => Boolean(stepByKey[key]);

  // Card numbering is derived, not counted during render. Some cards cover two
  // checklist steps (odometer + fuel, contract + signature), so the numbers come
  // from the visible card list rather than from the step list.
  const cards = (
    [
      isShown("documents") ? "documents" : null,
      isShown("mileage") || isShown("fuel") ? "condition" : null,
      isShown("photos") ? "photos" : null,
      isShown("damage") ? "damage" : null,
      isShown("payment") ? "payment" : null,
      isShown("deposit") ? "deposit" : null,
      isShown("contract") || isShown("signature") ? "contract" : null,
    ] as (string | null)[]
  ).filter((card): card is string => card !== null);

  const numberOf = (card: string) => cards.indexOf(card) + 1;

  return (
    <>
      <PageHeader
        back={{ href: detailHref, label: reservation.bookingReference }}
        title="Handover"
        description={`${reservation.customer.fullName} · ${reservation.vehicle.brand} ${reservation.vehicle.model} · ${reservation.vehicle.registrationNumber}`}
        meta={
          reservation.customer.status === "BLACKLISTED" ? (
            <Badge tone="critical">Blacklisted customer</Badge>
          ) : reservation.customer.status === "WATCHLIST" ? (
            <Badge tone="caution">Watchlist</Badge>
          ) : null
        }
      />

      {/* Progress — visible at a glance on a phone */}
      <div className="mb-5 rounded-card border border-line bg-surface p-4">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-sm font-medium text-ink">
            {checklist.progress.done} of {checklist.progress.total} steps done
          </span>
          <span className="text-xs text-ink-muted">
            Scheduled{" "}
            {formatInTimezone(
              reservation.pickupDatetime,
              timezone,
              "d MMM, HH:mm",
            )}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-surface-sunken">
          <div
            className="h-full rounded-full bg-[var(--brand)] transition-all"
            style={{
              width: `${checklist.progress.total === 0 ? 0 : (checklist.progress.done / checklist.progress.total) * 100}%`,
            }}
          />
        </div>
      </div>

      <div className="space-y-4">
        {isShown("documents") ? (
          <StepCard
            index={numberOf("documents")}
            title="Customer documents"
            description="Check the licence and ID against the person in front of you."
            done={stepByKey.documents.done}
            requirement={stepByKey.documents.requirement}
          >
            <DocumentStep
              action={saveDocumentAction.bind(null, slug)}
              reservationId={reservation.id}
              documents={reservation.customer.documents.map((document) => ({
                type: document.documentType,
                label: DOC_LABELS[document.documentType] ?? document.documentType,
                number: document.documentNumber,
                expiry: document.expiryDate
                  ? formatInTimezone(document.expiryDate, timezone, "d MMM yyyy")
                  : null,
                status: document.verificationStatus,
              }))}
            />
          </StepCard>
        ) : null}

        {isShown("mileage") || isShown("fuel") ? (
          <StepCard
            index={numberOf("condition")}
            title="Vehicle condition"
            description={`Last recorded odometer: ${reservation.vehicle.currentMileage.toLocaleString()} km`}
            done={
              (stepByKey.mileage?.done ?? true) && (stepByKey.fuel?.done ?? true)
            }
            requirement={stepByKey.mileage?.requirement}
          >
            <ConditionStep
              action={saveInspectionAction.bind(null, slug)}
              reservationId={reservation.id}
              values={{
                mileage:
                  inspection?.mileage != null
                    ? String(inspection.mileage)
                    : String(reservation.vehicle.currentMileage),
                fuelLevel:
                  inspection?.fuelLevel != null
                    ? String(inspection.fuelLevel)
                    : "100",
                condition: inspection?.condition ?? "",
                notes: inspection?.notes ?? "",
              }}
            />
          </StepCard>
        ) : null}

        {isShown("photos") ? (
          <StepCard
            index={numberOf("photos")}
            title="Before photos"
            description="The condition evidence for any dispute at return."
            done={stepByKey.photos.done}
            requirement={stepByKey.photos.requirement}
          >
            {isStorageConfigured() ? (
              <p className="text-sm text-ink-muted">
                Photo capture is wired to object storage but the capture UI lands
                with the return inspection in the next phase.
              </p>
            ) : (
              <div className="flex items-start gap-2.5 rounded-lg border border-caution/20 bg-caution-soft px-3 py-2.5 text-sm text-caution">
                <span className="mt-0.5 shrink-0">
                  <IconImage size={18} />
                </span>
                <span>
                  Photos need object storage. Set the <code>S3_*</code> variables
                  in <code>.env</code>, or set this step to Optional in Settings
                  to hand over without them.
                </span>
              </div>
            )}
          </StepCard>
        ) : null}

        {isShown("damage") ? (
          <StepCard
            index={numberOf("damage")}
            title="Existing damage"
            description="Record anything already on the car before it leaves."
            done={stepByKey.damage.done}
            requirement={stepByKey.damage.requirement}
          >
            <DamageStep
              addAction={addDamageAction.bind(null, slug)}
              confirmAction={confirmDamageCheckAction.bind(null, slug)}
              reservationId={reservation.id}
              confirmed={Boolean(inspection?.damageCheckedAt)}
              damages={reservation.damageRecords.map((damage) => ({
                id: damage.id,
                location: damage.location,
                type: damage.damageType,
                description: damage.description,
              }))}
            />
          </StepCard>
        ) : null}

        {isShown("payment") ? (
          <StepCard
            index={numberOf("payment")}
            title="Rental payment"
            description={`${formatMoney(reservation.amountPaid, currency)} of ${formatMoney(reservation.finalTotal, currency)} collected`}
            done={stepByKey.payment.done}
            requirement={stepByKey.payment.requirement}
          >
            {Number(reservation.amountRemaining) <= 0 ? (
              <p className="text-sm text-positive">
                Fully paid — nothing to collect.
              </p>
            ) : (
              <MoneyStep
                action={recordPaymentAction.bind(null, slug)}
                reservationId={reservation.id}
                suggested={reservation.amountRemaining.toString()}
                currency={currency}
                label="Amount"
                hint={`${formatMoney(reservation.amountRemaining, currency)} outstanding`}
              />
            )}

            {reservation.payments.length > 0 ? (
              <ul className="mt-3 divide-y divide-line border-t border-line pt-2 text-sm">
                {reservation.payments.map((payment) => (
                  <li
                    key={payment.id}
                    className="flex justify-between gap-3 py-1.5"
                  >
                    <span className="text-ink-muted">
                      {payment.method.toLowerCase()} ·{" "}
                      {formatInTimezone(payment.createdAt, timezone, "d MMM HH:mm")}
                    </span>
                    <span className="font-medium text-ink tabular-nums">
                      {formatMoney(payment.amount, currency)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </StepCard>
        ) : null}

        {isShown("deposit") ? (
          <StepCard
            index={numberOf("deposit")}
            title="Security deposit"
            description="Held on behalf of the customer. Never counted as revenue."
            done={stepByKey.deposit.done}
            requirement={stepByKey.deposit.requirement}
          >
            {Number(reservation.securityDepositRequired) <= 0 ? (
              <p className="text-sm text-ink-muted">
                No deposit is required for this rental.
              </p>
            ) : Number(depositOutstanding) <= 0 ? (
              <p className="text-sm text-positive">
                {formatMoney(depositHeld, currency)} held.
              </p>
            ) : (
              <MoneyStep
                action={collectDepositAction.bind(null, slug)}
                reservationId={reservation.id}
                suggested={depositOutstanding.toFixed(2)}
                currency={currency}
                label="Deposit"
                hint={`${formatMoney(reservation.securityDepositRequired, currency)} required`}
              />
            )}
          </StepCard>
        ) : null}

        {isShown("contract") || isShown("signature") ? (
          <StepCard
            index={numberOf("contract")}
            title="Contract & signature"
            description="Generated from this reservation and signed on screen by the customer."
            done={
              (stepByKey.contract?.done ?? true) &&
              (stepByKey.signature?.done ?? true)
            }
            requirement={stepByKey.contract?.requirement}
          >
            <div className="space-y-3">
              <p className="text-sm text-ink-muted">
                {stepByKey.signature?.done
                  ? "Signed and stored. Any later change creates a new version."
                  : stepByKey.contract?.done
                    ? "Contract issued — hand the device to the customer to sign."
                    : "Generate the contract once the condition and payment above are recorded."}
              </p>
              <ButtonLink
                href={`${detailHref}/contract`}
                variant={stepByKey.signature?.done ? "secondary" : "primary"}
              >
                {stepByKey.signature?.done
                  ? "View contract"
                  : stepByKey.contract?.done
                    ? "Open to sign"
                    : "Generate contract"}
              </ButtonLink>
            </div>
          </StepCard>
        ) : null}

        <Card>
          <h2 className="mb-3 text-sm font-semibold text-ink">
            Complete handover
          </h2>
          <CompleteStep
            action={completeHandoverAction.bind(null, slug)}
            reservationId={reservation.id}
            canComplete={checklist.canComplete}
            blockers={checklist.blockers}
          />
        </Card>
      </div>
    </>
  );
}
