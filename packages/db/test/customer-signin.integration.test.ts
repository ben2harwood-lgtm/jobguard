import { lp5RegistryRows } from "./lp5-command-catalog.js";
import { assertLp4SealedEvents } from "./lp4-writer-catchup-fixture.js";
import { ActionExecutor, type OutboundAdapter } from "../src/outbox.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
// CI only: real PostgreSQL proves atomic consumption, RLS, current binding and upgrade behavior.
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { beforeAll, afterAll, expect, it } from "vitest";
import { startBeforeMigration, applyMigration, type Cluster } from "./contractor-practice-session-fixtures.js";
import { migrate } from "../src/migrate.js";
import { snapshot } from "./contractor-entitlement-fixtures.js";
const own = "0387_customer_signin.sql";
const hmac = (v: string) => createHmac("sha256", "fictional-customer-secret-at-least-32-bytes").update(v).digest("hex");
let c: Cluster;
beforeAll(async () => {
  c = await startBeforeMigration(own);
  const before = await snapshot(c.admin);
  const expected = { ...before, "app.customer_portal_grant": [], "app.customer_portal_session": [] };
  await applyMigration(c, own);
  expect(await snapshot(c.admin)).toEqual(expected);
  await migrate(c.admin); await migrate(c.admin);
  const registry = (await c.admin.query("SELECT jsonb_agg(value ORDER BY value::text) data FROM jsonb_array_elements($1::jsonb)", [JSON.stringify(lp5RegistryRows)])).rows[0].data;
  const successors = { ...expected, "app.customer_variation_approval": [], "app.activation_acceptance_operation_use": [], "app.command_lifecycle_claim": [], "app.command_type_registry": registry, "app.repository_operational_record": [] };
  expect(await snapshot(c.admin, Object.keys(successors))).toEqual(successors);
}, 120000);
afterAll(async () => { await c?.close(); });
async function identityQuery(sql: string, args: unknown[]) {
  const db = await c.admin.connect();
  try { await db.query("BEGIN"); await db.query("SET LOCAL ROLE jobguard_identity"); const result = await db.query(sql, args); await db.query("COMMIT"); return result; }
  catch (error) { await db.query("ROLLBACK"); throw error; } finally { db.release(); }
}
async function world(role = "owner") {
  const tenant = randomUUID(), account = randomUUID(), member = randomUUID(), user = randomUUID(), job = randomUUID(), session = randomUUID(), token = randomBytes(32).toString("base64url"), digest = hmac(token);
  await c.admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [tenant]);
  await c.admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [user]);
  await c.admin.query("INSERT INTO identity.user_email(email,user_id) VALUES($1,$2)", [`${user}@fixture.invalid`, user]);
  await c.admin.query("INSERT INTO app.account(tenant_id,id,name) VALUES($1,$2,'Fictional builder')", [tenant, account]);
  await c.admin.query("INSERT INTO app.membership(tenant_id,id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,$5)", [tenant, member, account, user, role]);
  await c.admin.query("INSERT INTO identity.membership_locator(user_id,tenant_id,membership_id) VALUES($1,$2,$3)", [user, tenant, member]);
  await c.admin.query("INSERT INTO identity.session(id,user_id,token_digest,csrf_token,expires_at,environment) VALUES($1,$2,$3,'fictional-csrf-token',clock_timestamp()+interval '1 hour','synthetic_demo')", [session, user, digest]);
  await c.admin.query("INSERT INTO app.job(tenant_id,id,title) VALUES($1,$2,'Fictional portal job')", [tenant, job]);
  const party = (await c.admin.query("SELECT b.* FROM app.job_party_current pc JOIN app.job_party_binding b ON(b.tenant_id,b.job_id,b.id)=(pc.tenant_id,pc.job_id,pc.binding_id) WHERE pc.tenant_id=$1 AND pc.job_id=$2", [tenant, job])).rows[0]!;
  return { tenant, account, member, job, customer: party.customer_id as string, revision: party.customer_revision_id as string, binding: party.id as string, digest, token };
}
type World = Awaited<ReturnType<typeof world>>;
async function issue(w: World) {
  const token = randomBytes(32).toString("base64url"), digest = hmac(`customer-link:${token}`), path = `/customer/sign-in#${w.tenant}/${w.job}/${w.customer}/${token}`;
  const grant = (await identityQuery("SELECT identity.customer_portal_issue($1,$2,$3,$4,$5,$6) id", [w.tenant, w.digest, w.job, w.customer, digest, path])).rows[0].id as string;
  return { grant, digest, path, sessionDigest: hmac(randomUUID()) };
}
const use = (w: World, k: Awaited<ReturnType<typeof issue>>, operation = "redeem", changes: Partial<World> = {}) => {
  const x = { ...w, ...changes };
  return identityQuery("SELECT identity.customer_portal_use($1,$2,$3,$4,$5,$6) result", [x.tenant, x.job, x.customer, operation === "redeem" ? k.digest : k.sessionDigest, k.sessionDigest, operation]);
};
const refused = { code: "42501", message: "CUSTOMER_REFUSED" };
it.each(["admin", "estimator", "foreman", "operative", "read_only"])("%s cannot issue", async role => { await expect(issue(await world(role))).rejects.toMatchObject(refused); });
it.each(["owner", "finance"])("%s can issue only an outbox fake email, no plaintext in grants or audit", async role => {
  const w = await world(role), k = await issue(w);
  await assertLp4SealedEvents(c.admin,w.tenant,"customer_portal.issued");
  const grant = (await c.admin.query("SELECT row_to_json(g) g FROM app.customer_portal_grant g WHERE tenant_id=$1 AND id=$2", [w.tenant, k.grant])).rows[0].g;
  expect(JSON.stringify(grant)).not.toContain(k.path.split("/").at(-1));
  expect(grant.company_id).toBe(w.account);
  expect(new Date(grant.expires_at).getTime() - new Date(grant.issued_at).getTime()).toBe(600000);
  const outbox = (await c.admin.query("SELECT * FROM app.action_outbox WHERE tenant_id=$1 AND id=$2", [w.tenant, grant.outbox_id])).rows[0];
  expect(outbox).toMatchObject({ adapter: "fake_email", recipient: "practice-customer@example.invalid", immutable_content: k.path, status: "pending" });
  const audit = JSON.stringify((await c.admin.query("SELECT payload FROM app.audit_event WHERE tenant_id=$1", [w.tenant])).rows);
  expect(audit).not.toMatch(/email|customer-link|token|Fictional|practice-customer/);
});
it("concurrent double redemption has exactly one winner; replay and second session are refused", async () => {
  const w = await world(), k = await issue(w);
  const results = await Promise.allSettled([use(w, k), use(w, { ...k, sessionDigest: hmac(randomUUID()) })]);
  expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
  expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
  await expect(use(w, k)).rejects.toMatchObject(refused);
  expect((await c.admin.query("SELECT count(*)::int n FROM app.customer_portal_session WHERE tenant_id=$1", [w.tenant])).rows[0].n).toBe(1);
});
it.each(["forged", "expired", "revoked", "customer", "job", "tenant", "stale"])("refuses %s links without consumption or session", async kind => {
  const w = await world(), k = await issue(w);
  if (kind === "forged") k.digest = hmac("forged");
  if (kind === "expired") await c.admin.query("UPDATE app.customer_portal_grant SET issued_at=issued_at-interval '11 minutes',expires_at=expires_at-interval '11 minutes' WHERE tenant_id=$1", [w.tenant]);
  if (kind === "revoked") await identityQuery("SELECT identity.customer_portal_revoke($1,$2,$3,$4)", [w.tenant, w.digest, w.job, k.grant]);
  if (kind === "stale") await c.admin.query("INSERT INTO app.customer_revision(tenant_id,id,customer_id,revision,payload) SELECT tenant_id,$2,customer_id,revision+1,payload FROM app.customer_revision WHERE tenant_id=$1 AND id=$3", [w.tenant, randomUUID(), w.revision]);
  const changes = kind === "customer" ? { customer: randomUUID() } : kind === "job" ? { job: randomUUID() } : kind === "tenant" ? { tenant: randomUUID() } : {};
  await expect(use(w, k, "redeem", changes)).rejects.toMatchObject(refused);
  expect((await c.admin.query("SELECT consumed_at FROM app.customer_portal_grant WHERE tenant_id=$1", [w.tenant])).rows[0].consumed_at).toBeNull();
  expect((await c.admin.query("SELECT count(*)::int n FROM app.customer_portal_session WHERE tenant_id=$1", [w.tenant])).rows[0].n).toBe(0);
});
it("session is scoped to one job/customer/tenant and sign-out revokes server-side", async () => {
  const w = await world(), k = await issue(w); await use(w, k);
  expect((await use(w, k, "resolve")).rows[0].result).toMatchObject({ jobId: w.job, customerId: w.customer, companyId: w.account });
  for (const changes of [{ job: randomUUID() }, { customer: randomUUID() }, { tenant: randomUUID() }]) await expect(use(w, k, "resolve", changes)).rejects.toMatchObject(refused);
  await use(w, k, "signout"); await expect(use(w, k, "resolve")).rejects.toMatchObject(refused);
});
it.each(["revoked", "expired", "issuer_revoked", "stale"])("sessions refuse %s after redemption", async kind => {
  const w = await world(), k = await issue(w); await use(w, k);
  if (kind === "revoked") await identityQuery("SELECT identity.customer_portal_revoke($1,$2,$3,$4)", [w.tenant, w.digest, w.job, k.grant]);
  if (kind === "expired") await c.admin.query("UPDATE app.customer_portal_session SET issued_at=issued_at-interval '2 hours',expires_at=expires_at-interval '2 hours' WHERE tenant_id=$1", [w.tenant]);
  if (kind === "issuer_revoked") await c.admin.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2", [w.tenant, w.member]);
  if (kind === "stale") await c.admin.query("INSERT INTO app.customer_revision(tenant_id,id,customer_id,revision,payload) SELECT tenant_id,$2,customer_id,revision+1,payload FROM app.customer_revision WHERE tenant_id=$1 AND id=$3", [w.tenant, randomUUID(), w.revision]);
  await expect(use(w, k, "resolve")).rejects.toMatchObject(refused);
});
it("new tables have FORCE RLS and no direct runtime, identity or infrastructure access", async () => {
  for (const table of ["customer_portal_grant", "customer_portal_session", "customer_variation_approval"]) {
    const row = (await c.admin.query("SELECT relrowsecurity,relforcerowsecurity,pg_get_userbyid(relowner) owner FROM pg_class WHERE oid=$1::regclass", [`app.${table}`])).rows[0];
    expect(row).toEqual({ relrowsecurity: true, relforcerowsecurity: true, owner: "jobguard_migration" });
    for (const role of ["jobguard_runtime", "jobguard_identity", "jobguard_infrastructure"]) expect((await c.admin.query("SELECT has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') allowed", [role, `app.${table}`])).rows[0].allowed).toBe(false);
  }
  for (const fn of ["identity.customer_portal_issue(uuid,text,uuid,uuid,text,text)", "identity.customer_portal_use(uuid,uuid,uuid,text,text,text)", "identity.customer_portal_revoke(uuid,text,uuid,uuid)"]) {
    for (const role of ["jobguard_runtime", "jobguard_infrastructure"]) expect((await c.admin.query("SELECT has_function_privilege($1,$2,'EXECUTE') allowed", [role, fn])).rows[0].allowed).toBe(false);
  }
});

it("finance can execute only the exact fake sign-in email; unrelated sends remain owner-only", async () => {
 const w=await world("finance"),k=await issue(w);
 const outbox=(await c.admin.query("SELECT outbox_id FROM app.customer_portal_grant WHERE tenant_id=$1 AND id=$2",[w.tenant,k.grant])).rows[0].outbox_id;
 let deliveries=0;
 const adapter:OutboundAdapter={name:"fake_email",supportsProviderDeduplication:false,deliver:async action=>{expect(action.immutableContent).toBe(k.path);deliveries++;return {kind:"succeeded",providerReference:"fictional-delivery"};},reconcile:async()=>"unknown"};
 const executor=new ActionExecutor(c.runtime,new Map([[adapter.name,adapter]]),{emit:()=>undefined});
 await executor.execute(testTenantContext(w.tenant),outbox);expect(deliveries).toBe(1);
 expect((await c.admin.query("SELECT status FROM app.action_outbox WHERE tenant_id=$1 AND id=$2",[w.tenant,outbox])).rows[0].status).toBe("succeeded");
 for(const variant of [
  {action:"quote.send",policy:"customer-signin.synthetic.v1",recipient:"fixture@example.invalid",amount:null},
  {action:"customer_portal.signin.send",policy:"wrong-policy",recipient:"fixture@example.invalid",amount:null},
  {action:"customer_portal.signin.send",policy:"customer-signin.synthetic.v1",recipient:"fixture@example.com",amount:null},
  {action:"customer_portal.signin.send",policy:"customer-signin.synthetic.v1",recipient:"fixture@example.invalid",amount:1},
 ]) {
 const d=randomUUID(),r=randomUUID(),a=randomUUID(),other=randomUUID();
 await c.admin.query("INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type) VALUES($1,$2,'job',$3,$4)",[d,w.tenant,w.job,variant.action]);
 await c.admin.query("INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id) VALUES($1,$2,$3,'approved',$4)",[r,w.tenant,d,w.member]);
 await c.admin.query("INSERT INTO app.action_authorization(id,tenant_id,decision_id,resolution_id,actor_membership_id,action_type,recipient,content_hash,aggregate_revision,policy_version,expires_at,amount_pence,currency) SELECT $1,tenant_id,$2,$3,actor_membership_id,$6,$7,content_hash,aggregate_revision,$8,expires_at,$9,CASE WHEN $9::bigint IS NULL THEN NULL ELSE 'GBP' END FROM app.action_authorization WHERE tenant_id=$4 AND id=(SELECT authorization_id FROM app.action_outbox WHERE tenant_id=$4 AND id=$5)",[a,d,r,w.tenant,outbox,variant.action,variant.recipient,variant.policy,variant.amount]);
 // Pin the reused identifier to UUID before converting its provider-effect key to text.
 await c.admin.query("INSERT INTO app.action_outbox(id,tenant_id,authorization_id,adapter,provider_effect_key,action_type,recipient,content_hash,immutable_content,aggregate_revision,policy_version,authorization_expires_at,amount_pence,currency) SELECT $1::uuid,tenant_id,$2,adapter,$1::uuid::text,$5,$6,content_hash,immutable_content,aggregate_revision,$7,authorization_expires_at,$8,CASE WHEN $8::bigint IS NULL THEN NULL ELSE 'GBP' END FROM app.action_outbox WHERE tenant_id=$3 AND id=$4",[other,a,w.tenant,outbox,variant.action,variant.recipient,variant.policy,variant.amount]);
 await executor.execute(testTenantContext(w.tenant),other);expect(deliveries).toBe(1);
 expect((await c.admin.query("SELECT status FROM app.action_outbox WHERE tenant_id=$1 AND id=$2",[w.tenant,other])).rows[0].status).toBe("pending");
 }

});
it("a redeemed session may outlive the link's ten minutes, but never its own cap", async()=>{
 const w=await world(),k=await issue(w);await use(w,k);
 await c.admin.query("UPDATE app.customer_portal_grant SET issued_at=issued_at-interval '11 minutes',expires_at=expires_at-interval '11 minutes' WHERE tenant_id=$1",[w.tenant]);
 expect((await use(w,k,"resolve")).rows[0].result.jobId).toBe(w.job);
});
it("replacement revokes an existing session and cancels the previous pending outbox",async()=>{
 const w=await world(),first=await issue(w);await use(w,first);
 await c.admin.query("UPDATE app.customer_portal_grant SET issued_at=issued_at-interval '2 minutes',expires_at=expires_at-interval '2 minutes' WHERE tenant_id=$1",[w.tenant]);
 const second=await issue(w);
 await expect(use(w,first,"resolve")).rejects.toMatchObject(refused);await use(w,second);
 expect((await c.admin.query("SELECT o.status FROM app.customer_portal_grant g JOIN app.action_outbox o ON(o.tenant_id,o.id)=(g.tenant_id,g.outbox_id) WHERE g.tenant_id=$1 AND g.id=$2",[w.tenant,first.grant])).rows[0].status).toBe("cancelled");
});

it("issuer credentials cannot select another tenant, job or customer",async()=>{
 const w=await world(),other=await world();
 for(const x of [{...w,tenant:other.tenant,job:other.job,customer:other.customer},{...w,job:randomUUID()},{...w,customer:randomUUID()}])await expect(issue(x)).rejects.toMatchObject(refused);
});
