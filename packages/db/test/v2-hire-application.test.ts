import type { Pool } from "pg";
import { afterEach, expect, it, vi } from "vitest";
import { HireApplication } from "../../../apps/api/src/workspace/hire.application.js";
// Mode-only unit proof. Real SQL authorization and persistence are exercised in the V2 seed suite.
vi.mock("@jobguard/db", () => ({
  HireRepository: class {},
  PracticeAccessError: class extends Error { constructor(readonly code: string) { super(code); } },
}));
const connect = vi.fn(() => { throw new Error("Must refuse before accessing data"); });
const pool = { connect } as unknown as Pool;
afterEach(() => { vi.unstubAllEnvs(); connect.mockClear(); });
for (const [local, mode] of [["0", "synthetic_demo"], ["1", "pilot_no_charge"], ["1", "production_billing"]]) {
  it(`refuses hire reads and commands before database access in ${local}/${mode}`, async () => {
    vi.stubEnv("JOBGUARD_LOCAL_V2", local); vi.stubEnv("JOBGUARD_ENV", mode);
    const app = new HireApplication(pool, "untrusted-cookie");
    await expect(app.list("job")).rejects.toMatchObject({ code: "SYNTHETIC_MODE_REQUIRED" });
    await expect(app.command("job", {})).rejects.toMatchObject({ code: "SYNTHETIC_MODE_REQUIRED" });
    expect(connect).not.toHaveBeenCalled();
  });
}
it("requires a signed-in session before data access", async () => {
  vi.stubEnv("JOBGUARD_LOCAL_V2", "1"); vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  await expect(new HireApplication(pool).list("job")).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  expect(connect).not.toHaveBeenCalled();
});
