import { afterEach, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { V2JobProfitRepository } from "@jobguard/db";
import { PracticeAccess } from "../practice-access.js";
import { V2JobProfitApplication } from "./v2-job-profit.application.js";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
it.each([["0", "synthetic_demo"], ["1", "pilot_no_charge"], ["1", "production_billing"]])(
  "refuses outside local synthetic V2 (%s, %s) before authentication or DB reads", async (local, mode) => {
    vi.stubEnv("JOBGUARD_LOCAL_V2", local); vi.stubEnv("JOBGUARD_ENV", mode);
    const authorize = vi.spyOn(PracticeAccess.prototype, "job");
    await expect(new V2JobProfitApplication({} as Pool, "fake").read("fake")).rejects.toMatchObject({ code: "SYNTHETIC_MODE_REQUIRED" });
    expect(authorize).not.toHaveBeenCalled();
  });
it("refuses unauthorized sessions before reading money", async () => {
  vi.stubEnv("JOBGUARD_LOCAL_V2", "1"); vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  vi.spyOn(PracticeAccess.prototype, "job").mockRejectedValue(new Error("NOT_FOUND"));
  const read = vi.spyOn(V2JobProfitRepository.prototype, "read");
  await expect(new V2JobProfitApplication({} as Pool).read("fake")).rejects.toThrow("NOT_FOUND");
  expect(read).not.toHaveBeenCalled();
});
