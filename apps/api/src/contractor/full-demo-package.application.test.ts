// Practice sandbox — synthetic data; nothing is sent or charged
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { EnterpriseDashboardError, projectEnterpriseDashboard, enterpriseSignals } from "@jobguard/core";
import { EnterpriseDashboardApplication } from "./enterprise-dashboard.application.js";
import { FullDemoPackageApplication } from "./full-demo-package.application.js";
const principal = { sessionId: "00000000-0000-4000-8000-000000000001" };
const dashboard = { version: "enterprise-dashboard-query.v1", from: "2026-01-01T00:00:00Z", until: "2027-01-01T00:00:00Z", dimension: "team", filters: {}, offset: 0, limit: 20 };
const query = { version: "full-demo-package-query.v1", dashboard };
const label = "Practice sandbox — synthetic data; nothing is sent or charged";
const pool = new Proxy({}, { get() { throw new Error("unexpected database access"); } }) as Pool;
const observed = () => ({ report: projectEnterpriseDashboard({ version: "enterprise-dashboard-facts.v1", cutoff: "2026-10-18T00:00:00Z", extras: [], billing: { status: "held", prerequisite: "ENT-6B" } }, dashboard), signals: enterpriseSignals({ version: "enterprise-signal-facts.v1", extras: [], orderLines: [], billedVariations: [], closeouts: [], outlierPolicy: null }) });
beforeEach(() => vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
it("A01 rejects mode and authority overrides", async () => {
  const read = vi.spyOn(EnterpriseDashboardApplication.prototype, "read");
  const app = new FullDemoPackageApplication(pool);
  for (const field of ["environment", "mode", "tenantId", "actorId", "permission", "price", "settlement"]) {
    await expect(app.read(principal, { ...query, [field]: "override" })).rejects.toMatchObject({ code: "DASHBOARD_INVALID" });
    await expect(app.read({ ...principal, [field]: "override" }, query)).rejects.toMatchObject({ code: "NOT_FOUND" });
  }
  await expect(app.read(principal, { ...query, dashboard: { ...dashboard, filters: { jobId: principal.sessionId } } })).rejects.toMatchObject({ code: "DASHBOARD_INVALID" });
  for (const mode of ["production", "pilot_no_charge", "test", ""]) {
    vi.stubEnv("JOBGUARD_ENV", mode);
    await expect(app.read(principal, query)).rejects.toMatchObject({ code: "MODE_FORBIDDEN" });
  }
  expect(read).not.toHaveBeenCalled();
});
it("A02 preserves held money stages as null", async () => {
  vi.spyOn(EnterpriseDashboardApplication.prototype, "read").mockResolvedValue(observed());
  const result = await new FullDemoPackageApplication(pool).read(principal, query);
  expect(result.observations.value.report.totals).toMatchObject({ billed: null, paid: null });
  expect(result.held).toEqual([
    { stage: "export", status: "held", prerequisite: "ENT-6B" },
    { stage: "billing", status: "held", prerequisite: "ENT-6B" },
    { stage: "payment", status: "held", prerequisite: "ENT-6B" },
    { stage: "statement", status: "held", prerequisite: "ENT-7-P" },
  ]);
});
it("A03 delegates current authorization without fallback", async () => {
  const read = vi.spyOn(EnterpriseDashboardApplication.prototype, "read");
  const app = new FullDemoPackageApplication(pool);
  read.mockResolvedValueOnce(observed());
  await app.read(principal, query);
  for (const code of ["NOT_FOUND", "DASHBOARD_UNAVAILABLE"] as const) {
    const error = new EnterpriseDashboardError(code); read.mockRejectedValueOnce(error);
    await expect(app.read(principal, query)).rejects.toBe(error);
  }
  expect(read).toHaveBeenCalledTimes(3);
  expect(read).toHaveBeenLastCalledWith(principal, dashboard);
});
it("A04 emits sandbox and evidence classifications", async () => {
  const value = observed();
  vi.spyOn(EnterpriseDashboardApplication.prototype, "read").mockResolvedValue(value);
  const result = await new FullDemoPackageApplication(pool).read(principal, query);
  expect(result).toMatchObject({ version: "full-demo-package.v1", label, environment: "synthetic_demo", observations: { classification: "persisted_observation", value } });
  expect(result.observations.value).toBe(value);
  expect(result).not.toHaveProperty("baseline");
  expect(JSON.stringify(result)).not.toContain(principal.sessionId);
});
