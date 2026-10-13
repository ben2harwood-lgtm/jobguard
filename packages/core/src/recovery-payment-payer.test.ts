let nextId = 0;
const randomUUID = () => `10000000-0000-4000-8000-${String(++nextId).padStart(12, "0")}`;
import { expect, it } from "vitest";
import { recoveryPaymentPayerCommandV1, recoveryPaymentPayerMarkResultV1 } from "./recovery-payment-payer.js";

const command = () => ({ version: "recovery-payment-payer-command.v1", action: "mark_customer_own", commandId: randomUUID(), caseId: randomUUID(), sourceEventId: randomUUID(), expectedMarkRevision: 0, evidenceId: randomUUID() });
it("[A7 DB12] accepts one payment with evidence and withdrawal without evidence", () => {
 const input = command();
 expect(recoveryPaymentPayerCommandV1.parse(input)).toEqual(input);
 const { evidenceId: _evidence, ...withdraw } = input;
 expect(recoveryPaymentPayerCommandV1.parse({ ...withdraw, action: "withdraw_mark" })).toMatchObject({ action: "withdraw_mark" });
 expect(recoveryPaymentPayerCommandV1.safeParse({ ...input, action: "withdraw_mark" }).success).toBe(false);
 expect(recoveryPaymentPayerCommandV1.safeParse(withdraw).success).toBe(false);
});
it.each(["tenantId", "payerType", "amount", "state", "partyBindingId", "createdAt"])("[A7 DB12] refuses injected %s", field => {
 expect(recoveryPaymentPayerCommandV1.safeParse({ ...command(), [field]: randomUUID() }).success).toBe(false);
});
it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1])("[A7 DB12] refuses invalid revision %s", revision => {
 expect(recoveryPaymentPayerCommandV1.safeParse({ ...command(), expectedMarkRevision: revision }).success).toBe(false);
});
it("[A7 DB14] result keeps the immutable payment identity and evidence state", () => {
 const input = command(), result = { id: randomUUID(), revision: 1, sourceEventId: input.sourceEventId, state: "customer_own", evidenceId: input.evidenceId };
 expect(recoveryPaymentPayerMarkResultV1.parse(result)).toEqual(result);
 expect(recoveryPaymentPayerMarkResultV1.safeParse({ ...result, evidenceId: null }).success).toBe(false);
 expect(recoveryPaymentPayerMarkResultV1.safeParse({ ...result, state: "withdrawn", evidenceId: null }).success).toBe(true);
});
