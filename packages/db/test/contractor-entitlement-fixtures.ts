import { randomUUID } from "node:crypto";
import { expect } from "vitest";
import type { Pool, PoolClient } from "pg";
import { ContractorEntitlementAuthorityRepository } from "../src/contractor-entitlement-authority-repository.js";
import { ownerTx, type Cluster, type SessionFixture } from "./contractor-practice-session-fixtures.js";
export { cluster, startSession, startBeforeMigration, applyMigration, ownerTx, makeSessionExpired } from "./contractor-practice-session-fixtures.js";
export type { Cluster, SessionFixture };
export const own = "0193_contractor_entitlement_authority.sql";
export async function snapshot(db: Pool | PoolClient) {
 const tables = (await db.query("SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN ('app','identity','control_plane','audit_control') ORDER BY 1,2")).rows;
 const rows: Record<string, unknown> = {};
 for (const t of tables) rows[`${t.schemaname}.${t.tablename}`] = (await db.query(`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]') data FROM "${t.schemaname}"."${t.tablename}" t`)).rows[0].data;
 return rows;
}
export async function unchanged<T>(c: Cluster, work: () => Promise<T>): Promise<T> {
 const before = await snapshot(c.admin);
 try { return await work(); } finally { expect(await snapshot(c.admin)).toEqual(before); }
}
export const read = (c: Cluster, f: SessionFixture) => unchanged(c, () => new ContractorEntitlementAuthorityRepository(c.runtime).withAuthority(f.session, async (_db, authority) => authority));
export async function status(c: Cluster, f: SessionFixture, value: "active" | "inactive" | "suspended", assignmentId?: string) {
 return ownerTx(c, f.p.tenantId, async db => {
  await db.$client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,54))", [f.p.tenantId]);
  const assignment = assignmentId ?? (await db.$client.query("SELECT id FROM app.commercial_track_assignment ORDER BY revision DESC LIMIT 1")).rows[0].id;
  const id = randomUUID();
  await db.$client.query(`INSERT INTO app.contractor_agreement_status_revision(tenant_id,id,assignment_id,revision,status,schema_version,environment,fictional_source)
   SELECT $1,$2,$3,coalesce(max(revision),0)+1,$4,'contractor-agreement-status.v1','synthetic_demo',$5 FROM app.contractor_agreement_status_revision WHERE tenant_id=$1 AND assignment_id=$3`, [f.p.tenantId,id,assignment,value,`fictional-fixture:${randomUUID()}`]);
  return id;
 });
}
export async function raw(c: Cluster, tenant: string | null, session: string) {
 const db = await c.runtime.connect();
 try { await db.query("BEGIN"); if (tenant !== null) await db.query("SELECT set_config('app.tenant_id',$1,true)",[tenant]); return (await db.query("SELECT app.mon8_contractor_agreement_context($1) authority",[session])).rows[0].authority; }
 finally { await db.query("ROLLBACK"); db.release(); }
}
/** Exact predecessor catalogue, including columns/constraints and routine bodies. No prefix exclusions. */
export async function predecessorCatalogue(db: Pool | PoolClient) {
 const table = 'contractor_agreement_status_revision';
 const relations = (await db.query(`SELECT n.nspname,c.relname,c.relowner,c.relacl,c.relrowsecurity,c.relforcerowsecurity,
 (SELECT jsonb_agg(to_jsonb(a) ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) columns,
 (SELECT jsonb_agg(jsonb_build_object('name',x.conname,'definition',pg_get_constraintdef(x.oid)) ORDER BY x.conname) FROM pg_constraint x WHERE x.conrelid=c.oid) constraints
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('app','identity','control_plane','audit_control')
 AND c.relkind IN('r','v') AND NOT(n.nspname='app' AND c.relname=$1) ORDER BY 1,2`,[table])).rows;
 const routines = (await db.query(`SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args,p.proowner,p.proacl,p.prosecdef,p.proconfig,pg_get_functiondef(p.oid) definition
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('app','identity','control_plane','audit_control')
 AND NOT(n.nspname='app' AND p.proname IN('mon8_agreement_status_guard','mon8_contractor_agreement_context')) ORDER BY 1,2,3`)).rows;
 const policies=(await db.query("SELECT * FROM pg_policies WHERE schemaname IN('app','identity','control_plane','audit_control') AND NOT(schemaname='app' AND tablename=$1) ORDER BY schemaname,tablename,policyname",[table])).rows;
 return {relations,routines,policies};
}
