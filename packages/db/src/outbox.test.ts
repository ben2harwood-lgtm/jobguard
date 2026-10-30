import { createHash, createHmac } from "node:crypto";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { customerSigninLink, ActionExecutor, type OutboundAdapter } from "./outbox.js";
import { verifiedTenantContextFromMembership } from "./tenant-context.js";

const testTenantContext = (tenantId: string) => verifiedTenantContextFromMembership({
  identityUserId: "30000000-0000-4000-8000-000000000003",
  membershipId: "40000000-0000-4000-8000-000000000004", tenantId,
} as Parameters<typeof verifiedTenantContextFromMembership>[0]);

describe("ActionExecutor adapter ownership", () => {
  it.each([
    { status: "pending", authorization_expires_at: "2099-01-01T00:00:00Z" },
    { status: "pending", authorization_expires_at: "2000-01-01T00:00:00Z" },
    { status: "retryable", authorization_expires_at: "2099-01-01T00:00:00Z" },
    { status: "executing", claimed_at: "2000-01-01T00:00:00Z" },
  ])("leaves unsupported work untouched: $status / $authorization_expires_at", async (state) => {
    const id = "98000000-0000-4000-8000-000000000001";
    const context = testTenantContext("91000000-0000-4000-8000-000000000001");
    const row = {
      id,
      adapter: "fake_quote_delivery",
      authorization_id: "97000000-0000-4000-8000-000000000001",
      provider_effect_key: "synthetic:quote:1",
      action_type: "send_quote",
      recipient: "customer@example.invalid",
      content_hash: "a".repeat(64),
      immutable_content: "Synthetic quote",
      aggregate_revision: 1,
      amount_pence: null,
      currency: null,
      policy_version: "synthetic-quote.v1",
      created_at: "2026-01-01T00:00:00Z",
      authorization_expires_at: "2099-01-01T00:00:00Z",
      ...state,
    };
    const before = { ...row };
    const query = vi.fn(async (sql: string) => {
      if (sql.startsWith("SELECT o.* FROM app.action_outbox")) return { rows: [row] };
      if (sql.startsWith("SELECT count(*)::int n FROM app.action_attempt")) return { rows: [{ n: 0 }] };
      if (sql.startsWith("UPDATE ") || sql.startsWith("INSERT ")) return { rows: [] };
      if (sql.startsWith("SELECT pg_advisory_xact_lock(")) return { rows: [] };
      if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql) || sql.startsWith("SELECT set_config")) return { rows: [] };
      throw new Error(`Unexpected database operation: ${sql}`);
    });
    const release = vi.fn();
    const pool = { connect: vi.fn(async () => ({ query, release })) } as unknown as Pool;
    const capture: OutboundAdapter = {
      name: "fake_capture",
      supportsProviderDeduplication: false,
      deliver: vi.fn(async () => ({ kind: "succeeded" as const, providerReference: "synthetic:unused" })),
      reconcile: vi.fn(async () => "unknown" as const),
    };
    const telemetry = { emit: vi.fn() };

    await expect(new ActionExecutor(pool, new Map([[capture.name, capture]]), telemetry).execute(context, id)).resolves.toBeUndefined();

    expect(query.mock.calls.map(([sql]) => sql)).toEqual([
      "BEGIN",
      "SELECT set_config('app.tenant_id', $1, true)",
      "SELECT pg_advisory_xact_lock(hashtextextended($1::text,54))",
      expect.stringMatching(/^SELECT o\.\* FROM app\.action_outbox.*FOR UPDATE OF o$/u),
      "COMMIT",
    ]);
    expect(row).toEqual(before);
    expect(capture.deliver).not.toHaveBeenCalled();
    expect(capture.reconcile).not.toHaveBeenCalled();
    expect(telemetry.emit).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledOnce();
  });
});

describe("ActionExecutor retry exhaustion", () => {
  it("records a failed attempt with the adapter error code on the fifth retryable result", async () => {
    const id = "98000000-0000-4000-8000-000000000002";
    const context = testTenantContext("91000000-0000-4000-8000-000000000001");
    const row = {
      id,
      adapter: "fake_capture",
      authorization_id: "97000000-0000-4000-8000-000000000002",
      provider_effect_key: "synthetic:retry-exhaustion:1",
      action_type: "send_quote",
      recipient: "customer@example.invalid",
      content_hash: "a".repeat(64),
      immutable_content: "Synthetic quote",
      aggregate_revision: 1,
      amount_pence: null,
      currency: null,
      policy_version: "synthetic-quote.v1",
      created_at: "2026-01-01T00:00:00Z",
      authorization_expires_at: "2099-01-01T00:00:00Z",
      status: "retryable",
    };
    const query = vi.fn(async (sql: string, _values?: unknown[]) => {
      if (sql.startsWith("SELECT nullif(current_setting")) return { rows: [{ tenant_id: context.tenantId }] };
      if (sql === "SELECT sequence::text, event_hash FROM app.lock_audit_head()") return { rows: [] };
      if (sql === "SELECT clock_timestamp() AS occurred_at") return { rows: [{ occurred_at: new Date() }] };
      if (sql === "SELECT app.advance_audit_head($1, $2)") return { rows: [] };
      if (sql.startsWith("SELECT o.* FROM app.action_outbox")) return { rows: [row] };
      if (sql.startsWith("SELECT count(*)::int n FROM app.action_attempt")) return { rows: [{ n: 4 }] };
      if (sql.startsWith("UPDATE ") || sql.startsWith("INSERT ")) return { rows: [] };
      if (sql.startsWith("SELECT pg_advisory_xact_lock(")) return { rows: [] };
      if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql) || sql.startsWith("SELECT set_config")) return { rows: [] };
      throw new Error(`Unexpected database operation: ${sql}`);
    });
    const pool = { connect: vi.fn(async () => ({ query, release: vi.fn() })) } as unknown as Pool;
    const capture: OutboundAdapter = {
      name: "fake_capture",
      supportsProviderDeduplication: false,
      deliver: vi.fn(async () => ({ kind: "retryable" as const, code: "synthetic_unavailable" })),
      reconcile: vi.fn(async () => "unknown" as const),
    };
    const telemetry = { emit: vi.fn() };

    await new ActionExecutor(pool, new Map([[capture.name, capture]]), telemetry).execute(context, id);

    expect(query).toHaveBeenCalledWith(
      expect.stringMatching(/^UPDATE app\.action_outbox SET status=\$2/u),
      [id, "dead_letter", "dead_letter", "dead_letter"],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringMatching(/^UPDATE app\.action_attempt SET outcome=\$3/u),
      [id, 5, "failed", null, "synthetic_unavailable"],
    );
    expect(capture.deliver).toHaveBeenCalledOnce();
    expect(telemetry.emit.mock.calls.map(([name]) => name)).toEqual([
      "outbox.queue_age", "outbox.failure", "outbox.retry",
    ]);
    expect(telemetry.emit).toHaveBeenCalledWith("outbox.failure", { actionId: id, attempt: 5 });
    expect(telemetry.emit).toHaveBeenCalledWith("outbox.retry", { actionId: id, attempt: 5 });
  });
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
  it.each(["success", "missing-key", "tampered-hash"])("keeps credentials out of stored work and audit: %s", async mode => {
    const id="98000000-0000-4000-8000-000000000003", context=testTenantContext("91000000-0000-4000-8000-000000000001");
    const row={id,adapter:"fake_email",authorization_id:"97000000-0000-4000-8000-000000000003",provider_effect_key:"customer-signin:fictional",action_type:"customer_portal.signin.send",recipient:"fixture@example.invalid",content_hash:mode==="tampered-hash"?"a".repeat(64):createHash("sha256").update(reference).digest("hex"),immutable_content:reference,aggregate_revision:1,amount_pence:null,currency:null,policy_version:"customer-signin.synthetic.v1",created_at:"2026-01-01T00:00:00Z",authorization_expires_at:"2099-01-01T00:00:00Z",status:"pending"};
    const query=vi.fn(async(sql:string,values?:unknown[])=>{
      if(sql.startsWith("SELECT o.* FROM app.action_outbox"))return {rows:[row]};
      if(sql.startsWith("SELECT count(*)::int n FROM app.action_attempt"))return {rows:[{n:0}]};
      if(sql.startsWith("SELECT nullif(current_setting"))return {rows:[{tenant_id:context.tenantId}]};
      if(sql==="SELECT clock_timestamp() AS occurred_at")return {rows:[{occurred_at:new Date()}]};
      if(sql.startsWith("UPDATE app.action_outbox SET status='executing'"))row.status="executing";
      if(sql.startsWith("UPDATE app.action_outbox SET status=$2"))row.status=values![1] as string;
      return {rows:[],rowCount:1};
    });
    const pool={connect:vi.fn(async()=>({query,release:vi.fn()}))} as unknown as Pool;
    const deliver=vi.fn(async()=>({kind:"succeeded" as const,providerReference:"fictional-email"}));
    const adapter:OutboundAdapter={name:"fake_email",supportsProviderDeduplication:false,deliver,reconcile:async()=>"unknown"};
    const telemetry={emit:vi.fn()},derive=vi.fn(digest);
    const executor=new ActionExecutor(pool,new Map([[adapter.name,adapter]]),telemetry,mode==="missing-key"?undefined:derive);
    if(mode!=="success") {
      await expect(executor.execute(context,id)).rejects.toThrow(mode==="missing-key"?"CUSTOMER_SIGNIN_DELIVERY_UNAVAILABLE":"CONTENT_HASH_MISMATCH");
      expect(deliver).not.toHaveBeenCalled();expect(row.status).toBe("pending");return;
    }
    await executor.execute(context,id);await executor.execute(context,id);
    expect(deliver).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({immutableContent:reference}),customerSigninLink(reference,digest));
    expect(derive).toHaveBeenCalledOnce();expect(row.status).toBe("succeeded");
    const token=customerSigninLink(reference,digest).split("/").at(-1)!;
    expect(JSON.stringify(row)).not.toContain(token);
    expect(JSON.stringify(query.mock.calls)).not.toContain(token);
    expect(JSON.stringify(telemetry.emit.mock.calls)).not.toContain(token);
  });
});
