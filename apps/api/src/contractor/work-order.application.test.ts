import "reflect-metadata";
import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Pool } from "pg";
import { HttpException } from "@nestjs/common";
import { WorkOrderError, workOrderErrorCodes, workOrderFailureV1 } from "@jobguard/core";
import { WorkOrderApplication, workOrderHttpFailure } from "./work-order.application.js";
import { SchedulingApplication } from "./scheduling.application.js";
import { WorkOrderController } from "./work-order.controller.js";
import { SchedulingController } from "./scheduling.controller.js";

const original = process.env.JOBGUARD_ENV;
afterEach(() => { vi.restoreAllMocks(); if (original === undefined) delete process.env.JOBGUARD_ENV; else process.env.JOBGUARD_ENV = original; });
const id = "11111111-1111-4111-8111-111111111111", other = "22222222-2222-4222-8222-222222222222";
const principal = { version: "contractor-principal.v1", sessionId: id };
const generated = { version: "work-order-import-request.v1", environment: "synthetic_demo", commandId: id, source: { kind: "generated", sample: "starter_orders" } };

describe("ENT-2 application boundary (adapter tests, not PostgreSQL proof)", () => {
  it("rejects production and pilot modes and missing sessions before touching the database", async () => {
    const orders = new WorkOrderApplication(new Pool()), scheduling = new SchedulingApplication(new Pool());
    for (const mode of ["pilot_no_charge", "production_billing", undefined]) {
      if (mode === undefined) delete process.env.JOBGUARD_ENV; else process.env.JOBGUARD_ENV = mode;
      await expect(orders.overview(principal)).rejects.toMatchObject({ code: "MODE_FORBIDDEN" });
      await expect(orders.importGenerated(principal, generated)).rejects.toMatchObject({ code: "MODE_FORBIDDEN" });
      await expect(orders.importSorVersion(principal, {})).rejects.toMatchObject({ code: "MODE_FORBIDDEN" });
      await expect(scheduling.assignments(principal, id)).rejects.toMatchObject({ code: "MODE_FORBIDDEN" });
    }
    process.env.JOBGUARD_ENV = "synthetic_demo";
    for (const missing of [null, undefined, {}, { version: "contractor-principal.v1" }, { version: "contractor-principal.v1", sessionId: "not-a-uuid" }, { ...principal, tenantId: id }]) {
      await expect(orders.overview(missing)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
      await expect(orders.batch(missing, id)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
      await expect(orders.revisions(missing, id)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
      await expect(scheduling.siteVisits(missing, id)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    }
  });
  it("refuses arbitrary uploads and forged request fields before any session lookup (Q8: generated, selectable files only)", async () => {
    process.env.JOBGUARD_ENV = "synthetic_demo";
    const resolve = vi.spyOn((await import("@jobguard/db")).WorkOrderRepository.prototype, "resolveSession");
    const app = new WorkOrderApplication(new Pool());
    await expect(app.importGenerated(principal, { ...generated, source: { kind: "csv", name: "mine.csv", csv: "version\r\n" } })).rejects.toMatchObject({ code: "UPLOAD_NOT_ALLOWED" });
    for (const forged of [{ ...generated, tenantId: other }, { ...generated, source: { kind: "generated", sample: "../../etc/passwd" } }, { ...generated, source: { kind: "generated", sample: "starter_orders", csv: "x" } }, { ...generated, environment: "production_billing" }, { ...generated, commandId: "bad" }, null, "x"]) {
      await expect(app.importGenerated(principal, forged)).rejects.toMatchObject({ code: "INVALID_COMMAND" });
    }
    expect(resolve).not.toHaveBeenCalled();
    // The later API reuses the same service with a caller-supplied CSV, and only with one.
    await expect(app.importFile(principal, generated as never)).rejects.toMatchObject({ code: "INVALID_COMMAND" });
  });
  it("maps every typed code to one status and a body that carries nothing but the code", () => {
    expect(workOrderHttpFailure(new WorkOrderError("NOT_FOUND"))).toEqual({ status: 404, body: { version: "work-order-error.v1", code: "NOT_FOUND", recoverable: false } });
    expect(workOrderHttpFailure(new WorkOrderError("TRACK_FORBIDDEN")).status).toBe(403);
    expect(workOrderHttpFailure(new WorkOrderError("UPLOAD_NOT_ALLOWED")).status).toBe(403);
    expect(workOrderHttpFailure(new WorkOrderError("COMMAND_CONFLICT")).status).toBe(409);
    expect(workOrderHttpFailure(new WorkOrderError("INVALID_CSV")).status).toBe(422);
    for (const code of workOrderErrorCodes) expect(workOrderFailureV1.safeParse(workOrderHttpFailure(new WorkOrderError(code)).body).success).toBe(true);
    // An unexpected failure (even one that mentions a resident) is the generic retryable error, never its text.
    expect(workOrderHttpFailure(new Error("resident@example.invalid exploded"))).toEqual({ status: 503, body: { version: "work-order-error.v1", code: "DATABASE_UNAVAILABLE", recoverable: true } });
  });
});

describe("ENT-2 transport (adapter tests, not PostgreSQL proof)", () => {
  it.each([
    ["/contractor/work-order-imports", "get", undefined], ["/contractor/work-order-imports", "post", undefined], ["/contractor/work-order-imports/{batchId}", "get", "batchId"],
    ["/contractor/work-orders/{workOrderId}/revisions", "get", "workOrderId"], ["/contractor/sor-versions", "get", undefined], ["/contractor/sor-versions", "post", undefined],
    ["/contractor/jobs/{id}/assignments", "get", "id"], ["/contractor/jobs/{id}/site-visits", "get", "id"],
  ])("documents %s %s, with the UUID path parameter where there is one", async (path, method, name) => {
    const spec = JSON.parse(await readFile(new URL("../../openapi.json", import.meta.url), "utf8"));
    expect(spec.paths[path]?.[method], `${method} ${path}`).toBeTruthy();
    if (name) expect(spec.paths[path][method].parameters).toContainEqual({ name, required: true, in: "path", schema: { format: "uuid", type: "string" } });
  });
  it("exposes the scheduling projections for GET only: no scheduling write route exists at the transport", async () => {
    const spec = JSON.parse(await readFile(new URL("../../openapi.json", import.meta.url), "utf8"));
    for (const path of ["/contractor/jobs/{id}/assignments", "/contractor/jobs/{id}/site-visits"]) expect(Object.keys(spec.paths[path])).toEqual(["get"]);
    expect(Object.keys(spec.paths).filter(p => /assign|schedul|visit/u.test(p))).toEqual(["/contractor/jobs/{id}/assignments", "/contractor/jobs/{id}/site-visits"]);
    for (const route of ["jobs/[id]/assignments", "jobs/[id]/site-visits"]) {
      const source = await readFile(new URL(`../../../web/app/api/contractor/${route}/route.ts`, import.meta.url), "utf8");
      expect([...source.matchAll(/export (?:async )?function (\w+)/gu)].map(m => m[1])).toEqual(["GET"]);
    }
    const controller = await readFile(new URL("./scheduling.controller.ts", import.meta.url), "utf8");
    expect(controller).not.toMatch(/@(Post|Put|Patch|Delete)\(/u);
  });
  it("uses the cookie session as the only principal and gives hidden and absent resources the identical 404 body", async () => {
    const call = vi.spyOn(WorkOrderApplication.prototype, "revisions").mockRejectedValue(new WorkOrderError("NOT_FOUND"));
    const controller = new WorkOrderController(new Pool()), responses: unknown[] = [];
    for (const order of [id, other]) { try { await controller.revisions(order, `other=x; jg_session=${id}`); } catch (error) { expect(error).toBeInstanceOf(HttpException); const e = error as HttpException; responses.push([e.getStatus(), e.getResponse()]); } }
    expect(responses[0]).toEqual(responses[1]); expect(responses[0]).toEqual([404, { version: "work-order-error.v1", code: "NOT_FOUND", recoverable: false }]);
    expect(call).toHaveBeenCalledWith({ version: "contractor-principal.v1", sessionId: id }, id);
    const scheduling = vi.spyOn(SchedulingApplication.prototype, "assignments").mockRejectedValue(new WorkOrderError("NOT_FOUND"));
    await expect(new SchedulingController(new Pool()).assignments(id, `jg_session=${id}`)).rejects.toMatchObject({ status: 404 });
    expect(scheduling).toHaveBeenCalledWith({ version: "contractor-principal.v1", sessionId: id }, id);
  });
  it("accepts a write only from the trusted browser origin and passes the body, not the origin, to the shared service", async () => {
    const importer = vi.spyOn(WorkOrderApplication.prototype, "importGenerated").mockResolvedValue({ ok: true } as never);
    const sor = vi.spyOn(WorkOrderApplication.prototype, "importSorVersion").mockResolvedValue({ ok: true } as never);
    const controller = new WorkOrderController(new Pool());
    await controller.import(`jg_session=${id}`, "http://localhost:3000", generated);
    await controller.importSor(`jg_session=${id}`, "http://localhost:3000", { any: "body" });
    expect(importer).toHaveBeenCalledWith({ version: "contractor-principal.v1", sessionId: id }, generated);
    expect(sor).toHaveBeenCalledWith({ version: "contractor-principal.v1", sessionId: id }, { any: "body" });
    for (const origin of ["https://foreign.invalid", undefined, "http://localhost:3001"]) {
      expect(() => controller.import(`jg_session=${id}`, origin, generated)).toThrow(HttpException);
      expect(() => controller.importSor(`jg_session=${id}`, origin, {})).toThrow(HttpException);
    }
    expect(importer).toHaveBeenCalledTimes(1); expect(sor).toHaveBeenCalledTimes(1);
  });
});
