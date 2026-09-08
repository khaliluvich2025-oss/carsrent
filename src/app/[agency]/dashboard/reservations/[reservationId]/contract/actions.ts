"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { requirePermission } from "@/server/auth/guards";
import {
  ContractError,
  generateContract,
} from "@/server/services/contracts/generate";
import { signContract, SignatureError } from "@/server/services/contracts/sign";

export type ContractState = {
  message?: string;
  saved?: boolean;
  amended?: boolean;
};

const text = (formData: FormData, name: string) =>
  (formData.get(name) ?? "").toString();

function revalidate(slug: string, reservationId: string) {
  revalidatePath(`/${slug}/dashboard/reservations/${reservationId}/contract`);
  revalidatePath(`/${slug}/dashboard/reservations/${reservationId}/handover`);
  revalidatePath(`/${slug}/dashboard/reservations/${reservationId}`);
}

export async function generateContractAction(
  slug: string,
  _prev: ContractState,
  formData: FormData,
): Promise<ContractState> {
  const ctx = await requirePermission("contracts.generate");
  const reservationId = text(formData, "reservationId");
  if (!reservationId) return { message: "Reservation not found." };

  try {
    const result = await generateContract(
      ctx.db,
      reservationId,
      ctx.user.userId,
    );
    revalidate(slug, reservationId);
    return { saved: true, amended: result.amended };
  } catch (error) {
    if (error instanceof ContractError) return { message: error.message };
    throw error;
  }
}

export async function signContractAction(
  slug: string,
  reservationId: string,
  _prev: ContractState,
  formData: FormData,
): Promise<ContractState> {
  const ctx = await requirePermission("contracts.generate");

  const headerList = await headers();
  const ip =
    headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  try {
    await signContract(ctx.db, {
      contractId: text(formData, "contractId"),
      signerName: text(formData, "signerName"),
      signatureData: text(formData, "signatureData"),
      termsAccepted: formData.get("termsAccepted") === "on",
      signerIp: ip,
      userId: ctx.user.userId,
    });
  } catch (error) {
    if (error instanceof SignatureError || error instanceof ContractError) {
      return { message: error.message };
    }
    throw error;
  }

  revalidate(slug, reservationId);
  return { saved: true };
}
