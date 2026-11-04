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
  it("does not modify the fingerprinted invoice shape or allocation permissions", () => {
    const sql = read("../migrations/0795_lp8a_billing_revokes.sql");
    expect(sql).not.toMatch(/ALTER\s+TABLE|GRANT[^;]*TO jobguard_runtime/i);
    expect(sql).not.toMatch(/(?:receipt_line_allocation|recovery_case_allocation|recovery_allocation_command)/);
  });
});
