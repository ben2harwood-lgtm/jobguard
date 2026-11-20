import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { ExtraApprovalRepository, priceExtraV1, reviseExtraV1, submitExtraV1 } from "./extra-approval-chain-repository.js";
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
