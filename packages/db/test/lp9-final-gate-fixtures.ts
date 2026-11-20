import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Pool, PoolClient } from "pg";
import { expect } from "vitest";
import { MIGRATION_URLS } from "../src/migrate.js";
import { verifiedTenantContextFromMembership } from "../src/tenant-context.js";
import { jobDoorsActor } from "./lp-job-doors-fixtures.js";

export async function gatePrincipal(owner: Pool, actor?: Awaited<ReturnType<typeof jobDoorsActor>>) {
  const a = actor ?? await jobDoorsActor(owner), sessionId = randomUUID(), credential = randomBytes(32).toString("hex");
  await owner.query("INSERT INTO identity.user_email(email,user_id) VALUES($1,$2)", [`${a.person}@fictional.invalid`, a.person]);
  await owner.query("INSERT INTO identity.membership_locator VALUES($1,$2,$3)", [a.person, a.tenant, a.member]);
  await owner.query(`INSERT INTO identity.session(id,user_id,environment,token_digest,csrf_token,expires_at)
    VALUES($1,$2,'synthetic_demo',$3,'fictional',clock_timestamp()+interval '1 hour')`, [sessionId, a.person, credential]);
  return { ...a, sessionId, credential };
}
export type GatePrincipal = Awaited<ReturnType<typeof gatePrincipal>>;
export function gateContext(p: GatePrincipal) {
  return verifiedTenantContextFromMembership({ identityUserId: p.person, tenantId: p.tenant, membershipId: p.member } as Parameters<typeof verifiedTenantContextFromMembership>[0], { kind: "real", credential: p.credential });
}
export async function gateRefusal(c: PoolClient, sql: string, args: unknown[] = [], message?: string) {
  await c.query("SAVEPOINT lp9_refusal");
  try { await expect(c.query(sql, args)).rejects.toMatchObject({ code: "42501", ...(message ? { message } : {}) }); }
  finally { await c.query("ROLLBACK TO lp9_refusal; RELEASE lp9_refusal"); }
}

// Same query on source and restored clusters: compare actual catalogue state,
// not just migration labels. Full catalogue acceptance remains in predecessor suites.
export async function gateCatalog(owner: Pool) {
  return (await owner.query(`SELECT jsonb_build_object(
    'roles',(SELECT jsonb_agg(to_jsonb(r) ORDER BY rolname) FROM
      (SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls
       FROM pg_roles WHERE rolname LIKE 'jobguard_%') r),
    'memberships',(SELECT jsonb_agg(to_jsonb(m) ORDER BY role_name,member_name) FROM
      (SELECT pg_get_userbyid(roleid) role_name,pg_get_userbyid(member) member_name,admin_option,inherit_option,set_option
       FROM pg_auth_members) m),
    'tables',(SELECT jsonb_agg(to_jsonb(t) ORDER BY nspname,relname) FROM
      (SELECT n.nspname,c.relname,pg_get_userbyid(c.relowner) owner,c.relacl,c.relrowsecurity,c.relforcerowsecurity
       FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname IN ('app','identity','control_plane','audit_control','infrastructure','outbound_control')) t),
    'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY schemaname,tablename,policyname) FROM pg_policies p
      WHERE schemaname IN ('app','identity','control_plane','audit_control','infrastructure','outbound_control')),
    'triggers',(SELECT jsonb_agg(to_jsonb(t) ORDER BY definition) FROM
      (SELECT pg_get_triggerdef(oid) definition,tgenabled FROM pg_trigger WHERE NOT tgisinternal) t),
    'routines',(SELECT jsonb_agg(to_jsonb(f) ORDER BY signature) FROM
      (SELECT p.oid::regprocedure::text signature,pg_get_userbyid(p.proowner) owner,p.proacl,p.prosecdef,p.proconfig,
         md5(pg_get_functiondef(p.oid)) definition_hash
       FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname IN ('app','identity','control_plane','audit_control','infrastructure','outbound_control')
         AND p.prokind IN ('f','p')) f)
    ) catalog`)).rows[0].catalog;
}
export async function gateMigrationEvidence(owner: Pool) {
  const migrations = await Promise.all(MIGRATION_URLS.map(async url => ({
    stem: url.pathname.split("/").at(-1)!, sha256: createHash("sha256").update(await readFile(url)).digest("hex"),
  })));
  expect((await owner.query("SELECT migration_name FROM public.jobguard_schema_migration ORDER BY migration_name")).rows
    .map(row => row.migration_name)).toEqual(migrations.map(m => m.stem));
  return migrations;
}

/** Owner creates synthetic approval; the actual runtime inserts the checked work. */
export async function gateQueuedAction(owner: Pool, runtime: Pool, p: GatePrincipal) {
  const { transaction } = await import("./lp-job-doors-fixtures.js");
  const { withTenant } = await import("../src/tenant-context.js");
  const id = randomUUID(), authorization = randomUUID(), decision = randomUUID(), resolution = randomUUID();
  const content = "Fictional LP9 document", hash = createHash("sha256").update(content).digest("hex");
  await transaction(owner, p.tenant, async c => {
    await c.query("INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type) VALUES($1,$2,'job',$3,'quote.send')", [decision, p.tenant, randomUUID()]);
    await c.query("INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id) VALUES($1,$2,$3,'approved',$4)", [resolution, p.tenant, decision, p.member]);
    await c.query(`INSERT INTO app.action_authorization(id,tenant_id,decision_id,resolution_id,actor_membership_id,
      action_type,content_hash,aggregate_revision,policy_version,expires_at)
      VALUES($1,$2,$3,$4,$5,'quote.send',$6,1,'synthetic.lp9.v1','2099-01-01')`, [authorization, p.tenant, decision, resolution, p.member, hash]);
  });
  await withTenant(runtime, gateContext(p), tx => tx.$client.query(`SELECT app.insert_authorized_action(
    $1,$2,$3,$4,'fake_lp9',$5,'quote.send',NULL,$6,$7,1,NULL,NULL,'synthetic.lp9.v1','2099-01-01')`,
  [p.member, p.tenant, id, authorization, `lp9:${id}`, hash, content]));
  expect((await owner.query("SELECT status FROM app.action_outbox WHERE id=$1", [id])).rows).toEqual([{ status: "pending" }]);
  return { id, authorization };
}
