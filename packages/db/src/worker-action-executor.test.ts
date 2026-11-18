import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkerActionExecutor } from "./worker-action-executor.js";
import type { OutboundAdapter } from "./outbox.js";

const id = "98000000-0000-4000-8000-000000000001";
const token = "98000000-0000-4000-8000-000000000002";
function fixture(claim: unknown, completed = true, digest?: (value: string) => string, name: `fake_${string}` = "fake_capture") {
  const query = vi.fn(async (sql: string, _values?: unknown[]) => ({ rows:
    sql.includes("claims_enabled") ? [{ enabled: true }] :
    sql.includes("claim_worker_action") ? [{ claim }] :
    sql.includes("complete_worker_action") ? [{ completed }] : [] }));
  const release = vi.fn();
  const connect = vi.fn(async () => ({ query, release }));
  const adapter: OutboundAdapter = { name, supportsProviderDeduplication: false,
    deliver: vi.fn(async () => ({ kind: "succeeded" as const, providerReference: "synthetic:receipt" })),
    reconcile: vi.fn(async () => "unknown" as const) };
  const telemetry = { emit: vi.fn() };
  return { query, release, adapter, telemetry, executor: new WorkerActionExecutor({ query, connect } as unknown as Pool,
    new Map([[adapter.name, adapter]]), telemetry, digest) };
}
const claimed = { attempt: 1, token, action: { id, authorization_id: token, adapter: "fake_capture",
  provider_effect_key: "synthetic:effect", action_type: "send_quote", recipient: null, content_hash: createHash("sha256").update("fictional").digest("hex"),
  immutable_content: "fictional", aggregate_revision: 1, amount_pence: null, currency: null,
  policy_version: "synthetic.v1", authorization_expires_at: "2099-01-01T00:00:00Z", created_at: "2026-01-01T00:00:00Z" } };

afterEach(() => vi.unstubAllEnvs());

describe("worker-only executor protocol", () => {
  it.each([null, { refused: true, code: "AUTHORIZATION_REVOKED" }])("does not deliver refused or unclaimable work", async claim => {
    const f = fixture(claim); await f.executor.execute(id);
    expect(f.adapter.deliver).not.toHaveBeenCalled(); expect(f.query.mock.calls.some(([sql]) => sql.includes("complete_worker_action"))).toBe(false);
  });
  it("passes only identifiers to SQL and fences completion with the returned token", async () => {
    const f = fixture(claimed); await f.executor.execute(id);
    expect(f.query.mock.calls.filter(([sql]) => sql.includes("_worker_action"))).toEqual([
      ["SELECT app.claim_worker_action($1::uuid,$2::text[]) AS claim", [id, ["fake_capture"]]],
      ["SELECT app.complete_worker_action($1::uuid,$2::uuid,$3::text,$4::text,$5::text) AS completed",
        [id, token, "succeeded", "synthetic:receipt", null]],
    ]);
    expect(f.adapter.deliver).toHaveBeenCalledOnce();
    expect(f.query.mock.calls.findIndex(([sql]) => sql === "COMMIT")).toBeLessThan(
      f.query.mock.calls.findIndex(([sql]) => sql.includes("complete_worker_action")));
    expect(f.release).toHaveBeenCalledOnce();
  });
  it("does not report an effect when the claim token cannot complete", async () => {
    const f = fixture(claimed, false);
    vi.mocked(f.adapter.deliver).mockResolvedValueOnce({ kind: "outcome_unknown", code: "synthetic-unknown" });
    await f.executor.execute(id);
    expect(f.adapter.deliver).toHaveBeenCalledOnce();
    expect(f.telemetry.emit.mock.calls.map(([name]) => name)).toEqual(["outbox.queue_age"]);
  });
  it.each([[1, "outbox.retry"], [5, "outbox.failure"]] as const)("reports retry attempt %s after durable completion", async (attempt, event) => {
    const f = fixture({ ...claimed, attempt });
    vi.mocked(f.adapter.deliver).mockResolvedValueOnce({ kind: "retryable", code: "synthetic-unavailable" });
    await f.executor.execute(id);
    expect(f.query).toHaveBeenCalledWith(
      "SELECT app.complete_worker_action($1::uuid,$2::uuid,$3::text,$4::text,$5::text) AS completed",
      [id, token, "retryable", null, "synthetic-unavailable"],
    );
    expect(f.telemetry.emit).toHaveBeenCalledWith(event, { actionId: id, attempt });
  });
  it("rolls back a refused settlement guard before delivery", async () => {
    const f = fixture(claimed);
    await expect(f.executor.execute(id, () => { throw new Error("settlement disabled"); })).rejects.toThrow("settlement disabled");
    expect(f.query).toHaveBeenCalledWith("ROLLBACK");
    expect(f.query).not.toHaveBeenCalledWith("COMMIT");
    expect(f.adapter.deliver).not.toHaveBeenCalled(); expect(f.release).toHaveBeenCalledOnce();
  });
  it("delivers only after the claim transaction commits and releases its connection", async () => {
    const f = fixture(claimed);
    vi.mocked(f.adapter.deliver).mockImplementationOnce(async () => {
      expect(f.query).toHaveBeenCalledWith("COMMIT");
      expect(f.release).toHaveBeenCalledOnce();
      return { kind: "succeeded", providerReference: "synthetic:receipt" };
    });
    await f.executor.execute(id);
    expect(f.adapter.deliver).toHaveBeenCalledOnce();
  });
  it("preserves the deployment pause without claiming", async () => {
    vi.stubEnv("JOBGUARD_COMMERCIAL_OUTBOUND", "paused");
    const f = fixture(claimed); await f.executor.execute(id);
    expect(f.query.mock.calls.map(([sql]) => sql)).toEqual(["BEGIN", "ROLLBACK"]);
    expect(f.adapter.deliver).not.toHaveBeenCalled();
  });
  it("refuses an action returned under the wrong identifier", async () => {
    const f = fixture({ ...claimed, action: { ...claimed.action, id: token } });
    await expect(f.executor.execute(id)).rejects.toThrow("WORKER_ACTION_MISMATCH");
    expect(f.query).toHaveBeenCalledWith("ROLLBACK"); expect(f.adapter.deliver).not.toHaveBeenCalled();
  });
  it("leaves thrown provider outcomes for lease-expiry reconciliation", async () => {
    const f = fixture(claimed); vi.mocked(f.adapter.deliver).mockRejectedValueOnce(new Error("unknown provider result"));
    await expect(f.executor.execute(id)).rejects.toThrow("unknown provider result");
    expect(f.query.mock.calls.some(([sql]) => sql.includes("complete_worker_action"))).toBe(false);
  });
  it("refuses unsafe money from the database boundary before delivery", async () => {
    const f = fixture({ ...claimed, action: { ...claimed.action, amount_pence: "9007199254740993", currency: "GBP" } });
    await expect(f.executor.execute(id)).rejects.toThrow(); expect(f.adapter.deliver).not.toHaveBeenCalled();
  });
  it("validates adapter results before completion", async () => {
    const f = fixture(claimed); vi.mocked(f.adapter.deliver).mockResolvedValueOnce({ kind: "succeeded", providerReference: "" });
    await expect(f.executor.execute(id)).rejects.toThrow(); expect(f.query.mock.calls.some(([sql]) => sql.includes("complete_worker_action"))).toBe(false);
  });
});

describe("worker customer sign-in materialisation", () => {
  const reference = `customer-signin-reference.v1:${id}/${token}/${id}/${"a".repeat(43)}`;
  const signin = { ...claimed, action: { ...claimed.action, adapter: "fake_email", action_type: "customer_portal.signin.send",
    policy_version: "customer-signin.synthetic.v1", immutable_content: reference,
    content_hash: createHash("sha256").update(reference).digest("hex") } };
  it("hands the transient credential only to the adapter, after commit", async () => {
    const digest = vi.fn(() => "a".repeat(64));
    const f = fixture(signin, true, digest, "fake_email");
    await f.executor.execute(id);
    expect(digest).toHaveBeenCalledWith(`customer-delivery:${reference}`);
    expect(f.adapter.deliver).toHaveBeenCalledWith(expect.objectContaining({ immutableContent: reference }),
      expect.stringContaining("/customer/sign-in#"));
    expect(JSON.stringify(f.query.mock.calls)).not.toContain("/customer/sign-in#");
    expect(JSON.stringify(f.telemetry.emit.mock.calls)).not.toContain("/customer/sign-in#");
  });
  it("rolls back the claim if worker HMAC material is unavailable", async () => {
    const f = fixture(signin, true, undefined, "fake_email");
    await expect(f.executor.execute(id)).rejects.toThrow("CUSTOMER_SIGNIN_DELIVERY_UNAVAILABLE");
    expect(f.query).toHaveBeenCalledWith("ROLLBACK");
    expect(f.adapter.deliver).not.toHaveBeenCalled();
  });
  it("refuses altered stored bytes before creating a link", async () => {
    const digest = vi.fn(() => "a".repeat(64));
    const f = fixture({ ...signin, action: { ...signin.action, immutable_content: "changed" } }, true, digest, "fake_email");
    await expect(f.executor.execute(id)).rejects.toThrow("CONTENT_HASH_MISMATCH");
    expect(digest).not.toHaveBeenCalled(); expect(f.adapter.deliver).not.toHaveBeenCalled();
  });
});
