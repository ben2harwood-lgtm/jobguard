import { afterEach, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { EnterpriseDashboardApplication } from "./enterprise-dashboard.application.js";
const oldMode = process.env.JOBGUARD_ENV;
afterEach(() => { if (oldMode === undefined) delete process.env.JOBGUARD_ENV; else process.env.JOBGUARD_ENV = oldMode; });
describe("ENT-9B application boundary", () => {
  it("[E9-30] refuses every non-synthetic mode before any pool access", async () => {
    const pool = new Proxy({}, { get() { throw new Error("database accessed"); } }) as Pool;
    for (const mode of ["pilot_no_charge", "production", "test", ""]) {
      process.env.JOBGUARD_ENV = mode;
      await expect(new EnterpriseDashboardApplication(pool).read({}, {})).rejects.toMatchObject({ code: "MODE_FORBIDDEN" });
    }
  });
  it("[E9-29] refuses unexpected principal authority fields before database access", async () => {
    process.env.JOBGUARD_ENV = "synthetic_demo";
    const pool = new Proxy({}, { get() { throw new Error("database accessed"); } }) as Pool;
    await expect(new EnterpriseDashboardApplication(pool).read({ sessionId: "invalid", tenantId: "invalid" }, {})).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
