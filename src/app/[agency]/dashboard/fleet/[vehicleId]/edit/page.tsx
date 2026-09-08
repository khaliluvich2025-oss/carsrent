import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import { requirePermission } from "@/server/auth/guards";
import { db } from "@/server/db";
import { getVehicle } from "@/server/services/fleet/vehicles";
import { updateVehicleAction } from "../../actions";
import { VehicleForm, type VehicleFormValues } from "../../vehicle-form";

export const metadata: Metadata = { title: "Edit vehicle" };

const dateInput = (value: Date | null) =>
  value ? value.toISOString().slice(0, 10) : "";

export default async function EditVehiclePage({
  params,
}: {
  params: Promise<{ agency: string; vehicleId: string }>;
}) {
  const { agency: slug, vehicleId } = await params;
  const ctx = await requirePermission("fleet.manage");

  const [vehicle, agency] = await Promise.all([
    getVehicle(ctx.db, vehicleId),
    db.agency.findUnique({
      where: { id: ctx.user.agencyId },
      select: { currency: true },
    }),
  ]);

  if (!vehicle) notFound();

  const values: VehicleFormValues = {
    brand: vehicle.brand,
    model: vehicle.model,
    year: String(vehicle.year),
    category: vehicle.category,
    transmission: vehicle.transmission,
    fuelType: vehicle.fuelType,
    seats: String(vehicle.seats),
    doors: String(vehicle.doors),
    color: vehicle.color ?? "",
    features: vehicle.features.join(", "),
    registrationNumber: vehicle.registrationNumber,
    vin: vehicle.vin ?? "",
    currentMileage: String(vehicle.currentMileage),
    dailyPrice: vehicle.dailyPrice.toString(),
    weeklyPrice: vehicle.weeklyPrice?.toString() ?? "",
    monthlyPrice: vehicle.monthlyPrice?.toString() ?? "",
    securityDeposit: vehicle.securityDeposit.toString(),
    mileagePolicy: vehicle.mileagePolicy ?? "",
    mileageKmPerDay:
      vehicle.mileageKmPerDay === null ? "" : String(vehicle.mileageKmPerDay),
    extraKmPrice: vehicle.extraKmPrice?.toString() ?? "",
    currentStatus: vehicle.currentStatus,
    isActive: vehicle.isActive,
    insuranceExpiryAt: dateInput(vehicle.insuranceExpiryAt),
    technicalInspectionExpiryAt: dateInput(vehicle.technicalInspectionExpiryAt),
    nextServiceMileage:
      vehicle.nextServiceMileage === null
        ? ""
        : String(vehicle.nextServiceMileage),
  };

  const detailHref = `/${slug}/dashboard/fleet/${vehicle.id}`;

  return (
    <>
      <PageHeader
        title={`${vehicle.brand} ${vehicle.model}`}
        description="Changes apply to new reservations. Existing bookings keep the price they were quoted."
        back={{ href: detailHref, label: "Vehicle" }}
      />

      <VehicleForm
        action={updateVehicleAction.bind(null, slug, vehicle.id)}
        values={values}
        currency={agency?.currency ?? "MAD"}
        cancelHref={detailHref}
        submitLabel="Save changes"
      />
    </>
  );
}
