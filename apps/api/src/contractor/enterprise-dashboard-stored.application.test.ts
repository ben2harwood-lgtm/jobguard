import type { Pool } from "pg";
import { afterEach, expect, it, vi } from "vitest";
import { EnterpriseBaselineApplication } from "./enterprise-baseline.application.js";
import { EnterpriseDashboardApplication } from "./enterprise-dashboard.application.js";
const pool = new Proxy({}, { get() { throw new Error("database accessed"); } }) as Pool;
const baseline = new EnterpriseBaselineApplication(pool), dashboard = new EnterpriseDashboardApplication(pool);
afterEach(() => vi.unstubAllEnvs());
it("stored import, baseline reads and billed/paid reads reject live modes before touching data", async () => {
  for (const mode of ["production", "pilot_no_charge", "test", ""]) {
    vi.stubEnv("JOBGUARD_ENV", mode);
    await expect(baseline.import({}, {})).rejects.toMatchObject({ code: "MODE_FORBIDDEN" });
    await expect(baseline.read({}, {})).rejects.toMatchObject({ code: "MODE_FORBIDDEN" });
    await expect(dashboard.readBilling({}, {})).rejects.toMatchObject({ code: "MODE_FORBIDDEN" });
  }
});
it("stored operations reject caller-supplied identity/tenant authority before pool access", async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  for (const principal of [{ sessionId: "invalid" }, { sessionId: "00000000-0000-4000-8000-000000000001", tenantId: "caller" }]) {
    await expect(baseline.import(principal, {})).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(baseline.read(principal, {})).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(dashboard.readBilling(principal, {})).rejects.toMatchObject({ code: "NOT_FOUND" });
  }
});
