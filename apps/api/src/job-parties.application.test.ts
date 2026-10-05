import { afterEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { JobPartiesApplication } from "./job-parties.application.js";
import { SYNTHETIC_SESSION } from "./workspace/workspace-session.js";
const job = "11111111-1111-4111-8111-111111111111";
afterEach(() => vi.unstubAllEnvs());
describe("CH-3a application boundary", () => {
  it.each(["Second\nThird", "Second\rThird", "Second\r\nThird"])("rejects an address line containing CR/LF with INVALID_PARTIES before persistence: %j", async line => {
    const connect = vi.fn().mockRejectedValue(new Error("unexpected persistence"));
    const app = new JobPartiesApplication({ connect } as unknown as Pool);
    vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
    const run = async () => app.command({ sessionId: SYNTHETIC_SESSION }, job, {
      version: "job-parties-command.v1", commandId: "22222222-2222-4222-8222-222222222222", action: "create_site",
      site: { version: "site.v1", addressLines: ["First line", line], town: "London", postcode: "SW1A 1AA" },
    });
    await expect(run()).rejects.toMatchObject({ code: "INVALID_PARTIES" });
    expect(connect).not.toHaveBeenCalled();
  });
  it("rejects unauthenticated, non-member and production callers before opening a connection", () => {
    const connect = vi.fn(), app = new JobPartiesApplication({ connect } as unknown as Pool);
    vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
    expect(() => app.view(null, job)).toThrow("FORBIDDEN");
    expect(() => app.view({ sessionId: SYNTHETIC_SESSION, requestedTenantId: "33333333-3333-4333-8333-333333333333" }, job)).toThrow("FORBIDDEN");
    expect(() => app.command({ sessionId: SYNTHETIC_SESSION }, "wrong", {})).toThrow("NOT_FOUND");
    vi.stubEnv("JOBGUARD_ENV", "production_billing");
    expect(() => app.command({ sessionId: SYNTHETIC_SESSION }, job, { environment: "synthetic_demo" })).toThrow("FORBIDDEN");
    expect(connect).not.toHaveBeenCalled();
  });
});
