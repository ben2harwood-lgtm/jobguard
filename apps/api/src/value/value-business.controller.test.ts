import "reflect-metadata";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterEach, expect, it, vi } from "vitest";
import { ForbiddenException } from "@nestjs/common";
import { ApplicationAuthGuard } from "../auth/application-auth.guard.js";
import type { IdentityApplication } from "../auth/identity.application.js";
import type { ExecutionContext } from "@nestjs/common";
import { BusinessValueController } from "./value-business.controller.js";

afterEach(() => vi.unstubAllEnvs());
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
