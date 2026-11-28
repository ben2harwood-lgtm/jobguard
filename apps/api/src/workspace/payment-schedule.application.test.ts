import { afterEach, expect, it, vi } from "vitest";
import { PaymentScheduleApplication } from "./payment-schedule.application.js";
import type { Pool } from "pg";
const pool = { query: vi.fn(() => { throw new Error("database must not be reached"); }) } as unknown as Pool;
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
it.each([undefined, "0"])("V2 schedule is unavailable without the exact flag (%s)", async flag => {
  if (flag) vi.stubEnv("JOBGUARD_LOCAL_V2", flag); else vi.stubEnv("JOBGUARD_LOCAL_V2", undefined);
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  const app = new PaymentScheduleApplication(pool);
  await expect(app.read("irrelevant")).rejects.toMatchObject({code:"SYNTHETIC_MODE_REQUIRED"});
  await expect(app.set("irrelevant", {})).rejects.toMatchObject({code:"SYNTHETIC_MODE_REQUIRED"});
  expect(pool.query).not.toHaveBeenCalled();
});
it.each(["production_billing", "pilot_no_charge"])("V2 flag cannot enable the schedule in %s", async mode => {
  vi.stubEnv("JOBGUARD_LOCAL_V2", "1"); vi.stubEnv("JOBGUARD_ENV", mode);
  await expect(new PaymentScheduleApplication(pool).set("irrelevant", {})).rejects.toMatchObject({code:"SYNTHETIC_MODE_REQUIRED"});
  expect(pool.query).not.toHaveBeenCalled();
});
it("requires an authenticated session before reading or writing", async () => {
  vi.stubEnv("JOBGUARD_LOCAL_V2", "1"); vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  const app = new PaymentScheduleApplication(pool);
  await expect(app.read("irrelevant")).rejects.toMatchObject({code:"UNAUTHENTICATED"});
  await expect(app.set("irrelevant", {})).rejects.toMatchObject({code:"UNAUTHENTICATED"});
  expect(pool.query).not.toHaveBeenCalled();
});
it.each(["v2-stage-draft-command.v1", "v2-stage-draft-withdraw-command.v1"])("K5B-1 %s keeps the schedule's gates", async version => {
  vi.stubEnv("JOBGUARD_LOCAL_V2", undefined); vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  await expect(new PaymentScheduleApplication(pool, "session").set("irrelevant", { version })).rejects.toMatchObject({code:"SYNTHETIC_MODE_REQUIRED"});
  vi.stubEnv("JOBGUARD_LOCAL_V2", "1");
  await expect(new PaymentScheduleApplication(pool).set("irrelevant", { version })).rejects.toMatchObject({code:"UNAUTHENTICATED"});
  expect(pool.query).not.toHaveBeenCalled();
});
