import { Pool } from "pg";
import { expect, it, vi } from "vitest";
import { bootstrapSyntheticDemo } from "../src/demo-bootstrap.js";
import { assertPilotConnection } from "../src/pilot-connection.js";

const pilot = "postgresql://jobguard_runtime:fictional@pilot.invalid/jobguard_pilot";
const synthetic = "postgresql://jobguard_runtime:fictional@practice.invalid/jobguard_synthetic_demo";

it("refuses an authenticated database or role mismatch before the pilot caller proceeds", async () => {
  const query = vi.fn().mockResolvedValueOnce({ rows: [{ safe: false }] }).mockResolvedValueOnce({ rows: [{ safe: true }] });
  const pool = { query } as unknown as Pool;
  await expect(assertPilotConnection(pool, pilot)).rejects.toThrow("PILOT_DATABASE_BINDING_REFUSED");
  await expect(assertPilotConnection(pool, pilot)).resolves.toBeUndefined();
  expect(query).toHaveBeenCalledWith(expect.any(String), ["jobguard_pilot", "jobguard_runtime"]);
});

it("refuses seed destinations in both directions before opening a connection", async () => {
  const connect = vi.spyOn(Pool.prototype, "connect");
  try {
    vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
    for (const destination of [pilot, `${synthetic}?database=jobguard_pilot`]) {
      await expect(bootstrapSyntheticDemo({ ownerUrl: destination, runtimeUrl: synthetic }))
        .rejects.toMatchObject({ code: "DEMO_BOOTSTRAP_TARGET_FORBIDDEN" });
      await expect(bootstrapSyntheticDemo({ ownerUrl: synthetic, runtimeUrl: destination }))
        .rejects.toMatchObject({ code: "DEMO_BOOTSTRAP_TARGET_FORBIDDEN" });
    }
    vi.stubEnv("JOBGUARD_ENV", "pilot_no_charge");
    await expect(bootstrapSyntheticDemo({ ownerUrl: synthetic, runtimeUrl: synthetic }))
      .rejects.toMatchObject({ code: "DEMO_BOOTSTRAP_TARGET_FORBIDDEN" });
    expect(connect).not.toHaveBeenCalled();
  } finally {
    connect.mockRestore();
    vi.unstubAllEnvs();
  }
});
