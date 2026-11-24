import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { V2CustomerExtraLinkRepository, assertExtraLinkMode, extraLinkAgreeV1,
  extraLinkAmount, extraLinkCapability, extraLinkCreateV1, extraLinkCustomerView } from "./v2-customer-extra-link-repository.js";

afterEach(() => vi.unstubAllEnvs());
describe("V2-F6 customer agreement boundaries", () => {
  it.each(["0", "1", "-1", "12500", "-12501", "9999999999999999"])("formats exact pence %s without floating point", pence => {
    const amount = extraLinkAmount(pence);
    expect(BigInt(amount.replace(".", ""))).toBe(BigInt(pence));
    expect(amount).toMatch(/^-?\d+\.\d{2}$/u);
  });
  it("fails closed before database access outside V2, including synthetic mode alone", async () => {
    vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); vi.stubEnv("JOBGUARD_LOCAL_V2", "0");
    const query = vi.fn(), pool = { query, connect: vi.fn() } as unknown as Pool;
    expect(assertExtraLinkMode).toThrow("LINK_UNAVAILABLE");
    await expect(new V2CustomerExtraLinkRepository(pool).open("a".repeat(64) + "." + "b".repeat(64))).rejects.toThrow("LINK_UNAVAILABLE");
    expect(query).not.toHaveBeenCalled();
    vi.stubEnv("JOBGUARD_LOCAL_V2", "1"); vi.stubEnv("JOBGUARD_ENV", "production");
    expect(assertExtraLinkMode).toThrow("LINK_UNAVAILABLE");
  });
  it("requires an unguessable firm-bound token and hashes its secret", () => {
    const parsed = extraLinkCapability("a".repeat(64) + "." + "b".repeat(64));
    expect(parsed.firm).toBe("a".repeat(64)); expect(parsed.tokenHash).not.toBe("b".repeat(64));
    expect(() => extraLinkCapability("plain-token")).toThrow("LINK_UNAVAILABLE");
  });
  it("accepts only an exact agreement contract with person, version, job, time and replay identity", () => {
    const input = { version: "v2-extra-link.v1", action: "agree", commandId: randomUUID(), occurredAt: new Date().toISOString(),
      expectedVersion: 1, jobId: randomUUID(), revisionId: randomUUID(), amount: "125.00", name: "Practice customer" };
    expect(extraLinkAgreeV1.safeParse(input).success).toBe(true);
    expect(extraLinkAgreeV1.safeParse({ ...input, amount: 125 }).success).toBe(false);
    expect(extraLinkAgreeV1.safeParse({ ...input, name: "" }).success).toBe(false);
    expect(extraLinkAgreeV1.safeParse({ ...input, tenantId: randomUUID() }).success).toBe(false);
    expect(extraLinkCreateV1.safeParse(input).success).toBe(false);
  });
  it("returns only the customer allowlist", () => {
    const view = extraLinkCustomerView({ job_id: "job", revision_id: "revision", variation_version: 3,
      amount: "125.00", description: "Splashback extension", photos: [{ id: "photo", objectKey: "private", objectVersionId: "private" }],
      link_version: 1, agreed_at: null, token_hash: "secret", capture_text: "hidden", agreed_by: "private" } as never);
    expect(Object.keys(view).sort()).toEqual(["version", "environment", "jobId", "revisionId", "variationVersion", "amount", "description", "photoIds", "expectedVersion", "agreedAt"].sort());
    expect(JSON.stringify(view)).not.toMatch(/secret|private|hidden/u);
  });
  it("rolls back an agreement when the audit append fails", async () => {
    vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); vi.stubEnv("JOBGUARD_LOCAL_V2", "1");
    const jobId = randomUUID(), revisionId = randomUUID(), statements: string[] = [];
    const query = vi.fn(async (sql: string) => {
      statements.push(sql);
      if (sql.includes("app.v2_f6_agree")) return { rows: [{ result: { id: randomUUID(), job_id: jobId, revision_id: revisionId,
        amount: "125.00", actor_membership_id: randomUUID(), replayed: false } }] };
      if (sql.includes("app.append_audit")) throw new Error("forced audit failure");
      return { rows: [] };
    });
    const release = vi.fn(), pool = { connect: async () => ({ query, release }) } as unknown as Pool;
    await expect(new V2CustomerExtraLinkRepository(pool).agree("a".repeat(64) + "." + "b".repeat(64), {
      version: "v2-extra-link.v1", action: "agree", commandId: randomUUID(), occurredAt: new Date().toISOString(),
      expectedVersion: 1, jobId, revisionId, amount: "125.00", name: "Practice customer" })).rejects.toThrow("forced audit failure");
    expect(statements.at(-1)).toBe("ROLLBACK"); expect(statements).not.toContain("COMMIT"); expect(release).toHaveBeenCalledOnce();
  });
});
