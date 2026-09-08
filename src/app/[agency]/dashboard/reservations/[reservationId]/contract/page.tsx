import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { formatInTimezone } from "@/lib/dates";
import { requirePermission } from "@/server/auth/guards";
import { db } from "@/server/db";
import {
  getContractForReservation,
  listContractVersions,
} from "@/server/services/contracts/generate";
import { asSnapshot } from "@/server/services/contracts/snapshot";
import { generateContractAction, signContractAction } from "./actions";
import { ContractDocument } from "./contract-document";
import { GenerateButton, PrintButton } from "./contract-controls";
import { SignaturePad } from "./signature-pad";

export const metadata: Metadata = { title: "Contract" };

const STATUS_TONE = {
  DRAFT: "neutral",
  ISSUED: "info",
  SIGNED: "positive",
  SUPERSEDED: "neutral",
} as const;

export default async function ContractPage({
  params,
}: {
  params: Promise<{ agency: string; reservationId: string }>;
}) {
  const { agency: slug, reservationId } = await params;
  const ctx = await requirePermission("contracts.generate");

  const reservation = await ctx.db.reservation.findUnique({
    where: { id: reservationId },
    select: {
      id: true,
      bookingReference: true,
      customer: { select: { fullName: true } },
    },
  });
  if (!reservation) notFound();

  const [agency, contract, versions] = await Promise.all([
    db.agency.findUnique({
      where: { id: ctx.user.agencyId },
      select: { timezone: true },
    }),
    getContractForReservation(ctx.db, reservationId),
    listContractVersions(ctx.db, reservationId),
  ]);

  const timezone = agency?.timezone ?? "Africa/Casablanca";
  const detailHref = `/${slug}/dashboard/reservations/${reservationId}`;
  const snapshot = contract ? asSnapshot(contract.contentSnapshot) : null;
  const isSigned = contract?.status === "SIGNED";

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          back={{ href: detailHref, label: reservation.bookingReference }}
          title="Rental contract"
          description={reservation.customer.fullName}
          meta={
            contract ? (
              <>
                <Badge tone={STATUS_TONE[contract.status]}>
                  {contract.status.toLowerCase()}
                </Badge>
                {contract.version > 1 ? (
                  <Badge tone="info">Version {contract.version}</Badge>
                ) : null}
              </>
            ) : null
          }
          action={contract ? <PrintButton /> : null}
        />
      </div>

      {!contract || !snapshot ? (
        <Card className="print:hidden">
          <CardHeader
            title="No contract yet"
            description="Generate the contract once the vehicle condition and payment are recorded — everything on it is frozen at generation."
          />
          <GenerateButton
            action={generateContractAction.bind(null, slug)}
            reservationId={reservationId}
            label="Generate contract"
          />
        </Card>
      ) : (
        <div className="space-y-5">
          <div className="overflow-hidden rounded-card border border-line bg-white shadow-sm print:rounded-none print:border-0 print:shadow-none">
            <ContractDocument
              snapshot={snapshot}
              contractNumber={contract.contractNumber}
              version={contract.version}
              timezone={timezone}
              signature={
                contract.signature
                  ? {
                      signerName: contract.signature.signerName,
                      signedAt: contract.signature.signedAt,
                      imageData: contract.signature.signatureData,
                    }
                  : null
              }
            />
          </div>

          <div className="space-y-5 print:hidden">
            {isSigned ? (
              <Card>
                <CardHeader
                  title="Signed"
                  description="This contract is closed. Any change from here creates a new version and leaves this one intact."
                />
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-ink-muted">Signed by</dt>
                    <dd className="font-medium text-ink">
                      {contract.signature?.signerName}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-ink-muted">Signed at</dt>
                    <dd className="font-medium text-ink">
                      {contract.signature
                        ? formatInTimezone(contract.signature.signedAt, timezone)
                        : "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-ink-muted">Version</dt>
                    <dd className="font-medium text-ink">
                      {contract.signature?.contractVersion}
                    </dd>
                  </div>
                </dl>

                <div className="mt-4 border-t border-line pt-4">
                  <p className="mb-2 text-sm text-ink-muted">
                    If the rental terms have changed, issue an amendment. The
                    signed version above is preserved.
                  </p>
                  <GenerateButton
                    action={generateContractAction.bind(null, slug)}
                    reservationId={reservationId}
                    label="Issue amendment"
                    variant="secondary"
                  />
                </div>
              </Card>
            ) : (
              <>
                <Card>
                  <CardHeader
                    title="Customer signature"
                    description="Hand the phone or tablet to the customer once they have read the contract above."
                  />
                  <SignaturePad
                    action={signContractAction.bind(null, slug, reservationId)}
                    contractId={contract.id}
                    defaultSignerName={reservation.customer.fullName}
                  />
                </Card>

                <Card>
                  <CardHeader
                    title="Regenerate"
                    description="Refreshes this unsigned contract with the latest reservation details. The contract number does not change."
                  />
                  <GenerateButton
                    action={generateContractAction.bind(null, slug)}
                    reservationId={reservationId}
                    label="Regenerate"
                    variant="secondary"
                  />
                </Card>
              </>
            )}

            {versions.length > 1 ? (
              <Card>
                <CardHeader title="Versions" />
                <ul className="divide-y divide-line text-sm">
                  {versions.map((version) => (
                    <li
                      key={version.id}
                      className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                    >
                      <div>
                        <p className="font-medium text-ink">
                          Version {version.version}
                        </p>
                        <p className="text-xs text-ink-muted">
                          {formatInTimezone(version.generatedAt, timezone)}
                          {version.signature
                            ? ` · signed by ${version.signature.signerName}`
                            : ""}
                        </p>
                      </div>
                      <Badge tone={STATUS_TONE[version.status]}>
                        {version.status.toLowerCase()}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}
