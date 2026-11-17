import "reflect-metadata";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { mapCurrentBusinessValueSummary } from "@jobguard/core";
import { ValueBusinessReader } from "@jobguard/db";
import { afterEach, expect, it, vi } from "vitest";
import { ForbiddenException } from "@nestjs/common";
import { ApplicationAuthGuard } from "../auth/application-auth.guard.js";
import { IdentityApplication } from "../auth/identity.application.js";
import type { ExecutionContext } from "@nestjs/common";
import { BusinessValueApplication } from "./value-business.application.js";
import { BusinessValueController } from "./value-business.controller.js";

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
it("CH9-B08 direct Nest guard retains refusal for verified company principal", async () => {
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
 const context = vi.fn().mockResolvedValue({});
 const guard = new ApplicationAuthGuard(() => ({ context }) as unknown as IdentityApplication);
 const execution = { switchToHttp: () => ({ getRequest: () => ({ path: "/value", headers: { cookie: "jg_identity_session=company" } }) }) } as unknown as ExecutionContext;
 await expect(guard.canActivate(execution)).rejects.toBeInstanceOf(ForbiddenException);
 await expect(guard.canActivate(execution)).rejects.toMatchObject({ response: { code: "SYNTHETIC_WORKFLOW_ONLY" } });
});
it("CH9-B07/B09 direct controller rejects expired sessions without source or error leakage", async () => {
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
 const query = vi.fn().mockResolvedValue({ rows: [] });
 const controller = new BusinessValueController({ query } as unknown as Pool);
 const response = await controller.get({ tenantId: "foreign" }, `jg_session=${randomUUID()}`);
 expect(response).toEqual({ version: "business-value-result.v1", state: "unavailable", code: "UNAUTHENTICATED" });
 expect(query).toHaveBeenCalledTimes(1);
});
it("controller does not expose raw database failures", async () => {
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
 const query = vi.fn().mockRejectedValue(new Error("secret.internal.invalid password=fictional"));
 const response = await new BusinessValueController({ query } as unknown as Pool).get({}, `jg_session=${randomUUID()}`);
 expect(response).toEqual({ version: "business-value-result.v1", state: "unavailable", code: "BUSINESS_VALUE_UNAVAILABLE" });
});
it("CH9-B07 held and invalid selections have refusal HTTP statuses with private cache metadata", async () => {
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
 const query = vi.fn().mockResolvedValue({ rows: [{ tenant_id: "11111111-1111-4111-8111-111111111111", membership_id: "d1500000-0000-4000-8000-000000000003", identity_user_id: "d1500000-0000-4000-8000-000000000001" }] });
 const status = vi.fn(), controller = new BusinessValueController({ query } as unknown as Pool);
 await controller.get({}, `jg_session=${randomUUID()}`, { status });
 expect(status).toHaveBeenLastCalledWith(503);
 await controller.get({ tenantId: "foreign" }, `jg_session=${randomUUID()}`, { status });
 expect(status).toHaveBeenLastCalledWith(400);
 query.mockResolvedValue({ rows: [] });
 await controller.get({}, `jg_session=${randomUUID()}`, { status });
 expect(status).toHaveBeenLastCalledWith(401);
 expect(Reflect.getMetadata("__headers__", BusinessValueController.prototype.get)).toContainEqual({ name: "Cache-Control", value: "private, no-store" });
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
 const request = { method: "GET", path: "/value", headers: {
  cookie: `jobguard_session=${sessionToken}; jg_session=fictional`,
  "x-tenant-id": tenantId, "x-csrf-token": csrfToken, origin: identity.allowedOrigin,
 } as Record<string, string | undefined> };
 return { tenantId, sessionToken, provider, identity, request };
}
it("LATER-SAFETY-161 forwards caller CSRF through both company authority checks", async () => {
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
 const f = companyFixture();
 const read = vi.spyOn(ValueBusinessReader.prototype, "readBusiness").mockResolvedValue({ version: "business-value-result.v1", state: "mapped", tenantId: f.tenantId, label: "mapped, inspectable", environment: "synthetic_demo", jobs: [], summary: mapCurrentBusinessValueSummary([]), subscription: [] });
 const guard = new ApplicationAuthGuard(() => f.identity);
 expect(await guard.canActivate({ switchToHttp: () => ({ getRequest: () => f.request }) } as ExecutionContext)).toBe(true);
 const res = { status: vi.fn() };
 const result = await new BusinessValueController({} as Pool, () => f.identity).get({}, f.request.headers.cookie, res, f.request);
 expect(result).toEqual({ version: "business-value-result.v1", state: "mapped", tenantId: f.tenantId, label: "mapped, inspectable", environment: "synthetic_demo", jobs: [], summary: mapCurrentBusinessValueSummary([]), subscription: [] });
 expect(res.status).toHaveBeenCalledWith(200);
 expect(read).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ tenantId: f.tenantId }), "a".repeat(64), undefined, null);
 expect(f.provider.authenticate).toHaveBeenCalledTimes(2);
 expect(f.provider.authenticate).toHaveBeenLastCalledWith(f.sessionToken);
 expect(f.provider.digest).toHaveBeenCalledWith(`session:${f.sessionToken}`);
 expect(Reflect.getMetadata("__headers__", BusinessValueController.prototype.get)).toEqual(expect.arrayContaining([{ name: "Cache-Control", value: "private, no-store" }, { name: "Vary", value: "Cookie" }]));
});
it.each(["missing CSRF", "wrong CSRF", "foreign tenant", "revoked session", "expired session", "wrong Origin"])("LATER-SAFETY-161 refuses %s before company reads or practice fallback", async refusal => {
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
 const f = companyFixture();
 if (refusal === "missing CSRF") delete f.request.headers["x-csrf-token"];
 if (refusal === "wrong CSRF") f.request.headers["x-csrf-token"] = "wrong".repeat(6);
 if (refusal === "foreign tenant") f.request.headers["x-tenant-id"] = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
 if (refusal === "revoked session" || refusal === "expired session") f.provider.authenticate.mockResolvedValue(undefined);
 if (refusal === "wrong Origin") f.request.headers.origin = "https://foreign.invalid";
 const read = vi.spyOn(ValueBusinessReader.prototype, "readBusiness").mockResolvedValue({ version: "business-value-result.v1", state: "mapped", tenantId: f.tenantId, label: "mapped, inspectable", environment: "synthetic_demo", jobs: [], summary: mapCurrentBusinessValueSummary([]), subscription: [] });
 const practice = vi.spyOn(BusinessValueApplication.prototype, "readBusiness");
 const res = { status: vi.fn() };
 expect(await new BusinessValueController({} as Pool, () => f.identity).get({}, f.request.headers.cookie, res, f.request)).toEqual({ version: "business-value-result.v1", state: "unavailable", code: refusal.endsWith("session") ? "UNAUTHENTICATED" : "BUSINESS_VALUE_UNAVAILABLE" });
 expect(res.status).toHaveBeenCalledWith(refusal.endsWith("session") ? 401 : 503);
 expect(read).not.toHaveBeenCalled();
 expect(practice).not.toHaveBeenCalled();
 expect(Reflect.getMetadata("__headers__", BusinessValueController.prototype.get)).toEqual(expect.arrayContaining([{ name: "Cache-Control", value: "private, no-store" }, { name: "Vary", value: "Cookie" }]));
});
