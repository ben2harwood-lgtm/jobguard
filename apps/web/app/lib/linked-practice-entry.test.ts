import { createHash, randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ jar: new Map<string, string>(), session: vi.fn(), practice: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (key: string) => f.jar.has(key) ? { value: f.jar.get(key)! } : undefined }) }));
vi.mock("./identity-server", () => ({ identityApplication: () => ({ session: f.session }) }));
vi.mock("@jobguard/db", async original => ({ ...await original<typeof import("@jobguard/db")>(), authenticatePracticeSession: f.practice }));
import type { Pool } from "pg";
import type { authenticatePracticeSession } from "@jobguard/db";
import { practicePairReceipt, verifyPracticePair, practiceCookieOptions, enforcePracticePair } from "./linked-practice-entry";
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

beforeEach(() => { f.jar.clear(); vi.clearAllMocks(); vi.stubEnv("AUTH_CODE_SECRET", secret); });
afterEach(() => vi.unstubAllEnvs());
it.each([false, true])("allows an anonymous credential alongside identity only (identity=%s)", async identity => {
  const token = randomUUID();
  if (identity) f.jar.set("jobguard_session", "fictional-owner");
  const auth = { digest: createHash("sha256").update(token).digest("hex") } as Awaited<ReturnType<typeof authenticatePracticeSession>>;
  await enforcePracticePair({} as Pool, token, auth);
  expect(f.session).not.toHaveBeenCalled(); expect(f.practice).not.toHaveBeenCalled();
});
it.each([false, true])("linked credentials still require a receipt with or without identity (identity=%s)", async identity => {
  if (identity) f.jar.set("jobguard_session", "fictional-owner");
  const auth = { digest: "canonical-linked-namespace" } as Awaited<ReturnType<typeof authenticatePracticeSession>>;
  await expect(enforcePracticePair({} as Pool, randomUUID(), auth)).rejects.toThrow("UNAUTHENTICATED");
});
it("a stale receipt refuses anonymous credentials until explicit demo entry clears it", async () => {
  const token = randomUUID();
  f.jar.set("jobguard_session", "fictional-owner"); f.jar.set("jg_practice_pair", "stale");
  const auth = { digest: createHash("sha256").update(token).digest("hex") } as Awaited<ReturnType<typeof authenticatePracticeSession>>;
  await expect(enforcePracticePair({} as Pool, token, auth)).rejects.toThrow("UNAUTHENTICATED");
});
