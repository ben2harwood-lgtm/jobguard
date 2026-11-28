import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { CaptureApplication } from "./capture.application.js";

// HEAD_UNDER_TEST=bfac404e2058da7759001cc0321c859f393a7ca1.
// Unit evidence only. The separate RT-08 PostgreSQL suite exercises valid-shape
// forged, expired and revoked credentials, ownership and actual persistence.
const noDatabase = new Proxy({} as Pool, {
  get() { throw new Error("Malformed credentials must be refused before database access"); },
});
beforeAll(() => vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"));
afterAll(() => vi.unstubAllEnvs());
describe("RT-08 malformed session fails closed before payload handling (unit boundary)", () => {
  for (const [label, token] of [["missing", undefined], ["empty", ""], ["non-UUID", "forged"], ["cookie injection", "jg_session=forged; tenant=other"]] as const) {
    it.each(["capture", "view", "save", "confirm", "discard"] as const)(`RT-08-019/${label}/%s`, async operation => {
      const app = new CaptureApplication(noDatabase, token);
      const job = "00000000-0000-4000-8000-000000000001";
      const run = operation === "capture" ? app.capture(null) : operation === "view" ? app.view(job)
        : operation === "save" ? app.save(job, null) : operation === "confirm" ? app.confirm(job, null) : app.discard(job, null);
      await expect(run).rejects.toMatchObject({ code: "UNAUTHENTICATED", message: "UNAUTHENTICATED" });
    });
  }
});
