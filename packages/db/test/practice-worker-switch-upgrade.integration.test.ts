import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { migrate, ContractorRepository, ContractorPracticeSessionRepository } from "../src/index.js";
import * as proof from "./upgrade-proof-utils.js";
import { startBeforeMigration, applyMigration, migrationName, company, start, end, lookup, restoreHardenedLookup, disableSwitchOn, makeSessionExpired, startSession, endHomeRecord, startSessionWithHomeRecord } from "./practice-worker-switch-fixtures.js";
import type { Cluster } from "./contractor-practice-session-fixtures.js";
let c: Cluster;
const functions = async () => (await c.admin.query("SELECT p.oid::regprocedure::text identity,pg_get_functiondef(p.oid) definition,p.proowner,p.proacl,p.prosecdef,p.proconfig,p.provolatile,p.prolang,p.proargtypes::text,p.prorettype FROM pg_proc p WHERE p.pronamespace IN ('app'::regnamespace,'identity'::regnamespace) AND p.prokind='f' ORDER BY p.oid::regprocedure::text")).rows;
const triggers = async () => (await c.admin.query("SELECT tgrelid::regclass::text relation,tgname FROM pg_trigger WHERE NOT tgisinternal ORDER BY 1,2")).rows;
const privileges = async () => (await c.admin.query("SELECT oid::regclass::text relation,has_table_privilege('jobguard_runtime',oid,'INSERT') i,has_table_privilege('jobguard_runtime',oid,'UPDATE') u,has_table_privilege('jobguard_runtime',oid,'DELETE') d FROM pg_class WHERE relnamespace IN ('app'::regnamespace,'identity'::regnamespace,'control_plane'::regnamespace,'audit_control'::regnamespace) AND relkind='r' ORDER BY 1")).rows;
beforeAll(async () => { process.env.JOBGUARD_ENV = "synthetic_demo"; c = await startBeforeMigration(migrationName); }, 120000);
afterAll(async () => { await c?.close(); });
it("[PW12] [PW25] [PW26] [PW33] own migration preserves existing rows, authority and the hardened differential", async () => {
 const a = await company(c), b = await company(c), expired = await startSession(c), home = await startSessionWithHomeRecord(c), revoked = await startSession(c);
 await new ContractorPracticeSessionRepository(c.runtime).revoke(revoked.context, revoked.session);
 // An unmarked practice-start company with the same sign-in roots as the merged identity fixtures.
 const signed = await company(c), connection = randomUUID();
 await c.admin.query("INSERT INTO identity.user_email(email,user_id) VALUES($1,$2)", [`${randomUUID()}@fictional.invalid`, signed.p.identityUserId]);
 await c.admin.query("INSERT INTO identity.membership_locator VALUES($1,$2,$3)", [signed.p.identityUserId, signed.p.tenantId, signed.p.membershipId]);
 await c.admin.query("INSERT INTO identity.invitation(id,email,tenant_id,account_id,role,expires_at,issuer_user_id) SELECT gen_random_uuid(),'invited@fictional.invalid',tenant_id,account_id,'operative',clock_timestamp()+interval '1 day',identity_user_id FROM app.membership WHERE tenant_id=$1 AND id=$2", [signed.p.tenantId, signed.p.membershipId]);
 await c.admin.query("INSERT INTO identity.sso_connection(tenant_id,id,metadata) VALUES($1::uuid,$2::uuid,jsonb_build_object('version','sso-metadata.v1','protocol','saml2','provider','in-process-test-idp','id',$2::uuid::text,'tenantId',$1::uuid::text))", [signed.p.tenantId, connection]);
 await c.admin.query("INSERT INTO identity.session(id,user_id,environment,token_digest,csrf_token,expires_at) VALUES($1,$2,'synthetic_demo',$3,$4,clock_timestamp()+interval '1 day')", [randomUUID(), signed.p.identityUserId, randomUUID().replaceAll('-', '').repeat(2), randomUUID()]);
 const revokedGrant = (await c.admin.query("SELECT id FROM app.role_grant WHERE tenant_id=$1 AND membership_id=$2", [signed.p.tenantId, signed.members.second])).rows[0]!.id;
 const { currentCommand } = await import("./contractor-practice-session-fixtures.js");
 await new ContractorRepository(c.runtime).command(signed.p, await currentCommand(c, signed, { kind: "grant.revoke", grantId: revokedGrant }));
 await makeSessionExpired(c, expired.session); await endHomeRecord(c, home.session, "expired");
 const values = [a.session, b.session, expired.session, revoked.session, home.session, randomUUID()];
 const read = async (value: string, name = "app.contractor_session") => { const result = await c.runtime.query(`SELECT * FROM ${name}($1)`, [value]); const canonical = await c.runtime.query(`SELECT row_to_json(t)::text bytes FROM ${name}($1) t`, [value]); return { rows: canonical.rows, fields: result.fields.map(f => [f.name, f.dataTypeID]) }; };
 const beforeAnswers = await Promise.all(values.map(v => read(v)));
 const { resolvers: mergedResolvers } = await import("./contractor-practice-session-fixtures.js");
 const outcome = async (work: () => Promise<unknown>) => { try { return { value: await work() }; } catch (error) { const failure = error as Error & { code?: string }; return { error: { name: failure.name, message: failure.message, code: failure.code } }; } };
 const callerOutcomes = async () => {
  const answers = [];
  for (const value of values) {
   for (const resolve of mergedResolvers(c)) answers.push(await outcome(() => resolve(value)));
   if (value !== values.at(-1)) answers.push(await outcome(() => new ContractorRepository(c.runtime).startPractice(value)));
  }
  return answers;
 };
 const beforeCallers = await callerOutcomes();
 const tables = ["control_plane.contractor_practice_session", "control_plane.tenant", "control_plane.practice_session", "identity.identity_user", "identity.user_email", "identity.membership_locator", "identity.invitation", "identity.sso_connection", "identity.session", "app.role_grant_revocation", "app.membership", "app.contractor_member", "app.role_grant", "app.team_membership", "app.audit_event"];
 const before = await proof.proofBefore(c.admin, tables); for (const table of tables) expect(Object.keys(before[table]!.rows).length).toBeGreaterThan(0);
 const oldFunctions = await functions(), oldTriggers = await triggers(), oldPrivileges = await privileges();
 const hardened = oldFunctions.find(fn => fn.identity === "app.contractor_session(uuid)")!.definition as string;
 await c.admin.query("CREATE SCHEMA pws_scratch"); await c.admin.query(hardened.replace("app.contractor_session", "pws_scratch.contractor_session"));
 await applyMigration(c, migrationName);
 expect(await proof.proofDifferences(c.admin, before)).toEqual({ rows: [], types: [] });
 const afterFunctions = await functions(); const changed = oldFunctions.filter(old => JSON.stringify(afterFunctions.find(fn => fn.identity === old.identity)) !== JSON.stringify(old));
 expect(changed.map(fn => fn.identity)).toEqual(["app.contractor_session(uuid)"]);
 const newLookup = afterFunctions.find(fn => fn.identity === "app.contractor_session(uuid)")!;
 expect({ ...newLookup, definition: hardened }).toEqual(oldFunctions.find(fn => fn.identity === "app.contractor_session(uuid)"));
 expect(newLookup.definition).toContain("clock_timestamp()"); expect(newLookup.definition).toContain("transaction_isolation"); expect(newLookup.definition).not.toMatch(/\b(?:now|transaction_timestamp|statement_timestamp)\(/u);
 const addedTriggers = (await triggers()).filter(now => !oldTriggers.some(old => old.relation === now.relation && old.tgname === now.tgname));
 expect(addedTriggers.filter(t => oldPrivileges.some(p => p.relation === t.relation)).map(t => `${t.relation}:${t.tgname}`)).toEqual(["app.role_grant:made_up_worker_no_wider_grant", "identity.invitation:made_up_company_no_sign_in", "identity.membership_locator:made_up_company_no_sign_in", "identity.sso_connection:made_up_company_no_sign_in", "identity.user_email:made_up_company_no_sign_in"]);
 expect((await privileges()).filter(now => oldPrivileges.some(old => old.relation === now.relation))).toEqual(oldPrivileges);
 for (const table of ["practice_company_marker", "practice_worker_switch"]) expect((await c.admin.query(`SELECT * FROM control_plane.${table}`)).rows).toEqual([]);
 expect(await Promise.all(values.map(v => read(v)))).toEqual(beforeAnswers); expect(await callerOutcomes()).toEqual(beforeCallers);
 const { resolvers, errorShape } = await import("./contractor-practice-session-fixtures.js");
 for (const value of values) for (const resolve of resolvers(c)) {
  const expected = (await c.admin.query("SELECT * FROM pws_scratch.contractor_session($1)", [value])).rows[0];
  if (expected) { const actual = await resolve(value); expect(actual.tenantId).toBe(expected.tenant_id); }
  else { const failure = await resolve(value).catch(error => errorShape(error)); expect(failure).toMatchObject({ message: "UNAUTHENTICATED" }); }
 }
 await migrate(c.admin); await migrate(c.admin); expect(await proof.proofDifferences(c.admin, before)).toEqual({ rows: [], types: [] });
 for (const value of values) {
  const old = (await c.admin.query("SELECT row_to_json(t)::text bytes FROM pws_scratch.contractor_session($1) t", [value])).rows;
  expect((await c.admin.query("SELECT row_to_json(t)::text bytes FROM app.contractor_session($1) t", [value])).rows).toEqual(old);
 }
});
it("[PW26] rolled-back one-microsecond and full-type controls fail; later additions pass", async () => {
 const f = await company(c), tables = ["control_plane.contractor_practice_session", "control_plane.tenant"], before = await proof.proofBefore(c.admin, tables);
 for (const control of ["time", "type", "column", "function", "insert"] as const) await proof.rolledBack(c.admin, async db => {
  if (control === "time") { await db.query("SET LOCAL session_replication_role=replica"); await db.query("UPDATE control_plane.contractor_practice_session SET created_at=created_at+interval '1 microsecond',expires_at=expires_at+interval '1 microsecond' WHERE tenant_id=$1", [f.p.tenantId]); }
  if (control === "type") await db.query("ALTER TABLE control_plane.tenant ALTER COLUMN created_at TYPE timestamp(3) with time zone");
  if (control === "column") await db.query("ALTER TABLE control_plane.tenant ADD COLUMN pws_control text");
  if (control === "function") expect(await proof.scratchReplaceFunction(db, "app.contractor_session(uuid)")).toBe(true);
  if (control === "insert") await db.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [randomUUID()]);
  const diff = await proof.proofDifferences(db, before);
  if (control === "time") expect(diff.rows.length).toBeGreaterThan(0); else if (control === "type") expect(diff.types.length).toBeGreaterThan(0); else expect(diff).toEqual({ rows: [], types: [] });
 });
});
it("[PW27] hardened rollback and separate feature-off preserve end and state", async () => {
 const f = await company(c); await start(c, f);
 await proof.rolledBack(c.admin, async db => {
  const old = (await db.query("SELECT pg_get_functiondef('pws_scratch.contractor_session(uuid)'::regprocedure) definition")).rows[0]!.definition.replace("pws_scratch.contractor_session", "app.contractor_session");
  await db.query(restoreHardenedLookup); expect((await db.query("SELECT pg_get_functiondef('app.contractor_session(uuid)'::regprocedure) definition")).rows[0]!.definition).toBe(old);
  expect((await db.query("SELECT * FROM app.contractor_session($1)", [f.session])).rows[0]!.membership_id).toBe(f.p.membershipId);
  await db.query(disableSwitchOn); await db.query("SELECT set_config('app.tenant_id',$1,true)", [f.p.tenantId]); await db.query("SET LOCAL ROLE jobguard_runtime");
  await db.query("SAVEPOINT disabled"); await expect(db.query("SELECT app.practice_worker_switch_on($1,$2,$3)", [f.session, randomUUID(), f.members.operative])).rejects.toMatchObject({ code: "42501" }); await db.query("ROLLBACK TO SAVEPOINT disabled");
  expect((await db.query("SELECT app.practice_worker_switch_state($1) result", [f.session])).rows[0]!.result.state).toBe("unclosed");
  expect((await db.query("SELECT app.practice_worker_switch_off($1,$2) result", [f.session, randomUUID()])).rows[0]!.result.state).toBe("owner");
 });
 expect((await lookup(c, f)).membershipId).toBe(f.members.operative); await end(c, f);
});
it("[PW34] composed lookup at head has all three answers and helper errors return no member", async () => {
 await migrate(c.admin); await migrate(c.admin); const f = await company(c);
 expect(await lookup(c, f)).toEqual(f.p); await start(c, f); expect((await lookup(c, f)).membershipId).toBe(f.members.operative);
 const owner = await company(c);
 await proof.rolledBack(c.admin, async db => {
  await db.query(`CREATE OR REPLACE FUNCTION app.contractor_practice_session_live(s uuid) RETURNS TABLE(session_ref uuid,tenant_id uuid,membership_id uuid,identity_user_id uuid) LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN RAISE EXCEPTION 'PWS_HELPER_FAILED'; END $$`);
  for (const value of [f.session, owner.session]) { await db.query("SAVEPOINT helper_error"); await expect(db.query("SELECT * FROM app.contractor_session($1)", [value])).rejects.toMatchObject({ message: "PWS_HELPER_FAILED" }); await db.query("ROLLBACK TO SAVEPOINT helper_error"); }
 });
 await makeSessionExpired(c, f.session); expect((await c.runtime.query("SELECT * FROM app.contractor_session($1)", [f.session])).rows).toEqual([]);
});
it("[PW12] no-active-switch classes remain byte-equal to the hardened lookup at head", async () => {
 const { expireSwitch } = await import("./practice-worker-switch-fixtures.js");
 const never = await company(c), ended = await company(c), unclosed = await company(c), other = await company(c);
 await start(c, ended); await end(c, ended); await start(c, unclosed); await expireSwitch(c, unclosed); await start(c, other);
 const values = [never.session, ended.session, unclosed.session, randomUUID()]; expect(values.length).toBeGreaterThan(0);
 for (const value of values) {
  const old = (await c.admin.query("SELECT row_to_json(t)::text bytes FROM pws_scratch.contractor_session($1) t", [value])).rows;
  expect((await c.admin.query("SELECT row_to_json(t)::text bytes FROM app.contractor_session($1) t", [value])).rows).toEqual(old);
 }
 const old = (await c.admin.query("SELECT * FROM pws_scratch.contractor_session($1)", [other.session])).rows[0]!;
 const active = await lookup(c, other); expect(active.tenantId).toBe(old.tenant_id); expect(active.membershipId).not.toBe(old.membership_id); expect(active.identityUserId).not.toBe(old.identity_user_id);
});
it.each(["never-issued", "cap-expired", "revoked", "home-expired", "home-revoked"])("[PW34] ended %s sessions have no fourth answer for every switch state", async kind => {
 const { prepareWorkOrderDemo, ContractorPracticeSessionRepository } = await import("../src/index.js");
 const { startSessionWithHomeRecord, makeSessionExpired, endHomeRecord, repo, on, off } = await import("./practice-worker-switch-fixtures.js");
 for (const stored of ["none", "current", "ended"] as const) {
  const f = kind.startsWith("home") ? await startSessionWithHomeRecord(c) : await startSession(c);
  if (stored !== "none") { const demo = await prepareWorkOrderDemo(c.runtime, f.p, { siteCount: 1 }); await repo(c).switchOn(f.context, f.p, f.session, { ...on(), workerId: demo.operativeMembershipId }); if (stored === "ended") await repo(c).switchOff(f.context, f.p, f.session, off()); }
  if (kind === "revoked") await new ContractorPracticeSessionRepository(c.runtime).revoke(f.context, f.session);
  if (kind === "cap-expired") await makeSessionExpired(c, f.session);
  if (kind.startsWith("home")) await endHomeRecord(c, f.session, kind === "home-expired" ? "expired" : "revoked");
  const value = kind === "never-issued" ? randomUUID() : f.session;
  expect((await c.runtime.query("SELECT * FROM app.contractor_session($1)", [value])).rows).toEqual([]);
 }
});
