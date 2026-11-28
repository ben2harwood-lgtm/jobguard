import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { ExtraApprovalRepository, priceExtraV1, priceExtraV2, reviseExtraV1, reviseExtraV2, submitExtraV1 } from "./extra-approval-chain-repository.js";
import type { AuthenticatedMembership, VerifiedTenantContext } from "./tenant-context.js";

const base = () => ({ commandId: randomUUID(), jobId: randomUUID(), extraId: randomUUID() });
describe("ENT-5 Q01 strict repository pricing boundary", () => {
  it.each([0, -1, 1.5, 1_000_000_000_001, NaN, Infinity, "100", null])("refuses invalid net %s before opening a transaction", async netPence => {
    const connect = vi.fn(), repo = new ExtraApprovalRepository({ connect } as unknown as Pool);
    for (const [method, version] of [["priceExtra", "price-extra.v1"], ["reviseExtra", "revise-extra.v1"]] as const) {
      await expect(repo[method]({} as VerifiedTenantContext, {} as AuthenticatedMembership, { version, ...base(), netPence })).rejects.toMatchObject({ code: "INVALID_COMMAND" });
    }
    expect(connect).not.toHaveBeenCalled();
  });
  it.each(["adjustment", "discount", "markup", "vat", "quantity", "rounding", "currency"])("refuses caller-supplied %s in price and revision commands", field => {
    for (const [schema, version] of [[priceExtraV1, "price-extra.v1"], [reviseExtraV1, "revise-extra.v1"]] as const) {
      expect(schema.safeParse({ version, ...base(), netPence: 100, [field]: 1 }).success).toBe(false);
      for (const netPence of [1, 100, 1_000_000_000_000]) expect(schema.safeParse({ version, ...base(), netPence }).success).toBe(true);
    }
  });
  it("submission cannot supply a contract or fallback rules instead of the server's binding", () => {
    for (const extra of [{ contractVersionId: randomUUID() }, { clientContractVersionId: [randomUUID(), randomUUID()] }, { rules: {} }]) {
      expect(submitExtraV1.safeParse({ version: "submit-extra.v1", ...base(), ...extra }).success).toBe(false);
    }
  });
});
describe("EP-CC-S1 pricing contract v2 command boundary", () => {
  const quoted = (o: Record<string, unknown> = {}) => ({ kind: "surveyor_quoted", netPence: 9650, method: "quotation", note: "Fictional quotation", ...o });
  const sor = (o: Record<string, unknown> = {}) => ({ kind: "server_sor", sorCode: "REPAIR-DOOR", claimedQuantity: "2", ...o });
  const revise = (basis: unknown, o: Record<string, unknown> = {}) => ({ version: "revise-extra.v2", ...base(), basis, reason: "response_to_rejection", answersRequestId: randomUUID(), ...o });
  const noDb = () => { const connect = vi.fn(); return { connect, repo: new ExtraApprovalRepository({ connect } as unknown as Pool) }; };
  it("accepts each basis kind and every quote method, with an optional evidence item", () => {
    for (const basis of [sor(), sor({ claimedQuantity: "1.625" }), ...["dayworks", "quotation", "agreed_lump_sum", "materials_plus"].map(method => quoted({ method })), quoted({ evidenceId: randomUUID() })]) {
      expect(priceExtraV2.safeParse({ version: "price-extra.v2", ...base(), basis }).success).toBe(true);
      expect(reviseExtraV2.safeParse(revise(basis)).success).toBe(true);
    }
    for (const reason of ["response_to_rejection", "quantity_corrected", "rate_corrected", "pricing_error"]) expect(reviseExtraV2.safeParse(revise(sor(), { reason, reasonNote: "Fictional" })).success).toBe(true);
  });
  it.each([
    ["a client-supplied rate", sor({ ratePence: 100 })], ["a client-supplied net on a rate code", sor({ netPence: 100 })], ["an adjustment", sor({ adjustment: 1 })],
    ["a negative quantity", sor({ claimedQuantity: "-1" })], ["a numeric quantity", sor({ claimedQuantity: 2 })], ["seven decimal places", sor({ claimedQuantity: "1.0000001" })], ["an exponent", sor({ claimedQuantity: "1e3" })],
    ["a zero net", quoted({ netPence: 0 })], ["fractional pence", quoted({ netPence: 1.5 })], ["above the bound", quoted({ netPence: 1_000_000_000_001 })], ["an unknown method", quoted({ method: "guess" })],
    ["a blank note", quoted({ note: "   " })], ["a 501-character note", quoted({ note: "x".repeat(501) })], ["two evidence items", quoted({ evidenceId: [randomUUID(), randomUUID()] })], ["an unknown kind", { kind: "ai_suggested", netPence: 1 }],
  ])("refuses %s", (_label, basis) => {
    expect(priceExtraV2.safeParse({ version: "price-extra.v2", ...base(), basis }).success).toBe(false);
    expect(reviseExtraV2.safeParse(revise(basis)).success).toBe(false);
  });
  it("accepts a 500-character basis note and refuses a revision without a known reason or answered request", () => {
    expect(priceExtraV2.safeParse({ version: "price-extra.v2", ...base(), basis: quoted({ note: "x".repeat(500) }) }).success).toBe(true);
    for (const o of [{ reason: undefined }, { reason: "other" }, { answersRequestId: undefined }, { answersRequestId: "not-a-uuid" }, { reasonNote: "x".repeat(501) }]) expect(reviseExtraV2.safeParse(revise(sor(), o)).success).toBe(false);
  });
  it("refuses a v2 body without a basis as BASIS_REQUIRED and a malformed one as INVALID_COMMAND, before opening a transaction", async () => {
    const { connect, repo } = noDb(), ctx = {} as VerifiedTenantContext, actor = {} as AuthenticatedMembership;
    await expect(repo.priceExtra(ctx, actor, { version: "price-extra.v2", ...base() })).rejects.toMatchObject({ code: "BASIS_REQUIRED" });
    await expect(repo.reviseExtra(ctx, actor, { ...revise(undefined), basis: undefined })).rejects.toMatchObject({ code: "BASIS_REQUIRED" });
    await expect(repo.priceExtra(ctx, actor, { version: "price-extra.v2", ...base(), basis: sor({ ratePence: 1 }) })).rejects.toMatchObject({ code: "INVALID_COMMAND" });
    await expect(repo.reviseExtra(ctx, actor, revise(sor(), { reason: "other" }))).rejects.toMatchObject({ code: "INVALID_COMMAND" });
    expect(connect).not.toHaveBeenCalled();
  });
});
