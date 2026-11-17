import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { ContractorRepository } from "../src/index.js";
import { rolledBack } from "./upgrade-proof-utils.js";
import { cluster, company, start, end, state, lookup, ownerTx, text, resolvers, repo, on } from "./practice-worker-switch-fixtures.js";
import type { Cluster } from "./contractor-practice-session-fixtures.js";
let c: Cluster;
beforeAll(async () => { process.env.JOBGUARD_ENV = "synthetic_demo"; c = await cluster(); }, 120000);
afterAll(async () => { await c?.close(); });
const insertions = [
 ["locator", "identity.membership_locator", "INSERT INTO identity.membership_locator(user_id,tenant_id,membership_id) SELECT identity_user_id,tenant_id,id FROM app.membership WHERE tenant_id=$1 AND id=$2"],
 ["invitation", "identity.invitation", "INSERT INTO identity.invitation(id,email,tenant_id,account_id,role,expires_at,issuer_user_id) SELECT gen_random_uuid(),'invited@fictional.invalid',tenant_id,account_id,'operative',clock_timestamp()+interval '1 day',identity_user_id FROM app.membership WHERE tenant_id=$1 AND id=$2"],
 ["address", "identity.user_email", "INSERT INTO identity.user_email(email,user_id) SELECT $3,identity_user_id FROM app.membership WHERE tenant_id=$1 AND id=$2"],
 ["session", "identity.session", "INSERT INTO identity.session(id,user_id,environment,token_digest,csrf_token,expires_at) SELECT gen_random_uuid(),identity_user_id,'synthetic_demo',$3,$4,clock_timestamp()+interval '1 day' FROM app.membership WHERE tenant_id=$1 AND id=$2"],
] as const;
// Every extra path named by S1 reaches one of these roots; each has its own running-switch test.
const paths = [
 ["P3 P6 P14 locator", 0, "admin"], ["P2 P14 invitation", 1, "owner"], ["P7 P11 P14 owner address", 2, "owner"], ["P7 P11 P12 P14 worker address", 2, "operative"], ["P8 P15 owner session", 3, "owner"], ["P8 P15 worker session", 3, "operative"],
 ["P16 0143 emergency window uses existing locator", 0, "owner"], ["P17 0143 approved emergency rule uses existing locator", 0, "owner"], ["P18 0143 emergency use uses existing locator", 0, "owner"],
 ["P19 0150 user_email insert", 2, "owner"], ["P20 0150 signup locator insert", 0, "owner"], ["P21 0150 replacement locator repoint", 0, "admin"], ["P22 0150 invitation locator insert", 0, "admin"], ["P23 0150 invitation acceptance", 1, "owner"], ["P24 0150 invitation create", 1, "owner"],
] as const;
it.each(paths)("[PW31] %s stops an already-running switch without changing its history", async (_path, index, role) => {
 const f = await company(c), other = await company(c); await start(c, f); await start(c, other);
 const before = await text(c, "control_plane.practice_worker_switch", f.p.tenantId);
 const [_, table, sql] = insertions[index]; const db = await c.admin.connect();
 const args = index === 2 ? [f.p.tenantId, f.members[role], `${randomUUID()}@fictional.invalid`] : index === 3 ? [f.p.tenantId, f.members[role], randomUUID().replaceAll("-", "").repeat(2), randomUUID()] : [f.p.tenantId, f.members[role]];
 try { await db.query("BEGIN"); if (index !== 3) await db.query(`ALTER TABLE ${table} DISABLE TRIGGER USER`); await db.query(sql, args); if (index !== 3) await db.query(`ALTER TABLE ${table} ENABLE TRIGGER USER`); await db.query("COMMIT"); }
 catch(error) { await db.query("ROLLBACK"); throw error; } finally { db.release(); }
 for (const resolve of resolvers(c)) { const result = await resolve(f.session); expect(result.tenantId).toBe(f.p.tenantId); if ("membershipId" in result) expect(result.membershipId).toBe(f.p.membershipId); }
 expect(await state(c, f)).toMatchObject({ state: "unclosed" }); expect(await text(c, "control_plane.practice_worker_switch", f.p.tenantId)).toEqual(before);
 expect((await lookup(c, other)).membershipId).toBe(other.members.operative);
 await end(c, f); await expect(start(c, f)).rejects.toMatchObject({ code: "SWITCH_FORBIDDEN" });
});
it.each(insertions.slice(0, 3))("[PW15] [PW16] %s prevents marking and is refused after marking", async (_kind, _table, sql) => {
 const f = await company(c), params = _kind === "address" ? [f.p.tenantId, f.p.membershipId, `${randomUUID()}@fictional.invalid`] : [f.p.tenantId, f.p.membershipId];
 await c.admin.query(sql, params); await expect(start(c, f)).rejects.toMatchObject({ code: "SWITCH_FORBIDDEN" }); expect(await text(c, "control_plane.practice_company_marker", f.p.tenantId)).toEqual([]);
 const marked = await company(c); await start(c, marked);
 for (const ended of [false, true]) { if (ended) await end(c, marked); const args = _kind === "address" ? [marked.p.tenantId, marked.p.membershipId, `${randomUUID()}@fictional.invalid`] : [marked.p.tenantId, marked.p.membershipId];
  await expect(c.admin.query(sql, args)).rejects.toMatchObject({ message: "PRACTICE_COMPANY_SIGN_IN_FORBIDDEN" });
  await expect(ownerTx(c, marked.p.tenantId, db => db.$client.query(sql, args))).rejects.toMatchObject({ message: "PRACTICE_COMPANY_SIGN_IN_FORBIDDEN" });
 }
});
it("[PW16] P4 P5 P6 P12 SSO connection attach is refused for a marked company", async () => {
 const f = await company(c); await start(c, f);
 await expect(c.admin.query("INSERT INTO identity.sso_connection(tenant_id,id,metadata) VALUES($1::uuid,$2::uuid,jsonb_build_object('version','sso-metadata.v1','protocol','saml2','provider','in-process-test-idp','id',$2::uuid::text,'tenantId',$1::uuid::text))", [f.p.tenantId, randomUUID()])).rejects.toMatchObject({ code: "42501" });
});
it("[PW31] P1 signup of another company cannot affect an acting session", async () => {
 const f = await company(c); await start(c, f); const b = await company(c); expect(await lookup(c, b)).toEqual(b.p); expect((await lookup(c, f)).membershipId).toBe(f.members.operative);
});
it("[PW31] P9 P10 no connection or locator exists to grant emergency or SCIM access", async () => {
 const f = await company(c); await start(c, f);
 expect((await c.admin.query("SELECT * FROM identity.current_memberships($1)", [f.p.identityUserId])).rows).toEqual([]);
 expect((await c.admin.query("SELECT count(*)::int n FROM identity.sso_connection WHERE tenant_id=$1", [f.p.tenantId])).rows[0]!.n).toBe(0);
});
it("[PW15] [PW33] a marker cannot be written by hand on other terms", async () => {
 const f = await company(c);
 const sql = "INSERT INTO control_plane.practice_company_marker(tenant_id,session_ref,owner_membership_id,owner_identity_user_id,marked_at) VALUES($1,$2,$3,$4,clock_timestamp())";
 await expect(c.admin.query(sql, [f.p.tenantId, f.sessionRef, f.p.membershipId, f.p.identityUserId])).rejects.toMatchObject({ message: "PRACTICE_MARKER_FORBIDDEN" });
 await expect(ownerTx(c, f.p.tenantId, db => db.$client.query(sql, [f.p.tenantId, f.sessionRef, f.members.operative, f.p.identityUserId]))).rejects.toMatchObject({ message: "PRACTICE_MARKER_FORBIDDEN" });
 await rolledBack(c.admin, async db => { await db.query("SELECT set_config('app.tenant_id',$1,true)", [f.p.tenantId]); await db.query(sql, [f.p.tenantId, f.sessionRef, f.p.membershipId, f.p.identityUserId]); });
});
it("[PW33] the runtime role cannot write or read a session row at all", async () => {
 for (const sql of ["SELECT * FROM control_plane.contractor_practice_session", "INSERT INTO control_plane.contractor_practice_session DEFAULT VALUES", "UPDATE control_plane.contractor_practice_session SET revoked_at=clock_timestamp()", "DELETE FROM control_plane.contractor_practice_session"]) await expect(c.runtime.query(sql)).rejects.toMatchObject({ code: "42501" });
});
it("[PW23] new control-plane rows and audit never store a session value", async () => {
 const f = await company(c); await start(c, f);
 for (const table of ["control_plane.practice_company_marker", "control_plane.practice_worker_switch", "app.audit_event"]) for (const row of await text(c, table, f.p.tenantId)) expect(row).not.toContain(f.session);
});
it("[PW33] a hand-built company with no sign-in identity is treated as made-up: the stated limit, not an accident", async () => {
 const { handBuilt } = await import("./practice-worker-switch-fixtures.js"); const f = await handBuilt(c);
 await repo(c).switchOn(f.context, f.p, f.session, { ...on(), workerId: f.workerId }); expect((await lookup(c, f)).membershipId).toBe(f.workerId);
 await expect(c.admin.query("INSERT INTO identity.membership_locator VALUES($1,$2,$3)", [f.p.identityUserId, f.p.tenantId, f.p.membershipId])).rejects.toMatchObject({ message: "PRACTICE_COMPANY_SIGN_IN_FORBIDDEN" });
});
it("[PW33] the same hand-built company with one sign-in row is refused", async () => {
 const { handBuilt } = await import("./practice-worker-switch-fixtures.js"); const f = await handBuilt(c, true);
 await expect(repo(c).switchOn(f.context, f.p, f.session, { ...on(), workerId: f.workerId })).rejects.toMatchObject({ code: "SWITCH_FORBIDDEN" }); expect(await text(c, "control_plane.practice_company_marker", f.p.tenantId)).toEqual([]);
});
it("[PW15] marker history is permanent and timestamp bounds use the database clock", async () => {
 const f = await company(c); await start(c, f);
 for (const sql of ["UPDATE control_plane.practice_company_marker SET marked_at=clock_timestamp() WHERE tenant_id=$1", "DELETE FROM control_plane.practice_company_marker WHERE tenant_id=$1"]) await expect(ownerTx(c, f.p.tenantId, db => db.$client.query(sql, [f.p.tenantId]))).rejects.toMatchObject({ message: "PRACTICE_MARKER_IMMUTABLE" });
 const before = await text(c, "control_plane.practice_company_marker"); await expect(ownerTx(c, f.p.tenantId, db => db.$client.query("TRUNCATE control_plane.practice_company_marker"))).rejects.toThrow(); expect(await text(c, "control_plane.practice_company_marker")).toEqual(before);
 const fresh = await company(c);
 for (const offset of ["-1 day", "1 day"]) await expect(ownerTx(c, fresh.p.tenantId, db => db.$client.query("INSERT INTO control_plane.practice_company_marker(tenant_id,session_ref,owner_membership_id,owner_identity_user_id,marked_at) VALUES($1,$2,$3,$4,clock_timestamp()+$5::interval)", [fresh.p.tenantId, fresh.sessionRef, fresh.p.membershipId, fresh.p.identityUserId, offset]))).rejects.toMatchObject({ message: "PRACTICE_MARKER_FORBIDDEN" });
});
it("[PW16] locator and address repointing cannot attach marked identities", async () => {
 const marked = await company(c), fresh = await company(c); await start(c, marked);
 const address = `${randomUUID()}@fictional.invalid`;
 await c.admin.query("INSERT INTO identity.user_email VALUES($1,$2)", [address, fresh.p.identityUserId]);
 await c.admin.query("INSERT INTO identity.membership_locator VALUES($1,$2,$3)", [fresh.p.identityUserId, fresh.p.tenantId, fresh.p.membershipId]);
 await expect(c.admin.query("UPDATE identity.user_email SET user_id=$2 WHERE email=$1", [address, marked.p.identityUserId])).rejects.toMatchObject({ message: "PRACTICE_COMPANY_SIGN_IN_FORBIDDEN" });
 await expect(c.admin.query("UPDATE identity.membership_locator SET user_id=$1,tenant_id=$2,membership_id=$3 WHERE user_id=$4", [marked.p.identityUserId, marked.p.tenantId, marked.p.membershipId, fresh.p.identityUserId])).rejects.toMatchObject({ message: "PRACTICE_COMPANY_SIGN_IN_FORBIDDEN" });
});
it("[PW31] P13 operator paths have no root to bypass the unchanged identity refusals", async () => {
 // No source pins: the root refusal is proved through a table-owner insert.
 const f = await company(c); await start(c, f);
 await expect(ownerTx(c, f.p.tenantId, db => db.$client.query("INSERT INTO identity.membership_locator VALUES($1,$2,$3)", [f.p.identityUserId, f.p.tenantId, f.p.membershipId]))).rejects.toMatchObject({ message: "PRACTICE_COMPANY_SIGN_IN_FORBIDDEN" }); expect((await lookup(c, f)).membershipId).toBe(f.members.operative);
});
const variants = ["RC2 P1 hand-built signed-in", "RC3 P7 generated signed-in", "V1 P3 locator", "V2 P2 pending invitation", "V3 P3 accepted invitation", "V4 P4 connection", "V5 P5 verified domain", "V6 P7 owner address", "V7 P7 admin address", "V8 P8 direct session"];
it.each(variants)("[PW15] %s refuses routine and table-owner marker without writing either record", async variant => {
 const { handBuilt } = await import("./practice-worker-switch-fixtures.js");
 if (variant.startsWith("RC2")) {
  const f = await handBuilt(c, true);
  await expect(repo(c).switchOn(f.context, f.p, f.session, { ...on(), workerId: f.workerId })).rejects.toMatchObject({ code: "SWITCH_FORBIDDEN" });
  await expect(ownerTx(c, f.p.tenantId, db => db.$client.query("INSERT INTO control_plane.practice_company_marker(tenant_id,session_ref,owner_membership_id,owner_identity_user_id,marked_at) VALUES($1,$2,$3,$4,clock_timestamp())", [f.p.tenantId, f.sessionRef, f.p.membershipId, f.p.identityUserId]))).rejects.toMatchObject({ message: "PRACTICE_MARKER_FORBIDDEN" });
  return;
 }
 const f = await company(c);
 if (variant.startsWith("V1") || variant.startsWith("RC3")) await c.admin.query(insertions[0][2], [f.p.tenantId, variant.startsWith("V1") ? f.members.admin : f.p.membershipId]);
 if (variant.startsWith("V2") || variant.startsWith("V3")) {
  await c.admin.query(insertions[1][2], [f.p.tenantId, f.p.membershipId]);
  if (variant.startsWith("V3")) await c.admin.query("UPDATE identity.invitation SET accepted_at=clock_timestamp() WHERE tenant_id=$1", [f.p.tenantId]);
 }
 if (variant.startsWith("V4") || variant.startsWith("V5")) {
  const connection = randomUUID();
  await c.admin.query("INSERT INTO identity.sso_connection(tenant_id,id,metadata) VALUES($1::uuid,$2::uuid,jsonb_build_object('version','sso-metadata.v1','protocol','saml2','provider','in-process-test-idp','id',$2::uuid::text,'tenantId',$1::uuid::text))", [f.p.tenantId, connection]);
  if (variant.startsWith("V5")) await c.admin.query("INSERT INTO identity.verified_domain(tenant_id,connection_id,domain) VALUES($1,$2,$3)", [f.p.tenantId, connection, `${randomUUID()}.fictional.invalid`]);
 }
 if (variant.startsWith("V6") || variant.startsWith("V7") || variant.startsWith("RC3")) await c.admin.query(insertions[2][2], [f.p.tenantId, variant.startsWith("V7") ? f.members.admin : f.p.membershipId, `${randomUUID()}@fictional.invalid`]);
 if (variant.startsWith("V8")) await c.admin.query(insertions[3][2], [f.p.tenantId, f.p.membershipId, randomUUID().replaceAll("-", "").repeat(2), randomUUID()]);
 await expect(start(c, f)).rejects.toMatchObject({ code: "SWITCH_FORBIDDEN" });
 await expect(ownerTx(c, f.p.tenantId, db => db.$client.query("INSERT INTO control_plane.practice_company_marker(tenant_id,session_ref,owner_membership_id,owner_identity_user_id,marked_at) VALUES($1,$2,$3,$4,clock_timestamp())", [f.p.tenantId, f.sessionRef, f.p.membershipId, f.p.identityUserId]))).rejects.toMatchObject({ message: "PRACTICE_MARKER_FORBIDDEN" });
 expect(await text(c, "control_plane.practice_company_marker", f.p.tenantId)).toEqual([]); expect(await text(c, "control_plane.practice_worker_switch", f.p.tenantId)).toEqual([]);
});
it("[PW16] product invitation and SSO connection administration cannot attach a marked company", async () => {
 const f = await company(c); await start(c, f); const digest = randomUUID().replaceAll("-", "").repeat(2), connection = randomUUID();
 await c.admin.query("INSERT INTO identity.session(id,user_id,environment,token_digest,csrf_token,expires_at) VALUES($1,$2,'synthetic_demo',$3,$4,clock_timestamp()+interval '1 day')", [randomUUID(), f.p.identityUserId, digest, randomUUID()]);
 for (const action of ["invitation", "connection"] as const) await rolledBack(c.admin, async db => {
  await db.query("SELECT set_config('app.tenant_id',$1,true)", [f.p.tenantId]); await db.query("SET LOCAL ROLE jobguard_identity");
  if (action === "invitation") await expect(db.query("SELECT identity.invite_member($1,$2,$3,'operative')", [digest, f.p.tenantId, `${randomUUID()}@fictional.invalid`])).rejects.toMatchObject({ message: "PRACTICE_COMPANY_SIGN_IN_FORBIDDEN" });
  else await expect(db.query("SELECT identity.sso_admin_command($1,$2::jsonb)", [digest, JSON.stringify({ version: "sso-admin.v1", requested_tenant_id: f.p.tenantId, action: "connection.create", id: connection, metadata: { version: "sso-metadata.v1", protocol: "saml2", provider: "in-process-test-idp", id: connection, tenantId: f.p.tenantId } })])).rejects.toMatchObject({ message: "PRACTICE_COMPANY_SIGN_IN_FORBIDDEN" });
 });
});
it("[PW4] a marked company's second owner-written session cannot acquire its marker", async () => {
 const f = await company(c), second = randomUUID(), { digestOf } = await import("./practice-worker-switch-fixtures.js");
 await start(c, f); await end(c, f);
 await ownerTx(c, f.p.tenantId, db => db.$client.query("INSERT INTO control_plane.contractor_practice_session(session_id,tenant_id,membership_id,identity_user_id,session_digest,created_at,expires_at) SELECT gen_random_uuid(),$1,$2,$3,$4,r.t,r.t+interval '7 days' FROM (SELECT clock_timestamp() t) r", [f.p.tenantId, f.p.membershipId, f.p.identityUserId, digestOf(second)]));
 await expect(repo(c).switchOn(f.context, f.p, second, { ...on(), workerId: f.members.operative })).rejects.toMatchObject({ code: "SWITCH_FORBIDDEN" });
 await start(c, f); expect((await lookup(c, f)).membershipId).toBe(f.members.operative);
});
