import { formatInTimezone } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import type { ContractSnapshot } from "@/server/services/contracts/snapshot";

const DOC_LABELS: Record<string, string> = {
  DRIVING_LICENCE: "Driving licence",
  CIN: "National ID",
  PASSPORT: "Passport",
  OTHER: "Other",
};

function Clause({ title, body }: { title: string; body: string | null }) {
  if (!body) return null;
  return (
    <div className="break-inside-avoid">
      <h3 className="text-[11px] font-semibold tracking-wide text-ink uppercase">
        {title}
      </h3>
      <p className="mt-0.5 text-[11px] leading-relaxed whitespace-pre-wrap text-ink-soft">
        {body}
      </p>
    </div>
  );
}

/**
 * The contract document, rendered from its frozen snapshot (spec §50, §88).
 *
 * Everything here comes from `contentSnapshot` — never from live tables — so a
 * contract signed months ago still renders exactly as it was agreed, whatever
 * has changed since. Styled for A4 print: browsers turn this into the PDF.
 */
export function ContractDocument({
  snapshot,
  contractNumber,
  version,
  timezone,
  signature,
}: {
  snapshot: ContractSnapshot;
  contractNumber: string;
  version: number;
  timezone: string;
  signature: {
    signerName: string;
    signedAt: Date;
    imageData: string | null;
  } | null;
}) {
  const date = (iso: string, pattern = "d MMM yyyy, HH:mm") =>
    formatInTimezone(new Date(iso), timezone, pattern);

  return (
    <article className="mx-auto max-w-[210mm] bg-white p-8 text-ink print:p-0">
      <header className="flex items-start justify-between gap-6 border-b-2 border-ink pb-4">
        <div className="min-w-0">
          {snapshot.agency.logoUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={snapshot.agency.logoUrl}
              alt=""
              className="mb-2 h-10 w-auto object-contain"
            />
          ) : null}
          <h1 className="text-lg font-bold">
            {snapshot.agency.legalName ?? snapshot.agency.name}
          </h1>
          <p className="text-[11px] text-ink-soft">
            {[snapshot.agency.address, snapshot.agency.city]
              .filter(Boolean)
              .join(", ")}
          </p>
          <p className="text-[11px] text-ink-soft">
            {[snapshot.agency.phone, snapshot.agency.email]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {snapshot.agency.registrationNumber || snapshot.agency.taxId ? (
            <p className="text-[11px] text-ink-soft">
              {[
                snapshot.agency.registrationNumber
                  ? `RC ${snapshot.agency.registrationNumber}`
                  : null,
                snapshot.agency.taxId ? `IF ${snapshot.agency.taxId}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          ) : null}
        </div>

        <div className="shrink-0 text-right">
          <p className="text-[11px] tracking-wide text-ink-soft uppercase">
            Rental contract
          </p>
          <p className="font-mono text-base font-bold">{contractNumber}</p>
          {version > 1 ? (
            <p className="text-[11px] text-ink-soft">Amendment {version}</p>
          ) : null}
          <p className="mt-1 text-[11px] text-ink-soft">
            {date(snapshot.generatedAt)}
          </p>
        </div>
      </header>

      <section className="mt-5 grid grid-cols-2 gap-6">
        <div>
          <h2 className="mb-1.5 text-[11px] font-semibold tracking-wide uppercase">
            Renter
          </h2>
          <p className="text-sm font-medium">{snapshot.customer.fullName}</p>
          <p className="text-[11px] text-ink-soft">{snapshot.customer.phone}</p>
          {snapshot.customer.email ? (
            <p className="text-[11px] text-ink-soft">
              {snapshot.customer.email}
            </p>
          ) : null}
          {snapshot.customer.nationality ? (
            <p className="text-[11px] text-ink-soft">
              {snapshot.customer.nationality}
            </p>
          ) : null}

          {snapshot.customer.documents.length > 0 ? (
            <ul className="mt-2 space-y-0.5">
              {snapshot.customer.documents.map((document, index) => (
                <li key={index} className="text-[11px] text-ink-soft">
                  {DOC_LABELS[document.type] ?? document.type}:{" "}
                  {document.number ?? "—"}
                  {document.expiry
                    ? ` (exp. ${date(document.expiry, "d MMM yyyy")})`
                    : ""}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[11px] text-ink-muted">
              No verified documents recorded.
            </p>
          )}
        </div>

        <div>
          <h2 className="mb-1.5 text-[11px] font-semibold tracking-wide uppercase">
            Vehicle
          </h2>
          <p className="text-sm font-medium">
            {snapshot.vehicle.brand} {snapshot.vehicle.model}{" "}
            {snapshot.vehicle.year}
          </p>
          <p className="font-mono text-[11px] text-ink-soft">
            {snapshot.vehicle.registrationNumber}
          </p>
          <p className="text-[11px] text-ink-soft">
            {snapshot.vehicle.transmission.toLowerCase()} ·{" "}
            {snapshot.vehicle.fuelType.toLowerCase()} ·{" "}
            {snapshot.vehicle.seats} seats
            {snapshot.vehicle.color ? ` · ${snapshot.vehicle.color}` : ""}
          </p>
          {snapshot.vehicle.vin ? (
            <p className="text-[11px] text-ink-soft">
              VIN {snapshot.vehicle.vin}
            </p>
          ) : null}
          {snapshot.vehicle.mileageAtPickup != null ? (
            <p className="mt-2 text-[11px] text-ink-soft">
              Odometer at pickup:{" "}
              {snapshot.vehicle.mileageAtPickup.toLocaleString()} km
              {snapshot.vehicle.fuelAtPickup != null
                ? ` · Fuel ${snapshot.vehicle.fuelAtPickup}%`
                : ""}
            </p>
          ) : null}
        </div>
      </section>

      <section className="mt-5 border-t border-line pt-4">
        <h2 className="mb-2 text-[11px] font-semibold tracking-wide uppercase">
          Rental period
        </h2>
        <div className="grid grid-cols-3 gap-4 text-[11px]">
          <div>
            <p className="text-ink-muted">Collection</p>
            <p className="font-medium">{date(snapshot.rental.pickupAt)}</p>
            <p className="text-ink-soft">{snapshot.rental.pickupLocation}</p>
          </div>
          <div>
            <p className="text-ink-muted">Return</p>
            <p className="font-medium">{date(snapshot.rental.returnAt)}</p>
            <p className="text-ink-soft">{snapshot.rental.returnLocation}</p>
          </div>
          <div>
            <p className="text-ink-muted">Duration</p>
            <p className="font-medium">
              {snapshot.rental.rentalDays}{" "}
              {snapshot.rental.rentalDays === 1 ? "day" : "days"}
            </p>
            <p className="text-ink-soft">
              Ref {snapshot.rental.bookingReference}
            </p>
          </div>
        </div>
      </section>

      <section className="mt-5 border-t border-line pt-4">
        <h2 className="mb-2 text-[11px] font-semibold tracking-wide uppercase">
          Charges
        </h2>
        <table className="w-full text-[11px]">
          <tbody>
            {snapshot.pricing.lines.map((line, index) => (
              <tr key={index}>
                <td className="py-0.5">
                  {line.label}
                  {line.detail ? (
                    <span className="block text-ink-muted">{line.detail}</span>
                  ) : null}
                </td>
                <td className="py-0.5 text-right tabular-nums">
                  {formatMoney(line.amount, snapshot.pricing.currency)}
                </td>
              </tr>
            ))}
            <tr className="border-t border-ink">
              <td className="pt-1.5 font-semibold">Total</td>
              <td className="pt-1.5 text-right font-semibold tabular-nums">
                {formatMoney(snapshot.pricing.total, snapshot.pricing.currency)}
              </td>
            </tr>
            <tr>
              <td className="text-ink-soft">Paid at signing</td>
              <td className="text-right tabular-nums">
                {formatMoney(
                  snapshot.pricing.amountPaidAtGeneration,
                  snapshot.pricing.currency,
                )}
              </td>
            </tr>
            {Number(snapshot.pricing.securityDeposit) > 0 ? (
              <tr>
                <td className="text-ink-soft">
                  Security deposit (held, refundable)
                </td>
                <td className="text-right tabular-nums">
                  {formatMoney(
                    snapshot.pricing.securityDeposit,
                    snapshot.pricing.currency,
                  )}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        <p className="mt-1.5 text-[10px] text-ink-muted">
          The security deposit is held on behalf of the renter and is not part of
          the rental price. It is returned after the vehicle is inspected.
        </p>
      </section>

      <section className="mt-5 space-y-3 border-t border-line pt-4">
        <h2 className="text-[11px] font-semibold tracking-wide uppercase">
          Conditions
        </h2>
        {snapshot.conditions.minDriverAge ||
        snapshot.conditions.minLicenceYears ? (
          <p className="text-[11px] text-ink-soft">
            Minimum driver age {snapshot.conditions.minDriverAge ?? "—"}; licence
            held at least {snapshot.conditions.minLicenceYears ?? "—"} years.
          </p>
        ) : null}
        <Clause title="Fuel" body={snapshot.conditions.fuelPolicy} />
        <Clause title="Mileage" body={snapshot.conditions.mileagePolicy} />
        <Clause title="Damage" body={snapshot.conditions.damagePolicy} />
        <Clause title="Security deposit" body={snapshot.conditions.depositPolicy} />
        <Clause title="Cancellation" body={snapshot.conditions.cancellation} />
        <Clause title="General terms" body={snapshot.conditions.terms} />
      </section>

      <section className="mt-8 grid grid-cols-2 gap-8 break-inside-avoid">
        <div>
          <p className="mb-1 text-[11px] text-ink-muted">For the agency</p>
          <div className="h-16 border-b border-ink" />
          <p className="mt-1 text-[11px]">{snapshot.agency.name}</p>
        </div>
        <div>
          <p className="mb-1 text-[11px] text-ink-muted">The renter</p>
          <div className="flex h-16 items-end border-b border-ink">
            {signature?.imageData ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={signature.imageData}
                alt="Signature"
                className="max-h-16 w-auto object-contain"
              />
            ) : null}
          </div>
          <p className="mt-1 text-[11px]">
            {signature?.signerName ?? snapshot.customer.fullName}
          </p>
          {signature ? (
            <p className="text-[10px] text-ink-muted">
              Signed {formatInTimezone(signature.signedAt, timezone)}
            </p>
          ) : null}
        </div>
      </section>

      {snapshot.conditions.footer ? (
        <footer className="mt-6 border-t border-line pt-3 text-[10px] whitespace-pre-wrap text-ink-muted">
          {snapshot.conditions.footer}
        </footer>
      ) : null}
    </article>
  );
}
