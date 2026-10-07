import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { ActionExecutor, type OutboundAdapter } from "./outbox.js";
import type { VerifiedTenantContext } from "./tenant-context.js";

describe("ActionExecutor adapter ownership", () => {
  it.each([
    { status: "pending", authorization_expires_at: "2099-01-01T00:00:00Z" },
    { status: "pending", authorization_expires_at: "2000-01-01T00:00:00Z" },
    { status: "retryable", authorization_expires_at: "2099-01-01T00:00:00Z" },
    { status: "executing", claimed_at: "2000-01-01T00:00:00Z" },
  ])("leaves unsupported work untouched: $status / $authorization_expires_at", async (state) => {
    const id = "98000000-0000-4000-8000-000000000001";
    const context = { tenantId: "91000000-0000-4000-8000-000000000001" } as VerifiedTenantContext;
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
    const context = { tenantId: "91000000-0000-4000-8000-000000000001" } as VerifiedTenantContext;
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
      if (sql.startsWith("SELECT o.* FROM app.action_outbox")) return { rows: [row] };
      if (sql.startsWith("SELECT count(*)::int n FROM app.action_attempt")) return { rows: [{ n: 4 }] };
      if (sql.startsWith("UPDATE ") || sql.startsWith("INSERT ")) return { rows: [] };
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
