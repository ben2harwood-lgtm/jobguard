import { expect, it } from "vitest";
import { M1_QUOTE_POLICY, quotePreviewViewV1, paymentRecordViewV1, type CoreLoopActionContextV1 } from "@jobguard/core";
import { NativeCoreLoopScreens, sharedNativeView, nativeReviewChoice } from "./core-loop-screens";
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const p = { userId: id(1), tenantId: id(2), membershipId: id(3), mobileSessionId: id(4), deviceInstanceId: "fictional" };
const snapshot = { tenantId: p.tenantId, jobId: id(5), subjectId: id(6), revision: 1, contentHash: "a".repeat(64) };
const context: CoreLoopActionContextV1 = { version: "core-loop-action-context.v1", environment: "synthetic_demo", online: true, authorized: true, connectionId: id(7), refreshedConnectionId: id(7), current: snapshot, review: { action: "acceptQuote", connectionId: id(7), snapshot } };
it("native previews are exactly shared domain views, with no second fee or settlement calculation", () => {
 const quote = { currency: "GBP", taxPolicyVersion: M1_QUOTE_POLICY.taxPolicyVersion, lines: [] };
 expect(sharedNativeView({ screen: "quote_preview", input: quote }, p.tenantId)).toEqual(quotePreviewViewV1(quote));
 const invoice = { id: id(10), finalAccountRevisionId: id(11), sourceHash: "b".repeat(64), netPence: 100, taxPence: 20, totalPence: 120, balancePence: 120, customerCreditPence: 0 };
 expect(sharedNativeView({ screen: "payment_record", input: { invoice, localIntent: "queued" } }, p.tenantId)).toEqual(paymentRecordViewV1(invoice, "queued"));
});
it("fresh online loads strip old reviews and mint a new connection; choices never execute actions", async () => {
 const source = { assertCurrent: async () => {}, load: async () => ({ partition: p, context, request: { screen: "acceptance_intent" as const, input: context } }) };
 const screen = await new NativeCoreLoopScreens(p, source, () => id(99)).load("acceptance_intent");
 expect(screen.context.review).toBeNull(); expect(screen.context.connectionId).toBe(id(99));
 expect(nativeReviewChoice(screen, "acceptQuote", true)).toMatchObject({ executed: false, requiresOwningOnlineReview: true });
 expect(() => nativeReviewChoice(screen, "acceptQuote", false)).toThrow(); expect(() => nativeReviewChoice(screen, "recordPayment", true)).toThrow();
});
it("wrong tenant/user or offline source cannot display a native shared view", async () => {
 for (const patch of [{ partition: { ...p, userId: id(99) } }, { context: { ...context, online: false } }, { context: { ...context, current: { ...snapshot, tenantId: id(99) } } }]) {
  const source = { assertCurrent: async () => {}, load: async () => ({ partition: p, context, request: { screen: "acceptance_intent" as const, input: context }, ...patch }) };
  await expect(new NativeCoreLoopScreens(p, source, () => id(99)).load("acceptance_intent")).rejects.toMatchObject({ code: "MOBILE_DENIED" });
 }
});
