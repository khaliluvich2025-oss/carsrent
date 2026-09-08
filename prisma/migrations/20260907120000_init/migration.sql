-- Initial schema.
--
-- btree_gist lets a GiST exclusion constraint compare "vehicleId" with = while
-- comparing "period" with &&. Required by vehicle_blocks_no_overlap below.
CREATE EXTENSION IF NOT EXISTS btree_gist;
-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('AR', 'FR', 'EN');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('AWAITING_CONFIRMATION', 'CONFIRMED', 'READY_FOR_PICKUP', 'ACTIVE', 'RETURN_DUE', 'OVERDUE', 'RETURN_INSPECTION', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "VehicleStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'RENTED', 'MAINTENANCE', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "Transmission" AS ENUM ('MANUAL', 'AUTOMATIC');

-- CreateEnum
CREATE TYPE "FuelType" AS ENUM ('PETROL', 'DIESEL', 'HYBRID', 'ELECTRIC', 'LPG');

-- CreateEnum
CREATE TYPE "VehicleBlockKind" AS ENUM ('RESERVATION', 'MAINTENANCE', 'MANUAL', 'PAYMENT_HOLD');

-- CreateEnum
CREATE TYPE "BillingRule" AS ENUM ('DAY_ROUND_UP', 'GRACE_PERIOD', 'EXTRA_HOURLY');

-- CreateEnum
CREATE TYPE "OnlinePaymentMode" AS ENUM ('FULL', 'PERCENTAGE', 'FIXED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'BANK_TRANSFER', 'ONLINE', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('RENTAL_PAYMENT', 'ONLINE_DEPOSIT', 'REFUND', 'FUEL_CHARGE', 'LATE_FEE', 'DAMAGE_CHARGE', 'MILEAGE_CHARGE', 'OTHER');

-- CreateEnum
CREATE TYPE "DepositStatus" AS ENUM ('REQUIRED', 'COLLECTED', 'HELD', 'PARTIALLY_REFUNDED', 'REFUNDED', 'RETAINED');

-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('NORMAL', 'WATCHLIST', 'BLACKLISTED');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('DRIVING_LICENCE', 'CIN', 'PASSPORT', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('MISSING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "InspectionType" AS ENUM ('PICKUP', 'RETURN');

-- CreateEnum
CREATE TYPE "PhotoPosition" AS ENUM ('FRONT', 'REAR', 'LEFT', 'RIGHT', 'INTERIOR', 'OTHER');

-- CreateEnum
CREATE TYPE "AdditionalChargeType" AS ENUM ('LATE_RETURN', 'EXTRA_MILEAGE', 'FUEL', 'DAMAGE', 'OTHER');

-- CreateEnum
CREATE TYPE "CancellationReason" AS ENUM ('CUSTOMER_REQUEST', 'PAYMENT_ISSUE', 'AGENCY_DECISION', 'OTHER');

-- CreateEnum
CREATE TYPE "ChecklistRequirement" AS ENUM ('REQUIRED', 'OPTIONAL', 'DISABLED');

-- CreateEnum
CREATE TYPE "MileagePolicy" AS ENUM ('UNLIMITED', 'LIMITED');

-- CreateEnum
CREATE TYPE "FuelPolicy" AS ENUM ('FULL_TO_FULL', 'SAME_AS_PICKUP', 'PREPAID');

-- CreateEnum
CREATE TYPE "MaintenanceCategory" AS ENUM ('OIL_CHANGE', 'TIRES', 'MECHANICAL', 'TECHNICAL_INSPECTION', 'INSURANCE', 'CLEANING', 'OTHER');

-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('OIL_CHANGE', 'TIRES', 'REPAIR', 'INSURANCE', 'TECHNICAL_INSPECTION', 'CLEANING', 'FUEL', 'OTHER');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('DRAFT', 'ISSUED', 'SIGNED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "FileVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "ExtraPriceType" AS ENUM ('FLAT', 'PER_DAY');

-- CreateEnum
CREATE TYPE "ReservationChangeType" AS ENUM ('MODIFICATION', 'EXTENSION', 'PRICE_OVERRIDE');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('NEW_RESERVATION', 'AWAITING_CONFIRMATION', 'PICKUP_TODAY', 'RETURN_TODAY', 'RENTAL_OVERDUE', 'OUTSTANDING_PAYMENT', 'MAINTENANCE_DUE', 'INSURANCE_EXPIRING', 'OTHER');

-- CreateTable
CREATE TABLE "agencies" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "whatsapp" TEXT,
    "email" TEXT,
    "address" TEXT,
    "city" TEXT,
    "googleMapsUrl" TEXT,
    "logoFileId" TEXT,
    "heroFileId" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#0f172a',
    "secondaryColor" TEXT NOT NULL DEFAULT '#2563eb',
    "shortDescription" TEXT,
    "socialLinks" JSONB,
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Casablanca',
    "currency" TEXT NOT NULL DEFAULT 'MAD',
    "defaultLocale" "Locale" NOT NULL DEFAULT 'FR',
    "enabledLocales" "Locale"[] DEFAULT ARRAY['AR', 'FR', 'EN']::"Locale"[],
    "customDomain" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "agencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agency_settings" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "bufferMinutes" INTEGER NOT NULL DEFAULT 120,
    "noShowWaitingMinutes" INTEGER NOT NULL DEFAULT 120,
    "allowDifferentReturnSite" BOOLEAN NOT NULL DEFAULT true,
    "minRentalHours" INTEGER NOT NULL DEFAULT 24,
    "maxAdvanceBookingDays" INTEGER NOT NULL DEFAULT 365,
    "billingRule" "BillingRule" NOT NULL DEFAULT 'GRACE_PERIOD',
    "gracePeriodMinutes" INTEGER NOT NULL DEFAULT 60,
    "extraHourPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "securityDepositEnabled" BOOLEAN NOT NULL DEFAULT true,
    "onlinePaymentEnabled" BOOLEAN NOT NULL DEFAULT false,
    "onlinePaymentMode" "OnlinePaymentMode" NOT NULL DEFAULT 'PERCENTAGE',
    "onlinePaymentPercent" INTEGER NOT NULL DEFAULT 30,
    "onlinePaymentFixed" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "collectDepositOnline" BOOLEAN NOT NULL DEFAULT false,
    "paymentHoldMinutes" INTEGER NOT NULL DEFAULT 20,
    "mileagePolicy" "MileagePolicy" NOT NULL DEFAULT 'UNLIMITED',
    "mileageKmPerDay" INTEGER,
    "extraKmPrice" DECIMAL(12,2),
    "fuelPolicy" "FuelPolicy" NOT NULL DEFAULT 'FULL_TO_FULL',
    "fuelPricePerPercent" DECIMAL(12,2),
    "minDriverAge" INTEGER NOT NULL DEFAULT 21,
    "minLicenceYears" INTEGER NOT NULL DEFAULT 2,
    "requireDocuments" "ChecklistRequirement" NOT NULL DEFAULT 'REQUIRED',
    "requireMileage" "ChecklistRequirement" NOT NULL DEFAULT 'REQUIRED',
    "requireFuel" "ChecklistRequirement" NOT NULL DEFAULT 'REQUIRED',
    "requirePhotos" "ChecklistRequirement" NOT NULL DEFAULT 'REQUIRED',
    "requireDamageCheck" "ChecklistRequirement" NOT NULL DEFAULT 'REQUIRED',
    "requireDeposit" "ChecklistRequirement" NOT NULL DEFAULT 'REQUIRED',
    "requirePayment" "ChecklistRequirement" NOT NULL DEFAULT 'REQUIRED',
    "requireContract" "ChecklistRequirement" NOT NULL DEFAULT 'REQUIRED',
    "requireSignature" "ChecklistRequirement" NOT NULL DEFAULT 'REQUIRED',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "agency_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_settings" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "legalName" TEXT,
    "registrationNumber" TEXT,
    "taxId" TEXT,
    "termsAndConditions" TEXT,
    "fuelPolicyText" TEXT,
    "mileagePolicyText" TEXT,
    "damagePolicyText" TEXT,
    "cancellationText" TEXT,
    "depositPolicyText" TEXT,
    "footerText" TEXT,
    "stampFileId" TEXT,
    "numberPrefix" TEXT NOT NULL DEFAULT 'CTR',
    "nextSequence" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "contract_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "working_hours" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "opensAt" TEXT NOT NULL DEFAULT '08:00',
    "closesAt" TEXT NOT NULL DEFAULT '20:00',

    CONSTRAINT "working_hours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "role" "Role" NOT NULL DEFAULT 'EMPLOYEE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMPTZ(3),
    "passwordChangedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "absoluteExpiresAt" TIMESTAMPTZ(3) NOT NULL,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stored_files" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "visibility" "FileVisibility" NOT NULL DEFAULT 'PRIVATE',
    "publicUrl" TEXT,
    "originalName" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stored_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "transmission" "Transmission" NOT NULL,
    "fuelType" "FuelType" NOT NULL,
    "seats" INTEGER NOT NULL,
    "doors" INTEGER NOT NULL DEFAULT 5,
    "color" TEXT,
    "features" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "registrationNumber" TEXT NOT NULL,
    "vin" TEXT,
    "currentMileage" INTEGER NOT NULL DEFAULT 0,
    "dailyPrice" DECIMAL(12,2) NOT NULL,
    "weeklyPrice" DECIMAL(12,2),
    "monthlyPrice" DECIMAL(12,2),
    "securityDeposit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "mileagePolicy" "MileagePolicy",
    "mileageKmPerDay" INTEGER,
    "extraKmPrice" DECIMAL(12,2),
    "currentStatus" "VehicleStatus" NOT NULL DEFAULT 'AVAILABLE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "insuranceExpiryAt" TIMESTAMPTZ(3),
    "technicalInspectionExpiryAt" TIMESTAMPTZ(3),
    "nextServiceMileage" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_images" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "isCover" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "vehicle_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_blocks" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "kind" "VehicleBlockKind" NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "bufferMinutes" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMPTZ(3),
    "reservationId" TEXT,
    "maintenanceBlockId" TEXT,
    "reason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "period" tstzrange GENERATED ALWAYS AS (tstzrange("startsAt", "endsAt", '[)')) STORED,

    CONSTRAINT "vehicle_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "pickupFee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "returnFee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seasonal_rates" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "vehicleId" TEXT,
    "name" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "dailyPrice" DECIMAL(12,2) NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "seasonal_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extras" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priceType" "ExtraPriceType" NOT NULL DEFAULT 'FLAT',
    "price" DECIMAL(12,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "extras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "nationality" TEXT,
    "status" "CustomerStatus" NOT NULL DEFAULT 'NORMAL',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_documents" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "documentType" "DocumentType" NOT NULL,
    "documentNumber" TEXT,
    "expiryDate" DATE,
    "verificationStatus" "DocumentStatus" NOT NULL DEFAULT 'MISSING',
    "fileId" TEXT,
    "verifiedAt" TIMESTAMPTZ(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "customer_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_notes" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservations" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "bookingReference" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "pickupLocationId" TEXT NOT NULL,
    "returnLocationId" TEXT NOT NULL,
    "pickupDatetime" TIMESTAMPTZ(3) NOT NULL,
    "returnDatetime" TIMESTAMPTZ(3) NOT NULL,
    "actualPickupDatetime" TIMESTAMPTZ(3),
    "actualReturnDatetime" TIMESTAMPTZ(3),
    "rentalDays" INTEGER NOT NULL,
    "baseAmount" DECIMAL(12,2) NOT NULL,
    "pickupFee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "returnFee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "extrasAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "calculatedTotal" DECIMAL(12,2) NOT NULL,
    "manualOverrideAmount" DECIMAL(12,2),
    "finalTotal" DECIMAL(12,2) NOT NULL,
    "amountPaid" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "amountRemaining" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "securityDepositRequired" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'MAD',
    "status" "ReservationStatus" NOT NULL DEFAULT 'AWAITING_CONFIRMATION',
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "pricingBreakdown" JSONB,
    "cancellationReason" "CancellationReason",
    "cancellationNote" TEXT,
    "customerNote" TEXT,
    "internalNote" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMPTZ(3),
    "cancelledAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservation_status_history" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "fromStatus" "ReservationStatus",
    "toStatus" "ReservationStatus" NOT NULL,
    "reason" TEXT,
    "changedById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reservation_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservation_changes" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "changeType" "ReservationChangeType" NOT NULL,
    "oldValues" JSONB NOT NULL,
    "newValues" JSONB NOT NULL,
    "priceDelta" DECIMAL(12,2),
    "reason" TEXT,
    "changedById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reservation_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservation_extras" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "extraId" TEXT,
    "name" TEXT NOT NULL,
    "priceType" "ExtraPriceType" NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "amount" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "reservation_extras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'COMPLETED',
    "currency" TEXT NOT NULL DEFAULT 'MAD',
    "transactionReference" TEXT,
    "provider" TEXT,
    "notes" TEXT,
    "refundOfId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "security_deposits" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "requiredAmount" DECIMAL(12,2) NOT NULL,
    "collectedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "refundedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "retainedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "method" "PaymentMethod",
    "status" "DepositStatus" NOT NULL DEFAULT 'REQUIRED',
    "currency" TEXT NOT NULL DEFAULT 'MAD',
    "collectedAt" TIMESTAMPTZ(3),
    "settledAt" TIMESTAMPTZ(3),
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "security_deposits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "additional_charges" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "type" "AdditionalChargeType" NOT NULL,
    "description" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MAD',
    "settleFromDeposit" BOOLEAN NOT NULL DEFAULT false,
    "damageRecordId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "additional_charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspections" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "type" "InspectionType" NOT NULL,
    "performedAt" TIMESTAMPTZ(3) NOT NULL,
    "mileage" INTEGER,
    "fuelLevel" INTEGER,
    "condition" TEXT,
    "notes" TEXT,
    "damageCheckedAt" TIMESTAMPTZ(3),
    "employeeId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inspections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_photos" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "position" "PhotoPosition" NOT NULL DEFAULT 'OTHER',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inspection_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "damage_records" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "reservationId" TEXT,
    "inspectionId" TEXT,
    "location" TEXT NOT NULL,
    "damageType" TEXT NOT NULL,
    "description" TEXT,
    "isPreExisting" BOOLEAN NOT NULL DEFAULT false,
    "estimatedCharge" DECIMAL(12,2),
    "confirmedCharge" DECIMAL(12,2),
    "createdById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "damage_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "damage_photos" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "damageRecordId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "damage_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contracts" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "contractNumber" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "ContractStatus" NOT NULL DEFAULT 'DRAFT',
    "contentSnapshot" JSONB NOT NULL,
    "pdfFileId" TEXT,
    "supersedesId" TEXT,
    "generatedById" TEXT,
    "generatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signatures" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "signatureFileId" TEXT,
    "signatureData" TEXT,
    "signerName" TEXT NOT NULL,
    "signedAt" TIMESTAMPTZ(3) NOT NULL,
    "contractVersion" INTEGER NOT NULL,
    "signerIp" TEXT,
    "termsAccepted" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "signatures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_records" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "category" "MaintenanceCategory" NOT NULL,
    "description" TEXT,
    "cost" DECIMAL(12,2),
    "dueDate" TIMESTAMPTZ(3),
    "dueMileage" INTEGER,
    "performedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "mileageAtService" INTEGER,
    "notes" TEXT,
    "receiptFileId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "maintenance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_blocks" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "reason" TEXT,
    "maintenanceRecordId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maintenance_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_expenses" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MAD',
    "expenseDate" TIMESTAMPTZ(3) NOT NULL,
    "notes" TEXT,
    "receiptFileId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "userId" TEXT,
    "visibleToRole" "Role",
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "readAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "oldValue" JSONB,
    "newValue" JSONB,
    "reason" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agencies_slug_key" ON "agencies"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "agencies_logoFileId_key" ON "agencies"("logoFileId");

-- CreateIndex
CREATE UNIQUE INDEX "agencies_heroFileId_key" ON "agencies"("heroFileId");

-- CreateIndex
CREATE UNIQUE INDEX "agencies_customDomain_key" ON "agencies"("customDomain");

-- CreateIndex
CREATE UNIQUE INDEX "agency_settings_agencyId_key" ON "agency_settings"("agencyId");

-- CreateIndex
CREATE UNIQUE INDEX "contract_settings_agencyId_key" ON "contract_settings"("agencyId");

-- CreateIndex
CREATE UNIQUE INDEX "contract_settings_stampFileId_key" ON "contract_settings"("stampFileId");

-- CreateIndex
CREATE UNIQUE INDEX "working_hours_agencyId_dayOfWeek_key" ON "working_hours"("agencyId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "users_agencyId_idx" ON "users"("agencyId");

-- CreateIndex
CREATE UNIQUE INDEX "users_agencyId_username_key" ON "users"("agencyId", "username");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_tokenHash_key" ON "sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "sessions_expiresAt_idx" ON "sessions"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "stored_files_key_key" ON "stored_files"("key");

-- CreateIndex
CREATE INDEX "stored_files_agencyId_idx" ON "stored_files"("agencyId");

-- CreateIndex
CREATE INDEX "vehicles_agencyId_isActive_idx" ON "vehicles"("agencyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_agencyId_registrationNumber_key" ON "vehicles"("agencyId", "registrationNumber");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_images_fileId_key" ON "vehicle_images"("fileId");

-- CreateIndex
CREATE INDEX "vehicle_images_vehicleId_sortOrder_idx" ON "vehicle_images"("vehicleId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_blocks_reservationId_key" ON "vehicle_blocks"("reservationId");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_blocks_maintenanceBlockId_key" ON "vehicle_blocks"("maintenanceBlockId");

-- CreateIndex
CREATE INDEX "vehicle_blocks_vehicleId_startsAt_endsAt_idx" ON "vehicle_blocks"("vehicleId", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "vehicle_blocks_agencyId_startsAt_idx" ON "vehicle_blocks"("agencyId", "startsAt");

-- CreateIndex
CREATE INDEX "vehicle_blocks_expiresAt_idx" ON "vehicle_blocks"("expiresAt");

-- CreateIndex
CREATE INDEX "locations_agencyId_isActive_idx" ON "locations"("agencyId", "isActive");

-- CreateIndex
CREATE INDEX "seasonal_rates_agencyId_startDate_endDate_idx" ON "seasonal_rates"("agencyId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "extras_agencyId_isActive_idx" ON "extras"("agencyId", "isActive");

-- CreateIndex
CREATE INDEX "customers_agencyId_fullName_idx" ON "customers"("agencyId", "fullName");

-- CreateIndex
CREATE UNIQUE INDEX "customers_agencyId_phone_key" ON "customers"("agencyId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "customer_documents_fileId_key" ON "customer_documents"("fileId");

-- CreateIndex
CREATE INDEX "customer_documents_customerId_idx" ON "customer_documents"("customerId");

-- CreateIndex
CREATE INDEX "customer_notes_customerId_idx" ON "customer_notes"("customerId");

-- CreateIndex
CREATE INDEX "reservations_agencyId_status_idx" ON "reservations"("agencyId", "status");

-- CreateIndex
CREATE INDEX "reservations_agencyId_pickupDatetime_idx" ON "reservations"("agencyId", "pickupDatetime");

-- CreateIndex
CREATE INDEX "reservations_agencyId_returnDatetime_idx" ON "reservations"("agencyId", "returnDatetime");

-- CreateIndex
CREATE INDEX "reservations_vehicleId_idx" ON "reservations"("vehicleId");

-- CreateIndex
CREATE INDEX "reservations_customerId_idx" ON "reservations"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "reservations_agencyId_bookingReference_key" ON "reservations"("agencyId", "bookingReference");

-- CreateIndex
CREATE INDEX "reservation_status_history_reservationId_createdAt_idx" ON "reservation_status_history"("reservationId", "createdAt");

-- CreateIndex
CREATE INDEX "reservation_changes_reservationId_createdAt_idx" ON "reservation_changes"("reservationId", "createdAt");

-- CreateIndex
CREATE INDEX "reservation_extras_reservationId_idx" ON "reservation_extras"("reservationId");

-- CreateIndex
CREATE INDEX "payments_agencyId_createdAt_idx" ON "payments"("agencyId", "createdAt");

-- CreateIndex
CREATE INDEX "payments_reservationId_idx" ON "payments"("reservationId");

-- CreateIndex
CREATE UNIQUE INDEX "security_deposits_reservationId_key" ON "security_deposits"("reservationId");

-- CreateIndex
CREATE INDEX "security_deposits_agencyId_status_idx" ON "security_deposits"("agencyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "additional_charges_damageRecordId_key" ON "additional_charges"("damageRecordId");

-- CreateIndex
CREATE INDEX "additional_charges_reservationId_idx" ON "additional_charges"("reservationId");

-- CreateIndex
CREATE INDEX "inspections_vehicleId_idx" ON "inspections"("vehicleId");

-- CreateIndex
CREATE UNIQUE INDEX "inspections_reservationId_type_key" ON "inspections"("reservationId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "inspection_photos_fileId_key" ON "inspection_photos"("fileId");

-- CreateIndex
CREATE INDEX "inspection_photos_inspectionId_sortOrder_idx" ON "inspection_photos"("inspectionId", "sortOrder");

-- CreateIndex
CREATE INDEX "damage_records_vehicleId_idx" ON "damage_records"("vehicleId");

-- CreateIndex
CREATE INDEX "damage_records_reservationId_idx" ON "damage_records"("reservationId");

-- CreateIndex
CREATE UNIQUE INDEX "damage_photos_fileId_key" ON "damage_photos"("fileId");

-- CreateIndex
CREATE INDEX "damage_photos_damageRecordId_idx" ON "damage_photos"("damageRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "contracts_pdfFileId_key" ON "contracts"("pdfFileId");

-- CreateIndex
CREATE UNIQUE INDEX "contracts_supersedesId_key" ON "contracts"("supersedesId");

-- CreateIndex
CREATE INDEX "contracts_reservationId_idx" ON "contracts"("reservationId");

-- CreateIndex
CREATE UNIQUE INDEX "contracts_agencyId_contractNumber_version_key" ON "contracts"("agencyId", "contractNumber", "version");

-- CreateIndex
CREATE UNIQUE INDEX "signatures_contractId_key" ON "signatures"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "signatures_signatureFileId_key" ON "signatures"("signatureFileId");

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_records_receiptFileId_key" ON "maintenance_records"("receiptFileId");

-- CreateIndex
CREATE INDEX "maintenance_records_vehicleId_idx" ON "maintenance_records"("vehicleId");

-- CreateIndex
CREATE INDEX "maintenance_records_agencyId_dueDate_idx" ON "maintenance_records"("agencyId", "dueDate");

-- CreateIndex
CREATE INDEX "maintenance_blocks_vehicleId_startsAt_idx" ON "maintenance_blocks"("vehicleId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_expenses_receiptFileId_key" ON "vehicle_expenses"("receiptFileId");

-- CreateIndex
CREATE INDEX "vehicle_expenses_vehicleId_expenseDate_idx" ON "vehicle_expenses"("vehicleId", "expenseDate");

-- CreateIndex
CREATE INDEX "vehicle_expenses_agencyId_expenseDate_idx" ON "vehicle_expenses"("agencyId", "expenseDate");

-- CreateIndex
CREATE INDEX "notifications_agencyId_createdAt_idx" ON "notifications"("agencyId", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_userId_readAt_idx" ON "notifications"("userId", "readAt");

-- CreateIndex
CREATE INDEX "audit_logs_agencyId_createdAt_idx" ON "audit_logs"("agencyId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "agencies" ADD CONSTRAINT "agencies_logoFileId_fkey" FOREIGN KEY ("logoFileId") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agencies" ADD CONSTRAINT "agencies_heroFileId_fkey" FOREIGN KEY ("heroFileId") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agency_settings" ADD CONSTRAINT "agency_settings_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_settings" ADD CONSTRAINT "contract_settings_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_settings" ADD CONSTRAINT "contract_settings_stampFileId_fkey" FOREIGN KEY ("stampFileId") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "working_hours" ADD CONSTRAINT "working_hours_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_images" ADD CONSTRAINT "vehicle_images_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_images" ADD CONSTRAINT "vehicle_images_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_images" ADD CONSTRAINT "vehicle_images_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "stored_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_blocks" ADD CONSTRAINT "vehicle_blocks_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_blocks" ADD CONSTRAINT "vehicle_blocks_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_blocks" ADD CONSTRAINT "vehicle_blocks_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_blocks" ADD CONSTRAINT "vehicle_blocks_maintenanceBlockId_fkey" FOREIGN KEY ("maintenanceBlockId") REFERENCES "maintenance_blocks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_blocks" ADD CONSTRAINT "vehicle_blocks_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seasonal_rates" ADD CONSTRAINT "seasonal_rates_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seasonal_rates" ADD CONSTRAINT "seasonal_rates_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extras" ADD CONSTRAINT "extras_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_documents" ADD CONSTRAINT "customer_documents_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_documents" ADD CONSTRAINT "customer_documents_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_documents" ADD CONSTRAINT "customer_documents_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_notes" ADD CONSTRAINT "customer_notes_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_notes" ADD CONSTRAINT "customer_notes_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_notes" ADD CONSTRAINT "customer_notes_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_pickupLocationId_fkey" FOREIGN KEY ("pickupLocationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_returnLocationId_fkey" FOREIGN KEY ("returnLocationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_status_history" ADD CONSTRAINT "reservation_status_history_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_status_history" ADD CONSTRAINT "reservation_status_history_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_status_history" ADD CONSTRAINT "reservation_status_history_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_changes" ADD CONSTRAINT "reservation_changes_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_changes" ADD CONSTRAINT "reservation_changes_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_changes" ADD CONSTRAINT "reservation_changes_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_extras" ADD CONSTRAINT "reservation_extras_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_extras" ADD CONSTRAINT "reservation_extras_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_extras" ADD CONSTRAINT "reservation_extras_extraId_fkey" FOREIGN KEY ("extraId") REFERENCES "extras"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_refundOfId_fkey" FOREIGN KEY ("refundOfId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_deposits" ADD CONSTRAINT "security_deposits_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_deposits" ADD CONSTRAINT "security_deposits_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_deposits" ADD CONSTRAINT "security_deposits_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "additional_charges" ADD CONSTRAINT "additional_charges_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "additional_charges" ADD CONSTRAINT "additional_charges_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "additional_charges" ADD CONSTRAINT "additional_charges_damageRecordId_fkey" FOREIGN KEY ("damageRecordId") REFERENCES "damage_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "additional_charges" ADD CONSTRAINT "additional_charges_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_photos" ADD CONSTRAINT "inspection_photos_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_photos" ADD CONSTRAINT "inspection_photos_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "inspections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_photos" ADD CONSTRAINT "inspection_photos_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "stored_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "damage_records" ADD CONSTRAINT "damage_records_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "damage_records" ADD CONSTRAINT "damage_records_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "damage_records" ADD CONSTRAINT "damage_records_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "damage_records" ADD CONSTRAINT "damage_records_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "inspections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "damage_records" ADD CONSTRAINT "damage_records_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "damage_photos" ADD CONSTRAINT "damage_photos_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "damage_photos" ADD CONSTRAINT "damage_photos_damageRecordId_fkey" FOREIGN KEY ("damageRecordId") REFERENCES "damage_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "damage_photos" ADD CONSTRAINT "damage_photos_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "stored_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_pdfFileId_fkey" FOREIGN KEY ("pdfFileId") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signatures" ADD CONSTRAINT "signatures_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signatures" ADD CONSTRAINT "signatures_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- Optional relation: Prisma emits SET NULL for a nullable foreign key.
ALTER TABLE "signatures" ADD CONSTRAINT "signatures_signatureFileId_fkey" FOREIGN KEY ("signatureFileId") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_receiptFileId_fkey" FOREIGN KEY ("receiptFileId") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_blocks" ADD CONSTRAINT "maintenance_blocks_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_blocks" ADD CONSTRAINT "maintenance_blocks_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_blocks" ADD CONSTRAINT "maintenance_blocks_maintenanceRecordId_fkey" FOREIGN KEY ("maintenanceRecordId") REFERENCES "maintenance_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_blocks" ADD CONSTRAINT "maintenance_blocks_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_expenses" ADD CONSTRAINT "vehicle_expenses_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_expenses" ADD CONSTRAINT "vehicle_expenses_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_expenses" ADD CONSTRAINT "vehicle_expenses_receiptFileId_fkey" FOREIGN KEY ("receiptFileId") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_expenses" ADD CONSTRAINT "vehicle_expenses_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Double-booking protection (spec sections 20 and 92).
--
-- vehicle_blocks is the single source of vehicle occupancy. "endsAt" already
-- includes the agency turnaround buffer, and "period" is a half-open range, so
-- a pickup at exactly (previous end + buffer) is legal while any real overlap
-- is not.
--
-- This constraint is what makes the guarantee true under concurrency: when two
-- checkouts race, both may pass their application-level availability check, but
-- only one INSERT can commit. The loser raises SQLSTATE 23P01, which the
-- reservation service turns into "This vehicle is no longer available for the
-- selected period" plus alternatives. No locking, no retry loop, no race window.
ALTER TABLE "vehicle_blocks"
    ADD CONSTRAINT "vehicle_blocks_no_overlap"
    EXCLUDE USING gist ("vehicleId" WITH =, "period" WITH &&);