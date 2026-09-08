import type { TenantDb } from "@/server/tenant";
import {
  buildKey,
  isStorageConfigured,
  uploadObject,
} from "@/server/storage";
import { ContractError } from "./generate";

/**
 * Electronic signature (spec §52, §88).
 *
 * Once signed, the contract is closed: the snapshot, the signature bitmap, the
 * timestamp and the version are all preserved, and any later change becomes a
 * new version rather than an edit. This function is therefore the only writer
 * that flips a contract to SIGNED, and it refuses to run twice.
 */

const DATA_URL = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/;
const MAX_SIGNATURE_BYTES = 500 * 1024;

export class SignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SignatureError";
  }
}

export type SignInput = {
  contractId: string;
  signerName: string;
  /** `data:image/png;base64,...` from the signature pad */
  signatureData: string;
  termsAccepted: boolean;
  signerIp?: string | null;
  userId: string;
};

export async function signContract(db: TenantDb, input: SignInput) {
  const agencyId = db.$agencyId;

  if (!input.termsAccepted) {
    throw new SignatureError("The customer must accept the rental conditions.");
  }
  if (!input.signerName.trim()) {
    throw new SignatureError("Enter the name of the person signing.");
  }

  const match = DATA_URL.exec(input.signatureData.trim());
  if (!match) {
    throw new SignatureError("The signature could not be read. Try again.");
  }

  const png = Buffer.from(match[1], "base64");
  if (png.byteLength === 0) {
    throw new SignatureError("The signature is empty. Ask for a signature.");
  }
  if (png.byteLength > MAX_SIGNATURE_BYTES) {
    throw new SignatureError("The signature image is too large.");
  }

  const contract = await db.contract.findUnique({
    where: { id: input.contractId },
    select: {
      id: true,
      version: true,
      status: true,
      reservationId: true,
      signature: { select: { id: true } },
    },
  });
  if (!contract) throw new ContractError("Contract not found.");

  // Signing twice would either overwrite a signature or create a second one for
  // the same agreement. Neither is acceptable (spec §88).
  if (contract.status === "SIGNED" || contract.signature) {
    throw new SignatureError(
      "This contract is already signed. Generate an amendment to change it.",
    );
  }
  if (contract.status === "SUPERSEDED") {
    throw new SignatureError(
      "This version has been superseded. Sign the current version instead.",
    );
  }

  // Store the bitmap privately when possible, and always keep the inline copy
  // so the signature is never lost to a storage outage.
  let signatureFileId: string | null = null;
  if (isStorageConfigured()) {
    try {
      const key = buildKey({
        agencyId,
        entity: "contracts",
        entityId: contract.id,
        filename: "signature.png",
      });
      const uploaded = await uploadObject({
        key,
        body: png,
        contentType: "image/png",
        visibility: "PRIVATE",
      });
      const stored = await db.storedFile.create({
        data: {
          agencyId,
          bucket: uploaded.bucket,
          key: uploaded.key,
          contentType: uploaded.contentType,
          sizeBytes: uploaded.sizeBytes,
          visibility: "PRIVATE",
          originalName: "signature.png",
          uploadedById: input.userId,
        },
        select: { id: true },
      });
      signatureFileId = stored.id;
    } catch {
      // Fall back to the inline copy rather than failing the signature.
      signatureFileId = null;
    }
  }

  return db.$transaction(async (tx) => {
    const signedAt = new Date();

    await tx.signature.create({
      data: {
        agencyId,
        contractId: contract.id,
        signatureFileId,
        signatureData: input.signatureData.trim(),
        signerName: input.signerName.trim(),
        signedAt,
        contractVersion: contract.version,
        signerIp: input.signerIp ?? null,
        termsAccepted: true,
      },
    });

    await tx.contract.update({
      where: { id: contract.id },
      data: { status: "SIGNED" },
    });

    await tx.auditLog.create({
      data: {
        agencyId,
        userId: input.userId,
        action: "contract.sign",
        entityType: "Contract",
        entityId: contract.id,
        newValue: {
          signerName: input.signerName.trim(),
          signedAt: signedAt.toISOString(),
          contractVersion: contract.version,
        },
      },
    });

    return { contractId: contract.id, signedAt };
  });
}
