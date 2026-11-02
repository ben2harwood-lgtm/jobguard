import { describe, expect, it } from "vitest";
import { practiceReceiptReverseV1 } from "./customer-invoice.contracts.js";

const reverse = {
  version: "practice-customer-receipt.reverse.v1",
  commandId: "20000000-0000-4000-8000-000000000002",
  invoiceId: "10000000-0000-4000-8000-000000000001",
  paymentId: "30000000-0000-4000-8000-000000000003",
  reason: "Fictional correction",
};

describe("receipt reversal authority boundary", () => {
  it("accepts the reversal command without client-supplied authority", () => {
    expect(practiceReceiptReverseV1.parse(reverse)).toEqual(reverse);
  });

  it.each([
    ["tenantId", "40000000-0000-4000-8000-000000000004"],
    ["jobId", "50000000-0000-4000-8000-000000000005"],
    ["actorMembershipId", "60000000-0000-4000-8000-000000000006"],
    ["permissions", ["billing.manage"]],
    ["environment", "production_billing"],
    ["amountPence", 1],
    ["qualifyingRecoveryProof", true],
    ["platformFeeSettlement", true],
  ] as const)("refuses the invented %s field rather than stripping it", (field, value) => {
    const result = practiceReceiptReverseV1.safeParse({ ...reverse, [field]: value });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual([
        expect.objectContaining({ code: "unrecognized_keys", keys: [field] }),
      ]);
    }
  });
});
