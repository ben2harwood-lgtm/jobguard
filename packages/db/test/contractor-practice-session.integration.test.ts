import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { ContractorRepository, ContractorPracticeSessionRepository, authenticatePracticeSession, issuePracticeSession, withTenant, verifyAuditChain, migrate, appendAuditBatch, derivedUuid, contractorSessionContext, type VerifiedTenantContext } from "../src/index.js";
import { ObservedPool, analyseLockOrder, mutableTables } from "./lock-observer.js";
import * as proof from "./upgrade-proof-utils.js";
import { cluster, seedHomeOwner, startSession, startSessionWithHomeRecord, endHomeRecord, makeSessionExpired, digestOf, counts, sessionText, homeText, reading, refused, resolvers, currentCommand, companyRows, type Cluster, type SessionFixture } from "./contractor-practice-session-fixtures.js";
let c: Cluster;
const original = process.env.JOBGUARD_ENV;
const used: string[] = [];
const session = async (home = false) => { const f = await startSession(c, home); used.push(f.session); return f; };
const revoke = (f: SessionFixture) => new ContractorPracticeSessionRepository(c.runtime).revoke(f.context, f.session);
const row = async (f: SessionFixture) => (await c.admin.query("SELECT *,created_at::text created_text,expires_at::text expires_text,revoked_at::text revoked_text FROM control_plane.contractor_practice_session WHERE session_digest=$1", [digestOf(f.session)])).rows[0]!;
async function directRevoke(f: SessionFixture, setting: string | null, value: string | null = f.session) {
 return proof.rolledBack(c.runtime, async client => { if (setting !== null) await client.query("SELECT set_config('app.tenant_id',$1,true)", [setting]); return client.query("SELECT app.revoke_contractor_practice_session($1)", [value]); });
}
async function equalRefusals(value: string) {
 used.push(value);
 for (const resolve of resolvers(c)) { const never = randomUUID(); used.push(never); expect(await refused(resolve(value))).toEqual(await refused(resolve(never))); }
 expect((await c.runtime.query("SELECT * FROM app.contractor_session($1)", [value])).rowCount).toBe(0);
}
beforeAll(async () => { process.env.JOBGUARD_ENV = "synthetic_demo"; c = await cluster(); await seedHomeOwner(c); }, 60000);
afterAll(async () => { await c?.close(); if (original === undefined) delete process.env.JOBGUARD_ENV; else process.env.JOBGUARD_ENV = original; });
it("[PH1] issued sessions take the unchanged home record's remaining deadline", async () => {
 for (const late of [false, true]) {
  const value = await issuePracticeSession(c.runtime); used.push(value);
  if (late) await c.admin.query("UPDATE control_plane.practice_session SET expires_at=clock_timestamp()+interval '3 days' WHERE token_digest=$1", [digestOf(value)]);
  const home = await homeText(c, value), beforeCounts = await counts(c.admin), before = await reading(c.admin);
  const p = await new ContractorRepository(c.runtime).startPractice(value), after = await reading(c.admin);
  const found = (await c.admin.query(`SELECT x.session_id<>$1::uuid different,x.revoked_at IS NULL unrevoked,x.created_at BETWEEN $3::timestamptz AND $4::timestamptz bounded,
   x.expires_at=p.expires_at same_deadline,x.expires_at<=x.created_at+interval '7 days' capped FROM control_plane.contractor_practice_session x JOIN control_plane.practice_session p ON p.token_digest=x.session_digest WHERE x.session_digest=$2`, [value, digestOf(value), before, after])).rows;
  expect(found).toEqual([{ different: true, unrevoked: true, bounded: true, same_deadline: true, capped: true }]);
  expect(await homeText(c, value)).toBe(home); expect((await counts(c.admin))["control_plane.practice_session"]).toBe(beforeCounts["control_plane.practice_session"]);
  expect(await new ContractorRepository(c.runtime).resolveSession(value)).toEqual(p);
 }
});
it("[PH2] a new session with no home record keeps its fixed cap and concurrent starts share one company", async () => {
 const value = randomUUID(); used.push(value); const before = await counts(c.admin);
 const repo = new ContractorRepository(c.runtime), [a, b] = await Promise.all([repo.startPractice(value), repo.startPractice(value)]);
 expect(a).toEqual(b); expect(await repo.resolveSession(value)).toEqual(a);
 expect((await c.admin.query("SELECT expires_at=created_at+interval '7 days' exact,revoked_at IS NULL unrevoked FROM control_plane.contractor_practice_session WHERE session_digest=$1", [digestOf(value)])).rows).toEqual([{ exact: true, unrevoked: true }]);
 expect(await homeText(c, value)).toBeUndefined(); expect((await counts(c.admin))["control_plane.practice_session"]).toBe(before["control_plane.practice_session"]);
 await expect(authenticatePracticeSession(c.runtime, value)).rejects.toThrow("UNAUTHENTICATED");
});
it("[PH3] expiry and the copied cap refuse access even if home is lengthened", async () => {
 const ended = await session(), almost = await session(), home = await session(true);
 await makeSessionExpired(c, ended.session); await makeSessionExpired(c, almost.session, "6 days 23 hours 55 minutes");
 await refused(new ContractorRepository(c.runtime).resolveSession(ended.session)); expect(await new ContractorRepository(c.runtime).resolveSession(almost.session)).toEqual(almost.p);
 const cap = (await row(home)).expires_text;
 await c.admin.query("UPDATE control_plane.practice_session SET expires_at=expires_at+interval '30 days' WHERE token_digest=$1", [digestOf(home.session)]);
 await new ContractorRepository(c.runtime).startPractice(home.session); expect((await row(home)).expires_text).toBe(cap);
 await makeSessionExpired(c, home.session); await refused(new ContractorRepository(c.runtime).resolveSession(home.session));
 await expect(authenticatePracticeSession(c.runtime, home.session)).resolves.toBeDefined();
 const texts = [await sessionText(c, home.session), await homeText(c, home.session)];
 await equalRefusals(home.session); expect([await sessionText(c, home.session), await homeText(c, home.session)]).toEqual(texts);
});
it.each(["revoked", "expired"] as const)("[PH4] home %s refuses every contractor path without changing its row", async kind => {
 const f = await session(true), other = await session(true); await endHomeRecord(c, f.session, kind); const bytes = await sessionText(c, f.session), before = await counts(c.admin);
 await expect(authenticatePracticeSession(c.runtime, f.session)).rejects.toThrow("UNAUTHENTICATED"); await equalRefusals(f.session);
 await refused(new ContractorRepository(c.runtime).startPractice(f.session)); await refused(revoke(f));
 await expect(directRevoke(f, f.p.tenantId)).rejects.toMatchObject({ code: "28000", message: "UNAUTHENTICATED" });
 expect(await sessionText(c, f.session)).toBe(bytes); expect(await counts(c.admin)).toEqual(before); expect(await new ContractorRepository(c.runtime).resolveSession(other.session)).toEqual(other.p);
});
it("[PH5] contractor revoke leaves home and home jobs unchanged and cannot be revived by the live home", async () => {
 const f = await session(true), home = await homeText(c, f.session), auth = await authenticatePracticeSession(c.runtime, f.session);
 const jobs = async () => (await c.admin.query("SELECT row_to_json(x)::text bytes FROM app.job x WHERE practice_session_digest=$1 ORDER BY id", [digestOf(f.session)])).rows;
 const beforeJobs = await jobs(); await revoke(f); await equalRefusals(f.session);
 expect(await homeText(c, f.session)).toBe(home); expect(await authenticatePracticeSession(c.runtime, f.session)).toEqual(auth); expect(await jobs()).toEqual(beforeJobs);
 const bytes = await sessionText(c, f.session), before = await counts(c.admin); await refused(new ContractorRepository(c.runtime).startPractice(f.session));
 expect(await sessionText(c, f.session)).toBe(bytes); expect(await counts(c.admin)).toEqual(before);
});
it.each([false, true])("[PH6] holder activity never moves a deadline with home=%s", async home => {
 const f = await session(home), other = await session(), before = [await sessionText(c, f.session), await homeText(c, f.session)], repo = new ContractorRepository(c.runtime);
 for (const resolve of resolvers(c)) for (let n = 0; n < 10; n++) await resolve(f.session);
 const view = await repo.query(f.p, { version: "contractor-query.v1", tenantId: f.p.tenantId, resource: "organisation" });
 await repo.command(f.p, await currentCommand(c, f, { kind: "team.create", name: "Fictional team", branchId: view.units.find(unit => unit.kind === "branch")!.id }));
 await repo.startPractice(f.session); await Promise.all([repo.startPractice(f.session), repo.startPractice(f.session)]);
 await refused(new ContractorPracticeSessionRepository(c.runtime).revoke(other.context, f.session));
 if (home) { await authenticatePracticeSession(c.runtime, f.session); await expect(c.runtime.query("SELECT app.issue_practice_session($1)", [digestOf(f.session)])).rejects.toMatchObject({ code: "23505" }); }
 expect([await sessionText(c, f.session), await homeText(c, f.session)]).toEqual(before);
 const timeArgs = (await c.admin.query(`SELECT p.oid::regprocedure::text name FROM pg_proc p WHERE p.pronamespace='app'::regnamespace AND p.proname IN ('contractor_session','start_contractor_practice','contractor_admin_command','revoke_contractor_practice_session','contractor_practice_session_digest','contractor_practice_session_live','contractor_practice_session_guard','contractor_practice_session_require_audit','contractor_practice_home_deadline') AND has_function_privilege('jobguard_runtime',p.oid,'EXECUTE') AND EXISTS(SELECT 1 FROM unnest(p.proargtypes) a WHERE a IN ('timestamptz'::regtype,'timestamp'::regtype,'interval'::regtype,'date'::regtype))`)).rows;
 expect(timeArgs).toEqual([]);
});
it("[PH7] never-issued, cap-expired, revoked and both home-ended values have one public answer", async () => {
 const expired = await session(), revoked = await session(), homeExpired = await session(true), homeRevoked = await session(true);
 await makeSessionExpired(c, expired.session); await revoke(revoked); await endHomeRecord(c, homeExpired.session, "expired"); await endHomeRecord(c, homeRevoked.session, "revoked");
 const before = await counts(c.admin); for (const value of [randomUUID(), expired.session, revoked.session, homeExpired.session, homeRevoked.session]) await equalRefusals(value); expect(await counts(c.admin)).toEqual(before);
});
it.each(["cap", "contractor-revoked", "home-expired", "home-revoked", "home-without-row"])("[PH8] %s stays ended and a fresh value starts a separate company", async kind => {
 const f = await session(kind !== "cap"), repo = new ContractorRepository(c.runtime);
 if (kind === "cap") await makeSessionExpired(c, f.session);
 else if (kind === "contractor-revoked") await revoke(f);
 else await endHomeRecord(c, f.session, kind === "home-expired" ? "expired" : "revoked");
 let value = f.session;
 if (kind === "home-without-row") { value = await issuePracticeSession(c.runtime); used.push(value); await endHomeRecord(c, value, "revoked"); }
 const before = await counts(c.admin), bytes = await sessionText(c, f.session);
 await refused(repo.startPractice(value)); await Promise.all([refused(repo.startPractice(value)), refused(repo.startPractice(value))]);
 await proof.rolledBack(c.runtime, async client => { const prior = (await client.query("SELECT current_setting('app.tenant_id',true) setting")).rows;
  expect((await client.query("SELECT app.start_contractor_practice($1) answer", [value])).rows[0].answer).toBe("00000000-0000-0000-0000-000000000000");
  expect((await client.query("SELECT current_setting('app.tenant_id',true) setting")).rows).toEqual(prior);
 }); expect(await counts(c.admin)).toEqual(before);
 if (kind === "cap") { await c.runtime.query("SELECT app.issue_practice_session($1)", [digestOf(value)]); await equalRefusals(value); await refused(repo.startPractice(value)); }
 const fresh = await startSessionWithHomeRecord(c); used.push(fresh.session); expect(fresh.p.tenantId).not.toBe(f.p.tenantId); expect(await sessionText(c, f.session)).toBe(bytes);
 for (const tenant of [f.p.tenantId, fresh.p.tenantId]) expect((await c.admin.query("SELECT count(*)::int n FROM control_plane.contractor_practice_session WHERE tenant_id=$1", [tenant])).rows[0].n).toBe(1);
 await equalRefusals(value);
});
it("[PH8] a home record appearing later keeps the earlier cap and its end refuses the session", async () => {
 const f = await session(), cap = (await row(f)).expires_text; await c.runtime.query("SELECT app.issue_practice_session($1)", [digestOf(f.session)]);
 expect((await row(f)).expires_text).toBe(cap); expect(await new ContractorRepository(c.runtime).resolveSession(f.session)).toEqual(f.p);
 await endHomeRecord(c, f.session, "revoked"); await equalRefusals(f.session);
});
it("[PH9] owner writes cannot move authority fields, undo a revoke, remove or truncate rows", async () => {
 const f = await session(true); await revoke(f);
 for (const set of ["expires_at=expires_at+interval '1 second'", "created_at=created_at-interval '1 second'", "session_digest=repeat('a',64)", "revoked_at=NULL", "revoked_at=revoked_at+interval '1 microsecond'"]) await expect(proof.rolledBack(c.admin, async client => { await client.query("SET LOCAL ROLE jobguard_migration"); return client.query(`UPDATE control_plane.contractor_practice_session SET ${set} WHERE tenant_id=$1`, [f.p.tenantId]); })).rejects.toMatchObject({ message: "PRACTICE_SESSION_IMMUTABLE" });
 await expect(proof.rolledBack(c.admin, async client => { await client.query("SET LOCAL ROLE jobguard_migration"); return client.query("DELETE FROM control_plane.contractor_practice_session WHERE tenant_id=$1", [f.p.tenantId]); })).rejects.toMatchObject({ message: "PRACTICE_SESSION_IMMUTABLE" });
 const before = await counts(c.admin); await expect(proof.rolledBack(c.admin, async client => { await client.query("SET LOCAL ROLE jobguard_migration"); return client.query("TRUNCATE control_plane.contractor_practice_session"); })).rejects.toBeDefined(); expect(await counts(c.admin)).toEqual(before);
});
it.each(["backdated", "forwarddated", "revoked", "invalid-digest", "before-created", "beyond-seven", "beyond-home", "home-ended", "duplicate"])("[PH9] owner insert refuses %s", async kind => {
 const f = await session(true); if (kind === "home-ended") await endHomeRecord(c, f.session, "revoked");
 const d = ["beyond-home", "home-ended", "duplicate"].includes(kind) ? digestOf(f.session) : digestOf(randomUUID());
 const start = kind === "backdated" ? "clock_timestamp()-interval '1 second'" : kind === "forwarddated" ? "clock_timestamp()+interval '1 day'" : "clock_timestamp()";
 const end = kind === "before-created" ? "r-interval '1 second'" : kind === "beyond-seven" ? "r+interval '8 days'" : kind === "beyond-home" ? "(SELECT expires_at+interval '1 microsecond' FROM control_plane.practice_session WHERE token_digest=$2)" : kind === "duplicate" ? "app.contractor_practice_home_deadline($2::char(64),r)" : "r+interval '1 day'";
 const attempt = proof.rolledBack(c.admin, async client => { await client.query("SET LOCAL ROLE jobguard_migration"); return client.query(`WITH time AS (SELECT ${start} r) INSERT INTO control_plane.contractor_practice_session(session_id,tenant_id,membership_id,identity_user_id,session_digest,created_at,expires_at,revoked_at) SELECT $1,$3,$4,$5,${kind === "invalid-digest" ? "'INVALID'" : "$2"},r,${end},${kind === "revoked" ? "r" : "NULL"} FROM time`, [randomUUID(), d, f.p.tenantId, f.p.membershipId, f.p.identityUserId]); });
 if (kind === "duplicate") await expect(attempt).rejects.toMatchObject({ code: "23505" }); else await expect(attempt).rejects.toBeDefined();
});
it("[PH9] runtime cannot access either session table directly", async () => {
 for (const table of ["control_plane.contractor_practice_session", "control_plane.practice_session"]) for (const sql of [`SELECT * FROM ${table}`, `INSERT INTO ${table} DEFAULT VALUES`, `UPDATE ${table} SET expires_at=expires_at`, `DELETE FROM ${table}`, `TRUNCATE ${table}`]) await expect(c.runtime.query(sql)).rejects.toMatchObject({ code: "42501" });
});
it.each([false, true])("[PH10] revoke is timestamped, audited, and leaves company unchanged with home=%s", async home => {
 const f = await session(home), before = await companyRows(c, f.p.tenantId), low = await reading(c.admin); const result = await revoke(f), high = await reading(c.admin);
 expect(Object.keys(result).sort()).toEqual(["environment", "realExternalActions", "revokedAt", "version"]);
 expect((await c.admin.query("SELECT revoked_at BETWEEN $2::timestamptz AND $3::timestamptz bounded,revoked_at<expires_at before_cap FROM control_plane.contractor_practice_session WHERE tenant_id=$1", [f.p.tenantId, low, high])).rows).toEqual([{ bounded: true, before_cap: true }]);
 const events = (await c.admin.query(`SELECT id,tenant_id AS "tenantId",sequence::int,version,actor_ref AS "actorRef",event_type AS "eventType",subject_type AS "subjectType",subject_ref AS "subjectRef",occurred_at AS "occurredAt",payload,trim(payload_hash) AS "payloadHash",trim(previous_hash) AS "previousHash",trim(event_hash) AS "eventHash" FROM app.audit_event WHERE tenant_id=$1 ORDER BY sequence`, [f.p.tenantId])).rows;
 expect(() => verifyAuditChain(events)).not.toThrow(); const revoked = events.filter(event => event.eventType === "contractor.practice_session.revoked"); expect(revoked).toHaveLength(1);
 const r = await row(f); expect(revoked[0]).toMatchObject({ id: derivedUuid(`practice-session-revoked:${f.p.tenantId}:${r.session_id}`), actorRef: `membership:${f.p.membershipId}`, subjectType: "practice-session", subjectRef: r.session_id, payload: { references: { session: r.session_id, environment: "synthetic_demo" }, classifications: { action: "security" } } });
 expect(JSON.stringify(events)).not.toContain(f.session); expect(JSON.stringify(events)).not.toContain(digestOf(f.session)); expect(await companyRows(c, f.p.tenantId)).toEqual(before); await equalRefusals(f.session);
});
it("[PH11] all revoke refusals are indistinguishable and write nothing", async () => {
 const a = await session(), b = await session(), expired = await session(), revoked = await session(), homeExpired = await session(true), homeRevoked = await session(true);
 await makeSessionExpired(c, expired.session); await revoke(revoked); await endHomeRecord(c, homeExpired.session, "expired"); await endHomeRecord(c, homeRevoked.session, "revoked");
 const repo = new ContractorPracticeSessionRepository(c.runtime), shape = await refused(repo.revoke(a.context, (() => { const value = randomUUID(); used.push(value); return value; })())), before = await counts(c.admin);
 for (const f of [expired, revoked, homeExpired, homeRevoked]) { expect(await refused(revoke(f))).toEqual(shape); await expect(directRevoke(f, f.p.tenantId)).rejects.toMatchObject({ code: "28000", message: "UNAUTHENTICATED" }); }
 expect(await refused(repo.revoke(b.context, a.session))).toEqual(shape);
 for (const setting of [b.p.tenantId, null, "", "invalid"]) await expect(directRevoke(a, setting)).rejects.toMatchObject({ code: "28000", message: "UNAUTHENTICATED" });
 await expect(directRevoke(a, a.p.tenantId, null)).rejects.toMatchObject({ code: "28000", message: "UNAUTHENTICATED" }); expect(await counts(c.admin)).toEqual(before);
 expect(await new ContractorRepository(c.runtime).resolveSession(a.session)).toEqual(a.p); expect(await new ContractorRepository(c.runtime).resolveSession(b.session)).toEqual(b.p);
});
it("[PH12] failures at routine, audit insert and commit roll back both versions and audit head", async () => {
 for (const fragment of ["revoke_contractor_practice_session", "INSERT INTO app.audit_event", "COMMIT"]) {
  const f = await session(), before = await sessionText(c, f.session), events = await counts(c.admin), head = (await c.admin.query("SELECT row_to_json(x)::text FROM audit_control.audit_head x WHERE tenant_id=$1", [f.p.tenantId])).rows;
  const connect = c.runtime.connect.bind(c.runtime), spy = vi.spyOn(c.runtime, "connect");
  spy.mockImplementation((async () => { const client = await connect(), query = client.query.bind(client);
   return new Proxy(client, { get(target, prop) { if (prop === "query") return async (sql: string, args?: unknown[]) => { if (sql === "COMMIT" && fragment === "COMMIT") { await query("SET CONSTRAINTS ALL IMMEDIATE"); throw new Error("invalid test outcome"); } const result = await query(sql, args); if (sql.includes(fragment)) throw new Error("invalid test outcome"); return result; }; const value = Reflect.get(target, prop, target); return typeof value === "function" ? value.bind(target) : value; } });
  }) as typeof c.runtime.connect);
  try { await expect(revoke(f)).rejects.toMatchObject({ code: "PRACTICE_SESSION_UNAVAILABLE" }); } finally { spy.mockRestore(); }
  expect(await sessionText(c, f.session)).toBe(before); expect(await counts(c.admin)).toEqual(events); expect((await c.admin.query("SELECT row_to_json(x)::text FROM audit_control.audit_head x WHERE tenant_id=$1", [f.p.tenantId])).rows).toEqual(head); expect(await new ContractorRepository(c.runtime).resolveSession(f.session)).toEqual(f.p);
 }
 const f = await session(); await revoke(f);
 expect((await c.admin.query("SELECT x.xmin=e.xmin same FROM control_plane.contractor_practice_session x JOIN app.audit_event e ON e.tenant_id=x.tenant_id AND e.subject_ref=x.session_id::text AND e.event_type='contractor.practice_session.revoked' WHERE x.tenant_id=$1", [f.p.tenantId])).rows).toEqual([{ same: true }]);
});
it("[PH12] deferred audit refuses routine and owner revocations at commit without an event", async () => {
 for (const owner of [false, true]) {
  const f = await session(); const client = await (owner ? c.admin : c.runtime).connect();
  try { await client.query("BEGIN"); await client.query("SELECT set_config('app.tenant_id',$1,true)", [f.p.tenantId]);
   if (owner) { await client.query("SET LOCAL ROLE jobguard_migration"); await client.query("UPDATE control_plane.contractor_practice_session SET revoked_at=clock_timestamp() WHERE tenant_id=$1", [f.p.tenantId]); }
   else await client.query("SELECT app.revoke_contractor_practice_session($1)", [f.session]);
   await expect(client.query("COMMIT")).rejects.toMatchObject({ message: "PRACTICE_SESSION_AUDIT_REQUIRED", code: "23514" });
  } finally { await client.query("ROLLBACK"); client.release(); }
  expect(await new ContractorRepository(c.runtime).resolveSession(f.session)).toEqual(f.p);
 }
});
it("[PH12] the audit append takes the final contending lock", async () => {
 const f = await session(), observed = new ObservedPool(c.runtime, c.admin), ownership = { mutable: await mutableTables(c.admin) };
 const recording = await observed.record(() => new ContractorPracticeSessionRepository(observed.pool).revoke(f.context, f.session));
 expect(recording.transactions).toHaveLength(1); const order = analyseLockOrder(recording.transactions[0]!, ownership);
 expect(order.auditIndex).toBeDefined(); expect(order.afterAudit).toEqual([]); expect(order.strongTableLocks).toEqual([]);
});
async function heldRevoke(f: SessionFixture, work: (client: PoolClient) => Promise<void>) {
 await withTenant(c.runtime, f.context, async db => { const result = (await db.$client.query("SELECT app.revoke_contractor_practice_session($1) result", [f.session])).rows[0].result;
  await work(db.$client);
  await appendAuditBatch(db, [{ id: derivedUuid(`practice-session-revoked:${f.p.tenantId}:${result.session}`), version: "audit.v1", actorRef: `membership:${result.member}`, eventType: "contractor.practice_session.revoked", subjectType: "practice-session", subjectRef: result.session, payload: { references: { session: result.session, environment: "synthetic_demo" }, classifications: { action: "security" } } }]);
 });
}
it("[PH13] two revokes produce one event; open revoke and home ending read the committed state", async () => {
 const f = await session(), secondPool = new Pool({ ...c.config, database: "jobguard_synthetic_demo", user: "ent4b_login", max: 1 });
 let second: Promise<unknown> | undefined;
 try {
  const pid = (await secondPool.query("SELECT pg_backend_pid() pid")).rows[0].pid;
  await heldRevoke(f, async () => {
   second = new ContractorPracticeSessionRepository(secondPool).revoke(f.context, f.session);
   // Observe an actual independent-connection wait, never infer a race from elapsed time.
   let waiting = false;
   for (let attempt = 0; attempt < 256 && !waiting; attempt++) waiting = (await c.admin.query("SELECT wait_event_type='Lock' AND query LIKE '%revoke_contractor_practice_session%' waiting FROM pg_stat_activity WHERE pid=$1", [pid])).rows[0]?.waiting === true;
   expect(waiting).toBe(true);
  });
  await expect(second).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
 } finally { if (second) await second.catch(() => undefined); await secondPool.end(); }
 expect((await c.admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND event_type='contractor.practice_session.revoked'", [f.p.tenantId])).rows[0].n).toBe(1);
 const g = await session(); await heldRevoke(g, async () => { expect(await new ContractorRepository(c.runtime).resolveSession(g.session)).toEqual(g.p); }); await equalRefusals(g.session);
 const h = await session(true), homeClient = await c.admin.connect();
 try { await homeClient.query("BEGIN"); await homeClient.query("UPDATE control_plane.practice_session SET revoked_at=clock_timestamp() WHERE token_digest=$1", [digestOf(h.session)]); expect(await new ContractorRepository(c.runtime).resolveSession(h.session)).toEqual(h.p); await homeClient.query("COMMIT"); }
 finally { await homeClient.query("ROLLBACK"); homeClient.release(); }
 await equalRefusals(h.session);
});
it("[PH13] a start concurrent with an open revoke cannot create a second company", async () => {
 const f = await session(); let start: Promise<unknown> | undefined;
 await heldRevoke(f, async () => { start = new ContractorRepository(c.runtime).startPractice(f.session); await start.catch(() => undefined); });
 // Start sees the committed row while the revoke is open; it never writes a second company.
 await equalRefusals(f.session); expect((await c.admin.query("SELECT count(*)::int n FROM control_plane.contractor_practice_session WHERE tenant_id=$1", [f.p.tenantId])).rows[0].n).toBe(1);
});
it("[PH14] a different database name refuses all session routines", async () => {
 const name = "practice_other"; await c.admin.query(`CREATE DATABASE ${name}`);
 const admin = new Pool({ ...c.config, database: name }), runtime = new Pool({ ...c.config, database: name, user: "ent4b_login" });
 try { await migrate(admin); const f = await session(), r = await row(f); await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [f.p.tenantId]); await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [f.p.identityUserId]);
  const account = randomUUID();
  await admin.query("INSERT INTO app.account(tenant_id,id,name) VALUES($1,$2,'Fictional other company')", [f.p.tenantId, account]);
  await admin.query("INSERT INTO app.membership(tenant_id,id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [f.p.tenantId, f.p.membershipId, account, f.p.identityUserId]);
  await admin.query("INSERT INTO control_plane.contractor_practice_session(session_id,tenant_id,membership_id,identity_user_id,session_digest,created_at,expires_at) VALUES($1,$2,$3,$4,$5,clock_timestamp(),clock_timestamp()+interval '1 day')", [r.session_id, f.p.tenantId, f.p.membershipId, f.p.identityUserId, digestOf(f.session)]);
  expect((await runtime.query("SELECT * FROM app.contractor_session($1)", [f.session])).rows).toEqual([]);
  for (const routine of ["revoke_contractor_practice_session", "start_contractor_practice"]) for (const value of [f.session, null]) await expect(runtime.query(`SELECT app.${routine}($1)`, [value])).rejects.toMatchObject({ message: "MODE_FORBIDDEN", code: "42501" });
 } finally { await runtime.end(); await admin.end(); }
});
it("[PH16] canonical uuid case and the home digest bind the same row", async () => {
 const f = await session(true); used.push(f.session.toUpperCase()); expect(await new ContractorRepository(c.runtime).resolveSession(f.session.toUpperCase())).toEqual(f.p);
 expect((await c.admin.query("SELECT x.session_digest=p.token_digest same,x.session_digest=$1 expected FROM control_plane.contractor_practice_session x JOIN control_plane.practice_session p ON p.token_digest=x.session_digest WHERE x.tenant_id=$2", [digestOf(f.session), f.p.tenantId])).rows).toEqual([{ same: true, expected: true }]);
 const changed = (f.session[0] === "a" ? "b" : "a") + f.session.slice(1); await equalRefusals(changed);
 await endHomeRecord(c, f.session, "revoked"); await equalRefusals(f.session.toUpperCase());
});
it("[PH22] catalogue proves columns, constraints, non-internal triggers and exact routine grants", async () => {
 const columns = await proof.proofColumns(c.admin, "control_plane.contractor_practice_session"); expect(columns).toEqual([
  { name: "session_id", type: "uuid" }, { name: "tenant_id", type: "uuid" }, { name: "membership_id", type: "uuid" }, { name: "identity_user_id", type: "uuid" }, { name: "session_digest", type: "character(64)" }, ...["created_at", "expires_at", "revoked_at"].map(name => ({ name, type: "timestamp with time zone" })),
 ]);
 const table = (await c.admin.query("SELECT pg_get_userbyid(relowner) owner,relacl::text acl FROM pg_class WHERE oid='control_plane.contractor_practice_session'::regclass")).rows[0]; expect(table.owner).toBe("jobguard_migration"); expect(table.acl ?? "").not.toMatch(/jobguard_runtime|PUBLIC|jobguard_infrastructure/u);
 const constraints = (await c.admin.query("SELECT contype,pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conrelid='control_plane.contractor_practice_session'::regclass")).rows;
 expect(constraints.filter(x => x.contype === "c")).toHaveLength(3); expect(constraints.some(x => x.definition === "PRIMARY KEY (session_id)")).toBe(true); expect(constraints.some(x => x.definition === "UNIQUE (session_digest)")).toBe(true);
 expect((await c.admin.query("SELECT tgname FROM pg_trigger WHERE tgrelid='control_plane.contractor_practice_session'::regclass AND NOT tgisinternal ORDER BY tgname")).rows.map(x => x.tgname)).toEqual(["contractor_practice_session_audit", "contractor_practice_session_guard", "contractor_practice_session_truncate_guard"]);
 for (const signature of ["contractor_practice_session_digest(uuid)", "contractor_practice_home_deadline(character,timestamp with time zone)", "contractor_practice_session_live(uuid)", "revoke_contractor_practice_session(uuid)", "contractor_practice_session_guard()", "contractor_practice_session_require_audit()"]) {
  const p = (await c.admin.query("SELECT prosecdef,provolatile,proconfig,pg_get_userbyid(proowner) owner,has_function_privilege('jobguard_runtime',oid,'EXECUTE') runtime,has_function_privilege('jobguard_infrastructure',oid,'EXECUTE') infra,EXISTS(SELECT 1 FROM aclexplode(coalesce(proacl,acldefault('f',proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') public FROM pg_proc WHERE oid=$1::regprocedure", [`app.${signature}`])).rows[0];
  expect(p).toMatchObject({ prosecdef: signature.startsWith("revoke_"), proconfig: ["search_path=pg_catalog"], owner: "jobguard_migration", runtime: signature.startsWith("revoke_"), infra: false, public: false });
  if (signature.startsWith("contractor_practice_session_live")) expect(p.provolatile).toBe("v");
 }
});
it("[PH11] a holder can end their own session after membership revoke without additional permission", async () => {
 const f = await session(), repo = new ContractorRepository(c.runtime);
 await repo.command(f.p, await currentCommand(c, f, { kind: "membership.revoke", membershipId: f.p.membershipId }));
 expect(await repo.resolveSession(f.session)).toEqual(f.p); await expect(revoke(f)).resolves.toMatchObject({ environment: "synthetic_demo" }); await equalRefusals(f.session);
});

it("[PH15] catalogue scan finds no stored session values and exactly one new digest place", async () => {
 const tables = (await c.admin.query("SELECT quote_ident(n.nspname)||'.'||quote_ident(t.relname) name FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace WHERE t.relkind='r' AND n.nspname IN ('app','identity','control_plane','infrastructure','audit_control') ORDER BY 1")).rows.map(x => x.name as string);
 expect(tables.length).toBeGreaterThanOrEqual(150); expect(used.length).toBeGreaterThan(0);

 for (const home of [false, true]) {
  const value = home ? await issuePracticeSession(c.runtime) : randomUUID(); used.push(value); const d = digestOf(value);
  const occurrences = async () => Object.fromEntries(await Promise.all(tables.map(async table => [table, (await c.admin.query(`SELECT count(*)::int n FROM ${table} x WHERE strpos(row_to_json(x)::text,$1)>0`, [d])).rows[0].n])));
  const before = await occurrences(), p = await new ContractorRepository(c.runtime).startPractice(value);
  const context: VerifiedTenantContext = await contractorSessionContext(c.runtime, value);
  const result = await new ContractorPracticeSessionRepository(c.runtime).revoke(context, value), after = await occurrences();
  for (const table of tables) expect(after[table]).toBe(before[table] + (table === 'control_plane.contractor_practice_session' ? 1 : 0));
  const audit = (await c.admin.query("SELECT row_to_json(x)::text bytes FROM app.audit_event x WHERE tenant_id=$1", [p.tenantId])).rows;
  expect(JSON.stringify(audit)).not.toContain(value); expect(JSON.stringify(audit)).not.toContain(d); expect(JSON.stringify(result)).not.toContain(value); expect(JSON.stringify(result)).not.toContain(d);
  const error = await revoke({ session: value, p, context, home }).catch(error => error); expect(error.message + error.stack).not.toContain(value); expect(error.message + error.stack).not.toContain(d);
 }
 for (const table of tables) expect((await c.admin.query(`SELECT count(*)::int n FROM ${table} x WHERE EXISTS(SELECT 1 FROM unnest($1::text[]) v WHERE strpos(row_to_json(x)::text,v)>0)`, [used])).rows[0].n).toBe(0);
});
