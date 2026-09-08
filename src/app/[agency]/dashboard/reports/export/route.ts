import { NextResponse } from "next/server";

import { formatInTimezone } from "@/lib/dates";
import { getAuthContext } from "@/server/auth/guards";
import { db } from "@/server/db";
import { csvFilename, csvWithBom, toCsv } from "@/server/services/reports/csv";
import { getVehiclePerformance } from "@/server/services/reports/metrics";
import { resolvePeriod } from "@/server/services/reports/period";

/**
 * CSV exports (spec §73).
 *
 * A route handler rather than a server action because the response is a file
 * download. Owner-only, and tenant-scoped like everything else — an export is
 * the easiest place to accidentally hand over another agency's data.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ agency: string }> },
) {
  const { agency: slug } = await params;
  const ctx = await getAuthContext();

  if (!ctx) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  if (ctx.user.agencySlug !== slug || !ctx.can("reports.export")) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  const url = new URL(request.url);
  const dataset = url.searchParams.get("dataset") ?? "reservations";

  const agency = await db.agency.findUnique({
    where: { id: ctx.user.agencyId },
    select: { timezone: true },
  });
  const timezone = agency?.timezone ?? "Africa/Casablanca";

  const period = resolvePeriod(
    url.searchParams.get("period") ?? "month",
    timezone,
    {
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
    },
  );
  const window = { gte: period.start, lt: period.end };
  const at = (value: Date | null) =>
    value ? formatInTimezone(value, timezone, "yyyy-MM-dd HH:mm") : "";

  let csv: string;

  switch (dataset) {
    case "payments": {
      const rows = await ctx.db.payment.findMany({
        where: { createdAt: window },
        orderBy: { createdAt: "asc" },
        select: {
          createdAt: true,
          type: true,
          method: true,
          status: true,
          amount: true,
          currency: true,
          transactionReference: true,
          reservation: {
            select: {
              bookingReference: true,
              customer: { select: { fullName: true } },
            },
          },
          createdBy: { select: { fullName: true } },
        },
      });

      csv = toCsv(rows, [
        { header: "Date", value: (r) => at(r.createdAt) },
        { header: "Reservation", value: (r) => r.reservation.bookingReference },
        { header: "Customer", value: (r) => r.reservation.customer.fullName },
        { header: "Type", value: (r) => r.type },
        { header: "Method", value: (r) => r.method },
        { header: "Status", value: (r) => r.status },
        { header: "Amount", value: (r) => r.amount.toString() },
        { header: "Currency", value: (r) => r.currency },
        { header: "Reference", value: (r) => r.transactionReference },
        { header: "Recorded by", value: (r) => r.createdBy?.fullName },
      ]);
      break;
    }

    case "expenses": {
      const rows = await ctx.db.vehicleExpense.findMany({
        where: { expenseDate: window },
        orderBy: { expenseDate: "asc" },
        select: {
          expenseDate: true,
          category: true,
          amount: true,
          currency: true,
          notes: true,
          vehicle: {
            select: { brand: true, model: true, registrationNumber: true },
          },
          createdBy: { select: { fullName: true } },
        },
      });

      csv = toCsv(rows, [
        { header: "Date", value: (r) => at(r.expenseDate) },
        {
          header: "Vehicle",
          value: (r) => `${r.vehicle.brand} ${r.vehicle.model}`,
        },
        { header: "Registration", value: (r) => r.vehicle.registrationNumber },
        { header: "Category", value: (r) => r.category },
        { header: "Amount", value: (r) => r.amount.toString() },
        { header: "Currency", value: (r) => r.currency },
        { header: "Notes", value: (r) => r.notes },
        { header: "Recorded by", value: (r) => r.createdBy?.fullName },
      ]);
      break;
    }

    case "vehicles": {
      const rows = await getVehiclePerformance(ctx.db, period);
      csv = toCsv(rows, [
        { header: "Vehicle", value: (r) => r.label },
        { header: "Registration", value: (r) => r.registrationNumber },
        { header: "Rentals", value: (r) => r.rentals },
        { header: "Rental days", value: (r) => r.rentalDays },
        {
          header: "Utilisation %",
          value: (r) => (r.utilization * 100).toFixed(1),
        },
        { header: "Revenue", value: (r) => r.revenue },
        { header: "Expenses", value: (r) => r.expenses },
        { header: "Net contribution", value: (r) => r.netContribution },
        { header: "Damage reports", value: (r) => r.damageCount },
      ]);
      break;
    }

    case "customers": {
      const rows = await ctx.db.customer.findMany({
        orderBy: { createdAt: "asc" },
        select: {
          fullName: true,
          phone: true,
          email: true,
          nationality: true,
          status: true,
          createdAt: true,
          _count: { select: { reservations: true } },
        },
      });

      csv = toCsv(rows, [
        { header: "Name", value: (r) => r.fullName },
        { header: "Phone", value: (r) => r.phone },
        { header: "Email", value: (r) => r.email },
        { header: "Country", value: (r) => r.nationality },
        { header: "Status", value: (r) => r.status },
        { header: "Reservations", value: (r) => r._count.reservations },
        { header: "First seen", value: (r) => at(r.createdAt) },
      ]);
      break;
    }

    default: {
      const rows = await ctx.db.reservation.findMany({
        where: { createdAt: window },
        orderBy: { createdAt: "asc" },
        select: {
          bookingReference: true,
          status: true,
          paymentStatus: true,
          createdAt: true,
          pickupDatetime: true,
          returnDatetime: true,
          actualPickupDatetime: true,
          actualReturnDatetime: true,
          rentalDays: true,
          calculatedTotal: true,
          finalTotal: true,
          amountPaid: true,
          amountRemaining: true,
          securityDepositRequired: true,
          currency: true,
          customer: { select: { fullName: true, phone: true } },
          vehicle: {
            select: { brand: true, model: true, registrationNumber: true },
          },
          pickupLocation: { select: { name: true } },
          returnLocation: { select: { name: true } },
        },
      });

      csv = toCsv(rows, [
        { header: "Reference", value: (r) => r.bookingReference },
        { header: "Status", value: (r) => r.status },
        { header: "Payment", value: (r) => r.paymentStatus },
        { header: "Booked", value: (r) => at(r.createdAt) },
        { header: "Customer", value: (r) => r.customer.fullName },
        { header: "Phone", value: (r) => r.customer.phone },
        {
          header: "Vehicle",
          value: (r) => `${r.vehicle.brand} ${r.vehicle.model}`,
        },
        { header: "Registration", value: (r) => r.vehicle.registrationNumber },
        { header: "Pickup", value: (r) => at(r.pickupDatetime) },
        { header: "Pickup location", value: (r) => r.pickupLocation.name },
        { header: "Return", value: (r) => at(r.returnDatetime) },
        { header: "Return location", value: (r) => r.returnLocation.name },
        { header: "Actual pickup", value: (r) => at(r.actualPickupDatetime) },
        { header: "Actual return", value: (r) => at(r.actualReturnDatetime) },
        { header: "Days", value: (r) => r.rentalDays },
        { header: "Calculated total", value: (r) => r.calculatedTotal.toString() },
        { header: "Final total", value: (r) => r.finalTotal.toString() },
        { header: "Paid", value: (r) => r.amountPaid.toString() },
        { header: "Remaining", value: (r) => r.amountRemaining.toString() },
        {
          header: "Deposit",
          value: (r) => r.securityDepositRequired.toString(),
        },
        { header: "Currency", value: (r) => r.currency },
      ]);
    }
  }

  return new NextResponse(csvWithBom(csv), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${csvFilename(dataset, period.key === "custom" ? period.label : period.key)}"`,
      "Cache-Control": "no-store",
    },
  });
}
