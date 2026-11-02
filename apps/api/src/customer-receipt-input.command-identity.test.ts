import { describe, expect, it } from "vitest";
import { practiceReceiptRecordV1, practiceReceiptReverseV1 } from "./customer-invoice.contracts.js";

const commandId = "20000000-0000-4000-8000-000000000002";
const invoiceId = "10000000-0000-4000-8000-000000000001";
const paymentId = "30000000-0000-4000-8000-000000000003";
const commands = [
  {
    name: "record",
    schema: practiceReceiptRecordV1,
    input: {
      version: "practice-customer-receipt.record.v1",
      commandId,
      invoiceId,
      paidOn: "2026-09-19",
      amountPence: 100,
      method: "cash",
      reference: "Fictional receipt",
    },
    identifiers: ["commandId", "invoiceId"],
    wrongVersion: "practice-customer-receipt.reverse.v1",
    futureVersion: "practice-customer-receipt.record.v2",
  },
  {
    name: "reverse",
    schema: practiceReceiptReverseV1,
    input: {
      version: "practice-customer-receipt.reverse.v1",
      commandId,
      invoiceId,
      paymentId,
      reason: "Fictional correction",
    },
    identifiers: ["commandId", "invoiceId", "paymentId"],
    wrongVersion: "practice-customer-receipt.record.v1",
    futureVersion: "practice-customer-receipt.reverse.v2",
  },
] as const;

for (const { name, schema, input, identifiers, wrongVersion, futureVersion } of commands) {
  describe(`receipt ${name} command identity`, () => {
    it("preserves the exact version and distinct valid identifiers", () => {
      expect(schema.parse(input)).toEqual(input);
    });

    for (const field of ["version", ...identifiers]) {
      it(`requires the ${field} field independently`, () => {
        const missingField = Object.fromEntries(Object.entries(input).filter(([key]) => key !== field));
        expect(schema.safeParse(missingField).success).toBe(false);
      });
    }

    for (const field of identifiers) {
      it.each([undefined, null, "", "not-a-uuid", "20000000-0000-4000-8000-00000000000g", 1])(
        `rejects invalid ${field} %s independently`,
        (value) => {
          expect(schema.safeParse({ ...input, [field]: value }).success).toBe(false);
        },
      );
    }

    it.each([undefined, null, "", 1, wrongVersion, futureVersion])(
      "rejects an incorrect command version %s independently",
      (version) => {
        expect(schema.safeParse({ ...input, version }).success).toBe(false);
      },
    );
  });
}
