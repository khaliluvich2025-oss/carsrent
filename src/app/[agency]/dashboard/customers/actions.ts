"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { isPlausiblePhone, normalizePhone } from "@/lib/phone";
import { fieldErrors, optionalText, requiredText } from "@/lib/validation";
import { requirePermission } from "@/server/auth/guards";

export type CustomerActionState = {
  errors?: Record<string, string>;
  message?: string;
  saved?: boolean;
};

const text = (formData: FormData, name: string) =>
  (formData.get(name) ?? "").toString();

function revalidate(slug: string, customerId: string) {
  revalidatePath(`/${slug}/dashboard/customers`);
  revalidatePath(`/${slug}/dashboard/customers/${customerId}`);
}

const contactSchema = z.object({
  customerId: z.string().min(1),
  fullName: requiredText("Name is required", 120),
  phone: z
    .string()
    .trim()
    .min(1, "Phone is required")
    .refine(isPlausiblePhone, "Enter a valid phone number"),
  email: z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : value))
    .refine(
      (value) => value === null || z.string().email().safeParse(value).success,
      "Enter a valid email address",
    ),
  nationality: optionalText,
});

export async function updateCustomerAction(
  slug: string,
  _prev: CustomerActionState,
  formData: FormData,
): Promise<CustomerActionState> {
  const ctx = await requirePermission("customers.manage");

  const parsed = contactSchema.safeParse({
    customerId: text(formData, "customerId"),
    fullName: text(formData, "fullName"),
    phone: text(formData, "phone"),
    email: text(formData, "email"),
    nationality: text(formData, "nationality"),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  try {
    await ctx.db.customer.update({
      where: { id: parsed.data.customerId },
      data: {
        fullName: parsed.data.fullName,
        // Stored normalised so the dedupe key stays consistent (spec §34).
        phone: normalizePhone(parsed.data.phone),
        email: parsed.data.email,
        nationality: parsed.data.nationality,
      },
    });
  } catch (error) {
    // Phone is unique per agency — a clash means this number already belongs to
    // another customer record, which is a merge decision, not an edit.
    if ((error as { code?: string }).code === "P2002") {
      return {
        errors: {
          phone:
            "Another customer already uses this number. Check for a duplicate record first.",
        },
      };
    }
    throw error;
  }

  revalidate(slug, parsed.data.customerId);
  return { saved: true };
}

const statusSchema = z.object({
  customerId: z.string().min(1),
  status: z.enum(["NORMAL", "WATCHLIST", "BLACKLISTED"]),
  reason: z.string().trim().max(300),
});

/**
 * Flag a customer (spec §34).
 *
 * Flagging is audited and, when a reason is given, recorded as a note — a
 * blacklist with no explanation is not much use to the employee who meets that
 * customer at the counter six months later.
 */
export async function setCustomerStatusAction(
  slug: string,
  _prev: CustomerActionState,
  formData: FormData,
): Promise<CustomerActionState> {
  const ctx = await requirePermission("customers.manage");

  const parsed = statusSchema.safeParse({
    customerId: text(formData, "customerId"),
    status: text(formData, "status"),
    reason: text(formData, "reason"),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const existing = await ctx.db.customer.findUnique({
    where: { id: parsed.data.customerId },
    select: { status: true },
  });
  if (!existing) return { message: "Customer not found." };

  await ctx.db.customer.update({
    where: { id: parsed.data.customerId },
    data: { status: parsed.data.status },
  });

  if (parsed.data.reason) {
    await ctx.db.customerNote.create({
      data: {
        agencyId: ctx.db.$agencyId,
        customerId: parsed.data.customerId,
        body: `Status changed to ${parsed.data.status.toLowerCase()}: ${parsed.data.reason}`,
        createdById: ctx.user.userId,
      },
    });
  }

  await ctx.db.auditLog.create({
    data: {
      agencyId: ctx.db.$agencyId,
      userId: ctx.user.userId,
      action: "customer.status_change",
      entityType: "Customer",
      entityId: parsed.data.customerId,
      oldValue: { status: existing.status },
      newValue: { status: parsed.data.status },
      reason: parsed.data.reason || null,
    },
  });

  revalidate(slug, parsed.data.customerId);
  return { saved: true };
}

const noteSchema = z.object({
  customerId: z.string().min(1),
  body: requiredText("Write something first", 1000),
});

export async function addCustomerNoteAction(
  slug: string,
  _prev: CustomerActionState,
  formData: FormData,
): Promise<CustomerActionState> {
  const ctx = await requirePermission("customers.manage");

  const parsed = noteSchema.safeParse({
    customerId: text(formData, "customerId"),
    body: text(formData, "body"),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const customer = await ctx.db.customer.findUnique({
    where: { id: parsed.data.customerId },
    select: { id: true },
  });
  if (!customer) return { message: "Customer not found." };

  await ctx.db.customerNote.create({
    data: {
      agencyId: ctx.db.$agencyId,
      customerId: parsed.data.customerId,
      body: parsed.data.body,
      createdById: ctx.user.userId,
    },
  });

  revalidate(slug, parsed.data.customerId);
  return { saved: true };
}

export async function deleteCustomerNoteAction(
  slug: string,
  customerId: string,
  formData: FormData,
): Promise<void> {
  const ctx = await requirePermission("customers.manage");
  const noteId = text(formData, "noteId");
  if (!noteId) return;

  await ctx.db.customerNote.deleteMany({
    where: { id: noteId, customerId },
  });

  revalidate(slug, customerId);
}
