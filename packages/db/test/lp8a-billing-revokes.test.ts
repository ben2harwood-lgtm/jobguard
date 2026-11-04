import { randomUUID, createHash } from "node:crypto";
import type { Pool } from "pg";
import { CustomerBillingCommandService } from "../src/customer-billing-repository.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { readFileSync } from "node:fs";
import { combineLp0, loadMigrationProofs } from "./migration-proof-loader.js";
import { describe, expect, it } from "vitest";
const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const tables = ["customer_invoice", "customer_invoice_evidence", "customer_credit_note", "customer_payment", "customer_payment_reversal", "customer_invoice_sequence", "customer_credit_note_sequence"];
describe("LP-8a staged cutover", () => {
  it("withdraws the eight inventoried direct creation/number capabilities", () => {
    const inventory = combineLp0(JSON.parse(read("../../../docs/contracts/lp-0-effective-privileges-v1.json")), loadMigrationProofs().proofs);
    const keys = new Set(inventory.entries.map((entry: { key: string }) => entry.key));
    for (const table of tables) {
      expect(keys.has(`acl|rel|table|app.${table}|jobguard_runtime|INSERT|-`)).toBe(false);
      expect(keys.has(`acl|rel|table|app.${table}|jobguard_runtime|SELECT|-`)).toBe(true);
    }
    expect(keys.has("acl|routine|function:app.reserve_customer_invoice_number(uuid)|jobguard_runtime|EXECUTE|-")).toBe(false);
  });
  it("records number reservation as owner-only without dropping either checked invoice signature", () => {
    const inventory = combineLp0(JSON.parse(read("../../../docs/contracts/lp-0-effective-privileges-v1.json")), loadMigrationProofs().proofs);
    const reserve = inventory.recorded.routines.find((r: { identity: string }) => r.identity === "function:app.reserve_customer_invoice_number(uuid)");
    expect(reserve).toMatchObject({ reachable: false, runtimeExecute: false, publicExecute: false });
    for (const name of ["issue_practice_customer_invoice", "issue_lock_bound_customer_invoice"])
      expect(inventory.recorded.routines.find((r: { identity: string }) => r.identity.startsWith(`function:app.${name}(`))).toMatchObject({ runtimeExecute: true, publicExecute: false });
    expect(inventory.entries.some((e: { key: string }) => e.key === "owner|routine|function:app.reserve_customer_invoice_number(uuid)|jobguard_migration")).toBe(false);
  });
  it("retains the latest LP-6d pointer binding before validating the revision", () => {
    const predecessor = read("../migrations/0780_lp6d_remaining_routines.sql").split("CREATE OR REPLACE FUNCTION app.advance_final_account_draft(")[1]!.split("$$;")[0]!;
    const preamble = predecessor.split("AS $$")[1]!.split("BEGIN IF")[0]!;
    const current = read("../migrations/0795_lp8a_billing_revokes.sql");
    expect(current).toContain(preamble);
    expect(current.indexOf("PERFORM app.current_actor()")).toBeLessThan(current.indexOf("SELECT * INTO head"));
    expect(current).toContain("candidate.previous_revision_id IS DISTINCT FROM head.current_revision_id");
  });
  it("does not modify the fingerprinted invoice shape or allocation permissions", () => {
    const sql = read("../migrations/0795_lp8a_billing_revokes.sql");
    expect(sql).not.toMatch(/ALTER\s+TABLE|GRANT[^;]*TO jobguard_runtime/i);
    expect(sql).not.toMatch(/(?:receipt_line_allocation|recovery_case_allocation|recovery_allocation_command)/);
  });
});

// Query doubles test the service's compatibility replay boundary only. SQL/RLS,
// session authentication and the surviving overloads require the integration suite.
describe("legacy service payment replay identity", () => {
  const tenant = randomUUID(), actor = randomUUID(), paymentId = randomUUID();
  const input = { version: "customer-payment.record.v1", commandId: randomUUID(), actorMembershipId: actor,
    jobId: randomUUID(), invoiceId: randomUUID(), paidOn: "2026-11-04", amountPence: 1000,
    currency: "GBP", method: "bank_transfer", reference: "fictional-replay", builderAttestsReceived: true };
  const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  function fixture(bound: {actor:string;tenant:string} | undefined, contentHash = hash) {
    const calls: string[] = [];
    const pool = { connect: async () => ({ release() {}, async query(sql: string) {
      calls.push(sql);
      if (sql === "SELECT app.current_actor() actor, app.current_tenant() tenant") return { rows: bound ? [bound] : [] };
      if (sql.includes("SELECT role FROM app.membership")) return { rows: [{ role: "owner" }] };
      if (sql.includes("FROM app.command_receipt r")) return { rows: [{ command_type: "customer_payment.record", actor_membership_id: actor,
        status: "succeeded", result: { paymentId }, content_hash: contentHash }] };
      if (/^(BEGIN|ROLLBACK|COMMIT|SELECT set_config)/u.test(sql)) return { rows: [] };
      throw new Error(`Unexpected SQL: ${sql}`);
    } }) } as unknown as Pool;
    return { calls, service: new CustomerBillingCommandService(pool) };
  }
  it.each([undefined, {actor:randomUUID(),tenant}, {actor,tenant:randomUUID()}])("rejects absent or substituted binding before stored results", async bound => {
    const f = fixture(bound);
    await expect(f.service.recordPayment(testTenantContext(tenant),input)).rejects.toMatchObject({code:"FORBIDDEN"});
    expect(f.calls.some(sql=>sql.includes("FROM app.command_receipt"))).toBe(false);
    expect(f.calls).toContain("ROLLBACK");
  });
  it("preserves the exact historical retry for the bound member", async () => {
    const f = fixture({actor,tenant});
    await expect(f.service.recordPayment(testTenantContext(tenant),input)).resolves.toMatchObject({paymentId,qualifyingRecoveryProof:false,platformFeeSettlement:false});
    expect(f.calls).toContain("COMMIT");
  });
  it("still rejects a changed approved receipt", async () => {
    const f = fixture({actor,tenant},"b".repeat(64));
    await expect(f.service.recordPayment(testTenantContext(tenant),input)).rejects.toMatchObject({code:"COMMAND_CONFLICT"});
    expect(f.calls).toContain("ROLLBACK");
  });
});
