import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { verifiedTenantContextForQueuedJob } from "./tenant-context.js";
import { FakeTrueLayerAisAdapter, SyntheticAisTokenVault, aisHash, type AisPage } from "./ais-adapter.js";
import { DarkAisRepository } from "./ais-repository.js";

/** Scripted SQL responses test application orchestration only; PostgreSQL tests prove authority/RLS. */
async function fixture() {
  const ctx = verifiedTenantContextForQueuedJob(randomUUID()), id = randomUUID(), digest = "a".repeat(64), actor = randomUUID();
  let stateHash = "", status = "awaiting_consent", accountRef: string | null = null;
  const calls: Array<{ op: string; payload: unknown }> = [];
  const client = { release: vi.fn(), query: vi.fn(async (sql: string, values: unknown[] = []) => {
    if (!sql.includes("app.dark_ais")) return { rows: [] };
    const op = values[3] as string, input = JSON.parse(values[4] as string) as Record<string, string>;
    calls.push({ op, payload: input });
    if (op === "start") stateHash = input.stateHash!;
    if (op === "link") { if (status !== "awaiting_consent") throw new Error("AIS_CALLBACK_USED"); status = "linked"; accountRef = input.accountRef!; }
    if (["revoked", "unlinked", "token_revoked"].includes(op)) status = op;
    if (op === "page" && status !== "linked") throw new Error("AIS_INACTIVE");
    return { rows: [{ result: { connectionId: id, stateHash, accountRef, status, changed: op !== "inspect", actor } }] };
  }) };
  const pool = { connect: async () => client } as unknown as Pool;
  const adapter = new FakeTrueLayerAisAdapter(), vault = new SyntheticAisTokenVault(), repository = new DarkAisRepository(pool, adapter, vault, "synthetic_demo");
  const consent = await repository.start(ctx, digest, { version: "ais-start.v1", connectionId: id, expiresAt: new Date(Date.now() + 3_600_000).toISOString() });
  const page: AisPage = { version: "ais-page.v1", observations: [], nextCursor: null };
  const code = adapter.register({ version: "ais-binding.v1", tenantId: ctx.tenantId, connectionId: id, stateHash: aisHash(consent.state) }, "fake_account", new Map([["first", page]]));
  const callback = { version: "ais-callback.v1", code, state: consent.state };
  return { repository, adapter, vault, ctx, digest, id, callback, calls, client };
}
const window = { version: "ais-window.v1", from: "2026-10-01", to: "2026-10-31", cursor: null };

describe("M4-7 application orchestration (scripted SQL)", () => {
  it("keeps provider tokens out of SQL, responses and serialized dependencies; callback replay fails", async () => {
    const s = await fixture();
    const linked = await s.repository.callback(s.ctx, s.digest, s.id, s.callback);
    const token = (await s.vault.get(s.id))!;
    const pulled = await s.repository.pull(s.ctx, s.digest, s.id, window);
    expect(token).toMatch(/^fake_token_/u);
    expect(JSON.stringify([s.calls, linked, pulled, s.adapter, s.vault])).not.toContain(token);
    expect(linked).toEqual({ version: "ais-status.v1", connectionId: s.id, status: "linked" });
    await expect(s.repository.callback(s.ctx, s.digest, s.id, s.callback)).rejects.toThrow("AIS_CALLBACK_INVALID");
    expect(s.client.query.mock.calls.some(([sql]) => sql === "COMMIT")).toBe(true);
  });
  it("checks consent after provider execution and redacts unexpected provider failure text", async () => {
    const s = await fixture(); await s.repository.callback(s.ctx, s.digest, s.id, s.callback);
    const pull = s.adapter.pull.bind(s.adapter);
    s.adapter.pull = async (...args) => { const result = await pull(...args); await s.repository.stop(s.ctx, s.digest, s.id, "revoked"); return result; };
    await expect(s.repository.pull(s.ctx, s.digest, s.id, window)).rejects.toThrow("AIS_INACTIVE");
    expect(s.client.query.mock.calls.some(([sql]) => sql === "ROLLBACK")).toBe(true);
    const error = await fixture(); await error.repository.callback(error.ctx, error.digest, error.id, error.callback);
    error.adapter.pull = async () => { throw new Error("raw secret, bank data and provider URL"); };
    await expect(error.repository.pull(error.ctx, error.digest, error.id, window)).rejects.toThrow(/^AIS_PROVIDER_FAILED$/u);
    expect(error.calls.filter(c => c.op === "page")).toHaveLength(0);
  });
  it("token loss or provider revocation records a durable stop before vault removal; oversize backfill fails early", async () => {
    for (const missing of [true, false]) {
      const s = await fixture(); await s.repository.callback(s.ctx, s.digest, s.id, s.callback);
      if (missing) await s.vault.revoke(s.id); else s.adapter.revokeToken((await s.vault.get(s.id))!);
      await expect(s.repository.pull(s.ctx, s.digest, s.id, window)).rejects.toThrow("AIS_TOKEN_REVOKED");
      expect(s.calls.at(-1)?.op).toBe("token_revoked"); expect(await s.vault.get(s.id)).toBeUndefined();
    }
    const s = await fixture();
    await expect(s.repository.pull(s.ctx, s.digest, s.id, { ...window, from: "2020-01-01" })).rejects.toThrow("AIS_INVALID");
    expect(s.calls).toHaveLength(1);
  });
  it("validates grants and callbacks without echoing untrusted token/error values", async () => {
    const s = await fixture();
    s.adapter.exchange = async () => { throw new Error("untrusted token or callback contents"); };
    await expect(s.repository.callback(s.ctx, s.digest, s.id, s.callback)).rejects.toThrow(/^AIS_CALLBACK_INVALID$/u);
    expect(await s.vault.get(s.id)).toBeUndefined();
    await expect(s.repository.callback(s.ctx, s.digest, s.id, { ...s.callback, accountRef: "fake_swapped" })).rejects.toThrow(/^AIS_INVALID$/u);
  });
  it("clears a token if consent is unlinked while callback credentials are being stored", async () => {
    const s = await fixture(), put = s.vault.put.bind(s.vault);
    s.vault.put = async (id, token) => { await put(id, token); await s.repository.stop(s.ctx, s.digest, s.id, "unlinked"); };
    await expect(s.repository.callback(s.ctx, s.digest, s.id, s.callback)).rejects.toThrow("AIS_TOKEN_REVOKED");
    expect(await s.vault.get(s.id)).toBeUndefined();
    expect((await s.repository.read(s.ctx, s.digest, s.id)).status).toBe("unlinked");
  });
});
