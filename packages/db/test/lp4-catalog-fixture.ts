import type { PoolClient } from "pg";
import { expect } from "vitest";

// Exact LP-4 delta on the one pre-existing application table. Preserve every
// other grant; do not learn an expected ACL from the post-upgrade catalogue.
export async function lp4AuditEventAcl(db:Pick<PoolClient,"query">,original:string):Promise<string> {
  const items=(await db.query<{items:string[]}>("SELECT $1::aclitem[]::text[] items",[original])).rows[0]!.items;
  expect(items).toContain("jobguard_runtime=ar/jobguard_migration");
  expect(items.some(item=>item.startsWith("jobguard_audit_writer="))).toBe(false);
  const updated=items.map(item=>item==="jobguard_runtime=ar/jobguard_migration"?"jobguard_runtime=r/jobguard_migration":item);
  updated.push("jobguard_audit_writer=ar/jobguard_migration");
  return (await db.query<{acl:string}>("SELECT $1::text[]::aclitem[]::text acl",[updated])).rows[0]!.acl;
}
