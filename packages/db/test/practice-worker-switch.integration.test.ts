import { seedContractorAgreement } from "./contractor-agreement-test-fixtures.js";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { ContractorRepository, ContractorPracticeSessionRepository, JobSchedulingRepository, contractorSessionContext, withTenant, type VerifiedTenantContext } from "../src/index.js";
import { currentCommand, type Cluster } from "./contractor-practice-session-fixtures.js";
import { cluster, company, start, end, state, lookup, repo, on, off, text, expireSwitch, makeSessionExpired, startSessionWithHomeRecord, endHomeRecord, resolvers, raw } from "./practice-worker-switch-fixtures.js";
let c: Cluster;
beforeAll(async () => { process.env.JOBGUARD_ENV = "synthetic_demo"; c = await cluster(); }, 120000);
afterAll(async () => { await c?.close(); });
it.each(["operative", "supervisor", "surveyor", "client_approver"])("[PW1] [PW3] [PW13] decision 39 switches to %s and back without renewing the session", async role => {
 const f = await company(c), before = await text(c, "control_plane.contractor_practice_session", f.p.tenantId);
 const markerBefore = await text(c, "control_plane.practice_company_marker", f.p.tenantId); expect(markerBefore).toEqual([]);
 const lower = (await c.admin.query("SELECT clock_timestamp()::text t")).rows[0]!.t;
 const first = await start(c, f, role);
 const upper = (await c.admin.query("SELECT clock_timestamp()::text t")).rows[0]!.t;
 expect((await c.admin.query("SELECT started_at BETWEEN $2::timestamptz AND $3::timestamptz valid FROM control_plane.practice_worker_switch WHERE id=$1", [first.switchId, lower, upper])).rows[0]!.valid).toBe(true);
 expect(first.state).toBe("acting"); expect(first.workerMembershipId).toBe(f.members[role]);
 expect((await lookup(c, f)).membershipId).toBe(f.members[role]); expect((await lookup(c, f)).tenantId).toBe(f.p.tenantId);
 expect(await state(c, f)).toMatchObject({ state: "acting", switchId: first.switchId });
 expect((await c.admin.query("SELECT expires_at=started_at+interval '30 minutes' exact FROM control_plane.practice_worker_switch WHERE id=$1", [first.switchId])).rows[0]!.exact).toBe(true);
 const marker = await text(c, "control_plane.practice_company_marker", f.p.tenantId); expect(marker).toHaveLength(1);
 expect(await end(c, f)).toMatchObject({ state: "owner", endReason: "switched_back" }); expect(await lookup(c, f)).toEqual(f.p);
 await start(c, f, role); expect(await text(c, "control_plane.practice_company_marker", f.p.tenantId)).toEqual(marker); await end(c, f);
 expect(await text(c, "control_plane.contractor_practice_session", f.p.tenantId)).toEqual(before);
 const events = (await c.admin.query("SELECT event_type,payload,actor_ref FROM app.audit_event WHERE tenant_id=$1 AND event_type LIKE 'practice.worker_switch.%' ORDER BY sequence", [f.p.tenantId])).rows;
 expect(events).toHaveLength(4); expect(events[0]!.payload.references.marker).toBe("acquired"); expect(events[2]!.payload.references.marker).toBe("present");
 expect(events.every(e => e.actor_ref === `membership:${f.p.membershipId}`)).toBe(true);
});
it("[PW2] exactly the worker's own merged permissions and unchanged authority rows", async () => {
 const f = await company(c), tables = ["app.role_grant", "app.role_grant_revocation", "app.membership", "app.contractor_member", "app.team_membership"];
 const globalTables = ["identity.identity_user", "identity.user_email", "identity.membership_locator", "identity.invitation", "identity.sso_connection", "control_plane.tenant"];
 const globalBefore = await Promise.all(globalTables.map(t => text(c, t)));
 const before = await Promise.all(tables.map(t => text(c, t, f.p.tenantId)));
 const scheduling = new JobSchedulingRepository(c.runtime);
 await expect(scheduling.assignments(f.p, f.jobId)).rejects.toMatchObject({ code: "NOT_FOUND" });
 await start(c, f); const worker = await lookup(c, f);
 await scheduling.assignments(worker, f.jobId);
 await expect(new ContractorRepository(c.runtime).query(worker, { version: "contractor-query.v1", tenantId: f.p.tenantId, resource: "organisation" })).rejects.toMatchObject({ code: "NOT_FOUND" });
 expect(await Promise.all(tables.map(t => text(c, t, f.p.tenantId)))).toEqual(before); expect(await Promise.all(globalTables.map(t => text(c, t)))).toEqual(globalBefore); await end(c, f);
 expect(await Promise.all(tables.map(t => text(c, t, f.p.tenantId)))).toEqual(before); expect(await Promise.all(globalTables.map(t => text(c, t)))).toEqual(globalBefore);
});
it("[PW4] [PW7] a refused command writes no switch and no marker", async () => {
 const f = await company(c); await expect(start(c, f, "admin")).rejects.toMatchObject({ code: "NOT_FOUND" });
 expect(await text(c, "control_plane.practice_company_marker", f.p.tenantId)).toEqual([]);
 expect(await text(c, "control_plane.practice_worker_switch", f.p.tenantId)).toEqual([]);
 await start(c, f);
 for (const target of [f.members.supervisor, f.members.operative, randomUUID()]) await expect(repo(c).switchOn(f.context, f.p, f.session, { ...on(), workerId: target })).rejects.toMatchObject({ code: "SWITCH_OPEN" });
});
it.each(["owner", "admin", "commercial_manager", "finance", "read_only", "revoked", "wider"])("[PW5] target %s has the identical not-found refusal", async role => {
 const f = await company(c); await expect(start(c, f, role)).rejects.toMatchObject({ code: "NOT_FOUND" }); expect(await lookup(c, f)).toEqual(f.p);
});
it("[PW6] foreign target and context cannot select another company", async () => {
 const a = await company(c), b = await company(c);
 await expect(repo(c).switchOn(a.context, a.p, a.session, { ...on(), workerId: b.members.operative })).rejects.toMatchObject({ code: "NOT_FOUND" });
 await expect(repo(c).switchOn(b.context, a.p, a.session, { ...on(), workerId: a.members.operative })).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
 await start(c, a); expect(await lookup(c, b)).toEqual(b.p); await start(c, b); await end(c, b); expect((await lookup(c, a)).membershipId).toBe(a.members.operative);
});
it("[PW7] replaying a command id returns the first result, never the session's current state", async () => {
 const f = await company(c), command = on(), finish = off();
 const first = await start(c, f, "operative", command); expect(await start(c, f, "operative", command)).toEqual(first);
 const ended = await end(c, f, finish); await start(c, f, "supervisor");
 expect(await start(c, f, "operative", command)).toEqual(first); expect(await end(c, f, finish)).toEqual(ended);
 expect((await lookup(c, f)).membershipId).toBe(f.members.supervisor);
});
it("[PW7] the same command id with a changed target conflicts", async () => {
 const f = await company(c), command = on(); await start(c, f, "operative", command);
 await expect(start(c, f, "supervisor", command)).rejects.toMatchObject({ code: "COMMAND_CONFLICT" });
 await expect(end(c, f, { version: "practice-worker-switch-off.v1", commandId: command.commandId })).rejects.toMatchObject({ code: "COMMAND_CONFLICT" });
});
it("[PW7] the same command id from another session conflicts", async () => {
 const a = await company(c), b = await company(c), command = on(); await start(c, a, "operative", command);
 await expect(start(c, b, "operative", command)).rejects.toMatchObject({ code: "COMMAND_CONFLICT" });
});
it("[PW8] expiry leaves an unclosed switch until explicitly ended", async () => {
 const f = await company(c); await start(c, f); await expireSwitch(c, f); expect(await lookup(c, f)).toEqual(f.p);
 expect(await state(c, f)).toMatchObject({ state: "unclosed" }); await expect(start(c, f)).rejects.toMatchObject({ code: "SWITCH_OPEN" });
 expect(await end(c, f)).toMatchObject({ endReason: "expired" }); await start(c, f);
});
it.each(["revoked", "expired", "home-revoked", "home-expired"])("[PW9] ended %s session cannot act or revive", async kind => {
 const f = await company(c); await start(c, f);
 if (kind === "revoked") await new ContractorPracticeSessionRepository(c.runtime).revoke(f.context, f.session);
 else if (kind === "expired") await makeSessionExpired(c, f.session);
 else {
  const home = await startSessionWithHomeRecord(c); await endHomeRecord(c, home.session, kind === "home-revoked" ? "revoked" : "expired");
  for (const resolve of resolvers(c)) await expect(resolve(home.session)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  await makeSessionExpired(c, f.session);
 }
 const before = await text(c, "control_plane.practice_worker_switch", f.p.tenantId);
 for (const resolve of resolvers(c)) await expect(resolve(f.session)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
 for (const work of [() => start(c, f), () => end(c, f), () => state(c, f)]) await expect(work()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
 expect(await text(c, "control_plane.practice_worker_switch", f.p.tenantId)).toEqual(before);
 await expect(new ContractorRepository(c.runtime).startPractice(f.session)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
});
it("[PW10] missing audit rolls the routine and first marker back at commit", async () => {
 const f = await company(c);
 await expect(raw(c, f, "SELECT app.practice_worker_switch_on($1,$2,$3)", [f.session, randomUUID(), f.members.operative])).rejects.toMatchObject({ message: "SWITCH_AUDIT_REQUIRED" });
 expect(await text(c, "control_plane.practice_company_marker", f.p.tenantId)).toEqual([]); expect(await lookup(c, f)).toEqual(f.p);
});
it("[PW11] concurrent duplicate and different commands serialize", async () => {
 const f = await company(c), command = on(); const answers = await Promise.all([start(c, f, "operative", command), start(c, f, "operative", command)]); expect(answers[0]).toEqual(answers[1]);
 await end(c, f); const results = await Promise.allSettled([start(c, f), start(c, f)]); expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
 expect(results.find(r => r.status === "rejected")).toMatchObject({ reason: { code: "SWITCH_OPEN" } });
});
it("[PW22] refusal records deduplicate and omit foreign targets", async () => {
 const f = await company(c), command = on(); for (let i = 0; i < 3; i++) await expect(start(c, f, "admin", command)).rejects.toMatchObject({ code: "NOT_FOUND" });
 const rows = (await c.admin.query("SELECT payload FROM app.audit_event WHERE tenant_id=$1 AND event_type='practice.worker_switch.refused'", [f.p.tenantId])).rows;
 expect(rows).toHaveLength(1); expect(rows[0]!.payload.references.worker).toBe(f.members.admin);
 const b = await company(c); await expect(repo(c).switchOn(f.context, f.p, f.session, { ...on(), workerId: b.members.operative })).rejects.toMatchObject({ code: "NOT_FOUND" });
 const last = (await c.admin.query("SELECT payload FROM app.audit_event WHERE tenant_id=$1 AND event_type='practice.worker_switch.refused' ORDER BY sequence DESC LIMIT 1", [f.p.tenantId])).rows[0]!; expect(last.payload.references).not.toHaveProperty("worker");
});
it("[PW30] a lookup made after a committed end names the owner, also inside a transaction opened before the end", async () => {
 const f = await company(c); await start(c, f); const db = await c.runtime.connect();
 try { await db.query("BEGIN"); await db.query("SELECT 1"); await end(c, f); expect((await db.query("SELECT * FROM app.contractor_session($1)", [f.session])).rows[0]!.membership_id).toBe(f.p.membershipId); } finally { await db.query("ROLLBACK"); db.release(); }
});
it.each(["REPEATABLE READ", "SERIALIZABLE"])("[PW30] a transaction that is not read committed is never given the worker: %s", async isolation => {
 const f = await company(c); await start(c, f); const db = await c.runtime.connect();
 try { await db.query(`BEGIN ISOLATION LEVEL ${isolation}`); expect((await db.query("SELECT * FROM app.contractor_session($1)", [f.session])).rows[0]!.membership_id).toBe(f.p.membershipId); expect((await lookup(c, f)).membershipId).toBe(f.members.operative); await end(c, f); expect((await db.query("SELECT * FROM app.contractor_session($1)", [f.session])).rows[0]!.membership_id).toBe(f.p.membershipId); } finally { await db.query("ROLLBACK"); db.release(); }
});
it("[PW30] the lookup reads the actual time, not the transaction's start", async () => {
 const f = await company(c), db = await c.runtime.connect(); try { await db.query("BEGIN"); await db.query("SELECT transaction_timestamp()"); await start(c, f); expect((await db.query("SELECT * FROM app.contractor_session($1)", [f.session])).rows[0]!.membership_id).toBe(f.members.operative); } finally { await db.query("ROLLBACK"); db.release(); }
});
it("[PW30] expiry is strict", async () => { const f = await company(c); await start(c, f); await expireSwitch(c, f, 30); expect(await lookup(c, f)).toEqual(f.p); await expireSwitch(c, f, 29); expect((await lookup(c, f)).membershipId).toBe(f.members.operative); });
it.each(["admin", "commercial_manager", "finance", "read_only"])("[PW32] wider %s grant refused while acting, permitted after end", async role => {
 const f = await company(c); await start(c, f);
 const command = await currentCommand(c, f, { kind: "grant.create", membershipId: f.members.operative, role, scope: { kind: "tenant", id: f.p.tenantId }, contractId: null });
 await expect(new ContractorRepository(c.runtime).command(f.p, command)).rejects.toMatchObject({ code: "FORBIDDEN" });
 await end(c, f); await new ContractorRepository(c.runtime).command(f.p, command); await expect(start(c, f)).rejects.toMatchObject({ code: "NOT_FOUND" });
});
it("[PW23] public state contains no session reference, value or authority", async () => {
 const f = await company(c), result = await start(c, f); const serialized = JSON.stringify(result); expect(serialized).not.toContain(f.session); expect(serialized).not.toContain(f.sessionRef); expect(serialized).not.toContain(f.p.tenantId);
 const context: VerifiedTenantContext = await contractorSessionContext(c.runtime, f.session); await withTenant(c.runtime, context, async () => undefined);
});
it.each(["routine", "audit", "commit"])("[PW10] injected %s failure rolls back both commands and the first marker", async seam => {
 const f = await company(c);
 const { PracticeWorkerSwitchRepository } = await import("../src/index.js");
 const { Pool } = await import("pg");
 const failing = new Proxy(c.runtime, { get(target, property) {
  if (property !== "connect") { const value = Reflect.get(target, property, target); return typeof value === "function" ? value.bind(target) : value; }
  return async () => {
   const client = await target.connect();
   return new Proxy(client, { get(connection, key) {
    if (key !== "query") { const value = Reflect.get(connection, key, connection); return typeof value === "function" ? value.bind(connection) : value; }
    return async (sql: string, args?: unknown[]) => { if ((seam === "routine" && sql.includes("SELECT app.practice_worker_switch_")) || (seam === "audit" && sql.includes("INSERT INTO app.audit_event")) || (seam === "commit" && sql === "COMMIT")) throw new Error("PWS_INJECTED_FAILURE"); return connection.query(sql, args); };
   } });
  };
 } });
 expect(failing).toBeInstanceOf(Pool);
 const repository = new PracticeWorkerSwitchRepository(failing);
 await expect(repository.switchOn(f.context, f.p, f.session, { ...on(), workerId: f.members.operative })).rejects.toMatchObject({ code: "SWITCH_UNAVAILABLE" });
 expect(await text(c, "control_plane.practice_company_marker", f.p.tenantId)).toEqual([]); expect(await lookup(c, f)).toEqual(f.p);
 await start(c, f); const before = await text(c, "control_plane.practice_worker_switch", f.p.tenantId);
 await expect(repository.switchOff(f.context, f.p, f.session, off())).rejects.toMatchObject({ code: "SWITCH_UNAVAILABLE" });
 expect(await text(c, "control_plane.practice_worker_switch", f.p.tenantId)).toEqual(before); expect((await lookup(c, f)).membershipId).toBe(f.members.operative);
});
it("[PW10] no business lock is acquired after the audit append", async () => {
 const { ObservedPool, mutableTables } = await import("./lock-observer.js");
 const { PracticeWorkerSwitchRepository } = await import("../src/index.js");
 const f = await company(c), observed = new ObservedPool(c.runtime, c.admin), repository = new PracticeWorkerSwitchRepository(observed.pool), mutable = await mutableTables(c.admin);
 for (const work of [() => repository.switchOn(f.context, f.p, f.session, { ...on(), workerId: f.members.operative }), () => repository.switchOff(f.context, f.p, f.session, off())]) {
  const { transactions } = await observed.record(work); expect(transactions).toHaveLength(1);
  const statements = transactions[0]!.statements, index = statements.findIndex(s => s.sql.includes("app.lock_audit_head")); expect(index).toBeGreaterThanOrEqual(0);
  const head = statements[index]!.footprint;
  for (const statement of statements.slice(index + 1)) {
   expect([...statement.footprint.advisory].every(k => head.advisory.has(k))).toBe(true);
   for (const [key, rank] of statement.footprint.rows) if ([...mutable].some(table => key.startsWith(`${table}#`)) && !key.startsWith("app.audit_")) expect(rank).toBeLessThanOrEqual(head.rows.get(key) ?? 0);
  }
 }
});
it("[PW20] invalid session values and foreign target cannot select authority", async () => {
 const f = await company(c), b = await company(c), switched = await start(c, b);
 for (const value of [randomUUID(), f.sessionRef, f.p.membershipId, f.members.operative!, f.p.tenantId, switched.switchId!]) {
  await expect(repo(c).switchOn(f.context, f.p, value, { ...on(), workerId: f.members.operative })).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  await expect(repo(c).state(f.context, value)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
 }
 expect(await lookup(c, f)).toEqual(f.p);
});
it("[PW11] one command concurrently used across sessions and opposite operations conflicts", async () => {
 const a = await company(c), b = await company(c); await start(c, b); const command = randomUUID();
 const results = await Promise.allSettled([start(c, a, "operative", { version: "practice-worker-switch-on.v1", commandId: command }), end(c, b, { version: "practice-worker-switch-off.v1", commandId: command })]);
 expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1); expect(results.find(r => r.status === "rejected")).toMatchObject({ reason: { code: "COMMAND_CONFLICT" } });
});
it("[PW32] a tenant-locked wider grant committed first prevents a waiting switch", async () => {
 const f = await company(c), db = await c.admin.connect();
 try {
  await db.query("BEGIN"); await db.query("SELECT set_config('app.tenant_id',$1,true)", [f.p.tenantId]); await db.query("SET LOCAL ROLE jobguard_migration");
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,54))", [f.p.tenantId]);
  const waiting = start(c, f); await db.query("INSERT INTO app.role_grant VALUES($1,$2,$3,'admin','tenant',$1,NULL)", [f.p.tenantId, randomUUID(), f.members.operative]);
  await db.query("COMMIT"); await expect(waiting).rejects.toMatchObject({ code: "NOT_FOUND" });
 } finally { await db.query("ROLLBACK"); db.release(); }
});
it("[PW9] home record ending during a current switch leaves both session and switch inert", async () => {
 const { prepareWorkOrderDemo } = await import("../src/index.js");
 for (const kind of ["expired", "revoked"] as const) {
  const f = await startSessionWithHomeRecord(c); await seedContractorAgreement(c.admin, f.p.tenantId); const demo = await prepareWorkOrderDemo(c.runtime, f.p, { siteCount: 1 });
  await repo(c).switchOn(f.context, f.p, f.session, { ...on(), workerId: demo.operativeMembershipId });
  const sessionBefore = await text(c, "control_plane.contractor_practice_session", f.p.tenantId), switchBefore = await text(c, "control_plane.practice_worker_switch", f.p.tenantId);
  await endHomeRecord(c, f.session, kind);
  for (const resolve of resolvers(c)) await expect(resolve(f.session)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  await expect(repo(c).state(f.context, f.session)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  expect(await text(c, "control_plane.contractor_practice_session", f.p.tenantId)).toEqual(sessionBefore); expect(await text(c, "control_plane.practice_worker_switch", f.p.tenantId)).toEqual(switchBefore);
 }
});
it("[PW32] decision 39 grants stay with the member and revocation removes job access", async () => {
 const f = await company(c), contracts = new ContractorRepository(c.runtime);
 await start(c, f);
 for (const role of ["operative", "supervisor", "surveyor"]) await contracts.command(f.p, await currentCommand(c, f, { kind: "grant.create", membershipId: f.members.operative, role, scope: { kind: "team", id: f.demo.teamId }, contractId: null }));
 await contracts.command(f.p, await currentCommand(c, f, { kind: "membership.revoke", membershipId: f.members.operative }));
 await expect(new JobSchedulingRepository(c.runtime).assignments(await lookup(c, f), f.jobId)).rejects.toMatchObject({ code: "NOT_FOUND" });
 await end(c, f); await expect(start(c, f)).rejects.toMatchObject({ code: "NOT_FOUND" });
});
it("[PW23] catalogue-wide scan stores neither session values nor extra digests", async () => {
 const { digestOf } = await import("./practice-worker-switch-fixtures.js");
 const f = await company(c); await start(c, f); await end(c, f);
 const tables = (await c.admin.query("SELECT quote_ident(n.nspname)||'.'||quote_ident(t.relname) name FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace WHERE t.relkind='r' AND n.nspname IN('app','identity','control_plane','infrastructure','audit_control') ORDER BY 1")).rows;
 expect(tables.length).toBeGreaterThan(0);
 for (const table of tables) {
  expect((await c.admin.query(`SELECT count(*)::int n FROM ${table.name} t WHERE strpos(row_to_json(t)::text,$1)>0`, [f.session])).rows[0]!.n).toBe(0);
  if (table.name !== 'control_plane.contractor_practice_session') expect((await c.admin.query(`SELECT count(*)::int n FROM ${table.name} t WHERE strpos(row_to_json(t)::text,$1)>0`, [digestOf(f.session)])).rows[0]!.n).toBe(0);
 }
});
it("[PW1] switch events and rows share a transaction and the audit chain verifies", async () => {
 const { verifyAuditChain } = await import("../src/index.js");
 const f = await company(c), first = await start(c, f); await end(c, f);
 const rows = (await c.admin.query("SELECT s.xmin::text sx,a.xmin::text ax FROM control_plane.practice_worker_switch s JOIN app.audit_event a ON a.tenant_id=s.tenant_id AND a.id=s.end_event_id WHERE s.id=$1", [first.switchId])).rows;
 expect(rows).toHaveLength(1); expect(rows[0]!.sx).toBe(rows[0]!.ax);
 const events = (await c.admin.query("SELECT id,version,tenant_id AS \"tenantId\",sequence,actor_ref AS \"actorRef\",event_type AS \"eventType\",subject_type AS \"subjectType\",subject_ref AS \"subjectRef\",occurred_at AS \"occurredAt\",payload,payload_hash AS \"payloadHash\",previous_hash AS \"previousHash\",event_hash AS \"eventHash\" FROM app.audit_event WHERE tenant_id=$1 ORDER BY sequence", [f.p.tenantId])).rows;
 verifyAuditChain(events.map(event => ({ ...event, sequence: Number(event.sequence) })));
});
it.each(["membership.revoke", "grant.create"])("[PW11] [PW32] merged %s committed first is seen by a waiting switch", async kind => {
 const f = await company(c);
 let unlock!: () => void, announce!: () => void;
 const gate = new Promise<void>(resolve => { unlock = resolve; }), locked = new Promise<void>(resolve => { announce = resolve; });
 const held = new Proxy(c.runtime, { get(target, property) {
  if (property !== "connect") { const value = Reflect.get(target, property, target); return typeof value === "function" ? value.bind(target) : value; }
  return async () => { const connection = await target.connect(); return new Proxy(connection, { get(client, key) {
   if (key !== "query") { const value = Reflect.get(client, key, client); return typeof value === "function" ? value.bind(client) : value; }
   return async (sql: string, args?: unknown[]) => { const result = await client.query(sql, args); if (sql.includes("SELECT pg_advisory_xact_lock(hashtextextended($1,54))")) { announce(); await gate; } return result; };
  } }); };
 } });
 const command = await currentCommand(c, f, { kind, membershipId: f.members.operative, ...(kind === "grant.create" ? { role: "admin", scope: { kind: "tenant", id: f.p.tenantId }, contractId: null } : {}) });
 const operation = new ContractorRepository(held).command(f.p, command); await locked;
 const switching = start(c, f);
 try {
  let waiting = false;
  for (let n = 0; n < 200; n++) { waiting = (await c.admin.query("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND NOT granted) waiting")).rows[0]!.waiting; if (waiting) break; }
  expect(waiting).toBe(true);
 } finally { unlock(); }
 await operation; await expect(switching).rejects.toMatchObject({ code: "NOT_FOUND" });
 expect(await text(c, "control_plane.practice_worker_switch", f.p.tenantId)).toEqual([]);
});
it("[PW11] session revoke and switch settle without deadlock and no later lookup succeeds", async () => {
 const f = await company(c);
 const results = await Promise.allSettled([start(c, f), new ContractorPracticeSessionRepository(c.runtime).revoke(f.context, f.session)]);
 for (const result of results) if (result.status === "rejected") expect(result.reason.code).not.toBe("40P01");
 expect(results[1]!.status).toBe("fulfilled");
 for (let n = 0; n < 3; n++) await expect(lookup(c, f)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
});
it("[PW11] simultaneous start and end leave a consistent current state", async () => {
 const f = await company(c); await start(c, f);
 const results = await Promise.allSettled([start(c, f, "supervisor"), end(c, f)]); expect(results[1]!.status).toBe("fulfilled");
 const current = await state(c, f), actor = await lookup(c, f); expect(actor.membershipId).toBe(current.state === "acting" ? f.members.supervisor : f.p.membershipId);
});
it.each(["owner membership", "owner grant", "small-builder track"])("[PW4] %s caller refusal is identical for every target", async change => {
 const f = await company(c), other = await company(c), contractors = new ContractorRepository(c.runtime);
 if (change === "owner membership") await contractors.command(f.p, await currentCommand(c, f, { kind: "membership.revoke", membershipId: f.p.membershipId }));
 if (change === "owner grant") {
  const grant = (await c.admin.query("SELECT id FROM app.role_grant WHERE tenant_id=$1 AND membership_id=$2 AND role='owner'", [f.p.tenantId, f.p.membershipId])).rows[0]!.id;
  await contractors.command(f.p, await currentCommand(c, f, { kind: "grant.revoke", grantId: grant }));
 }
 if (change === "small-builder track") {
  const { ownerTx } = await import("./practice-worker-switch-fixtures.js"); const { appendAuditBatch } = await import("../src/index.js"); const id = randomUUID();
  await ownerTx(c, f.p.tenantId, async db => {
   await db.$client.query("SELECT app.assign_commercial_track($1,$2,'small_builder',$3,1,'operations:pws-fixture')", [f.p.tenantId, id, `synthetic-agreement:${f.p.tenantId}`]);
   await appendAuditBatch(db, [{ id, version: "audit.v1", actorRef: "operations:pws-fixture", eventType: "commercial_track.assigned", subjectType: "tenant", subjectRef: f.p.tenantId, payload: { references: { environment: "synthetic_demo" } } }]);
  });
 }
 const shapes = [];
 for (const workerId of [f.members.supervisor, f.members.operative, randomUUID(), other.members.operative]) {
  const failure = await repo(c).switchOn(f.context, f.p, f.session, { ...on(), workerId }).catch(error => ({ code: error.code, message: error.message })); shapes.push(failure);
 }
 expect(shapes).toEqual(Array(4).fill({ code: "SWITCH_FORBIDDEN", message: "SWITCH_FORBIDDEN" }));
 expect(await text(c, "control_plane.practice_worker_switch", f.p.tenantId)).toEqual([]);
});
it("[PW5] a target linked to another company's sign-in locator is not eligible", async () => {
 const f = await company(c), b = await company(c);
 const user = (await c.admin.query("SELECT identity_user_id FROM app.membership WHERE tenant_id=$1 AND id=$2", [f.p.tenantId, f.members.operative])).rows[0]!.identity_user_id, linked = randomUUID();
 await c.admin.query("INSERT INTO app.membership(tenant_id,id,account_id,identity_user_id,role) SELECT tenant_id,$2,account_id,$3,'operative' FROM app.membership WHERE tenant_id=$1 AND id=$4", [b.p.tenantId, linked, user, b.p.membershipId]);
 await c.admin.query("INSERT INTO identity.membership_locator VALUES($1,$2,$3)", [user, b.p.tenantId, linked]);
 await expect(start(c, f)).rejects.toMatchObject({ code: "NOT_FOUND" }); expect(await lookup(c, f)).toEqual(f.p);
});
it("[PW6] unstamped or missing contexts are refused before connecting", async () => {
 const f = await company(c), { PracticeWorkerSwitchRepository } = await import("../src/index.js"); let connections = 0;
 const p = new Proxy(c.runtime, { get(target, property) { if (property === "connect") return () => { connections++; throw new Error("PWS_UNEXPECTED_CONNECTION"); }; const value = Reflect.get(target, property, target); return typeof value === "function" ? value.bind(target) : value; } });
 const repository = new PracticeWorkerSwitchRepository(p);
 await expect(repository.switchOn({ tenantId: f.p.tenantId } as never, f.p, f.session, { ...on(), workerId: f.members.operative })).rejects.toThrow();
 await expect(repository.state(undefined as never, f.session)).rejects.toThrow(); expect(connections).toBe(0);
});
it("[PW32] team move and grant revocation remain available while acting", async () => {
 const f = await company(c), contractors = new ContractorRepository(c.runtime);
 const team = await contractors.command(f.p, await currentCommand(c, f, { kind: "team.create", branchId: f.demo.branchId, name: "Fictional second team" }));
 await start(c, f);
 await contractors.command(f.p, await currentCommand(c, f, { kind: "team.move", membershipId: f.members.operative, fromTeamId: f.demo.teamId, toTeamId: team.id }));
 const grant = (await c.admin.query("SELECT g.id FROM app.role_grant g WHERE g.tenant_id=$1 AND g.membership_id=$2 AND g.scope_id=$3 AND NOT EXISTS(SELECT 1 FROM app.role_grant_revocation r WHERE r.tenant_id=g.tenant_id AND r.grant_id=g.id)", [f.p.tenantId, f.members.operative, team.id])).rows[0]!.id;
 await contractors.command(f.p, await currentCommand(c, f, { kind: "grant.revoke", grantId: grant }));
 await expect(new JobSchedulingRepository(c.runtime).assignments(await lookup(c, f), f.jobId)).rejects.toMatchObject({ code: "NOT_FOUND" });
 await end(c, f);
});
