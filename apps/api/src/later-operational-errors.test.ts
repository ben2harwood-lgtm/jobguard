import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { HttpException } from "@nestjs/common";
import type { Pool } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommandError, PracticeAccessError, WatchdogError } from "@jobguard/db";
import { JobWorkStateError } from "@jobguard/core";
import { MaterialController } from "./material.controller.js";
import { PurchaseOrderController } from "./purchase-order.controller.js";
import { SupplierDocumentController } from "./supplier-document.controller.js";
import { ThingsToCheckController } from "./things-to-check.controller.js";
import { InboxRelevanceController } from "./inbox-relevance.controller.js";
import { MaterialApplication } from "./material.application.js";
import { PurchaseOrderApplication } from "./purchase-order.application.js";
import { SupplierDocumentApplication } from "./supplier-document.application.js";
import { ThingsToCheckApplication } from "./things-to-check.application.js";
import { InboxRelevanceApplication } from "./inbox-relevance.application.js";
import { PracticeAccess } from "./practice-access.js";

const pool = {} as Pool, jobId = randomUUID(), decisionId = randomUUID();
const cookie = `jg_session=${randomUUID()}`;
const material = new MaterialController(pool), po = new PurchaseOrderController(pool);
const supplier = new SupplierDocumentController(pool), things = new ThingsToCheckController(pool);
const inbox = new InboxRelevanceController(pool);
// No HTTP listener or database: these test the actual controller/application/schema
// composition. Injected failures test transport mapping, not persistence guarantees.
const writes = [
  { id: "L084", name: "material requirement", call: () => material.requirement(jobId, {}, cookie) },
  { id: "L084", name: "material rate", call: () => material.rate({}, cookie) },
  { id: "L085", name: "PO revision", call: () => po.revise(jobId, {}, cookie) },
  { id: "L085", name: "PO placement", call: () => po.place(jobId, {}, cookie) },
  { id: "L086", name: "supplier intake", call: () => supplier.intake(jobId, {}, cookie) },
  { id: "L086", name: "supplier receipt", call: () => supplier.receipt(jobId, {}, cookie) },
  { id: "L086", name: "supplier confirmation", call: () => supplier.confirm(jobId, {}, cookie) },
  { id: "L087", name: "finding evaluation", call: () => things.evaluate(jobId, {}, cookie) },
  { id: "L087", name: "finding review", call: () => things.review(jobId, {}, cookie) },
  { id: "L087", name: "bill supersession", call: () => things.supersede(jobId, {}, cookie) },
  { id: "L066", name: "inbox seed", call: () => inbox.seed(jobId, {}, cookie) },
  { id: "L066", name: "inbox budget", call: () => inbox.budget(jobId, {}, cookie) },
  { id: "L066", name: "inbox dismissal", call: () => inbox.dismiss(jobId, decisionId, {}, cookie) },
];
const transports = [
  { id: "L084", name: "material", call: writes[0]!.call, fail: (error: Error) => vi.spyOn(MaterialApplication.prototype, "addRequirement").mockRejectedValue(error) },
  { id: "L085", name: "PO", call: writes[2]!.call, fail: (error: Error) => vi.spyOn(PurchaseOrderApplication.prototype, "revise").mockRejectedValue(error) },
  { id: "L086", name: "supplier", call: writes[4]!.call, fail: (error: Error) => vi.spyOn(SupplierDocumentApplication.prototype, "intake").mockRejectedValue(error) },
  { id: "L087", name: "review", call: writes[8]!.call, fail: (error: Error) => vi.spyOn(ThingsToCheckApplication.prototype, "review").mockRejectedValue(error) },
  { id: "L066", name: "inbox", call: writes[10]!.call, fail: (error: Error) => vi.spyOn(InboxRelevanceApplication.prototype, "seed").mockRejectedValue(error) },
];

async function httpFailure(call: () => unknown) {
  try { await call(); } catch (error) {
    expect(error).toBeInstanceOf(HttpException);
    const failure = error as HttpException;
    return { status: failure.getStatus(), body: failure.getResponse() };
  }
  throw new Error("Expected an HTTP failure");
}
beforeEach(() => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  // Only access is stubbed for schema checks; no context is minted or DB effect claimed.
  const principal = { context: {}, digest: "a".repeat(64) } as never;
  vi.spyOn(PracticeAccess.prototype, "job").mockResolvedValue(principal);
  vi.spyOn(PracticeAccess.prototype, "session").mockResolvedValue(principal);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("LATER-B15 typed operational transport errors", () => {
  it.each(writes)("$id $name: invalid body returns typed validation error", async ({ call }) => {
    expect(await httpFailure(call)).toEqual({ status: 400, body: { code: "INVALID_COMMAND" } });
  });
  it.each([
    ["L084", "material rate", () => material.rate({}, cookie), () => vi.spyOn(MaterialApplication.prototype, "addRate"), "STALE_MATERIAL_RATE_REVISION"],
    ["L084", "material requirement", writes[0]!.call, () => vi.spyOn(MaterialApplication.prototype, "addRequirement"), "STALE_MATERIAL_REQUIREMENT_REVISION"],
    ["L085", "PO revision", writes[2]!.call, () => vi.spyOn(PurchaseOrderApplication.prototype, "revise"), "STALE_PURCHASE_ORDER_REVISION"],
    ["L085", "PO placement", writes[3]!.call, () => vi.spyOn(PurchaseOrderApplication.prototype, "place"), "PURCHASE_ORDER_AUTHORITY_STALE"],
    ["L086", "supplier intake", writes[4]!.call, () => vi.spyOn(SupplierDocumentApplication.prototype, "intake"), "STALE_DOCUMENT_INTAKE"],
    ["L086", "supplier receipt", writes[5]!.call, () => vi.spyOn(SupplierDocumentApplication.prototype, "receipt"), "STALE_GOODS_RECEIPT"],
    ["L086", "supplier confirmation", writes[6]!.call, () => vi.spyOn(SupplierDocumentApplication.prototype, "confirm"), "STALE_SUPPLIER_FACTS"],
    ["L087", "review", writes[8]!.call, () => vi.spyOn(ThingsToCheckApplication.prototype, "review"), "REVIEW_REVISION_CONFLICT"],
    ["L087", "supersession", writes[9]!.call, () => vi.spyOn(ThingsToCheckApplication.prototype, "supersede"), "SUPERSESSION_REVISION_CONFLICT"],
  ] as const)("%s %s: stale command returns typed conflict", async (_id, _name, call, spy, code) => {
    spy().mockRejectedValue(new Error(code));
    expect(await httpFailure(call)).toEqual({ status: 409, body: { code } });
  });
  it.each(transports)("$id $name: unknown faults remain 500 without SQL leakage", async ({ call, fail }) => {
    for (const error of [new Error("SELECT private_data FROM app.internal failed"), new Error("STALE_UNLISTED_REVISION"),
      Object.assign(new Error("STALE_DOCUMENT_INTAKE"), { code: "23505", detail: "private SQL" }),
      Object.assign(new Error("private parser state"), { name: "ZodError" }), new SyntaxError("private parser state")]) {
      fail(error);
      expect(await httpFailure(call)).toEqual({ status: 500, body: { code: "INTERNAL_ERROR" } });
    }
  });
  it.each(writes)("$id $name: authority refusal precedes validation for every job state", async ({ call }) => {
    // Reuse the exact typed refusal: the existing Nest filter owns status/body/code.
    for (const state of ["unknown", "foreign", "not-live", "live"]) {
      const refusal = new PracticeAccessError("NOT_FOUND");
      vi.mocked(PracticeAccess.prototype.job).mockRejectedValue(refusal);
      vi.mocked(PracticeAccess.prototype.session).mockRejectedValue(refusal);
      await expect(call(), state).rejects.toBe(refusal);
    }
  });
  it.each(transports)("$id $name: existing typed filters retain the original error", async ({ call, fail }) => {
    for (const error of [new PracticeAccessError("UNAUTHENTICATED"), new PracticeAccessError("SYNTHETIC_MODE_REQUIRED"),
      new WatchdogError("JOB_NOT_LIVE"), new WatchdogError("IDEMPOTENCY_CONFLICT"),
      new JobWorkStateError("JOB_WORK_CLOSED"), new HttpException({ code: "EXISTING_REFUSAL" }, 422)]) {
      fail(error);
      await expect(call()).rejects.toBe(error);
    }
  });
  it("L085: command permission and exact authorization errors retain typed refusals", async () => {
    for (const [code, status] of [["FORBIDDEN", 403], ["AUTHORIZATION_INVALID", 403], ["COMMAND_CONFLICT", 409]] as const) {
      vi.spyOn(PurchaseOrderApplication.prototype, "place").mockRejectedValue(new CommandError(code));
      expect(await httpFailure(writes[3]!.call)).toEqual({ status, body: { code } });
    }
  });
  it("L084: successful application results and command forwarding are unchanged", async () => {
    const result = { id: randomUUID(), version: 2 };
    const app = vi.spyOn(MaterialApplication.prototype, "addRate").mockResolvedValue(result as never);
    expect(await material.rate({ fixture: true }, cookie)).toBe(result);
    expect(app).toHaveBeenCalledWith({ fixture: true });
  });
  it.each([
    ["L085", "MATERIAL_RATE_NOT_COMPARABLE", 409], ["L085", "MATERIAL_REQUIREMENT_NOT_FOUND", 404],
    ["L086", "PURCHASE_ORDER_REQUIRED", 409], ["L086", "DELIVERY_DOCUMENT_REQUIRED", 409],
    ["L086", "SOURCE_DISPOSITION_REQUIRED", 409], ["L086", "UNKNOWN_FIXTURE_ALIAS", 400],
    ["L086", "DOCUMENT_TYPE_MISMATCH", 400], ["L086", "ARITHMETIC_MISMATCH", 400],
    ["L086", "SUPPLIER_PROPOSAL_NOT_FOUND", 404], ["L087", "CONFIRMED_MATCH_SOURCES_REQUIRED", 409],
    ["L087", "CONFIRMED_SOURCE_FACTS_REQUIRED", 409], ["L087", "FINDING_SUPERSEDED", 409],
    ["L087", "UNRELATED_SUPPLIER_BILLS", 400], ["L087", "REPLACEMENT_BILL_NOT_LOWER", 400],
    ["L087", "FINDING_NOT_FOUND", 404], ["L066", "INVALID_ADVISORY_BUDGET", 400],
    ["L066", "DECISION_NOT_FOUND_FOR_JOB", 404],
  ] as const)("%s: exact operational code %s maps to %i", async (_id, code, status) => {
    vi.spyOn(MaterialApplication.prototype, "addRate").mockRejectedValue(new Error(code));
    expect(await httpFailure(() => material.rate({}, cookie))).toEqual({ status, body: { code } });
  });
  it.each([
    ["L084", () => material.get(jobId, cookie), () => vi.spyOn(MaterialApplication.prototype, "view")],
    ["L085", () => po.get(jobId, cookie), () => vi.spyOn(PurchaseOrderApplication.prototype, "view")],
    ["L086", () => supplier.view(jobId, cookie), () => vi.spyOn(SupplierDocumentApplication.prototype, "view")],
    ["L087", () => things.view(jobId, cookie), () => vi.spyOn(ThingsToCheckApplication.prototype, "view")],
    ["L066", () => inbox.view(jobId, cookie), () => vi.spyOn(InboxRelevanceApplication.prototype, "view")],
  ] as const)("%s: read preserves authority and hides unknown faults", async (_id, call, spy) => {
    const refusal = new PracticeAccessError("NOT_FOUND");
    spy().mockRejectedValue(refusal);
    await expect(call()).rejects.toBe(refusal);
    spy().mockRejectedValue(new Error("SELECT private_data FROM app.internal"));
    expect(await httpFailure(call)).toEqual({ status: 500, body: { code: "INTERNAL_ERROR" } });
  });
});
