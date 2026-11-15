import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ jar: new Map<string, string>(), session: vi.fn(), practice: vi.fn(), query: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (key: string) => f.jar.has(key) ? { value: f.jar.get(key)! } : undefined }) }));
vi.mock("./identity-server", () => ({ identityApplication: () => ({ session: f.session }) }));
vi.mock("@jobguard/db", async original => ({ ...await original<typeof import("@jobguard/db")>(), authenticatePracticeSession: f.practice }));
import type { Pool } from "pg";
import { practicePairReceipt, verifyPracticePair, practiceCookieOptions, enforcePracticePair, pairingCookie } from "./linked-practice-entry";
const pool = { query: f.query } as unknown as Pool;
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

beforeEach(() => { f.jar.clear(); vi.clearAllMocks(); f.query.mockResolvedValue({rows:[{linked:false}]}); vi.stubEnv("AUTH_CODE_SECRET", secret); });
afterEach(() => vi.unstubAllEnvs());
it.each([false, true])("allows an anonymous credential alongside identity only (identity=%s)", async identity => {
  const token = randomUUID();
  if (identity) f.jar.set("jobguard_session", "fictional-owner");
  f.query.mockResolvedValue({rows:[{linked:false}]});
  await enforcePracticePair(pool, token);
  expect(f.session).not.toHaveBeenCalled(); expect(f.practice).not.toHaveBeenCalled();
});
it.each([false, true])("linked credentials still require a receipt with or without identity (identity=%s)", async identity => {
  if (identity) f.jar.set("jobguard_session", "fictional-owner");
  f.query.mockResolvedValue({rows:[{linked:true}]});
  await expect(enforcePracticePair(pool, randomUUID())).rejects.toThrow("UNAUTHENTICATED");
});
it("a stale linked receipt does not change the authoritative anonymous demo path", async () => {
  const token = randomUUID();
  f.jar.set("jobguard_session", "fictional-owner"); f.jar.set("jg_practice_pair", "stale");
  f.query.mockResolvedValue({rows:[{linked:false}]});
  await enforcePracticePair(pool, token);
  expect(f.session).not.toHaveBeenCalled(); expect(f.practice).not.toHaveBeenCalled();
});

it("keeps core-1000/demo authentication independent of the presented token spelling", async () => {
  const token = randomUUID().toUpperCase();
  f.query.mockResolvedValue({rows:[{linked:false}]});
  await enforcePracticePair(pool, token);
  expect(f.session).not.toHaveBeenCalled(); expect(f.practice).not.toHaveBeenCalled();
});
it("requires the full pair check for a linked marker regardless of the credential digest", async () => {
  const token = randomUUID();
  f.query.mockResolvedValue({rows:[{linked:true}]});
  await expect(enforcePracticePair(pool, token)).rejects.toThrow("UNAUTHENTICATED");
});

it("does not downgrade a missing or malformed SQL marker to anonymous access", async () => {
  for (const rows of [[], [{linked:null}], [{linked:"false"}]]) {
    f.query.mockResolvedValue({rows});
    await expect(enforcePracticePair(pool, randomUUID())).rejects.toThrow();
  }
  f.query.mockRejectedValue(new Error("marker unavailable"));
  await expect(enforcePracticePair(pool, randomUUID())).rejects.toThrow("marker unavailable");
});

it("checks the signed receipt and live identity for a linked marker", async () => {
  const token=randomUUID(),identity="fictional-owner";
  f.query.mockResolvedValue({rows:[{linked:true}]});
  f.jar.set("jobguard_session",identity);
  f.jar.set(pairingCookie,practicePairReceipt(identity,token,secret));
  f.session.mockResolvedValue({memberships:[{role:"owner"}]});
  f.practice.mockResolvedValue({digest:"canonical-linked-namespace"});
  await enforcePracticePair(pool,token);
  expect(f.session).toHaveBeenCalledWith(identity);
  expect(f.practice).toHaveBeenCalledWith(pool,token);
});
