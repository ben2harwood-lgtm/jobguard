import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DEMO_IDENTITY_USER_ID, DEMO_MEMBERSHIP_ID, DEMO_TENANT_ID } from "@jobguard/db";
import { BusinessValueApplication } from "./value-business.controller.js";

// Only authentication is doubled. No fixture pretends to be a business source.
function fixture() {
 const query = vi.fn().mockResolvedValue({ rows: [{ tenant_id: DEMO_TENANT_ID, membership_id: DEMO_MEMBERSHIP_ID, identity_user_id: DEMO_IDENTITY_USER_ID }] });
 const connect = vi.fn(() => { throw new Error("No business reads while bindings are held"); });
 const pool = { query, connect } as unknown as Pool;
 return { query, connect, app: new BusinessValueApplication(pool, randomUUID()) };
}
beforeEach(() => vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"));
afterEach(() => vi.unstubAllEnvs());
it("CH9-B01/B06 held company binding authenticates before refusing; no tenant-wide aggregate", async () => {
 const { app, query, connect } = fixture();
 expect(await app.readBusiness({})).toEqual({ version: "business-value-result.v1", state: "unavailable", code: "BUSINESS_VALUE_BINDING_HELD" });
 expect(query).toHaveBeenCalledExactlyOnceWith("SELECT * FROM app.authenticate_practice_session($1)", [expect.stringMatching(/^[a-f0-9]{64}$/u)]);
 expect(connect).not.toHaveBeenCalled();
});
it("CH9-B02/B09 repeated reads only reauthenticate; no producer, meter or hidden-state query", async () => {
 const { app, query } = fixture();
 expect(await app.readBusiness({})).toEqual(await app.readBusiness({}));
 expect(query.mock.calls.map(call => call[0])).toEqual(Array(2).fill("SELECT * FROM app.authenticate_practice_session($1)"));
});
it.each([
 { tenantId: "foreign" }, { sessionDigest: "forged" }, { actor: "owner" }, { price: 0 }, { count: 0 }, { trial: true },
 { settled: true }, { sources: [] }, { policyVersion: "fake" }, { periodId: "" }, { from: "bad" },
 { from: "2026-10-01T00:00:00Z" }, { toExclusive: "2026-11-01T00:00:00Z" }, [], null,
])("CH9-B07 rejects unsupported/forged selection after current authentication: %j", async query => {
 const f = fixture();
 expect(await f.app.readBusiness(query)).toMatchObject({ state: "unavailable", code: "INVALID_BUSINESS_VALUE_SELECTION" });
 expect(f.query).toHaveBeenCalledTimes(1);
});
it.each([
 { periodId: "not-an-authorised-period" },
 { from: "2026-10-01T00:00:00Z", toExclusive: "2026-11-01T00:00:00Z" },
 { from: "2026-11-01T00:00:00Z", toExclusive: "2026-10-01T00:00:00Z" },
])("CH9-B03/B04 accepted-looking selections stay held; no guessed clock/period/%j amount", async query => {
 const { app } = fixture();
 expect(await app.readBusiness(query)).toEqual({ version: "business-value-result.v1", state: "unavailable", code: "BUSINESS_VALUE_SELECTION_HELD" });
});
it("CH9-B01/B07 authentication refusal precedes informative selection errors", async () => {
 const { app, query } = fixture(); query.mockResolvedValue({ rows: [] });
 await expect(app.readBusiness({ tenantId: "foreign" })).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
});
it("CH9-B08 real-company mode is refused even with a practice-looking cookie", async () => {
 const { app, query } = fixture(); vi.stubEnv("JOBGUARD_ENV", "production");
 await expect(app.readBusiness({})).rejects.toMatchObject({ code: "SYNTHETIC_MODE_REQUIRED" });
 expect(query).not.toHaveBeenCalled();
});
it("CH9-B05/B11/B12 no fabricated fee/period/receipt or trial-driven suppression path", async () => {
 const { app } = fixture();
 expect(Object.keys(await app.readBusiness({})).sort()).toEqual(["code", "state", "version"]);
});
