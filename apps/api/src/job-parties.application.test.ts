import { afterEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { JobPartiesApplication } from "./job-parties.application.js";
import { SYNTHETIC_SESSION } from "./workspace/workspace-session.js";
const job = "11111111-1111-4111-8111-111111111111";
afterEach(() => vi.unstubAllEnvs());
describe("CH-3a application boundary", () => {
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
