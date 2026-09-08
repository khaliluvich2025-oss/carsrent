"use server";

import { revalidatePath } from "next/cache";

import { fieldErrors } from "@/lib/validation";
import { requirePermission } from "@/server/auth/guards";
import {
  createEmployee,
  employeeSchema,
  resetEmployeePassword,
  setEmployeeActive,
  TeamError,
} from "@/server/services/settings/agency";

export type TeamState = {
  errors?: Record<string, string>;
  message?: string;
  saved?: boolean;
};

const text = (formData: FormData, name: string) =>
  (formData.get(name) ?? "").toString();

function revalidate(slug: string) {
  revalidatePath(`/${slug}/dashboard/settings/team`);
}

export async function createEmployeeAction(
  slug: string,
  _prev: TeamState,
  formData: FormData,
): Promise<TeamState> {
  const ctx = await requirePermission("employees.manage");

  const parsed = employeeSchema.safeParse({
    fullName: text(formData, "fullName"),
    username: text(formData, "username"),
    role: text(formData, "role") || "EMPLOYEE",
    phone: text(formData, "phone"),
    email: text(formData, "email"),
    password: text(formData, "password"),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  try {
    await createEmployee(ctx.db, ctx.db.$agencyId, parsed.data);
  } catch (error) {
    if (error instanceof TeamError) {
      return { errors: { [error.field]: error.message } };
    }
    throw error;
  }

  await ctx.db.auditLog.create({
    data: {
      agencyId: ctx.db.$agencyId,
      userId: ctx.user.userId,
      action: "employee.create",
      entityType: "User",
      newValue: { username: parsed.data.username, role: parsed.data.role },
    },
  });

  revalidate(slug);
  return { saved: true };
}

export async function setEmployeeActiveAction(
  slug: string,
  formData: FormData,
): Promise<void> {
  const ctx = await requirePermission("employees.manage");
  const userId = text(formData, "userId");
  const isActive = text(formData, "isActive") === "1";
  if (!userId) return;

  // An owner locking themselves out of their own agency is not a recoverable
  // mistake from inside the product.
  if (userId === ctx.user.userId && !isActive) return;

  await setEmployeeActive(ctx.db, userId, isActive);

  await ctx.db.auditLog.create({
    data: {
      agencyId: ctx.db.$agencyId,
      userId: ctx.user.userId,
      action: isActive ? "employee.enable" : "employee.disable",
      entityType: "User",
      entityId: userId,
    },
  });

  revalidate(slug);
}

export async function resetPasswordAction(
  slug: string,
  _prev: TeamState,
  formData: FormData,
): Promise<TeamState> {
  const ctx = await requirePermission("employees.manage");
  const userId = text(formData, "userId");
  const password = text(formData, "password");
  if (!userId) return { message: "User not found." };

  // Scoped lookup: an id from another agency simply finds nothing.
  const target = await ctx.db.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true },
  });
  if (!target) return { message: "User not found." };

  try {
    await resetEmployeePassword(ctx.db, userId, password);
  } catch (error) {
    if (error instanceof TeamError) {
      return { errors: { [error.field]: error.message } };
    }
    throw error;
  }

  await ctx.db.auditLog.create({
    data: {
      agencyId: ctx.db.$agencyId,
      userId: ctx.user.userId,
      action: "employee.password_reset",
      entityType: "User",
      entityId: userId,
    },
  });

  revalidate(slug);
  return { saved: true, message: `Password reset for ${target.username}.` };
}
