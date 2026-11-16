import "reflect-metadata";
import type { Pool } from "pg";
import { ValueBusinessReader } from "@jobguard/db";
import { afterEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { ValueV3Application, heldJobValueV3, ValueV3ReadError } from "./value-v3.application.js";
import { IdentityApplication } from "../auth/identity.application.js";
import { ApplicationAuthGuard } from "../auth/application-auth.guard.js";
import type { ExecutionContext } from "@nestjs/common";
import { ValueV3Controller } from "./value-v3.controller.js";

const id = randomUUID();
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
function response() {
 const headers: Record<string, string> = {};
 return { headers, setHeader: vi.fn((key: string, value: string) => { headers[key] = value; }) };
}
it("CH9-J01/05 sets private no-store before success and delegates without writes", async () => {
 const read = vi.spyOn(ValueV3Application.prototype, "readJob").mockResolvedValue(heldJobValueV3(id));
 const res = response();
 expect(await new ValueV3Controller({} as Pool).get(id, {}, "jg_session=fictional", res)).toEqual(heldJobValueV3(id));
 expect(read).toHaveBeenCalledWith(id, {});
 expect(res.headers["Cache-Control"]).toBe("private, no-store");
 expect(res.headers["Vary"]).toBe("Cookie");
 expect(res.setHeader.mock.invocationCallOrder[0]).toBeLessThan(read.mock.invocationCallOrder[0]!);
});
it.each(["NOT_FOUND", "UNAUTHENTICATED", "VALUE_V3_QUERY_UNBOUND", "VALUE_V3_SOURCE_REJECTED", "SYNTHETIC_MODE_REQUIRED", "DATABASE_UNAVAILABLE"])("CH9-J01/02/09 keeps %s private and sanitized", async code => {
 vi.spyOn(ValueV3Application.prototype, "readJob").mockRejectedValue(
  code.startsWith("VALUE_") ? new ValueV3ReadError(code as "VALUE_V3_QUERY_UNBOUND" | "VALUE_V3_SOURCE_REJECTED") : Object.assign(new Error("private SQL/session/tenant bytes"), { code }));
 const res = response();
 try { await new ValueV3Controller({} as Pool).get(id, {}, undefined, res); expect.fail("must reject"); }
 catch (error) {
  const result = error as { getResponse(): unknown; getStatus(): number };
  expect(JSON.stringify(result.getResponse())).not.toContain("private SQL");
  expect(result.getStatus()).toBe(code === "NOT_FOUND" ? 404 : code === "UNAUTHENTICATED" ? 401 : code === "SYNTHETIC_MODE_REQUIRED" ? 403 : code === "VALUE_V3_QUERY_UNBOUND" ? 400 : 503);
 }
 expect(res.headers["Cache-Control"]).toBe("private, no-store");
});
it("CH9-J01 defers request-scoped reader construction until application authority", async () => {
 const factory = vi.fn(() => ({ readJob: vi.fn(async () => heldJobValueV3(id)) }));
 vi.spyOn(ValueV3Application.prototype, "readJob").mockRejectedValue(Object.assign(new Error("UNAUTHENTICATED"), { code: "UNAUTHENTICATED" }));
 await expect(new ValueV3Controller({} as Pool, factory).get(id, {}, undefined, response())).rejects.toHaveProperty("status", 401);
 expect(factory).not.toHaveBeenCalled();
});

// Exercise the controller's real subscription authority and principal bridge;
// only the provider and persisted value read are stubbed.
function companyFixture() {
 const tenantId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
 const sessionToken = "s".repeat(32), csrfToken = "c".repeat(24);
 const principal = { identityUserId: tenantId, sessionId: tenantId, csrfToken, sessionCredential: "a".repeat(64) };
 const membership = { id: tenantId, identityUserId: tenantId, tenantId, role: "owner", email: "owner@example.invalid" };
 const provider = {
  authenticate: vi.fn(async (token: string) => token === sessionToken ? principal : undefined),
  findMembership: vi.fn(async (_principal: unknown, selected: string) => selected === tenantId ? membership : undefined),
  digest: vi.fn(() => "a".repeat(64)),
 };
 const identity = new IdentityApplication(provider as unknown as IdentityApplication["provider"], "https://jobguard.invalid");
 const request = { method: "GET", path: `/jobs/${id}/value/v3`, headers: {
  cookie: `jobguard_session=${sessionToken}; jg_session=fictional`,
  "x-tenant-id": tenantId, "x-csrf-token": csrfToken, origin: identity.allowedOrigin,
 } as Record<string, string | undefined> };
 return { tenantId, sessionToken, provider, identity, request };
}
it("LATER-SAFETY-161 forwards caller CSRF through both company authority checks", async () => {
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
 const f = companyFixture();
 const read = vi.spyOn(ValueBusinessReader.prototype, "readJob").mockResolvedValue(null);
 const guard = new ApplicationAuthGuard(() => f.identity);
 expect(await guard.canActivate({ switchToHttp: () => ({ getRequest: () => f.request }) } as ExecutionContext)).toBe(true);
 const res = response();
 const result = await new ValueV3Controller({} as Pool, undefined, () => f.identity).get(id, {}, f.request.headers.cookie, res, f.request);
 expect(result).toEqual(heldJobValueV3(id));
 expect(read).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ tenantId: f.tenantId }), "a".repeat(64), id, null);
 expect(f.provider.authenticate).toHaveBeenCalledTimes(2);
 expect(f.provider.authenticate).toHaveBeenLastCalledWith(f.sessionToken);
 expect(f.provider.digest).toHaveBeenCalledWith(`session:${f.sessionToken}`);
 expect(res.headers).toEqual({ "Cache-Control": "private, no-store", Vary: "Cookie" });
});
it.each(["missing CSRF", "wrong CSRF", "foreign tenant", "revoked session", "expired session", "wrong Origin"])("LATER-SAFETY-161 refuses %s before company reads or practice fallback", async refusal => {
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
 const f = companyFixture();
 if (refusal === "missing CSRF") delete f.request.headers["x-csrf-token"];
 if (refusal === "wrong CSRF") f.request.headers["x-csrf-token"] = "wrong".repeat(6);
 if (refusal === "foreign tenant") f.request.headers["x-tenant-id"] = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
 if (refusal === "revoked session" || refusal === "expired session") f.provider.authenticate.mockResolvedValue(undefined);
 if (refusal === "wrong Origin") f.request.headers.origin = "https://foreign.invalid";
 const read = vi.spyOn(ValueBusinessReader.prototype, "readJob").mockResolvedValue(null);
 const practice = vi.spyOn(ValueV3Application.prototype, "readJob");
 const res = response();
 await expect(new ValueV3Controller({} as Pool, undefined, () => f.identity).get(id, {}, f.request.headers.cookie, res, f.request)).rejects.toHaveProperty("status", refusal.endsWith("session") ? 401 : 503);
 expect(read).not.toHaveBeenCalled();
 expect(practice).not.toHaveBeenCalled();
 expect(res.headers).toEqual({ "Cache-Control": "private, no-store", Vary: "Cookie" });
});
