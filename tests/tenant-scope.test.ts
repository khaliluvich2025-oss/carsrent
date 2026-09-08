import { describe, expect, it } from "vitest";

import {
  applyTenantScope,
  TENANT_SCOPED_MODELS,
  UNSCOPED_MODELS,
  UnclassifiedModelError,
} from "@/server/tenant-scope";

const AGENCY_A = "agency_a";
const AGENCY_B = "agency_b";

type Row = Record<string, unknown>;
type Args = {
  where?: Row;
  data?: Row | Row[];
  create?: Row;
};

describe("tenant scoping", () => {
  it("narrows reads to the tenant", () => {
    const out = applyTenantScope(
      "Vehicle",
      "findMany",
      { where: { isActive: true } },
      AGENCY_A,
    ) as Args;

    expect(out.where).toEqual({ isActive: true, agencyId: AGENCY_A });
  });

  it("adds a where clause even when the caller supplied none", () => {
    const out = applyTenantScope("Reservation", "findMany", {}, AGENCY_A) as Args;
    expect(out.where).toEqual({ agencyId: AGENCY_A });
  });

  it("scopes findUnique, which is the easiest place to leak a row by id", () => {
    const out = applyTenantScope(
      "Reservation",
      "findUnique",
      { where: { id: "res_1" } },
      AGENCY_A,
    ) as Args;

    expect(out.where).toEqual({ id: "res_1", agencyId: AGENCY_A });
  });

  it("overrides an agencyId supplied by the caller rather than trusting it", () => {
    const out = applyTenantScope(
      "Customer",
      "findMany",
      { where: { agencyId: AGENCY_B } },
      AGENCY_A,
    ) as Args;

    expect(out.where?.agencyId).toBe(AGENCY_A);
  });

  it("scopes update and delete", () => {
    for (const operation of ["update", "delete", "updateMany", "deleteMany"]) {
      const out = applyTenantScope(
        "Vehicle",
        operation,
        { where: { id: "veh_1" } },
        AGENCY_A,
      ) as Args;
      expect(out.where?.agencyId).toBe(AGENCY_A);
    }
  });

  it("stamps the tenant onto creates", () => {
    const out = applyTenantScope(
      "Vehicle",
      "create",
      { data: { brand: "Dacia", model: "Duster" } },
      AGENCY_A,
    ) as Args;

    expect(out.data).toEqual({
      brand: "Dacia",
      model: "Duster",
      agencyId: AGENCY_A,
    });
  });

  it("stamps every row of a createMany", () => {
    const out = applyTenantScope(
      "Location",
      "createMany",
      { data: [{ name: "Airport" }, { name: "Office" }] },
      AGENCY_A,
    ) as Args;

    expect(out.data).toEqual([
      { name: "Airport", agencyId: AGENCY_A },
      { name: "Office", agencyId: AGENCY_A },
    ]);
  });

  it("overrides an agencyId supplied in create data", () => {
    const out = applyTenantScope(
      "Vehicle",
      "create",
      { data: { brand: "Dacia", agencyId: AGENCY_B } },
      AGENCY_A,
    ) as Args;

    expect((out.data as Row).agencyId).toBe(AGENCY_A);
  });

  it("leaves a nested agency connect alone instead of conflicting with it", () => {
    const out = applyTenantScope(
      "Vehicle",
      "create",
      { data: { brand: "Dacia", agency: { connect: { id: AGENCY_A } } } },
      AGENCY_A,
    ) as Args;

    expect(out.data).not.toHaveProperty("agencyId");
  });

  it("scopes both halves of an upsert", () => {
    const out = applyTenantScope(
      "AgencySettings",
      "upsert",
      { where: { id: "s1" }, create: { bufferMinutes: 120 }, update: {} },
      AGENCY_A,
    ) as Args;

    expect(out.where?.agencyId).toBe(AGENCY_A);
    expect(out.create?.agencyId).toBe(AGENCY_A);
  });

  it("passes untouched models through", () => {
    const args = { where: { slug: "atlas-cars" } };
    expect(applyTenantScope("Agency", "findUnique", args, AGENCY_A)).toBe(args);
    expect(applyTenantScope("Session", "findUnique", args, AGENCY_A)).toBe(args);
  });

  it("fails closed on a model nobody classified", () => {
    expect(() =>
      applyTenantScope("SomeNewModel", "findMany", {}, AGENCY_A),
    ).toThrow(UnclassifiedModelError);
  });

  it("refuses to run without a tenant", () => {
    expect(() => applyTenantScope("Vehicle", "findMany", {}, "")).toThrow();
  });

  it("classifies every model exactly once", () => {
    const overlap = [...TENANT_SCOPED_MODELS].filter((m) =>
      UNSCOPED_MODELS.has(m),
    );
    expect(overlap).toEqual([]);
  });
});
