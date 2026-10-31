import type { PoolClient } from "pg";
import { expect } from "vitest";
import { lp5ReadTables } from "./lp5-command-catalog.js";

/** Exact LP-5a ACL delta on pre-existing migration-owned relations. */
export async function lp5RelationAcl(db: Pick<PoolClient,"query">, table: string, original: string): Promise<string> {
  if (!lp5ReadTables.includes(table)) return original;
  const items = (await db.query<{ items: string[] }>("SELECT $1::aclitem[]::text[] items", [original])).rows[0]!.items;
  expect(items.some(item => item.startsWith("jobguard_command_writer="))).toBe(false);
  const mask = ["decision", "decision_resolution", "action_authorization", "command_receipt"].includes(table) ? "ar" : "r";
  return (await db.query<{ acl: string }>("SELECT $1::text[]::aclitem[]::text acl", [[...items, `jobguard_command_writer=${mask}/jobguard_migration`]])).rows[0]!.acl;
}

/** Exact permissive policy additions; callers intersect with predecessor tables. */
export function lp5Policies() {
  const tenant = "(tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)";
  const policy = (table: string, name: string, cmd: string) => ({ name: `app.${table}.${name}`,
    permissive: "PERMISSIVE", roles: ["jobguard_command_writer"], cmd,
    qual: cmd === "INSERT" ? null : tenant, with_check: cmd === "SELECT" ? null : tenant });
  return [...lp5ReadTables.map(table => policy(table, "lp5_command_read", "SELECT")),
    ...["decision", "decision_resolution", "action_authorization", "command_receipt"].map(table => policy(table, "lp5_command_insert", "INSERT")),
    policy("command_receipt", "lp5_command_complete", "UPDATE"), policy("command_lifecycle_claim", "tenant_isolation", "ALL")];
}
