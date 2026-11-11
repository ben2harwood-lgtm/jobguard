import { createHash, createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { customerSigninLink, ActionExecutor, type OutboundAdapter } from "./outbox.js";
import { verifiedTenantContextForQueuedJob } from "./tenant-context.js";
import { outboundWorkerPool } from "./worker-pool.js";
import { workerProtocolFixture } from "./worker-protocol-test-fixture.js";
vi.mock("./worker-pool.js", () => ({ outboundWorkerPool: vi.fn() }));
const tenant = "91000000-0000-4000-8000-000000000001";
const context = verifiedTenantContextForQueuedJob(tenant);
function fixture(overrides = {}, name: `fake_${string}` = "fake_capture", digest?: (value: string) => string) {
  const f = workerProtocolFixture({ tenant_id: tenant, ...overrides });
  vi.mocked(outboundWorkerPool).mockResolvedValue(f.pool);
  const adapter: OutboundAdapter = { name, supportsProviderDeduplication: false,
    deliver: vi.fn(async () => ({ kind: "succeeded" as const, providerReference: "fictional" })), reconcile: vi.fn(async () => "unknown" as const) };
  const telemetry = { emit: vi.fn() };
  return { ...f, adapter, telemetry, execute: () => new ActionExecutor(f.pool, new Map([[name, adapter]]), telemetry, digest).execute(context, f.row.id) };
}
describe("ActionExecutor adapter ownership", () => {
  it.each(["pending", "retryable", "executing"])("leaves unsupported %s work untouched", async status => {
    const f = fixture({ status, adapter: "fake_quote_delivery" }), before = { ...f.row };
    await f.execute();
    expect(f.row).toEqual(before); expect(f.adapter.deliver).not.toHaveBeenCalled();
    expect(f.audit).toEqual([]); expect(f.telemetry.emit).not.toHaveBeenCalled();
    expect(f.query.mock.calls.some(([sql]) => /^(UPDATE|INSERT)/u.test(sql))).toBe(false);
  });
});
it("passes retryable failure and the claim token to checked completion on the fifth attempt", async () => {
  const f = fixture(); f.state.attempt = 4;
  vi.mocked(f.adapter.deliver).mockResolvedValue({ kind: "retryable", code: "synthetic_unavailable" });
  await f.execute();
  expect(f.row.status).toBe("dead_letter"); expect(f.adapter.deliver).toHaveBeenCalledOnce();
  expect(f.query).toHaveBeenCalledWith("SELECT app.complete_worker_action($1::uuid,$2::uuid,$3::text,$4::text,$5::text) AS completed", [f.row.id, f.token, "retryable", null, "synthetic_unavailable"]);
  expect(f.telemetry.emit).toHaveBeenCalledWith("outbox.failure", { actionId: f.row.id, attempt: 5 });
});
it.each([false, undefined, "unavailable"])("does not deliver when the checked client authority claim refuses: %s", async authority => {
  const f = fixture({ action_type: "extra.client_approval_request.send", adapter: "fake_email" }, "fake_email");
  f.state.authorized = false;
  if (authority === "unavailable") f.state.claimError = new Error("authority unavailable");
  if (authority === "unavailable") await expect(f.execute()).rejects.toThrow("authority unavailable"); else await f.execute();
  expect(f.adapter.deliver).not.toHaveBeenCalled(); expect(f.audit).toEqual([]);
});
describe("customer sign-in delivery references", () => {
  const reference = "customer-signin-reference.v1:91000000-0000-4000-8000-000000000001/92000000-0000-4000-8000-000000000002/93000000-0000-4000-8000-000000000003/" + "a".repeat(43);
  const digest = (value:string) => createHmac("sha256", "fictional-delivery-secret").update(value).digest("hex");
  it("needs the server key, binds the entire reference and rejects raw links", () => {
    const link = customerSigninLink(reference,digest);
    expect(link).toMatch(/^\/customer\/sign-in#[a-f0-9/-]+\/[A-Za-z0-9_-]{43}$/u);
    expect(link.split("/").at(-1)).not.toBe("a".repeat(43));
    expect(customerSigninLink(reference,digest)).toBe(link);
    expect(customerSigninLink(reference.replace("92000000","94000000"),digest)).not.toBe(link);
    expect(customerSigninLink(reference,v=>createHmac("sha256","other-fictional-key").update(v).digest("hex"))).not.toBe(link);
    expect(()=>customerSigninLink(link,digest)).toThrow("INVALID_CUSTOMER_SIGNIN_REFERENCE");
  });
  it.each(["success", "missing-key", "tampered-hash"])("keeps credentials out of stored work: %s", async mode => {
    const derive = vi.fn(digest);
    const f = fixture({ adapter: "fake_email", action_type: "customer_portal.signin.send", recipient: "fixture@example.invalid",
      policy_version: "customer-signin.synthetic.v1", immutable_content: reference,
      content_hash: mode === "tampered-hash" ? "a".repeat(64) : createHash("sha256").update(reference).digest("hex") }, "fake_email", mode === "missing-key" ? undefined : derive);
    if (mode !== "success") {
      await expect(f.execute()).rejects.toThrow(mode === "missing-key" ? "CUSTOMER_SIGNIN_DELIVERY_UNAVAILABLE" : "CONTENT_HASH_MISMATCH");
      expect(f.adapter.deliver).not.toHaveBeenCalled(); expect(f.row.status).toBe("pending"); return;
    }
    await f.execute();
    expect(f.adapter.deliver).toHaveBeenCalledWith(expect.objectContaining({ immutableContent: reference }), customerSigninLink(reference, digest));
    expect(derive).toHaveBeenCalledOnce(); expect(f.row.status).toBe("succeeded");
    const token = customerSigninLink(reference, digest).split("/").at(-1)!;
    expect(JSON.stringify(f.row)).not.toContain(token); expect(JSON.stringify(f.query.mock.calls)).not.toContain(token);
    expect(JSON.stringify(f.telemetry.emit.mock.calls)).not.toContain(token);
  });
});
