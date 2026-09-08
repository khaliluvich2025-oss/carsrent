import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  TENANT_SCOPED_MODELS,
  UNSCOPED_MODELS,
} from "@/server/tenant-scope";

/**
 * Drift guard.
 *
 * The tenant-scoping extension fails closed on unknown models, which means a new
 * model added to the schema would blow up at runtime the first time anyone
 * queried it. This test moves that failure to CI, and — more importantly —
 * catches the opposite mistake: a model that HAS an `agencyId` but was filed as
 * unscoped, which would silently leak across tenants.
 */

const schema = readFileSync(
  fileURLToPath(new URL("../prisma/schema.prisma", import.meta.url)),
  "utf8",
);

type ModelInfo = { name: string; hasAgencyId: boolean };

function parseModels(source: string): ModelInfo[] {
  const models: ModelInfo[] = [];
  const modelPattern = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;

  for (const match of source.matchAll(modelPattern)) {
    const [, name, body] = match;
    models.push({
      name,
      hasAgencyId: /^\s*agencyId\s+String/m.test(body),
    });
  }

  return models;
}

const models = parseModels(schema);

describe("tenant-scope classification covers the schema", () => {
  it("finds the models", () => {
    expect(models.length).toBeGreaterThan(30);
  });

  it.each(models.map((m) => [m.name, m.hasAgencyId] as const))(
    "%s is classified",
    (name) => {
      const classified =
        TENANT_SCOPED_MODELS.has(name) || UNSCOPED_MODELS.has(name);
      expect(classified, `${name} is missing from src/server/tenant-scope.ts`).toBe(
        true,
      );
    },
  );

  it("files every model that has an agencyId as tenant-scoped", () => {
    const misfiled = models
      .filter((m) => m.hasAgencyId && !TENANT_SCOPED_MODELS.has(m.name))
      .map((m) => m.name);

    expect(misfiled).toEqual([]);
  });

  it("does not claim a model is tenant-scoped when it has no agencyId", () => {
    const wrong = models
      .filter((m) => !m.hasAgencyId && TENANT_SCOPED_MODELS.has(m.name))
      .map((m) => m.name);

    expect(wrong).toEqual([]);
  });
});
