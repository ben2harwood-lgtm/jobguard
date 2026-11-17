import { randomUUID } from "node:crypto";
import { HttpException } from "@nestjs/common";
import type { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RecoveryAllocationApplication } from "./recovery-allocation.application.js";
import { RecoveryAllocationController } from "./recovery-allocation.controller.js";
const session = randomUUID(), job = randomUUID();
afterEach(() => vi.restoreAllMocks());
async function failed(promise: Promise<unknown>) { try { await promise; } catch (error) { expect(error).toBeInstanceOf(HttpException); return { status: (error as HttpException).getStatus(), body: (error as HttpException).getResponse() }; } throw new Error("Expected failure"); }
describe("RecoveryAllocationController", () => {
  it("uses the session cookie and path job for both transports and returns 200 on command", async () => {
    const view = vi.spyOn(RecoveryAllocationApplication.prototype, "view").mockResolvedValue({} as never), command = vi.spyOn(RecoveryAllocationApplication.prototype, "command").mockResolvedValue({} as never);
    const controller = new RecoveryAllocationController({} as Pool), request = { headers: { cookie: `jg_session=${session}` } }, body = { action: "review" };
    await controller.get(request, job, {}); expect(view).toHaveBeenCalledWith(session, job, {});
    await controller.post(request, job, body); expect(command).toHaveBeenCalledWith(session, job, body);
    await controller.reverse(request, job, body); expect(command).toHaveBeenLastCalledWith(session, job, body, true);
    expect(Reflect.getMetadata("__httpCode__", RecoveryAllocationController.prototype.post)).toBe(200); expect(Reflect.getMetadata("__httpCode__", RecoveryAllocationController.prototype.reverse)).toBe(200);
  });
  it("rejects tenant headers before the application and ambiguous cookie supplies no principal", async () => {
    const view = vi.spyOn(RecoveryAllocationApplication.prototype, "view").mockResolvedValue({} as never), controller = new RecoveryAllocationController({} as Pool);
    expect(await failed(controller.get({ headers: { "x-tenant-id": randomUUID() } }, job, {}))).toEqual({ status: 403, body: { version: "recovery-allocation-error.v1", code: "TENANT_FORBIDDEN" } }); expect(view).not.toHaveBeenCalled();
    await controller.get({ headers: { cookie: `jg_session=${session}; jg_session=${randomUUID()}` } }, job, {}); expect(view).toHaveBeenCalledWith(undefined, job, {});
  });
  it.each([["UNAUTHENTICATED",401], ["ALLOCATION_FORBIDDEN",403], ["ALLOCATION_NOT_FOUND",404], ["INVALID_COMMAND",400], ["ALLOCATION_EXCEEDS_AVAILABLE",409], ["ALLOCATION_APPROVAL_CHANGED",409], ["ALLOCATION_REVERSAL_SOURCE_REQUIRED",409], ["RECOVERY_TRANSITION_FORBIDDEN",409]])("maps %s to %i", async (code,status) => {
    vi.spyOn(RecoveryAllocationApplication.prototype, "command").mockRejectedValue(Object.assign(new Error("internal detail"), { code }));
    expect(await failed(new RecoveryAllocationController({} as Pool).post({ headers: { cookie: `jg_session=${session}` } }, job, {}))).toEqual({ status, body: { version: "recovery-allocation-error.v1", code } });
  });
  it("redacts raw database errors", async () => {
    vi.spyOn(RecoveryAllocationApplication.prototype, "view").mockRejectedValue(new Error("private database detail"));
    expect(await failed(new RecoveryAllocationController({} as Pool).get({ headers: {} }, job, {}))).toEqual({ status: 503, body: { version: "recovery-allocation-error.v1", code: "DATABASE_UNAVAILABLE" } });
  });
});
