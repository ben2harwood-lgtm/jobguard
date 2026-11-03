import { fakeAuditAppend } from "../src/audit-protocol-test-fixture.js";
import { readFileSync } from "node:fs";
import type { Pool } from "pg";
import { expect, it, vi } from "vitest";
import { FakeOpsSink } from "../../config/src/ops-alerts.js";
import { ActionExecutor, type OutboundAdapter } from "../src/outbox.js";
import { testTenantContext } from "./tenant-context-test-utils.js";

const catalogue = JSON.parse(readFileSync(new URL("../../../config/ops-alerts.v1.json", import.meta.url), "utf8"));
it.each(["retryable", "outcome_unknown"] as const)("actual outbox %s failure reaches the fake sink", async kind => {
  const sink = new FakeOpsSink(catalogue);
  const id = "98000000-0000-4000-8000-000000000001";
  const tenant = "91000000-0000-4000-8000-000000000001";
  const row = { id, status: "retryable", adapter: "fake_capture", authorization_id: id,
    provider_effect_key: "synthetic-ops", action_type: "send_quote", recipient: "customer@example.invalid",
    content_hash: "a".repeat(64), immutable_content: "Fictional quote", aggregate_revision: 1,
    amount_pence: null, currency: null, policy_version: "synthetic.v1",
    created_at: new Date(), authorization_expires_at: new Date("2099-01-01") };
  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    if (sql.includes("FROM app.append_audit(")) return { rows: fakeAuditAppend(String(values[0]), tenant) };
    if (sql === "SELECT outbound_control.claims_enabled() AS enabled") return { rows: [{ enabled: true }] };
    if (sql.startsWith("SELECT o.*")) return { rows: [row] };
    if (sql.startsWith("SELECT count(*)")) return { rows: [{ n: 4 }] };
    if (sql.startsWith("SELECT nullif")) return { rows: [{ tenant_id: tenant }] };
    if (sql.includes("app.lock_audit_head")) return { rows: [] };
    if (sql.startsWith("SELECT clock_timestamp")) return { rows: [{ occurred_at: new Date() }] };
    if (sql.includes("app.advance_audit_head") || sql.startsWith("SELECT pg_advisory_xact_lock")) return { rows: [] };
    if (/^(BEGIN|COMMIT|ROLLBACK|UPDATE |INSERT |SELECT set_config)/u.test(sql)) return { rows: [], rowCount: 1 };
    throw new Error("UNEXPECTED_SYNTHETIC_QUERY");
  });
  const pool = { connect: async () => ({ query, release: vi.fn() }) } as unknown as Pool;
  const adapter: OutboundAdapter = { name: "fake_capture", supportsProviderDeduplication: false,
    deliver: vi.fn(async () => ({ kind, code: "FICTIONAL_FAILURE" })), reconcile: vi.fn() };
  await new ActionExecutor(pool, new Map([[adapter.name, adapter]]), sink.outboxTelemetry()).execute(testTenantContext(tenant), id);
  expect(adapter.deliver).toHaveBeenCalledOnce();
  expect(sink.records.map(record => record.id)).toEqual([kind === "retryable" ? "queue_failure" : "unknown_send"]);
});
