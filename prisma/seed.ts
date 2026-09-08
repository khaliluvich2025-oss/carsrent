import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "@prisma/client";

import { hashPassword } from "../src/server/auth/password";

// Run standalone under tsx, so load .env ourselves (Node 24 built-in).
process.loadEnvFile?.(".env");

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL (or DIRECT_URL) must be set to seed.");
}

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const AGENCY_SLUG = "atlas-cars";
const OWNER_PASSWORD = "ChangeMe-Owner-2026";
const EMPLOYEE_PASSWORD = "ChangeMe-Staff-2026";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Times relative to "now" so the dashboard always has something to show. */
const now = new Date();
const at = (dayOffset: number, hour: number) => {
  const d = new Date(now.getTime() + dayOffset * DAY);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
};

async function main() {
  const agency = await db.agency.upsert({
    where: { slug: AGENCY_SLUG },
    update: {},
    create: {
      slug: AGENCY_SLUG,
      name: "Atlas Cars Marrakech",
      phone: "+212 524 000 000",
      whatsapp: "+212 600 000 000",
      email: "contact@atlascars.example",
      address: "Avenue Mohammed V",
      city: "Marrakech",
      primaryColor: "#c2410c",
      secondaryColor: "#0f172a",
      shortDescription: "Location de voitures à Marrakech depuis 2012",
      timezone: "Africa/Casablanca",
      currency: "MAD",
      defaultLocale: "FR",
      enabledLocales: ["AR", "FR", "EN"],
    },
  });

  await db.agencySettings.upsert({
    where: { agencyId: agency.id },
    update: {},
    create: {
      agencyId: agency.id,
      bufferMinutes: 120,
      billingRule: "GRACE_PERIOD",
      gracePeriodMinutes: 60,
      extraHourPrice: "80.00",
      securityDepositEnabled: true,
      onlinePaymentEnabled: false,
      mileagePolicy: "UNLIMITED",
      fuelPolicy: "FULL_TO_FULL",
      minDriverAge: 21,
      minLicenceYears: 2,
      // Contract generation and signature arrive in a later phase, and photos
      // need object storage. Seeded as Optional so a handover can be completed
      // end to end today; the enforcement itself is fully built, so an agency
      // can switch these to Required the moment they are available.
      requirePhotos: "OPTIONAL",
      requireContract: "OPTIONAL",
      requireSignature: "OPTIONAL",
    },
  });

  await db.contractSettings.upsert({
    where: { agencyId: agency.id },
    update: {},
    create: {
      agencyId: agency.id,
      legalName: "Atlas Cars SARL",
      numberPrefix: "CTR",
      fuelPolicyText: "Le véhicule est livré plein et doit être restitué plein.",
      mileagePolicyText: "Kilométrage illimité.",
      cancellationText:
        "Annulation gratuite jusqu'à 48 heures avant la prise en charge.",
      depositPolicyText:
        "La caution est restituée après inspection du véhicule au retour.",
    },
  });

  // Mon-Sat 08:00-20:00, Sunday 10:00-18:00 (spec §77 worked example)
  for (let day = 0; day <= 6; day += 1) {
    await db.workingHours.upsert({
      where: { agencyId_dayOfWeek: { agencyId: agency.id, dayOfWeek: day } },
      update: {},
      create: {
        agencyId: agency.id,
        dayOfWeek: day,
        opensAt: day === 0 ? "10:00" : "08:00",
        closesAt: day === 0 ? "18:00" : "20:00",
      },
    });
  }

  const [ownerHash, employeeHash] = await Promise.all([
    hashPassword(OWNER_PASSWORD),
    hashPassword(EMPLOYEE_PASSWORD),
  ]);

  const owner = await db.user.upsert({
    where: { agencyId_username: { agencyId: agency.id, username: "owner" } },
    update: {},
    create: {
      agencyId: agency.id,
      username: "owner",
      passwordHash: ownerHash,
      fullName: "Youssef Benali",
      role: "OWNER",
      phone: "+212 600 111 222",
    },
  });

  const employee = await db.user.upsert({
    where: { agencyId_username: { agencyId: agency.id, username: "employee" } },
    update: {},
    create: {
      agencyId: agency.id,
      username: "employee",
      passwordHash: employeeHash,
      fullName: "Salma Idrissi",
      role: "EMPLOYEE",
      phone: "+212 600 333 444",
    },
  });

  // ---- Locations (spec §22) -------------------------------------------------
  const locationSeeds = [
    { name: "Agency Office", pickupFee: "0.00", returnFee: "0.00", sortOrder: 0, address: "Avenue Mohammed V, Marrakech" },
    { name: "Marrakech Airport", pickupFee: "150.00", returnFee: "150.00", sortOrder: 1, address: "Aéroport Marrakech-Ménara" },
    { name: "Train Station", pickupFee: "80.00", returnFee: "80.00", sortOrder: 2, address: "Gare ONCF Marrakech" },
    { name: "Hotel Delivery", pickupFee: "100.00", returnFee: "100.00", sortOrder: 3, address: null },
  ];

  const locations: Record<string, string> = {};
  for (const seed of locationSeeds) {
    const existing = await db.location.findFirst({
      where: { agencyId: agency.id, name: seed.name },
      select: { id: true },
    });
    const row =
      existing ??
      (await db.location.create({
        data: { agencyId: agency.id, ...seed },
        select: { id: true },
      }));
    locations[seed.name] = row.id;
  }

  // ---- Fleet (spec §16) -----------------------------------------------------
  const vehicleSeeds: Prisma.VehicleUncheckedCreateInput[] = [
    {
      agencyId: agency.id,
      brand: "Dacia", model: "Duster", year: 2026, category: "SUV",
      transmission: "AUTOMATIC", fuelType: "DIESEL", seats: 5, doors: 5,
      color: "Gris", features: ["Air conditioning", "Bluetooth", "GPS", "Reversing camera"],
      registrationNumber: "12345-A-6", currentMileage: 18400,
      dailyPrice: "450.00", weeklyPrice: "420.00", monthlyPrice: "350.00",
      securityDeposit: "3000.00", currentStatus: "RENTED",
      insuranceExpiryAt: at(48, 0), technicalInspectionExpiryAt: at(120, 0),
      nextServiceMileage: 20000,
    },
    {
      agencyId: agency.id,
      brand: "Renault", model: "Clio 5", year: 2025, category: "Economy",
      transmission: "MANUAL", fuelType: "DIESEL", seats: 5, doors: 5,
      color: "Blanc", features: ["Air conditioning", "Bluetooth"],
      registrationNumber: "23456-B-6", currentMileage: 42100,
      dailyPrice: "280.00", weeklyPrice: "260.00", monthlyPrice: "220.00",
      securityDeposit: "2000.00", currentStatus: "AVAILABLE",
      insuranceExpiryAt: at(200, 0), technicalInspectionExpiryAt: at(15, 0),
      nextServiceMileage: 45000,
    },
    {
      agencyId: agency.id,
      brand: "Volkswagen", model: "Golf 8", year: 2025, category: "Compact",
      transmission: "AUTOMATIC", fuelType: "PETROL", seats: 5, doors: 5,
      color: "Noir", features: ["Air conditioning", "Apple CarPlay", "Cruise control"],
      registrationNumber: "34567-C-6", currentMileage: 26750,
      dailyPrice: "520.00", weeklyPrice: "490.00", monthlyPrice: "430.00",
      securityDeposit: "4000.00", currentStatus: "MAINTENANCE",
      insuranceExpiryAt: at(90, 0), technicalInspectionExpiryAt: at(240, 0),
    },
    {
      agencyId: agency.id,
      brand: "Peugeot", model: "208", year: 2024, category: "Economy",
      transmission: "MANUAL", fuelType: "PETROL", seats: 5, doors: 5,
      color: "Bleu", features: ["Air conditioning", "Bluetooth"],
      registrationNumber: "45678-D-6", currentMileage: 58200,
      dailyPrice: "260.00", weeklyPrice: "240.00", monthlyPrice: "200.00",
      securityDeposit: "2000.00", currentStatus: "RESERVED",
      insuranceExpiryAt: at(150, 0),
    },
    {
      agencyId: agency.id,
      brand: "Hyundai", model: "Tucson", year: 2025, category: "SUV",
      transmission: "AUTOMATIC", fuelType: "HYBRID", seats: 5, doors: 5,
      color: "Blanc nacré", features: ["Air conditioning", "GPS", "Reversing camera", "Cruise control"],
      registrationNumber: "56789-E-6", currentMileage: 12300,
      dailyPrice: "650.00", weeklyPrice: "600.00", monthlyPrice: "520.00",
      securityDeposit: "5000.00", currentStatus: "AVAILABLE",
      mileagePolicy: "LIMITED", mileageKmPerDay: 250, extraKmPrice: "3.50",
      insuranceExpiryAt: at(300, 0), nextServiceMileage: 15000,
    },
    {
      agencyId: agency.id,
      brand: "Dacia", model: "Logan", year: 2024, category: "Economy",
      transmission: "MANUAL", fuelType: "DIESEL", seats: 5, doors: 4,
      color: "Gris", features: ["Air conditioning"],
      registrationNumber: "67890-F-6", currentMileage: 76400,
      dailyPrice: "230.00", weeklyPrice: "210.00", monthlyPrice: "180.00",
      securityDeposit: "2000.00", currentStatus: "AVAILABLE",
      insuranceExpiryAt: at(60, 0),
    },
    {
      agencyId: agency.id,
      brand: "Mercedes-Benz", model: "Classe C", year: 2025, category: "Luxury",
      transmission: "AUTOMATIC", fuelType: "DIESEL", seats: 5, doors: 4,
      color: "Noir", features: ["Leather seats", "GPS", "Cruise control", "Apple CarPlay", "Sunroof"],
      registrationNumber: "78901-G-6", currentMileage: 9800,
      dailyPrice: "1200.00", weeklyPrice: "1100.00", monthlyPrice: "950.00",
      securityDeposit: "10000.00", currentStatus: "AVAILABLE",
      insuranceExpiryAt: at(280, 0),
    },
    {
      agencyId: agency.id,
      brand: "Citroën", model: "Jumpy", year: 2023, category: "Van",
      transmission: "MANUAL", fuelType: "DIESEL", seats: 9, doors: 5,
      color: "Blanc", features: ["Air conditioning", "9 seats"],
      registrationNumber: "89012-H-6", currentMileage: 112500,
      dailyPrice: "700.00", weeklyPrice: "650.00", monthlyPrice: "560.00",
      securityDeposit: "5000.00", currentStatus: "AVAILABLE",
      insuranceExpiryAt: at(45, 0), nextServiceMileage: 113000,
    },
  ];

  const vehicles: Record<string, string> = {};
  for (const seed of vehicleSeeds) {
    const row = await db.vehicle.upsert({
      where: {
        agencyId_registrationNumber: {
          agencyId: agency.id,
          registrationNumber: seed.registrationNumber,
        },
      },
      update: {},
      create: seed,
      select: { id: true },
    });
    vehicles[seed.registrationNumber] = row.id;
  }

  // ---- Seasonal rates (spec §24) -------------------------------------------
  const year = now.getUTCFullYear();
  const seasonSeeds = [
    {
      name: "High season",
      startDate: new Date(Date.UTC(year, 6, 1)),
      endDate: new Date(Date.UTC(year, 7, 31)),
      dailyPrice: "600.00",
      priority: 0,
    },
    {
      name: "Christmas & New Year",
      startDate: new Date(Date.UTC(year, 11, 20)),
      endDate: new Date(Date.UTC(year + 1, 0, 5)),
      dailyPrice: "700.00",
      priority: 10,
    },
  ];

  for (const seed of seasonSeeds) {
    const existing = await db.seasonalRate.findFirst({
      where: { agencyId: agency.id, name: seed.name },
      select: { id: true },
    });
    if (!existing) {
      await db.seasonalRate.create({ data: { agencyId: agency.id, ...seed } });
    }
  }

  // ---- Extras (spec §25) ----------------------------------------------------
  const extraSeeds = [
    { name: "Child seat", description: "Group 1, up to 18 kg", priceType: "PER_DAY" as const, price: "30.00" },
    { name: "Additional driver", description: "Second named driver on the contract", priceType: "FLAT" as const, price: "150.00" },
    { name: "GPS", description: "Portable satnav", priceType: "PER_DAY" as const, price: "25.00" },
    { name: "Airport delivery outside hours", priceType: "FLAT" as const, price: "200.00" },
  ];

  for (const seed of extraSeeds) {
    const existing = await db.extra.findFirst({
      where: { agencyId: agency.id, name: seed.name },
      select: { id: true },
    });
    if (!existing) {
      await db.extra.create({ data: { agencyId: agency.id, ...seed } });
    }
  }

  // ---- Customers (spec §34) -------------------------------------------------
  const customerSeeds = [
    { fullName: "Marie Dubois", phone: "+33 6 12 34 56 78", email: "marie.dubois@example.com", nationality: "France" },
    { fullName: "James Whitfield", phone: "+44 7700 900123", email: "j.whitfield@example.com", nationality: "United Kingdom" },
    { fullName: "Karim El Amrani", phone: "+212 661 234 567", email: null, nationality: "Morocco" },
    { fullName: "Sofia Rossi", phone: "+39 340 1122334", email: "sofia.rossi@example.com", nationality: "Italy" },
    { fullName: "Hans Müller", phone: "+49 151 23456789", email: "h.mueller@example.com", nationality: "Germany" },
  ];

  const customers: Record<string, string> = {};
  for (const seed of customerSeeds) {
    const row = await db.customer.upsert({
      where: { agencyId_phone: { agencyId: agency.id, phone: seed.phone } },
      update: {},
      create: { agencyId: agency.id, ...seed },
      select: { id: true },
    });
    customers[seed.fullName] = row.id;
  }

  // A flagged customer, so the CRM and the reservation warning have something
  // real to show (spec §34, §35).
  await db.customer.update({
    where: { id: customers["Hans Müller"] },
    data: { status: "WATCHLIST" },
  });

  const noteCount = await db.customerNote.count({
    where: { agencyId: agency.id },
  });
  if (noteCount === 0) {
    await db.customerNote.createMany({
      data: [
        {
          agencyId: agency.id,
          customerId: customers["Hans Müller"],
          body: "Status changed to watchlist: returned the car 4 hours late without calling.",
          createdById: owner.id,
        },
        {
          agencyId: agency.id,
          customerId: customers["Marie Dubois"],
          body: "Regular customer, always books the Duster. Prefers airport pickup.",
          createdById: employee.id,
        },
        {
          agencyId: agency.id,
          customerId: customers["Karim El Amrani"],
          body: "Local customer, pays cash. Speaks Darija and French.",
          createdById: employee.id,
        },
      ],
    });
  }

  // ---- Reservations + their blocking windows (spec §12, §19, §84) -----------
  //
  // Each reservation writes a matching vehicle_blocks row, because that table is
  // the single source of occupancy. The buffer is folded into the block's end.
  const BUFFER = 120;

  const reservationSeeds = [
    {
      reference: "RNT-1024", customer: "Marie Dubois", registration: "12345-A-6",
      pickup: at(-2, 10), return: at(3, 10), pickupLocation: "Marrakech Airport",
      returnLocation: "Marrakech Airport", status: "ACTIVE" as const,
      base: "2250.00", pickupFee: "150.00", returnFee: "150.00", total: "2550.00",
      paid: "2550.00", deposit: "3000.00", createdBy: employee.id,
    },
    {
      reference: "RNT-1058", customer: "James Whitfield", registration: "45678-D-6",
      pickup: at(0, 14), return: at(5, 14), pickupLocation: "Agency Office",
      returnLocation: "Agency Office", status: "CONFIRMED" as const,
      base: "1300.00", pickupFee: "0.00", returnFee: "0.00", total: "1300.00",
      paid: "0.00", deposit: "2000.00", createdBy: employee.id,
    },
    {
      reference: "RNT-1061", customer: "Sofia Rossi", registration: "56789-E-6",
      pickup: at(1, 9), return: at(8, 9), pickupLocation: "Marrakech Airport",
      returnLocation: "Agency Office", status: "AWAITING_CONFIRMATION" as const,
      base: "4200.00", pickupFee: "150.00", returnFee: "0.00", total: "4350.00",
      paid: "0.00", deposit: "5000.00", createdBy: null,
    },
    {
      reference: "RNT-1062", customer: "Hans Müller", registration: "78901-G-6",
      pickup: at(4, 11), return: at(7, 11), pickupLocation: "Hotel Delivery",
      returnLocation: "Marrakech Airport", status: "AWAITING_CONFIRMATION" as const,
      base: "3600.00", pickupFee: "100.00", returnFee: "150.00", total: "3850.00",
      paid: "0.00", deposit: "10000.00", createdBy: null,
    },
    {
      reference: "RNT-1009", customer: "Karim El Amrani", registration: "23456-B-6",
      pickup: at(-14, 9), return: at(-9, 9), pickupLocation: "Agency Office",
      returnLocation: "Agency Office", status: "COMPLETED" as const,
      base: "1400.00", pickupFee: "0.00", returnFee: "0.00", total: "1400.00",
      paid: "1400.00", deposit: "2000.00", createdBy: employee.id,
    },
  ];

  for (const seed of reservationSeeds) {
    const existing = await db.reservation.findFirst({
      where: { agencyId: agency.id, bookingReference: seed.reference },
      select: { id: true },
    });
    if (existing) continue;

    const rentalDays = Math.max(
      1,
      Math.round((seed.return.getTime() - seed.pickup.getTime()) / DAY),
    );
    const remaining = (
      Number(seed.total) - Number(seed.paid)
    ).toFixed(2);

    const reservation = await db.reservation.create({
      data: {
        agencyId: agency.id,
        bookingReference: seed.reference,
        customerId: customers[seed.customer],
        vehicleId: vehicles[seed.registration],
        pickupLocationId: locations[seed.pickupLocation],
        returnLocationId: locations[seed.returnLocation],
        pickupDatetime: seed.pickup,
        returnDatetime: seed.return,
        rentalDays,
        baseAmount: seed.base,
        pickupFee: seed.pickupFee,
        returnFee: seed.returnFee,
        calculatedTotal: seed.total,
        finalTotal: seed.total,
        amountPaid: seed.paid,
        amountRemaining: remaining,
        securityDepositRequired: seed.deposit,
        status: seed.status,
        paymentStatus:
          Number(seed.paid) === 0
            ? "UNPAID"
            : Number(remaining) === 0
              ? "PAID"
              : "PARTIALLY_PAID",
        createdById: seed.createdBy,
        confirmedAt: seed.status === "AWAITING_CONFIRMATION" ? null : seed.pickup,
        completedAt: seed.status === "COMPLETED" ? seed.return : null,
        actualPickupDatetime:
          seed.status === "ACTIVE" || seed.status === "COMPLETED"
            ? seed.pickup
            : null,
        actualReturnDatetime:
          seed.status === "COMPLETED" ? seed.return : null,
      },
      select: { id: true },
    });

    await db.reservationStatusHistory.create({
      data: {
        agencyId: agency.id,
        reservationId: reservation.id,
        toStatus: seed.status,
        changedById: seed.createdBy,
      },
    });

    // Completed rentals no longer occupy the vehicle.
    if (seed.status !== "COMPLETED") {
      await db.vehicleBlock.create({
        data: {
          agencyId: agency.id,
          vehicleId: vehicles[seed.registration],
          kind: "RESERVATION",
          startsAt: seed.pickup,
          endsAt: new Date(seed.return.getTime() + BUFFER * 60 * 1000),
          bufferMinutes: BUFFER,
          reservationId: reservation.id,
          createdById: seed.createdBy,
        },
      });
    }

    if (Number(seed.paid) > 0) {
      await db.payment.create({
        data: {
          agencyId: agency.id,
          reservationId: reservation.id,
          type: "RENTAL_PAYMENT",
          amount: seed.paid,
          method: "CASH",
          status: "COMPLETED",
          createdById: seed.createdBy,
        },
      });
      await db.securityDeposit.create({
        data: {
          agencyId: agency.id,
          reservationId: reservation.id,
          requiredAmount: seed.deposit,
          collectedAmount: seed.status === "COMPLETED" ? "0.00" : seed.deposit,
          refundedAmount: seed.status === "COMPLETED" ? seed.deposit : "0.00",
          method: "CASH",
          status: seed.status === "COMPLETED" ? "REFUNDED" : "HELD",
          collectedAt: seed.pickup,
          settledAt: seed.status === "COMPLETED" ? seed.return : null,
          createdById: seed.createdBy,
        },
      });
    }
  }

  // ---- Maintenance block (spec §58) ----------------------------------------
  const golfId = vehicles["34567-C-6"];
  const existingMaintenance = await db.maintenanceBlock.findFirst({
    where: { agencyId: agency.id, vehicleId: golfId },
    select: { id: true },
  });

  if (!existingMaintenance) {
    const record = await db.maintenanceRecord.create({
      data: {
        agencyId: agency.id,
        vehicleId: golfId,
        category: "OIL_CHANGE",
        description: "Oil change and brake pads",
        cost: "1250.00",
        performedAt: at(-1, 8),
        createdById: owner.id,
      },
      select: { id: true },
    });

    const block = await db.maintenanceBlock.create({
      data: {
        agencyId: agency.id,
        vehicleId: golfId,
        startsAt: at(-1, 8),
        endsAt: at(1, 18),
        reason: "Oil change and brake pads",
        maintenanceRecordId: record.id,
        createdById: owner.id,
      },
      select: { id: true, startsAt: true, endsAt: true },
    });

    await db.vehicleBlock.create({
      data: {
        agencyId: agency.id,
        vehicleId: golfId,
        kind: "MAINTENANCE",
        startsAt: block.startsAt,
        endsAt: block.endsAt,
        maintenanceBlockId: block.id,
        reason: "Oil change and brake pads",
        createdById: owner.id,
      },
    });
  }

  // ---- Expenses (spec §60) --------------------------------------------------
  const expenseCount = await db.vehicleExpense.count({
    where: { agencyId: agency.id },
  });
  if (expenseCount === 0) {
    await db.vehicleExpense.createMany({
      data: [
        { agencyId: agency.id, vehicleId: golfId, category: "OIL_CHANGE", amount: "650.00", expenseDate: at(-1, 9), notes: "Oil + filter", createdById: owner.id },
        { agencyId: agency.id, vehicleId: golfId, category: "REPAIR", amount: "1200.00", expenseDate: at(-1, 9), notes: "Front brake pads", createdById: owner.id },
        { agencyId: agency.id, vehicleId: vehicles["12345-A-6"], category: "TIRES", amount: "2400.00", expenseDate: at(-20, 10), notes: "4 new tyres", createdById: owner.id },
        { agencyId: agency.id, vehicleId: vehicles["23456-B-6"], category: "CLEANING", amount: "150.00", expenseDate: at(-8, 12), createdById: owner.id },
        { agencyId: agency.id, vehicleId: vehicles["89012-H-6"], category: "INSURANCE", amount: "3500.00", expenseDate: at(-45, 10), notes: "Annual premium", createdById: owner.id },
      ],
    });
  }

  console.log(`Seeded "${agency.name}" at /${agency.slug}`);
  console.log(`  ${vehicleSeeds.length} vehicles, ${customerSeeds.length} customers, ${reservationSeeds.length} reservations`);
  console.log(`  Owner    -> owner    / ${OWNER_PASSWORD}`);
  console.log(`  Employee -> employee / ${EMPLOYEE_PASSWORD}`);
  console.log("  Change both passwords before this touches real data.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
