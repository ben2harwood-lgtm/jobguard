import { afterEach, expect, it, vi } from "vitest";
import { Pool } from "pg";
import * as db from "@jobguard/db";
import { type AuthenticatedMembership } from "@jobguard/db";
import { ExtraPricingApplication, ExtraPricingError, extraPricingHttpFailure } from "./extra-pricing.application.js";
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
const setup = () => {
 const pool = new Pool(), sessionId = crypto.randomUUID(), jobId = crypto.randomUUID(), extraId = crypto.randomUUID();
 const member = { tenantId: crypto.randomUUID(), identityUserId: crypto.randomUUID(), membershipId: crypto.randomUUID() } as AuthenticatedMembership;
 const lookup = vi.spyOn(db.ContractorRepository.prototype, "resolveSession").mockResolvedValue(member);
 const context = vi.spyOn(db, "contractorSessionContext").mockResolvedValue({ tenantId: member.tenantId } as db.VerifiedTenantContext);
 const price = vi.spyOn(db.ExtraApprovalRepository.prototype, "priceExtra").mockResolvedValue({ netPence: 9650 });
 const revise = vi.spyOn(db.ExtraApprovalRepository.prototype, "reviseExtra").mockResolvedValue({ netPence: 9650 });
 const basis = vi.spyOn(db.ExtraApprovalRepository.prototype, "pricingBasis").mockResolvedValue({ prices: [] });
 return { pool, sessionId, jobId, extraId, member, lookup, context, price, revise, basis, app: new ExtraPricingApplication(pool), principal: { version: "contractor-principal.v1", sessionId } };
};
const sor = { kind: "server_sor", sorCode: "REPAIR-DOOR", claimedQuantity: "2" };

it("binds the actor to the session and the job and extra to the path; the body carries only its basis", async () => {
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
 const s = setup(), commandId = crypto.randomUUID(), answersRequestId = crypto.randomUUID();
 await s.app.price(s.principal, s.jobId.toUpperCase(), s.extraId, { version: "price-extra.v2", commandId, basis: sor });
 expect(s.price).toHaveBeenCalledWith({ tenantId: s.member.tenantId }, s.member, { version: "price-extra.v2", commandId, basis: sor, jobId: s.jobId, extraId: s.extraId });
 await s.app.revise(s.principal, s.jobId, s.extraId, { version: "revise-extra.v2", commandId, basis: sor, reason: "response_to_rejection", answersRequestId });
 expect(s.revise).toHaveBeenCalledWith({ tenantId: s.member.tenantId }, s.member, { version: "revise-extra.v2", commandId, basis: sor, reason: "response_to_rejection", answersRequestId, jobId: s.jobId, extraId: s.extraId });
 await s.app.basis(s.principal, s.jobId, s.extraId);
 expect(s.basis).toHaveBeenCalledWith({ tenantId: s.member.tenantId }, s.member, { version: "extra-pricing-basis-query.v1", jobId: s.jobId, extraId: s.extraId });
 expect(s.context).toHaveBeenCalledWith(s.pool, s.sessionId);
 await s.pool.end();
});

it("refuses a path-shadowing body, a v1 or wrong-version body, bad path ids, a bad principal and non-synthetic mode before any write", async () => {
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
 const s = setup(), body = { version: "price-extra.v2", commandId: crypto.randomUUID(), basis: sor };
 for (const raw of [{ ...body, jobId: crypto.randomUUID() }, { ...body, extraId: crypto.randomUUID() }, { ...body, version: "price-extra.v1" }, { version: "price-extra.v1", commandId: body.commandId, netPence: 100 }, null, [], "x"]) {
  await expect(s.app.price(s.principal, s.jobId, s.extraId, raw)).rejects.toMatchObject({ code: "INVALID_COMMAND" });
 }
 await expect(s.app.revise(s.principal, s.jobId, s.extraId, body)).rejects.toMatchObject({ code: "INVALID_COMMAND" });
 await expect(s.app.price(s.principal, "not-a-job", s.extraId, body)).rejects.toMatchObject({ code: "NOT_FOUND" });
 await expect(s.app.basis(s.principal, s.jobId, "not-an-extra")).rejects.toMatchObject({ code: "NOT_FOUND" });
 await expect(s.app.price({ version: "contractor-principal.v1", sessionId: "x" }, s.jobId, s.extraId, body)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
 s.lookup.mockRejectedValueOnce(Object.assign(new Error("revoked"), { code: "UNAUTHENTICATED" }));
 await expect(s.app.price(s.principal, s.jobId, s.extraId, body)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
 s.context.mockResolvedValueOnce({ tenantId: crypto.randomUUID() } as db.VerifiedTenantContext);
 await expect(s.app.price(s.principal, s.jobId, s.extraId, body)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
 vi.stubEnv("JOBGUARD_ENV", "production_billing");
 await expect(s.app.price(s.principal, s.jobId, s.extraId, body)).rejects.toMatchObject({ code: "MODE_FORBIDDEN" });
 expect(s.price).not.toHaveBeenCalled(); expect(s.revise).not.toHaveBeenCalled(); expect(s.basis).not.toHaveBeenCalled();
 await s.pool.end();
});

it("answers closed codes only, with HTTP statuses for the v2 refusals", () => {
 const status = (e: unknown) => extraPricingHttpFailure(e);
 expect(status(new db.ExtraApprovalError("BASIS_REQUIRED"))).toEqual({ status: 422, body: { version: "extra-pricing-error.v1", code: "BASIS_REQUIRED" } });
 for (const [code, http] of [["UNAUTHENTICATED", 401], ["ORIGIN_FORBIDDEN", 403], ["MODE_FORBIDDEN", 403]] as const) expect(status(new ExtraPricingError(code)).status).toBe(http);
 for (const [code, http] of [["PERMISSION_DENIED", 403], ["RATE_NOT_FOUND", 404], ["EVIDENCE_NOT_FOUND", 404], ["INVALID_QUANTITY", 422], ["REVISION_REASON_REQUIRED", 422],
  ["ALREADY_ON_ORDER", 409], ["STALE_REVISION", 409], ["COMMAND_CONFLICT", 409], ["INVALID_TRANSITION", 409], ["DATABASE_UNAVAILABLE", 503]] as const) expect(status(new db.ExtraApprovalError(code)).status).toBe(http);
 expect(status(Object.assign(new Error("relation app.secret does not exist"), { code: "42P01" }))).toEqual({ status: 503, body: { version: "extra-pricing-error.v1", code: "DATABASE_UNAVAILABLE" } });
});

it("an identical retry of a committed revision passes the identical command, so the receipt replays its stored answer", async () => {
 // Review P2 (EP-CC-S1): the reason and answered request come only from the body, never from the extra's current state.
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
 const s = setup(), body = { version: "revise-extra.v2", commandId: crypto.randomUUID(), basis: sor, reason: "response_to_rejection", answersRequestId: crypto.randomUUID() };
 const stored = { requestId: crypto.randomUUID(), basis: { netPence: 9650 } };
 s.revise.mockResolvedValue(stored);
 expect(await s.app.revise(s.principal, s.jobId, s.extraId, structuredClone(body))).toEqual(stored);
 expect(await s.app.revise(s.principal, s.jobId, s.extraId, structuredClone(body))).toEqual(stored);
 expect(s.revise).toHaveBeenCalledTimes(2);
 expect(s.revise.mock.calls[1]).toEqual(s.revise.mock.calls[0]);
 await s.pool.end();
});
