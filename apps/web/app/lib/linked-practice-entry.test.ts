import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { practicePairReceipt, verifyPracticePair, practiceCookieOptions } from "./linked-practice-entry";
const secret = "fictional-pairing-secret-over-32-characters";
it("binds the exact parent and device, without containing either credential", () => {
  const identity = randomUUID(), practice = randomUUID();
  const receipt = practicePairReceipt(identity, practice, secret);
  expect(receipt).not.toContain(identity); expect(receipt).not.toContain(practice);
  expect(verifyPracticePair(receipt, identity, practice, secret)).toBe(true);
  expect(verifyPracticePair(receipt, randomUUID(), practice, secret)).toBe(false);
  expect(verifyPracticePair(receipt, identity, randomUUID(), secret)).toBe(false);
  expect(verifyPracticePair(receipt, identity, practice, secret+"other")).toBe(false);
});
it.each([undefined, "", "v1."+"a".repeat(64), "v1."+"A".repeat(64), "x".repeat(10000), "v2."+"a".repeat(64)])("bounds and refuses malformed/forged receipts %s", receipt => {
  expect(verifyPracticePair(receipt, "fictional-parent", randomUUID(), secret)).toBe(false);
});
it("bounds credential parsing and uses server cookie flags", () => {
  expect(()=>practicePairReceipt("x".repeat(257),randomUUID(),secret)).toThrow("UNAUTHENTICATED");
  expect(()=>practicePairReceipt("identity","not-uuid",secret)).toThrow("UNAUTHENTICATED");
  expect(practiceCookieOptions(true)).toEqual({httpOnly:true,secure:true,sameSite:"strict",path:"/"});
});
