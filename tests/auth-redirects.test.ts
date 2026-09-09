import { describe, expect, it } from "vitest";

import {
  agencySlugFromPath,
  landingPath,
  signInPath,
} from "@/server/auth/redirects";

describe("signInPath", () => {
  it("sends an unauthenticated visitor to their own agency's sign-in page", () => {
    // The bug this replaces: everyone went to a platform-wide /login that does
    // not exist, so a signed-out owner hit a 404 with no way back in.
    expect(signInPath("/atlas-cars/dashboard")).toBe(
      "/atlas-cars/login?next=%2Fatlas-cars%2Fdashboard",
    );
  });

  it("keeps the whole path so the visitor resumes where they stopped", () => {
    expect(signInPath("/atlas-cars/dashboard/settings/team")).toBe(
      "/atlas-cars/login?next=%2Fatlas-cars%2Fdashboard%2Fsettings%2Fteam",
    );
  });

  it("does not point the login page back at itself", () => {
    expect(signInPath("/atlas-cars/login")).toBe("/atlas-cars/login");
  });

  it("falls back to the root when the path names no agency", () => {
    expect(signInPath("/")).toBe("/");
    expect(signInPath("")).toBe("/");
    expect(signInPath("/login")).toBe("/");
  });
});

describe("agencySlugFromPath", () => {
  it("reads the first segment", () => {
    expect(agencySlugFromPath("/atlas-cars/dashboard")).toBe("atlas-cars");
  });

  it("rejects anything that is not slug-shaped", () => {
    expect(agencySlugFromPath("/Atlas_Cars/dashboard")).toBeNull();
    expect(agencySlugFromPath("/-leading-dash/x")).toBeNull();
    expect(agencySlugFromPath("//evil.example")).toBeNull();
  });
});

describe("landingPath", () => {
  it("returns the requested page when it belongs to the same agency", () => {
    expect(landingPath("atlas-cars", "/atlas-cars/dashboard/reports")).toBe(
      "/atlas-cars/dashboard/reports",
    );
  });

  it("defaults to the dashboard when nothing was requested", () => {
    expect(landingPath("atlas-cars", "")).toBe("/atlas-cars/dashboard");
  });

  it("refuses to send anyone into another tenant", () => {
    expect(landingPath("atlas-cars", "/rival-cars/dashboard")).toBe(
      "/atlas-cars/dashboard",
    );
  });

  it("refuses off-site destinations", () => {
    for (const hostile of [
      "//evil.example/atlas-cars/",
      "https://evil.example/atlas-cars/dashboard",
      "/atlas-cars/\\evil.example",
    ]) {
      expect(landingPath("atlas-cars", hostile)).toBe("/atlas-cars/dashboard");
    }
  });

  it("does not bounce straight back to the login page", () => {
    expect(landingPath("atlas-cars", "/atlas-cars/login")).toBe(
      "/atlas-cars/dashboard",
    );
  });
});
