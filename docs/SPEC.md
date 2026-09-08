## # CAR RENTAL SAAS — MASTER BUILD SPECIFICATION

## ## 1. PROJECT OVERVIEW

Build a complete multi-agency SaaS web application for car rental agencies.

## The platform has two main sides:

1. **Client Website**
   - Public-facing rental website.
   - Customers search for available vehicles and create reservations.

2. **Agency Dashboard**
   - Private management system.
   - Used by the agency Owner and Employees.

The application must be designed as a **multi-tenant SaaS from day one**.

## Each agency must have completely isolated:

- Vehicles
- Customers
- Reservations
- Employees
- Payments
- Expenses
- Maintenance
- Contracts
- Documents
- Reports
- Settings
- Branding

An agency must NEVER be able to access another agency's data.

---

## # 2. CORE PRODUCT PRINCIPLES

## The system should be:

- Mobile-first
- Fast
- Modern
- Simple for non-technical users
- Responsive
- Secure
- Multi-agency
- Suitable for small and medium car rental agencies
- Designed around real rental operations

Do not unnecessarily over-engineer the UI.

## The most important workflows are:

```text
## SEARCH
## → RESERVATION
## → PHONE CONFIRMATION
## → PICKUP
## → ACTIVE RENTAL
## → RETURN
## → INSPECTION
## → PAYMENT SETTLEMENT
## → COMPLETED
```

---

## # 3. TECHNOLOGY STACK

## Use:

```text
Next.js
React
TypeScript
Tailwind CSS

PostgreSQL
Prisma ORM
```

Use secure authentication.

## Recommended:

```text
Auth.js / NextAuth
```

or an equivalent secure authentication implementation.

## Use secure cloud/S3-compatible object storage for:

- Vehicle images
- Customer documents
- Inspection images
- Damage images
- Expense receipts
- Contracts
- Signatures
- Agency logos

Sensitive customer documents MUST NOT be publicly accessible.

---

## # 4. MULTI-AGENCY ARCHITECTURE

Every agency has its own workspace.

## Almost every business table must contain:

```text
agency_id
```

## Examples:

```text
Agency A
├── Vehicles
├── Customers
├── Reservations
├── Employees
├── Payments
├── Contracts
└── Settings

Agency B
├── Vehicles
├── Customers
├── Reservations
├── Employees
├── Payments
├── Contracts
└── Settings
```

Agency A must never be able to access Agency B data.

Do not rely only on frontend filtering.

Tenant isolation must also be enforced server-side.

---

## # 5. USER ROLES

## There are ONLY TWO roles in V1:

```text
## OWNER
## EMPLOYEE
```

## Do NOT create:

- Manager
- Supervisor
- Accountant
- Receptionist
- Other roles

unless explicitly requested later.

---

## ## OWNER

## Owner has full access to:

- Dashboard
- Reservations
- Calendar
- Fleet
- Customers
- Pickup
- Returns
- Payments
- Deposits
- Maintenance
- Expenses
- Reports
- Employees
- Agency settings
- Website branding
- Pricing
- Locations
- Contract settings

---

## ## EMPLOYEE

## Employee handles daily operations:

- Reservations
- Customers
- Phone confirmations
- Pickup
- Return
- Vehicle inspections
- Customer document verification
- Payments required during operations
- Security deposits
- Operational vehicle information

Employees must NOT have access to sensitive Owner-only analytics and system settings.

---

## # 6. AUTHENTICATION

## Every Owner and Employee has their own:

```text
username
password
```

## Database should store:

```text
username
password_hash
agency_id
role
is_active
```

Never store plaintext passwords.

## Owner can:

- Create employee
- Disable employee
- Change/reset employee password
- View employee activity

Prefer disabling users instead of deleting them so historical actions remain traceable.

---

## # 7. CLIENT WEBSITE

## The public website should follow:

```text
## HOME
↓
## SEARCH
↓
## AVAILABLE CARS
↓
## CAR DETAILS
↓
## BOOKING
↓
## CUSTOMER INFORMATION
↓
## OPTIONAL PAYMENT
↓
## RESERVATION CONFIRMATION
↓
## MY BOOKING
```

---

## # 8. HOME PAGE

## Main search form:

```text
Pickup Location
Pickup Date
Pickup Time

Return Location
Return Date
Return Time

## SEARCH AVAILABLE CARS
```

The website must support agency branding.

## Display:

- Agency logo
- Agency name
- Main branding colors
- Phone
- WhatsApp
- Language selector

## Languages:

```text
Arabic
French
English
```

Each agency can enable/disable languages.

## Default currency:

```text
## MAD
```

Architecture should allow additional currencies later.

---

## # 9. AVAILABLE CARS

After search, show ONLY vehicles genuinely available for the requested date/time period.

## Each vehicle card should display:

```text
Vehicle image
Brand
Model
Year
Category
Transmission
Fuel type
Seats
Daily price
Security deposit
View Details
```

## Filters can include:

```text
Category
Price
Transmission
Fuel
Seats
```

---

## # 10. CAR DETAILS

## Display:

- Image gallery
- Brand
- Model
- Year
- Category
- Transmission
- Fuel
- Seats
- Doors
- Main features
- Daily price
- Security deposit
- Selected pickup information
- Selected return information
- Rental duration
- Pricing breakdown

## Example:

```text
Dacia Duster 2026

Automatic
Diesel
5 Seats

5 Days × 450 MAD = 2,250 MAD
Airport Pickup = 150 MAD

## TOTAL = 2,400 MAD

Security Deposit = 3,000 MAD
```

Security deposit must NOT be counted as rental revenue.

---

## # 11. CUSTOMER INFORMATION

Keep booking friction low.

## During online reservation ask for:

```text
Full Name
Phone / WhatsApp
Email (optional)
Country / Nationality (optional)
```

## DO NOT require:

- Driving licence upload
- CIN upload
- Passport upload

during online booking.

Documents are verified later during pickup.

---

## # 12. BOOKING MODEL

## The booking model is:

## # INSTANT RESERVATION + MANUAL PHONE CONFIRMATION

The website automatically checks vehicle availability.

If available, the customer can reserve it immediately.

## After reservation:

```text
## AWAITING_CONFIRMATION
```

The requested vehicle dates become blocked.

Agency receives the reservation.

Owner/Employee calls the customer.

## Then:

```text
## CONFIRM RESERVATION
```

## or:

```text
## CANCEL RESERVATION
```

If cancelled, the blocked vehicle dates are released.

---

## # 13. BOOKING FLOW

```text
Customer searches
↓
Availability Check
↓
Customer selects vehicle
↓
Customer enters information
↓
FINAL Availability Check
↓
Optional online payment
↓
Reservation created
↓
Vehicle dates blocked
↓
## AWAITING_CONFIRMATION
↓
Agency calls customer
↓
## CONFIRMED
```

## If cancelled:

```text
## CANCELLED
↓
Dates released
```

---

## # 14. RESERVATION STATUSES

## Internal statuses:

```text
## AWAITING_CONFIRMATION
## CONFIRMED
## READY_FOR_PICKUP
## ACTIVE
## RETURN_DUE
## OVERDUE
## RETURN_INSPECTION
## COMPLETED
## CANCELLED
## NO_SHOW
```

## Typical lifecycle:

```text
## AWAITING_CONFIRMATION
↓
## CONFIRMED
↓
## READY_FOR_PICKUP
↓
## ACTIVE
↓
## RETURN_DUE
↓
## RETURN_INSPECTION
↓
## COMPLETED
```

## Alternative flows:

```text
## CONFIRMED
## → CANCELLED
```

```text
## CONFIRMED
## → NO_SHOW
```

```text
## ACTIVE
## → OVERDUE
## → RETURN_INSPECTION
## → COMPLETED
```

## Customer-facing statuses should be simplified to:

```text
Pending Confirmation
Confirmed
Active
Completed
Cancelled
```

Do not expose unnecessary internal operational statuses to customers.

---

## # 15. MY BOOKING

Do NOT require customer accounts in V1.

## Customer can access a reservation using:

```text
Booking Reference
+
Phone Number
```

## Display:

- Vehicle
- Pickup
- Return
- Locations
- Reservation status
- Rental total
- Amount paid
- Remaining amount when appropriate
- Agency contact information

---

## # 16. VEHICLE PROFILE

Each vehicle must have a complete profile.

## Core fields:

```text
id
agency_id

brand
model
year
category
transmission
fuel_type
seats
doors
color

registration_number
vin
current_mileage

daily_price
weekly_price
monthly_price
security_deposit

current_status
is_active

created_at
updated_at
```

---

## # 17. VEHICLE IMAGES

Support multiple images per vehicle.

## Separate table:

```text
vehicle_images
```

## Fields should support:

```text
vehicle_id
image_url
is_cover
sort_order
```

One image can be selected as the main/cover image.

---

## # 18. VEHICLE STATUS

## Current operational statuses:

```text
## AVAILABLE
## RESERVED
## RENTED
## MAINTENANCE
## UNAVAILABLE
```

## IMPORTANT:

Vehicle availability must NOT depend only on `current_status`.

A vehicle may be AVAILABLE now but already reserved for next week.

Availability must always be calculated for the requested period.

---

## # 19. AVAILABILITY ENGINE

This is one of the most important parts of the entire application.

## Customer provides:

```text
requested_pickup_datetime
requested_return_datetime
```

## System must check:

- Reservations
- Active rentals
- Maintenance blocks
- Manual blocks
- Buffer time

## Basic overlap logic:

```text
requested_start < existing_end
## AND
requested_end > existing_start
```

If true, there is an overlap.

The vehicle must not be shown as available.

---

## # 20. DOUBLE BOOKING PROTECTION

Perform availability checking TWICE.

```text
## SEARCH
↓
Availability Check #1
↓
Customer selects vehicle
↓
Checkout
↓
FINAL Availability Check #2
↓
Create Reservation
```

The final reservation creation must also be protected at the database/server level against concurrent bookings.

Do not rely only on frontend checks.

Two customers must never be able to successfully reserve the same vehicle for overlapping periods.

---

## # 21. BUFFER BETWEEN RENTALS

## Each agency can configure:

```text
minimum_buffer_time
```

## Example:

```text
## Vehicle return:
14 Sep 18:00

## Buffer:
2 hours

## Next possible pickup:
14 Sep 20:00
```

## Buffer accounts for:

- Inspection
- Cleaning
- Refueling
- Moving vehicle
- Preparation

---

## # 22. LOCATIONS

Owner manages pickup and return locations.

## Examples:

```text
Agency Office
Marrakech Airport
Train Station
Hotel Delivery
Custom Address
```

## Each location can have:

```text
name
pickup_fee
return_fee
is_active
```

## Agency can configure:

```text
## Allow different pickup and return locations:
## ON / OFF
```

## Example:

```text
## Pickup:
Marrakech Airport +150 MAD

## Return:
Agency Office FREE
```

---

## # 23. LOCATION AVAILABILITY

Availability logic must consider operational feasibility.

## Example:

## A vehicle returns at:

```text
Marrakech Airport — 14:00
```

## and another customer requests:

```text
Agency Office — 14:15
```

The vehicle may not be operationally available.

Use the configured buffer time.

Do not build complex GPS/distance-based transfer calculations in V1.

---

## # 24. PRICING

Owner has full control over vehicle pricing.

## Each vehicle can have:

```text
Daily Price
Weekly Price
Monthly Price
Security Deposit
```

Support seasonal pricing architecture.

## Example:

```text
## Normal:
450 MAD/day

## July-August:
600 MAD/day

## 7+ days:
420 MAD/day

## 30+ days:
350 MAD/day
```

---

## # 25. PRICING ENGINE

## Pricing engine should consider:

```text
Vehicle base price
Rental duration
Seasonal pricing
Weekly pricing
Monthly pricing
Pickup fee
Return fee
Extras
Discounts
Manual override
Billing rule
```

## Calculation:

```text
## BASE RENTAL
+
## LOCATION FEES
+
## EXTRAS
-
## DISCOUNTS
=
## RENTAL TOTAL
```

Security deposit must remain separate.

---

## # 26. MANUAL PRICE OVERRIDE

Owner must be able to manually override reservation pricing.

## Example:

```text
## System Total:
## 2,700 MAD

## Negotiated Price:
## 2,500 MAD
```

## Store:

- Original calculated price
- New price
- User who changed it
- Timestamp
- Reason

Do not silently overwrite historical pricing.

---

## # 27. RENTAL BILLING RULES

Each agency chooses its billing method.

## Options:

```text
## 24 HOURS + GRACE PERIOD
## 24 HOURS + EXTRA HOURLY CHARGE
## ROUND UP TO FULL DAY
```

## Settings:

```text
grace_period_minutes
extra_hour_price
```

## Example:

```text
## Pickup:
Monday 10:00

## Return:
Tuesday 10:45

## Grace:
60 minutes

## Charged:
1 day
```

---

## # 28. SECURITY DEPOSIT / CAUTION

## Agency-level setting:

```text
## Security Deposit:
## ON / OFF
```

Each vehicle can have a different amount.

## Example:

```text
## Dacia Logan:
## 2,000 MAD

## Range Rover:
## 8,000 MAD
```

Owner can override the amount for an individual reservation.

## Deposit statuses:

```text
## REQUIRED
## COLLECTED
## HELD
## PARTIALLY_REFUNDED
## REFUNDED
## RETAINED
```

Security deposits are NOT rental revenue.

---

## # 29. ONLINE PAYMENT

Online payment is optional per agency.

## Setting:

```text
## Online Payment:
## ON / OFF
```

## If OFF:

```text
Reserve
→
Awaiting Phone Confirmation
```

## If ON, agency can choose:

```text
## FULL PAYMENT
## PERCENTAGE
## FIXED AMOUNT
```

## Examples:

```text
100%

30%

## 500 MAD
```

## Also support:

```text
## Collect Security Deposit Online:
## ON / OFF
```

Do not store card numbers or CVV.

Use a payment provider when online payment is implemented.

---

## # 30. PAYMENT HOLD

If online payment is enabled, temporarily hold the vehicle while the customer completes payment.

The hold must expire automatically.

Do not permanently block a vehicle because of an abandoned checkout.

---

## # 31. PAYMENTS & TRANSACTIONS

Do not use only a single `paid` boolean.

A reservation may have multiple transactions.

## Example:

```text
## Rental Total:
## 3,200 MAD

500 MAD — Online
2,000 MAD — Cash
700 MAD — Card
```

## Payment methods:

```text
## CASH
## CARD
## BANK_TRANSFER
## ONLINE
## OTHER
```

## Payment statuses:

```text
## UNPAID
## PARTIALLY_PAID
## PAID
## PARTIALLY_REFUNDED
## REFUNDED
```

---

## # 32. TRANSACTION TYPES

## Examples:

```text
## RENTAL_PAYMENT
## ONLINE_DEPOSIT
## REFUND
## FUEL_CHARGE
## LATE_FEE
## DAMAGE_CHARGE
## MILEAGE_CHARGE
## OTHER
```

## Each transaction should record:

```text
reservation_id
agency_id
type
amount
method
status
transaction_reference
created_by
created_at
```

---

## # 33. SECURITY DEPOSIT ACCOUNTING

Security deposit must be tracked separately.

## Example:

```text
## Deposit:
## 3,000 MAD

## Additional Charges:
## 1,150 MAD

## Refund:
## 1,850 MAD
```

## Employee/Owner chooses:

```text
## DEDUCT FROM DEPOSIT
```

## or:

```text
## CUSTOMER PAYS SEPARATELY
```

---

## # 34. CUSTOMER CRM

Create a customer profile automatically when a customer first reserves.

## Fields:

```text
id
agency_id

full_name
phone
email
nationality

status

created_at
updated_at
```

## Customer status:

```text
## NORMAL
## WATCHLIST
## BLACKLISTED
```

Phone number should be a strong identifier for duplicate detection.

---

## # 35. CUSTOMER PROFILE

## Display:

- Contact details
- First booking
- Last booking
- Rental history
- Total reservations
- Completed reservations
- Cancelled reservations
- Total rental spend
- Damage history
- Internal notes
- Document status

Agency A must NOT see the customer's history with Agency B.

---

## # 36. CUSTOMER DOCUMENTS

Documents are collected/verified at pickup.

## Possible documents:

```text
## DRIVING_LICENCE
## CIN
## PASSPORT
## OTHER
```

## Track:

```text
document_type
document_number
expiry_date
verification_status
file
```

## Statuses:

```text
## MISSING
## VERIFIED
## REJECTED
```

Sensitive documents must use protected storage.

---

## # 37. PICKUP / HANDOVER FLOW

## When customer arrives:

```text
Open Reservation
↓
Start Handover
↓
Verify Customer
↓
Verify Driving Licence
↓
Verify CIN / Passport
↓
Record Mileage
↓
Record Fuel
↓
Take Before Photos
↓
Record Existing Damage
↓
Collect Rental Payment
↓
Collect Security Deposit
↓
Generate Contract
↓
Customer Signs
↓
Complete Handover
↓
## ACTIVE RENTAL
```

---

## # 38. PICKUP INSPECTION

## Record:

```text
pickup_datetime_actual
mileage
fuel_level
general_condition
notes
employee_id
```

## Support photos:

- Front
- Rear
- Left
- Right
- Interior
- Additional

Photos should remain associated with that specific rental.

---

## # 39. EXISTING DAMAGE

Employee can record existing damage before handover.

## Example:

```text
## Location:
Front Left Door

## Type:
Scratch

## Description:
Small existing scratch

## Photos:
[...]

## Recorded At:
12 Sep 2026 14:18
```

Do NOT implement AI damage detection in V1.

---

## # 40. PICKUP CHECKLIST

## Owner can configure which steps are:

```text
## REQUIRED
## OPTIONAL
## DISABLED
```

## Possible requirements:

- Documents
- Mileage
- Fuel
- Photos
- Damage check
- Security deposit
- Payment
- Contract
- Signature

System should prevent handover completion if a required step is missing.

---

## # 41. ACTIVE RENTAL

## After successful handover:

```text
## Reservation Status:
## ACTIVE

## Vehicle Status:
## RENTED
```

Store actual handover time.

---

## # 42. RETURN FLOW

```text
Start Return
↓
Record Actual Return Time
↓
Record Mileage
↓
Record Fuel
↓
Take After Photos
↓
Compare Before / After
↓
Record New Damage
↓
Calculate Late Fees
↓
Calculate Mileage Fees
↓
Calculate Fuel Fees
↓
Add Damage Charges
↓
Settle Payments
↓
Settle Security Deposit
↓
Complete Rental
↓
Cleaning / Buffer
↓
Vehicle Available
```

---

## # 43. RETURN INSPECTION

## Record:

```text
actual_return_datetime
return_mileage
return_fuel_level
condition
notes
employee_id
```

## Display:

```text
## BEFORE
vs
## AFTER
```

using inspection photos.

---

## # 44. LATE RETURN

## Compare:

```text
scheduled_return_datetime
vs
actual_return_datetime
```

Calculate delay.

## Example:

```text
## Scheduled:
18:00

## Returned:
20:30

## Delay:
2h 30m
```

Fees should follow agency policy.

Allow authorized manual adjustment with reason.

---

## # 45. MILEAGE

## Record:

```text
pickup_mileage
return_mileage
```

## Calculate:

```text
distance_travelled =
return_mileage - pickup_mileage
```

## Architecture should support:

```text
Unlimited mileage
```

## or:

```text
X km/day
+
extra price/km
```

---

## # 46. FUEL

Record pickup and return fuel levels.

Support agency fuel policy.

## Example:

```text
## Pickup:
100%

## Return:
50%
```

Allow fuel charge to be added.

---

## # 47. NEW DAMAGE

During return, Employee can create new damage records.

## Store:

```text
location
damage_type
description
photos
estimated_charge
confirmed_charge
created_by
created_at
```

Employee confirms damage manually.

No automatic AI damage judgment in V1.

---

## # 48. ADDITIONAL CHARGES

## Support:

```text
## LATE_RETURN
## EXTRA_MILEAGE
## FUEL
## DAMAGE
## OTHER
```

## Example:

```text
## Late Return:
## +200 MAD

## Mileage:
## +150 MAD

## Fuel:
## +300 MAD

## Damage:
## +700 MAD

## TOTAL ADDITIONAL:
## 1,350 MAD
```

---

## # 49. COMPLETE RENTAL

## Before completion verify:

```text
Return time recorded
Mileage recorded
Fuel checked
Photos completed
Damage inspection completed
Payments settled
Deposit settled
```

## Then:

```text
## COMPLETED
```

Vehicle should not necessarily become available immediately.

## Check:

- Buffer
- Maintenance
- Manual block
- Damage requiring maintenance

## Then:

```text
## AVAILABLE
```

when appropriate.

---

## # 50. RENTAL CONTRACT

Generate rental contracts automatically.

## Use:

```text
Agency information
Customer information
Customer verified documents
Vehicle information
Registration number
Reservation
Pickup/return
Pricing
Payments
Security deposit
Rental conditions
```

## Generate:

```text
contract_number
```

## Example:

```text
## CTR-2026-00128
```

---

## # 51. CONTRACT SETTINGS

## Owner controls:

- Agency logo
- Company information
- Company identifiers if required
- Contract terms
- Fuel policy
- Mileage policy
- Damage policy
- Cancellation policy
- Deposit policy
- Footer
- Optional agency stamp/signature

---

## # 52. ELECTRONIC SIGNATURE

## At pickup:

```text
Read Contract
↓
Accept Terms
↓
Sign
```

Customer should be able to sign on phone/tablet.

## Store:

```text
signature
signed_at
contract_version
```

Generate final signed PDF.

After signing, do NOT silently modify the original contract.

If important terms change, create a new version/amendment.

---

## # 53. CANCELLATION

Employee or Owner can cancel a reservation.

## Require:

```text
Cancellation Reason
```

## Examples:

```text
## CUSTOMER_REQUEST
## PAYMENT_ISSUE
## AGENCY_DECISION
## OTHER
```

## After cancellation:

```text
Release blocked vehicle dates
```

unless another block exists.

Existing payments must remain in financial history.

Process refunds separately.

---

## # 54. NO-SHOW

## Confirmed reservation can be marked:

```text
## NO_SHOW
```

Agency can configure a waiting period before releasing the vehicle.

## Example:

```text
## No-show waiting period:
2 hours
```

---

## # 55. MODIFY RESERVATION

## Allow:

- Change pickup date/time
- Change return date/time
- Change vehicle
- Change pickup location
- Change return location

## Before saving:

```text
## RUN AVAILABILITY CHECK
```

If unavailable, reject the change and show alternatives.

Recalculate pricing when needed.

---

## # 56. RENTAL EXTENSION

## During ACTIVE rental:

```text
## EXTEND RENTAL
```

Employee selects new return date/time.

## Before approving:

```text
Check future reservations
Check maintenance
Check manual blocks
```

If conflict exists, do not automatically approve.

## If available:

```text
Calculate additional rental amount
Update reservation
Store change history
```

---

## # 57. MAINTENANCE

Vehicle can have maintenance records and maintenance blocks.

## Maintenance can be based on:

```text
## DATE
## MILEAGE
```

## Examples:

```text
Oil Change
Tires
Mechanical Repair
Technical Inspection
Insurance
Other
```

---

## # 58. MAINTENANCE BLOCKS

## Example:

```text
## Vehicle:
Dacia Duster

## Maintenance:
15 Sep 08:00
→
17 Sep 18:00
```

Vehicle must not appear available during this period.

If Owner attempts to create maintenance overlapping an existing confirmed reservation, display a warning and require the booking conflict to be resolved.

---

## # 59. MAINTENANCE ALERTS

## Examples:

```text
Oil change due in 480 km
Insurance expires in 30 days
Technical inspection due soon
Scheduled maintenance tomorrow
```

Show alerts in Dashboard.

---

## # 60. VEHICLE EXPENSES

Allow Owner to record expenses per vehicle.

## Examples:

```text
Oil Change — 650 MAD
Tires — 2,400 MAD
Repair — 1,200 MAD
Insurance — 3,500 MAD
Technical Inspection — 500 MAD
Cleaning — 150 MAD
Other — 300 MAD
```

## Expense record:

```text
vehicle_id
agency_id
category
amount
date
notes
receipt_file
created_by
```

Receipt is optional.

---

## # 61. VEHICLE HISTORY

Every vehicle should have a timeline.

## Example:

```text
12 Sep — Rental #RNT-1024
17 Sep — Returned
17 Sep — Damage Reported
18 Sep — Maintenance
20 Sep — Available
24 Sep — Rental #RNT-1058
```

---

## # 62. VEHICLE PERFORMANCE

## Owner can see:

```text
Total Rentals
Rental Days
Revenue
Direct Expenses
Net Contribution
Utilization Rate
Damage Count
```

## Use the term:

```text
## NET CONTRIBUTION
```

rather than claiming true net profit because agency-wide expenses may not be included.

---

## # 63. MAIN DASHBOARD

## Owner Dashboard should show:

```text
Total Vehicles
Available
Reserved
Rented
Maintenance

New Reservations
Today's Pickups
Today's Returns
Awaiting Phone Confirmation
```

## Owner-only financial KPIs:

```text
Revenue Today
Revenue This Month
Outstanding Payments
Security Deposits Held
```

---

## # 64. EMPLOYEE DASHBOARD

## Employee dashboard should prioritize operations:

```text
Today's Pickups
Today's Returns
Awaiting Phone Confirmation
Overdue Rentals
Active Rentals
Operational Alerts
```

Do not expose unnecessary Owner financial analytics.

---

## # 65. FLEET CALENDAR

Create a visual vehicle calendar.

## Example:

| Vehicle | Sep 7 | Sep 8 | Sep 9 | Sep 10 | Sep 11 |
|---|---|---|---|---|---|
| Dacia Duster | Rented | Rented | Available | Reserved | Reserved |
| Clio 5 | Available | Available | Rented | Rented | Rented |
| Golf 8 | Maintenance | Maintenance | Available | Available | Reserved |

## Support:

```text
## DAY
## WEEK
## MONTH
```

Clicking an event should open relevant reservation/maintenance details.

---

## # 66. TODAY'S OPERATIONS

## Dashboard section:

```text
## 09:00 — RETURN
Clio 5
## #RNT-1082

## 11:30 — PICKUP
Dacia Duster
Marrakech Airport

## 14:00 — PICKUP
Golf 8
Agency Office

## 18:00 — RETURN
Peugeot 208
Marrakech Airport
```

This section must work well on mobile.

---

## # 67. NOTIFICATIONS

Internal notification center.

## Examples:

```text
New reservation
Reservation awaiting call
Pickup today
Return today
Rental overdue
Outstanding payment
Maintenance due
Insurance expiring
```

Owner and Employee notifications should respect their permissions.

---

## # 68. WHATSAPP

V1 should NOT require complex WhatsApp Business API automation.

## Provide:

```text
## CALL CUSTOMER
## WHATSAPP CUSTOMER
```

WhatsApp button opens customer conversation with a prepared message.

## Templates can include:

```text
Reservation confirmation
Pickup reminder
Pickup instructions
Return reminder
Outstanding payment
```

Agency can enable/disable templates/reminders.

Full automatic WhatsApp Business API can be V2.

---

## # 69. REPORTS

Reports are OWNER ONLY.

## Main metrics:

```text
Revenue
Reservations
Completed Rentals
Cancelled Reservations
Average Booking Value
Fleet Utilization
Expenses
Outstanding Payments
Security Deposits Held
Returning Customers
```

---

## # 70. VEHICLE REPORTS

## Show:

```text
Best Performing Vehicles
Revenue per Vehicle
Rental Days
Utilization
Expenses
Net Contribution
Damage Count
```

---

## # 71. BOOKING ANALYTICS

## Include:

```text
Most Active Days
Most Active Months
Average Rental Duration
Cancellation Rate
Repeat Customer Rate
Most Popular Pickup Locations
Most Popular Vehicle Categories
```

---

## # 72. REPORT FILTERS

## Support:

```text
## TODAY
## THIS WEEK
## THIS MONTH
## THIS YEAR
## CUSTOM DATE RANGE
```

---

## # 73. REPORT EXPORTS

## Architecture should support:

```text
## PDF
Excel
## CSV
```

## Possible exports:

```text
Reservations
Revenue
Expenses
Vehicles
Customers
Payments
```

---

## # 74. AGENCY SETTINGS

Owner-only settings.

## Sections:

```text
Agency Information
Branding
Languages
Currency
Booking
Pricing
Locations
Delivery
Working Hours
Rental Conditions
Contract
Payments
Notifications
Team
```

---

## # 75. AGENCY INFORMATION

## Fields:

```text
Agency Name
Logo
Phone
WhatsApp
Email
Address
City
Google Maps URL optional
```

## Use these automatically in:

- Client website
- Contracts
- Documents

---

## # 76. BRANDING

## Owner can customize:

```text
Logo
Primary Color
Secondary Color
Hero Image
Agency Name
Short Description
Social Links
```

Keep the product UI architecture consistent across agencies while allowing branding customization.

---

## # 77. WORKING HOURS

Owner configures working hours per day.

## Example:

```text
Monday-Saturday
08:00-20:00

Sunday
10:00-18:00
```

Architecture should support optional out-of-hours pickup fees later.

---

## # 78. RENTAL CONDITIONS

## Owner configures:

```text
Minimum Driver Age
Minimum Licence Age
Fuel Policy
Mileage Policy
Late Return Policy
Cancellation Policy
Damage Policy
Security Deposit Policy
```

Display relevant conditions before reservation confirmation and include them in the contract.

---

## # 79. TEAM MANAGEMENT

## Owner can:

```text
Add Employee
Disable Employee
Reset Password
View Employee Activity
```

## Only:

```text
## OWNER
## EMPLOYEE
```

---

## # 80. AUDIT LOG

Record sensitive actions.

## Store:

```text
agency_id
user_id
action
entity_type
entity_id
old_value
new_value
reason
timestamp
```

## Important actions:

```text
Price Override
Reservation Cancellation
Reservation Modification
Refund
Security Deposit Deduction
Damage Charge
Payment Change
Vehicle Manual Status Change
Contract Generation
Employee Account Changes
```

---

## # 81. FINANCIAL TIMELINE

Each reservation should have a financial history.

## Example:

```text
Reservation Created
500 MAD Paid Online
2,000 MAD Paid at Pickup
3,000 MAD Security Deposit Collected
300 MAD Fuel Charge Added
2,700 MAD Security Deposit Refunded
Rental Completed
```

Never destroy historical financial events when editing totals.

---

## # 82. NOTIFICATIONS / OPERATIONAL ALERTS

## Dashboard should highlight:

```text
Overdue Rental
Awaiting Phone Confirmation
Pickup Today
Return Today
Payment Remaining
Maintenance Due
Insurance Expiring
```

Use clear visual priority without clutter.

---

## # 83. DATA MODEL — MAIN TABLES

## At minimum, plan for:

```text
agencies

users

vehicles
vehicle_images

customers
customer_documents

reservations
reservation_status_history

locations

payments
security_deposits
additional_charges

pickup_inspections
return_inspections
inspection_photos
damage_records

contracts
signatures

maintenance_blocks
maintenance_records

vehicle_expenses

notifications

audit_logs

agency_settings
```

Create additional supporting tables where proper relational design requires them.

Do not put everything into one giant table.

---

## # 84. RESERVATION MODEL

## Core fields should include:

```text
id
agency_id
booking_reference

customer_id
vehicle_id

pickup_location_id
return_location_id

pickup_datetime
return_datetime

actual_pickup_datetime
actual_return_datetime

rental_days

base_amount
pickup_fee
return_fee
extras_amount
discount_amount

calculated_total
manual_override_amount
final_total

amount_paid
amount_remaining

security_deposit_required

status

created_at
confirmed_at
cancelled_at
completed_at

created_by
updated_at
```

Use appropriate decimal/money types.

Never use floating-point arithmetic for money.

---

## # 85. FILE STORAGE

## Store:

```text
Agency Logos
Vehicle Photos
Customer Documents
Pickup Photos
Return Photos
Damage Photos
Expense Receipts
Contracts
Signatures
```

Sensitive files must require authorization.

Do not expose customer identity documents through permanent public URLs.

---

## # 86. SECURITY

## Requirements:

- Secure password hashing
- Server-side authorization
- Tenant isolation
- Protected customer documents
- Protected signed contracts
- Secure file uploads
- Input validation
- Rate limiting where appropriate
- Secure session management
- Audit logging
- Database backups
- File backups/recovery strategy

Never trust `agency_id` coming directly from the client.

Derive agency context from the authenticated session/server context whenever possible.

---

## # 87. PAYMENT SECURITY

## Never store:

```text
Full card number
## CVV
Raw payment credentials
```

Payment provider handles card information.

## Application stores only necessary information such as:

```text
Provider
Transaction ID
Amount
Currency
Status
Timestamp
```

---

## # 88. CONTRACT INTEGRITY

## Once a contract is signed:

- Preserve original contract
- Preserve signature
- Preserve signed timestamp
- Preserve contract version

Do not silently mutate signed contract contents.

Create amendments/new versions if necessary.

---

## # 89. MOBILE-FIRST OPERATIONS

The entire application must be responsive.

## These workflows must be particularly optimized for phones:

```text
Phone Confirmation
Pickup
Document Verification
Vehicle Photos
Damage Recording
Signature
Return Inspection
Payment Collection
Security Deposit Settlement
```

## Employees may perform these operations at:

- Airport
- Hotel
- Customer location
- Agency parking area

Do not design these workflows as desktop-only forms.

---

## # 90. V1 EXCLUSIONS

## DO NOT build the following unless explicitly requested:

```text
AI Damage Detection
GPS Vehicle Tracking
Native iOS App
Native Android App
Full WhatsApp Business API Automation
AI Dynamic Pricing
Multi-agency Marketplace
Full Accounting Software
Complex CRM Marketing Automation
```

The architecture can allow future expansion, but these features are outside V1.

---

## # 91. BUILD ORDER

Implement in this order.

## ## PHASE 1 — FOUNDATION

```text
Project setup
Database
Prisma schema
Multi-agency architecture
Authentication
Owner/Employee permissions
```

## ## PHASE 2 — FLEET

```text
Vehicle CRUD
Vehicle images
Vehicle status
Vehicle profile
```

## ## PHASE 3 — PRICING & LOCATIONS

```text
Locations
Pickup/return fees
Pricing settings
Security deposits
Billing rules
Pricing engine
```

## ## PHASE 4 — AVAILABILITY

```text
Availability engine
Reservation overlap protection
Maintenance blocks
Manual blocks
Buffer time
Fleet calendar
```

## ## PHASE 5 — CLIENT WEBSITE

```text
Homepage
Search
Available Cars
Filters
Car Details
Booking
Customer Information
Confirmation
My Booking
```

## ## PHASE 6 — RESERVATIONS

```text
Reservation Dashboard
Awaiting Confirmation
Phone Confirmation
Confirm
Cancel
Modify Reservation
No-Show
Rental Extension
```

## ## PHASE 7 — CUSTOMER CRM

```text
Customer Profiles
Rental History
Notes
Flags
Blacklist
```

## ## PHASE 8 — PICKUP

```text
Document Verification
Pickup Checklist
Mileage
Fuel
Before Photos
Existing Damage
Payments
Security Deposit
```

## ## PHASE 9 — CONTRACTS

```text
Contract Generation
Contract Settings
## PDF
Electronic Signature
Signed Contract Storage
```

## ## PHASE 10 — ACTIVE RENTAL & RETURN

```text
Active Rental
Return Inspection
After Photos
Mileage
Fuel
Damage
Late Return
Additional Charges
```

## ## PHASE 11 — FINANCIALS

```text
Payments
Partial Payments
Security Deposit
Refunds
Additional Charges
Financial Timeline
```

## ## PHASE 12 — MAINTENANCE

```text
Maintenance Records
Maintenance Blocks
Mileage Reminders
Date Reminders
Insurance
Technical Inspection
Expenses
```

## ## PHASE 13 — REPORTING

```text
Revenue
Expenses
Vehicle Performance
Fleet Utilization
Bookings
Customers
Payments
Exports
```

## ## PHASE 14 — AGENCY CUSTOMIZATION

```text
Agency Settings
Branding
Languages
Working Hours
Rental Policies
Team Management
```

## ## PHASE 15 — COMMUNICATION

```text
Notifications
Operational Alerts
Call Customer
WhatsApp Customer
Message Templates
```

## ## PHASE 16 — QA & SECURITY

## Test:

```text
Tenant isolation
Double booking
Concurrent booking attempts
Pricing calculations
Date/time edge cases
Reservation modifications
Rental extensions
Permissions
Payment calculations
Deposit calculations
Contract integrity
Private documents
Mobile pickup workflow
Mobile return workflow
```

---

## # 92. CRITICAL DOUBLE-BOOKING TEST

This test MUST pass.

## Scenario:

```text
## Customer A searches:
Dacia Duster
12 Sep 10:00 → 15 Sep 10:00

## Customer B searches:
Same vehicle
Same dates
```

Both may initially see the vehicle if searches happen simultaneously.

Customer A completes reservation first.

## When Customer B attempts final confirmation:

```text
## FINAL AVAILABILITY CHECK
```

must fail.

## Customer B receives:

```text
This vehicle is no longer available for the selected period.
```

Then show available alternatives.

There must never be two successful overlapping reservations.

---

## # 93. DATE/TIME REQUIREMENTS

Do not treat rental dates as date-only values.

## Use:

```text
## DATE + TIME
```

## because:

```text
12 Sep 10:00
```

## and:

```text
12 Sep 18:00
```

have different operational meaning.

Store timestamps consistently and display them using the agency's configured timezone.

---

## # 94. MONEY REQUIREMENTS

Never use JavaScript floating-point calculations directly for financial totals.

Use proper decimal/money handling.

All calculations must be deterministic and testable.

## Store:

```text
currency
```

where financially appropriate.

## Default:

```text
## MAD
```

---

## # 95. UX PRINCIPLES

## Client website:

- Visual
- Fast
- Mobile-first
- Minimal booking friction
- Clear pricing
- Clear security deposit
- Strong vehicle photography
- Simple navigation

## Agency Dashboard:

- Operational
- Information-dense without clutter
- Fast
- Mobile responsive
- Clear status colors
- Easy search
- Easy filters
- Few clicks for common actions

Do not hide critical operational information behind unnecessary menus.

---

## # 96. DASHBOARD PRIORITY

When Employee opens Dashboard, within a few seconds they should understand:

```text
What needs pickup today?
What needs return today?
Which customers need phone confirmation?
Which rentals are overdue?
Which cars have operational problems?
```

When Owner opens Dashboard, they should additionally understand:

```text
How is the business performing?
How much revenue was generated?
What money is outstanding?
Which vehicles are performing best?
What maintenance/expenses require attention?
```

---

## # 97. IMPORTANT BUSINESS RULES

## Do not change these rules without explicit instruction:

1. Customer documents are collected at pickup, not during online booking.
2. Reservation blocks vehicle dates immediately.
3. Reservation initially becomes `AWAITING_CONFIRMATION`.
4. Agency calls customer manually.
5. Employee/Owner confirms or cancels reservation.
6. Online payment is optional per agency.
7. Security deposit is configurable per vehicle.
8. Security deposit is separate from revenue.
9. Owner controls pricing.
10. Owner can manually override reservation pricing.
11. Availability is date/time based.
12. Availability must consider reservations, maintenance, manual blocks and buffer time.
13. Final availability check is mandatory before reservation creation.
14. Only OWNER and EMPLOYEE roles exist.
15. Signed contracts cannot be silently modified.
16. Customer data is isolated per agency.
17. Employees do not receive full Owner financial/settings access.
18. Customer accounts are not required in V1.
19. My Booking uses booking reference + phone number.
20. Vehicle documents and customer documents must remain protected.

---

## # 98. DEVELOPMENT RULES

## Before implementing a major feature:

1. Understand the existing architecture.
2. Reuse existing components where appropriate.
3. Do not duplicate business logic.
4. Put critical business logic into reusable server-side services/modules.
5. Validate all sensitive operations server-side.
6. Keep TypeScript strongly typed.
7. Avoid `any` unless genuinely necessary.
8. Keep components reasonably small.
9. Keep database queries tenant-scoped.
10. Add proper loading, empty and error states.

Do not create fake functionality that only works visually.

Buttons and workflows included in V1 must actually function.

---

## # 99. TESTING REQUIREMENTS

## Create tests for critical business logic, especially:

```text
Availability overlap
Buffer time
Concurrent booking
Pricing
Rental duration
Grace period
Hourly charges
Security deposit
Partial payments
Refunds
Reservation modification
Rental extension
Maintenance conflicts
Tenant isolation
Permissions
```

Test edge cases around midnight, month boundaries and rental time changes.

---

## # 100. FINAL PRODUCT GOAL

## The finished V1 should allow a real rental agency to:

```text
Add its fleet
↓
Configure pricing
↓
Configure locations
↓
Launch branded client website
↓
Receive reservations
↓
Call customers
↓
Confirm reservations
↓
Manage calendar
↓
Handle pickup
↓
Verify documents
↓
Inspect vehicle
↓
Collect payments/deposit
↓
Generate/sign rental contract
↓
Track active rental
↓
Handle return
↓
Compare before/after
↓
Charge additional fees
↓
Refund/retain security deposit
↓
Record maintenance and expenses
↓
View reports
```

The goal is NOT to create a generic car rental demo.

The goal is to create a **production-oriented car rental operations SaaS** that a real agency can use every day.

---

## # 101. IMPLEMENTATION INSTRUCTION TO CLAUDE

Do not immediately attempt to build the entire application in one giant pass.

## First:

1. Read this specification completely.
2. Inspect the existing repository if one exists.
3. Produce the proposed project architecture.
4. Produce the Prisma/database schema.
5. Identify security-critical areas.
6. Identify assumptions or conflicts with the current codebase.
7. Create an implementation checklist based on the phases above.
8. Then begin Phase 1.

Do not change the approved business rules because another approach seems easier to implement.

If an implementation detail is unclear but does not affect the approved business logic, choose a sensible production-ready implementation.

If a decision would materially change the approved workflow, stop and surface the decision before implementing it.

Build the system incrementally, keeping it runnable after each major phase.

## # END OF MASTER SPECIFICATION