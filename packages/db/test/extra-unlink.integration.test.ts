// Written before product code; NOT RUN (sandbox cannot start PostgreSQL / a browser).
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { contractorRoles, ExtraPersistenceError } from "@jobguard/core";
import {
 ContractorRepository, ExtraRepository, WorkOrderRepository, demoFile, demoRow, withTenant,
 InvalidTenantContextError, verifyAuditChain, type AuditEvent, type ExtraTransactionSeam,
} from "../src/index.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import {
 cluster, fixture, raise, linkInput, orderInput, laterRevision, ownerTx, receipt,
 noteCanary, descriptionCanary, type Cluster, type Fixture,
} from "./extra-fixtures.js";

let c: Cluster, repo: ExtraRepository, contractors: ContractorRepository;
beforeAll(async () => { c = await cluster(); repo = new ExtraRepository(c.runtime); contractors = new ContractorRepository(c.runtime); }, 60_000);
afterAll(async () => { await c?.close(); });
type Scope = { kind: string; id: string };
const five = ["owner", "admin", "supervisor", "surveyor", "commercial_manager"] as const;
const allRoles = ["owner", "admin", "supervisor", "surveyor", "commercial_manager", "operative", "finance", "read_only", "client_approver", "connector"];
const protectedTables = ["variation", "variation_revision", "extra_origin", "extra_event", "extra_order_line_link", "role_grant", "role_grant_revocation", "contractor_membership_revocation"];
const view = (f: Fixture) => contractors.query(f.p, { version: "contractor-query.v1", tenantId: f.p.tenantId, resource: "organisation" });
async function command(f: Fixture, fields: Record<string, unknown>) {
 return contractors.command(f.p, { version: "contractor-command.v1", environment: "synthetic_demo", commandId: randomUUID(), id: randomUUID(), expectedRevision: (await view(f)).revision, ...fields });
}
async function organisation() {
 const f = await fixture(c), r1 = (await view(f)).units.find(u => u.kind === "region")!.id;
 const t2 = (await command(f, { kind: "team.create", branchId: f.demo.branchId, name: "Fictional team two" })).id;
 const b2 = (await command(f, { kind: "unit.create", unitKind: "branch", parentId: r1, name: "Fictional branch two" })).id;
 const t3 = (await command(f, { kind: "team.create", branchId: b2, name: "Fictional team three" })).id;
 const r2 = (await command(f, { kind: "unit.create", unitKind: "region", parentId: f.p.tenantId, name: "Fictional region two" })).id;
 const b3 = (await command(f, { kind: "unit.create", unitKind: "branch", parentId: r2, name: "Fictional branch three" })).id;
 const t4 = (await command(f, { kind: "team.create", branchId: b3, name: "Fictional team four" })).id;
 return Object.assign(f, { r1, r2, b1: f.demo.branchId, b2, b3, t1: f.demo.teamId, t2, t3, t4 });
}
async function grantTo(f: Fixture, membershipId: string, role: string, scope: Scope) {
 const id = randomUUID(); // grant.create now refuses owner (HARDEN-1), so an owner grant is made as the table owner, like one handed out before.
 await (role === "owner" ? ownerTx(c, f.p.tenantId, db => db.$client.query("INSERT INTO app.role_grant(tenant_id,id,membership_id,role,scope_kind,scope_id) VALUES($1,$2,$3,'owner',$4,$5)", [f.p.tenantId, id, membershipId, scope.kind, scope.id])) : command(f, { kind: "grant.create", id, membershipId, role, scope, contractId: null })); return id;
}
async function member(f: Fixture, role: string, scope: Scope) {
 const id = randomUUID(), invitedRole = role === "owner" ? "read_only" : role;
 await command(f, { kind: "member.invite", id, role: invitedRole, email: `${id}@fictional.invalid`, scope: role === "owner" ? { kind: "tenant", id: f.p.tenantId } : scope, clientId: role === "client_approver" ? f.demo.clientId : null, contractId: null });
 const grantId = role === "owner" ? await grantTo(f, id, role, scope) : (await c.admin.query("SELECT id FROM app.role_grant WHERE tenant_id=$1 AND membership_id=$2", [f.p.tenantId, id])).rows[0].id as string;
 return { id, grantId };
}
async function extras(f: Fixture, n = 2) {
 const result: string[] = []; for (let i = 0; i < n; i++) result.push((await repo.raiseExtra(f.ctx, raise(f))).variationId); return result;
}
async function linked(f: Fixture, pair?: readonly [string, string]) {
 const [duplicate, canonical] = pair ?? await extras(f) as [string, string];
 const input = linkInput(f, duplicate, canonical), result = await repo.linkDuplicate(f.ctx, input);
 return { ...result, duplicate, canonical, commandId: input.commandId };
}
function input(f: Fixture, linkId: string, expectedRevision = 1, actorMembershipId = f.p.membershipId) {
 return { version: "extra-duplicate-unlink.v1", commandId: randomUUID(), jobId: f.jobId, actorMembershipId, linkId, expectedRevision, reasonCode: "linked_in_error" };
}
function semantic(job: string, link: string, commandId: string) { return `extra-duplicate-unlink:${job}:${link}:${commandId}`; }
async function verifiedHead(f: Fixture) {
 const rows = (await c.admin.query("SELECT * FROM app.audit_event WHERE tenant_id=$1 ORDER BY sequence", [f.p.tenantId])).rows;
 verifyAuditChain(rows.map(r => ({ id: r.id, version: r.version, tenantId: r.tenant_id, sequence: Number(r.sequence), actorRef: r.actor_ref, eventType: r.event_type, subjectType: r.subject_type, subjectRef: r.subject_ref, occurredAt: r.occurred_at, payload: r.payload, payloadHash: r.payload_hash, previousHash: r.previous_hash, eventHash: r.event_hash })) as AuditEvent[]);
 return (await c.admin.query("SELECT sequence::text,event_hash FROM audit_control.audit_head WHERE tenant_id=$1", [f.p.tenantId])).rows;
}
async function rows(f: Fixture, table: string) {
 return (await c.admin.query(`SELECT row_to_json(t)::text value FROM app.${table} t WHERE tenant_id=$1 ORDER BY row_to_json(t)::text`, [f.p.tenantId])).rows;
}
async function protectedRows(f: Fixture) {
 return Object.fromEntries(await Promise.all(protectedTables.map(async table => [table, await rows(f, table)])));
}
async function counts(f: Fixture) {
 const result: Record<string, number> = {};
 for (const table of ["command_receipt", "extra_duplicate_link", "audit_event"]) result[table] = (await c.admin.query(`SELECT count(*)::int n FROM app.${table} WHERE tenant_id=$1`, [f.p.tenantId])).rows[0].n as number;
 return result;
}
async function snapshot(f: Fixture) { return { counts: await counts(f), head: await verifiedHead(f), protected: await protectedRows(f) }; }
function codeOnly(error: unknown, code: string, foreignIds: string[] = []) {
 if (code === "INVALID_TENANT_CONTEXT") { expect(error).toBeInstanceOf(InvalidTenantContextError); expect(error).toHaveProperty("code", "INVALID_TENANT_CONTEXT"); return; }
 expect(error).toBeInstanceOf(ExtraPersistenceError); expect(error).toHaveProperty("code", code); expect(error).toHaveProperty("message", code);
 const message = (error as Error).message;
 for (const text of [...allRoles, ...foreignIds, noteCanary, descriptionCanary, "SELECT", "constraint", "postgres"]) expect(message).not.toContain(text);
}
async function refused(f: Fixture, work: () => Promise<unknown>, code: string, other?: Fixture) {
 const before = await snapshot(f), foreignBefore = other ? await snapshot(other) : null;
 let error: unknown; try { await work(); } catch (caught) { error = caught; }
 codeOnly(error, code, other ? [other.p.tenantId] : []);
 expect(await snapshot(f)).toEqual(before); if (other) expect(await snapshot(other)).toEqual(foreignBefore); return error;
}
async function exported(f: Fixture, variation: string) {
 await ownerTx(c, f.p.tenantId, async db => {
  const commandId = await receipt(db, f.p.tenantId, f.jobId, variation, f.p.membershipId, "FinaliseExportBatch");
  await db.$client.query("INSERT INTO app.extra_event(tenant_id,id,job_id,variation_id,kind,command_id,actor_membership_id) VALUES($1,$2,$3,$4,'exported',$5,$6)", [f.p.tenantId, randomUUID(), f.jobId, variation, commandId, f.p.membershipId]);
 });
}
async function secondJob(f: Fixture) {
 await new WorkOrderRepository(c.runtime).importCsv(f.p, { commandId: randomUUID(), kind: "csv", name: "other-job.csv", csv: demoFile([demoRow(f.demo, 2)]) });
 const row = (await c.admin.query("SELECT w.id,w.job_id,x.revision_id FROM app.work_order w JOIN app.work_order_current x ON(x.tenant_id,x.work_order_id)=(w.tenant_id,w.id) WHERE w.tenant_id=$1 AND w.id<>$2", [f.p.tenantId, f.orderId])).rows[0];
 return { ...f, jobId: row.job_id as string, orderId: row.id as string, revisionId: row.revision_id as string };
}
async function madeUpJobs(f: Fixture) {
 return ownerTx(c, f.p.tenantId, async db => {
  const small = randomUUID(), contractor = randomUUID();
  await db.$client.query("INSERT INTO app.job(tenant_id,id,title,status) VALUES($1,$2,'Fictional small builder','live'),($1,$3,'Fictional contractor fixture','draft')", [f.p.tenantId, small, contractor]);
  await db.$client.query("INSERT INTO app.job_commercial_track(tenant_id,job_id,job_track,environment,provenance) VALUES($1,$2,'contractor','synthetic_demo','work_order_import')", [f.p.tenantId, contractor]);
  return [small, contractor];
 });
}
async function spyQueries<T>(rewrite: (sql: string, result: any) => any, work: () => Promise<T>) {
 const connect = c.runtime.connect.bind(c.runtime), clients = new WeakSet<object>();
 vi.spyOn(c.runtime, "connect").mockImplementation((async () => {
  const client = await connect();
  if (clients.has(client)) return client;
  clients.add(client);
  const query = client.query.bind(client);
  vi.spyOn(client, "query").mockImplementation((async (sql: any, params?: any) => {
   if (sql === "COMMIT") { await query("SET CONSTRAINTS ALL IMMEDIATE"); const replacement = rewrite("COMMIT", undefined); if (replacement !== undefined) return replacement; }
   const result = await query(sql, params); return rewrite(String(sql), result) ?? result;
  }) as any); return client;
 }) as any);
 try { return await work(); } finally { vi.restoreAllMocks(); }
}

// These cases are shared by D10, D16 and D18; expected codes are literal and each refusal checks all protected rows.
async function allowedRefusals(f: Fixture, startingRevision = 0, orderRevision?: number) {
 const first = await linked(f);
 if (orderRevision !== undefined) await repo.linkOrderLine(f.ctx, orderInput(f, first.duplicate, await laterRevision(c, f, orderRevision)));
 const second = await linked(f), prior = input(f, second.linkId, startingRevision + 2);
 const undone = await repo.unlinkDuplicate(f.ctx, prior);
 const otherJob = await secondJob(f), wrongJob = await linked(otherJob), foreign = await organisation(), foreignLink = await linked(foreign);
 const admin = await member(f, "admin", { kind: "tenant", id: f.p.tenantId });
 const good = input(f, first.linkId, startingRevision + 3);
 const cases: Array<[string, unknown]> = [
  ["NOT_LINKED", { ...good, linkId: randomUUID() }], ["NOT_LINKED", { ...good, linkId: wrongJob.linkId }],
  ["NOT_LINKED", { ...good, linkId: foreignLink.linkId }], ["NOT_LINKED", { ...good, linkId: undone.unlinkId }],
  ["ALREADY_UNLINKED", { ...good, linkId: second.linkId }],
  ["STALE_REVISION", { ...good, expectedRevision: startingRevision + 2 }], ["STALE_REVISION", { ...good, expectedRevision: startingRevision + 4 }],
  ["COMMAND_CONFLICT", { ...prior, linkId: first.linkId }], ["COMMAND_CONFLICT", { ...prior, expectedRevision: startingRevision + 3 }],
  ["COMMAND_CONFLICT", { ...prior, reasonCode: "wrong_pair" }], ["COMMAND_CONFLICT", { ...prior, actorMembershipId: admin.id }],
  ["COMMAND_CONFLICT", { ...good, commandId: first.commandId }], ["INVALID_COMMAND", { ...good, tenantId: f.p.tenantId }],
 ];
 for (const [code, raw] of cases) await refused(f, () => repo.unlinkDuplicate(f.ctx, raw), code, foreign);
 await refused(f, () => repo.unlinkDuplicate({ tenantId: f.p.tenantId } as any, good), "INVALID_TENANT_CONTEXT");
 await linked(f);
 await refused(f, () => repo.unlinkDuplicate(f.ctx, good), "STALE_REVISION");
}

describe("ENT-4c un-link command", () => {
 it("[D1] an owner un-links an active link: one un-link row, one completed command receipt, one audit event, nothing else", async () => {
  const f = await organisation(), l = await linked(f), raw = input(f, l.linkId), before = await snapshot(f);
  let fact: Parameters<ExtraTransactionSeam>[1] | undefined;
  const result = await repo.unlinkDuplicate(f.ctx, raw, async (_db, value) => { fact = value; });
  expect(Object.keys(result).sort()).toEqual(["linkId", "revision", "unlinkId", "variationId"]);
  expect(result).toEqual({ unlinkId: expect.any(String), linkId: l.linkId, variationId: l.duplicate, revision: 2 });
  expect(fact).toEqual({ kind: "duplicate_unlink", commandId: raw.commandId, jobId: f.jobId, variationId: l.duplicate, linkId: result.unlinkId, reversesLinkId: l.linkId });
  const row = (await c.admin.query("SELECT *,xmin::text transaction_id FROM app.extra_duplicate_link WHERE tenant_id=$1 AND id=$2", [f.p.tenantId, result.unlinkId])).rows[0];
  expect(row).toMatchObject({ kind: "unlink", reverses_link_id: l.linkId, reason_code: "linked_in_error", duplicate_id: l.duplicate, canonical_id: l.canonical, command_id: raw.commandId, actor_membership_id: f.p.membershipId });
  const stored = (await c.admin.query("SELECT * FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2", [f.p.tenantId, raw.commandId])).rows;
  expect(stored).toHaveLength(1); expect(stored[0]).toMatchObject({ command_type: "UnlinkDuplicate", status: "succeeded", result });
  expect(stored[0].semantic_key).toBe(semantic(f.jobId, l.linkId, raw.commandId));
  const events = (await c.admin.query("SELECT *,xmin::text transaction_id FROM app.audit_event WHERE tenant_id=$1 AND id=$2", [f.p.tenantId, result.unlinkId])).rows;
  expect(events).toHaveLength(1); expect(events[0]).toMatchObject({ event_type: "contractor.extra.duplicate_unlinked", subject_type: "extra", subject_ref: l.duplicate, actor_ref: `membership:${f.p.membershipId}`, transaction_id: row.transaction_id });
  expect(events[0].payload).toEqual({ references: { command: raw.commandId, job: f.jobId, duplicate: l.duplicate, canonical: l.canonical, link: result.unlinkId, reverses: l.linkId, environment: "synthetic_demo" } });
  const after = await snapshot(f);
  expect(Object.fromEntries(Object.keys(after.counts).map(table => [table, after.counts[table]! - before.counts[table]!]))).toEqual({ command_receipt: 1, extra_duplicate_link: 1, audit_event: 1 });
  expect(Number(after.head[0].sequence) - Number(before.head[0].sequence)).toBe(1); expect(after.protected).toEqual(before.protected);
  const group = await repo.readDuplicateGroup(f.ctx, f.jobId, l.duplicate); expect(group.members).toHaveLength(1); expect(group.canonicalId).toBe(l.duplicate);
  expect(await repo.readDuplicateLinks(f.ctx, f.jobId)).toEqual({ version: "extra-duplicate-links.v1", jobId: f.jobId, revision: 2, activeLinks: [] });
 }, 60_000);

 it("[D2] each of the five roles un-links at each scope that covers the job", async () => {
  const f = await organisation(), pair = await extras(f) as [string, string]; let revision = 0;
  const table = [
   ["owner", "tenant"], ["owner", "region"], ["owner", "branch"], ["owner", "team"],
   ["admin", "tenant"], ["admin", "region"], ["admin", "branch"], ["admin", "team"],
   ["supervisor", "tenant"], ["supervisor", "region"], ["supervisor", "branch"], ["supervisor", "team"],
   ["surveyor", "tenant"], ["surveyor", "region"], ["surveyor", "branch"], ["surveyor", "team"],
   ["commercial_manager", "tenant"], ["commercial_manager", "region"], ["commercial_manager", "branch"], ["commercial_manager", "team"],
  ] as const;
  const scopes = { tenant: f.p.tenantId, region: f.r1, branch: f.b1, team: f.t1 };
  expect(table).toHaveLength(20);
  for (const [role, kind] of table) {
   const actor = role === "owner" && kind === "tenant" ? f.p.membershipId : (await member(f, role, { kind, id: scopes[kind] })).id;
   const l = await linked(f, pair); revision++;
   const before = await counts(f), result = await repo.unlinkDuplicate(f.ctx, input(f, l.linkId, revision, actor)); revision++;
   const rows = (await c.admin.query("SELECT actor_membership_id FROM app.extra_duplicate_link WHERE tenant_id=$1 AND id=$2 AND kind='unlink'", [f.p.tenantId, result.unlinkId])).rows;
   expect(rows, `${role}/${kind}`).toEqual([{ actor_membership_id: actor }]);
   expect((await counts(f)).extra_duplicate_link! - before.extra_duplicate_link!).toBe(1);
  }
  const mixed = await member(f, "supervisor", { kind: "team", id: f.t1 }); await grantTo(f, mixed.id, "admin", { kind: "branch", id: f.b1 });
  const l = await linked(f, pair), before = await counts(f); revision++;
  const result = await repo.unlinkDuplicate(f.ctx, input(f, l.linkId, revision, mixed.id));
  expect((await c.admin.query("SELECT actor_membership_id FROM app.extra_duplicate_link WHERE tenant_id=$1 AND id=$2", [f.p.tenantId, result.unlinkId])).rows).toEqual([{ actor_membership_id: mixed.id }]);
  expect((await counts(f)).extra_duplicate_link! - before.extra_duplicate_link!).toBe(1);
 }, 120_000);

 it("[D3] every role in the merged list is decided, and the four other roles are refused", async () => {
  const f = await organisation(), l = await linked(f);
  const decisions = [["owner", true], ["admin", true], ["supervisor", true], ["surveyor", true], ["commercial_manager", true], ["operative", false], ["finance", false], ["read_only", false], ["client_approver", false]] as const;
  expect(decisions).toHaveLength(9); expect(decisions.map(([role]) => role).sort()).toEqual([...contractorRoles].sort());
  // The five true rows have all four covering scopes in D2; these six callers exercise the four refused roles.
  const actors = [f.demo.operativeMembershipId, (await member(f, "operative", { kind: "team", id: f.t1 })).id, (await member(f, "finance", { kind: "tenant", id: f.p.tenantId })).id, (await member(f, "read_only", { kind: "tenant", id: f.p.tenantId })).id, (await member(f, "read_only", { kind: "team", id: f.t1 })).id, (await member(f, "client_approver", { kind: "client", id: f.demo.clientId })).id];
  for (const actor of actors) await refused(f, () => repo.unlinkDuplicate(f.ctx, input(f, l.linkId, 1, actor)), "UNLINK_FORBIDDEN");
  await withTenant(c.runtime, f.ctx, async db => {
   for (const [role, expected] of [...decisions, ["connector", false], ["made_up_role", false]] as const) expect((await db.$client.query("SELECT app.contractor_role_permits($1,'organisation.manage') OR app.contractor_role_permits($1,'extra.price') allowed", [role])).rows[0].allowed, role).toBe(expected);
  });
 }, 120_000);

 it("[D4] one of the five roles without a covering grant is refused", async () => {
  const f = await organisation(), l = await linked(f);
  for (const role of five) for (const scope of [{ kind: "team", id: f.t2 }, { kind: "branch", id: f.b2 }, { kind: "region", id: f.r2 }]) {
   const actor = await member(f, role, scope);
   // Owner invitations add a read-only tenant grant; their only grant of an allowed role is outside this job.
   await refused(f, () => repo.unlinkDuplicate(f.ctx, input(f, l.linkId, 1, actor.id)), "UNLINK_FORBIDDEN");
  }
 }, 120_000);

 it("[D5] a revoked grant or membership is refused, on a new command and on a replay", async () => {
  const f = await organisation(), pair = await extras(f) as [string, string]; let revision = 0;
  for (const role of five) for (const kind of ["grant.revoke", "membership.revoke"]) {
   const actor = await member(f, role, { kind: "team", id: f.t1 }), l = await linked(f, pair); revision++;
   const raw = input(f, l.linkId, revision, actor.id); await repo.unlinkDuplicate(f.ctx, raw); revision++;
   await command(f, kind === "grant.revoke" ? { kind, grantId: actor.grantId } : { kind, membershipId: actor.id });
   const fresh = await linked(f, pair); revision++;
   await refused(f, () => repo.unlinkDuplicate(f.ctx, input(f, fresh.linkId, revision, actor.id)), "UNLINK_FORBIDDEN");
   await refused(f, () => repo.unlinkDuplicate(f.ctx, raw), "UNLINK_FORBIDDEN");
   await repo.unlinkDuplicate(f.ctx, input(f, fresh.linkId, revision)); revision++;
  }
 }, 120_000);

 it("[D6] mixed and foreign actors are refused", async () => {
  const f = await organisation(), other = await organisation(), l = await linked(f), foreignLink = await linked(other);
  const readOnly = await member(f, "read_only", { kind: "tenant", id: f.p.tenantId }); await grantTo(f, readOnly.id, "admin", { kind: "branch", id: f.b2 });
  const supervisor = await member(f, "supervisor", { kind: "team", id: f.t2 }); await grantTo(f, supervisor.id, "surveyor", { kind: "branch", id: f.b2 });
  for (const actor of [readOnly.id, supervisor.id, other.p.membershipId, randomUUID()]) await refused(f, () => repo.unlinkDuplicate(f.ctx, input(f, l.linkId, 1, actor)), "UNLINK_FORBIDDEN", other);
  await refused(other, () => repo.unlinkDuplicate(other.ctx, input(other, foreignLink.linkId, 1, f.p.membershipId)), "UNLINK_FORBIDDEN", f);
 }, 120_000);

 it("[D7] a refused caller gets one answer, whatever they name", async () => {
  const f = await organisation(), other = await organisation(), active = await linked(f), reversed = await linked(f);
  await repo.unlinkDuplicate(f.ctx, input(f, reversed.linkId, 2));
  const exportedLink = await linked(f); await exported(f, exportedLink.duplicate);
  const fakeJobs = await madeUpJobs(f), missingJob = randomUUID();
  const readOnly = await member(f, "read_only", { kind: "tenant", id: f.p.tenantId }), supervisor = await member(f, "supervisor", { kind: "team", id: f.t2 });
  for (const actor of [readOnly.id, supervisor.id]) {
   const good = input(f, active.linkId, 4, actor);
   for (const raw of [good, { ...good, linkId: randomUUID() }, { ...good, linkId: reversed.linkId }, { ...good, linkId: exportedLink.linkId }, { ...good, expectedRevision: 1 }, { ...good, commandId: active.commandId }, ...[missingJob, other.jobId, ...fakeJobs].map(jobId => ({ ...good, jobId }))]) await refused(f, () => repo.unlinkDuplicate(f.ctx, raw), "UNLINK_FORBIDDEN", other);
  }
  for (const jobId of [missingJob, other.jobId, ...fakeJobs]) await refused(f, () => repo.unlinkDuplicate(f.ctx, { ...input(f, active.linkId, 4), jobId }), "UNLINK_FORBIDDEN", other);
 }, 120_000);

 it("[D8] the write statement carries the rule itself", async () => {
  const f = await organisation(), l = await linked(f), revoked = await member(f, "supervisor", { kind: "team", id: f.t1 });
  await command(f, { kind: "grant.revoke", grantId: revoked.grantId });
  const actors = [(await member(f, "read_only", { kind: "tenant", id: f.p.tenantId })).id, (await member(f, "finance", { kind: "tenant", id: f.p.tenantId })).id, f.demo.operativeMembershipId, (await member(f, "client_approver", { kind: "client", id: f.demo.clientId })).id, (await member(f, "admin", { kind: "branch", id: f.b2 })).id, revoked.id];
  let initialChecks = 0;
  await spyQueries((sql, result) => {
   if (/^SELECT\s/iu.test(sql) && /\bAS allowed\b/u.test(sql) && sql.includes("app.contractor_job_allowed")) { initialChecks++; return { ...result, rows: [{ allowed: true }], rowCount: 1 }; }
   return result;
  }, async () => {
   for (const actor of actors) await refused(f, () => repo.unlinkDuplicate(f.ctx, input(f, l.linkId, 1, actor)), "UNLINK_FORBIDDEN");
   expect((await repo.unlinkDuplicate(f.ctx, input(f, l.linkId))).revision).toBe(2);
  });
  expect(initialChecks).toBe(7);
 }, 120_000);

 it("[D9] authority is read from the database at the moment of the command", async () => {
  const f = await organisation(), l = await linked(f), raw = input(f, l.linkId);
  let release!: () => void, ready!: (pid: number) => void;
  const held = new Promise<void>(resolve => { release = resolve; }), started = new Promise<number>(resolve => { ready = resolve; });
  const holder = ownerTx(c, f.p.tenantId, async db => {
   await db.$client.query("SELECT pg_advisory_xact_lock(hashtextextended($1::uuid::text,54))", [f.p.tenantId]);
   ready((await db.$client.query("SELECT pg_backend_pid() pid")).rows[0].pid as number); await held;
  });
  const pid = await started, before = await snapshot(f);
  const pending = repo.unlinkDuplicate(f.ctx, raw).then(value => ({ value }), error => ({ error }));
  try {
   let waiting = false; const until = Date.now() + 10_000;
   while (!waiting && Date.now() < until) {
    waiting = (await c.admin.query("SELECT 1 FROM pg_locks w JOIN pg_locks h ON h.locktype=w.locktype AND h.database IS NOT DISTINCT FROM w.database AND h.classid=w.classid AND h.objid=w.objid AND h.objsubid=w.objsubid WHERE h.pid=$1 AND h.locktype='advisory' AND h.granted AND NOT w.granted", [pid])).rowCount !== 0;
   }
   expect(waiting).toBe(true);
   expect((await c.admin.query("SELECT command_id FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2", [f.p.tenantId, raw.commandId])).rows).toEqual([]);
   expect((await c.admin.query("SELECT id FROM app.extra_duplicate_link WHERE tenant_id=$1 AND command_id=$2", [f.p.tenantId, raw.commandId])).rows).toEqual([]);
   expect(await snapshot(f)).toEqual(before);
  } finally { release(); await holder; }
  expect(await pending).toMatchObject({ value: { revision: 2, linkId: l.linkId } });
 }, 60_000);

 it("[D10] typed refusals for an allowed actor, each writing nothing", async () => { await allowedRefusals(await organisation()); }, 120_000);

 it("[D11] replay returns the stored result once; two callers produce one un-link", async () => {
  const f = await organisation(), l = await linked(f), raw = input(f, l.linkId), result = await repo.unlinkDuplicate(f.ctx, raw), before = await snapshot(f);
  expect(await repo.unlinkDuplicate(f.ctx, raw)).toEqual(result); expect(await snapshot(f)).toEqual(before);
  const same = await linked(f), sameRaw = input(f, same.linkId, 3), sameResults = await Promise.all([repo.unlinkDuplicate(f.ctx, sameRaw), repo.unlinkDuplicate(f.ctx, sameRaw)]);
  expect(sameResults[0]).toEqual(sameResults[1]);
  expect((await c.admin.query("SELECT id FROM app.extra_duplicate_link WHERE tenant_id=$1 AND reverses_link_id=$2", [f.p.tenantId, same.linkId])).rows).toHaveLength(1);
  const different = await linked(f), results = await Promise.allSettled([repo.unlinkDuplicate(f.ctx, input(f, different.linkId, 5)), repo.unlinkDuplicate(f.ctx, input(f, different.linkId, 5))]);
  expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
  const failure = results.find(r => r.status === "rejected"); expect(failure?.status).toBe("rejected"); if (failure?.status === "rejected") codeOnly(failure.reason, "ALREADY_UNLINKED");
  expect((await c.admin.query("SELECT id FROM app.extra_duplicate_link WHERE tenant_id=$1 AND reverses_link_id=$2", [f.p.tenantId, different.linkId])).rows).toHaveLength(1);
  const racing = await linked(f), pair = await extras(f) as [string, string], race = await Promise.allSettled([repo.unlinkDuplicate(f.ctx, input(f, racing.linkId, 7)), repo.linkDuplicate(f.ctx, linkInput(f, pair[0], pair[1]))]);
  expect(race[1]!.status).toBe("fulfilled");
  const reversalRows = (await c.admin.query("SELECT id FROM app.extra_duplicate_link WHERE tenant_id=$1 AND reverses_link_id=$2", [f.p.tenantId, racing.linkId])).rows;
  if (race[0]!.status === "fulfilled") { expect(reversalRows).toHaveLength(1); expect((await repo.readDuplicateLinks(f.ctx, f.jobId)).revision).toBe(9); }
  else { codeOnly(race[0]!.reason, "STALE_REVISION"); expect(reversalRows).toEqual([]); expect((await repo.readDuplicateLinks(f.ctx, f.jobId)).revision).toBe(8); }
  expect((await c.admin.query("SELECT id FROM app.extra_duplicate_link WHERE tenant_id=$1 AND duplicate_id=$2 AND canonical_id=$3 AND kind='link'", [f.p.tenantId, pair[0], pair[1]])).rows).toHaveLength(1);
  await verifiedHead(f);
 }, 120_000);

 it("[D12] history is preserved, append-only, and a pair can be linked again", async () => {
  const f = await organisation(), l = await linked(f), original = (await c.admin.query("SELECT row_to_json(t)::text value FROM app.extra_duplicate_link t WHERE tenant_id=$1 AND id=$2", [f.p.tenantId, l.linkId])).rows;
  const first = await repo.unlinkDuplicate(f.ctx, input(f, l.linkId));
  expect((await c.admin.query("SELECT row_to_json(t)::text value FROM app.extra_duplicate_link t WHERE tenant_id=$1 AND id=$2", [f.p.tenantId, l.linkId])).rows).toEqual(original);
  for (const id of [l.linkId, first.unlinkId]) for (const sql of ["UPDATE app.extra_duplicate_link SET reason_code=reason_code WHERE id=$1", "DELETE FROM app.extra_duplicate_link WHERE id=$1"]) {
   await expect(withTenant(c.runtime, f.ctx, db => db.$client.query(sql, [id]))).rejects.toMatchObject({ code: "42501" });
   await expect(ownerTx(c, f.p.tenantId, db => db.$client.query(sql, [id]))).rejects.toMatchObject({ code: "55000" });
  }
  await expect(withTenant(c.runtime, f.ctx, db => db.$client.query("TRUNCATE app.extra_duplicate_link"))).rejects.toMatchObject({ code: "42501" });
  const fresh = await linked(f, [l.duplicate, l.canonical]); expect(fresh.linkId).not.toBe(l.linkId);
  expect(await repo.readDuplicateLinks(f.ctx, f.jobId)).toEqual({ version: "extra-duplicate-links.v1", jobId: f.jobId, revision: 3, activeLinks: [{ linkId: fresh.linkId, duplicateId: l.duplicate, canonicalId: l.canonical }] });
  await refused(f, () => repo.unlinkDuplicate(f.ctx, input(f, l.linkId, 3)), "ALREADY_UNLINKED");
  const second = await repo.unlinkDuplicate(f.ctx, input(f, fresh.linkId, 3)); expect(second.revision).toBe(4);
  expect((await c.admin.query("SELECT kind,reverses_link_id FROM app.extra_duplicate_link WHERE tenant_id=$1 ORDER BY kind,reverses_link_id", [f.p.tenantId])).rows).toEqual([{ kind: "link", reverses_link_id: null }, { kind: "link", reverses_link_id: null }, ...[l.linkId, fresh.linkId].sort().map(reverses_link_id => ({ kind: "unlink", reverses_link_id }))]);
  expect((await c.admin.query("SELECT reverses_link_id FROM app.extra_duplicate_link WHERE tenant_id=$1 AND kind='unlink' GROUP BY reverses_link_id HAVING count(*)>1", [f.p.tenantId])).rows).toEqual([]);
  const reversePair = await linked(f, [l.canonical, l.duplicate]); expect(reversePair.variationId).toBe(l.canonical);
 }, 60_000);

 it("[D13] refusal after export on either extra", async () => {
  for (const endpoint of ["duplicate", "canonical"] as const) {
   const f = await organisation(), l = await linked(f); await exported(f, l[endpoint]);
   await refused(f, () => repo.unlinkDuplicate(f.ctx, input(f, l.linkId)), "EXTRA_EXPORTED");
  }
 }, 60_000);

 it("[D14] the audit event commits or rolls back with the command", async () => {
  const f = await organisation(), l = await linked(f);
  await refused(f, () => repo.unlinkDuplicate(f.ctx, input(f, l.linkId), async () => { throw new Error(noteCanary); }), "DATABASE_UNAVAILABLE");
  for (const fragment of ["INSERT INTO app.command_receipt", "INSERT INTO app.extra_duplicate_link", "INSERT INTO app.audit_event", "UPDATE app.command_receipt", "COMMIT"]) {
   await spyQueries((sql, result) => { if (sql.includes(fragment)) throw new Error(descriptionCanary); return result; }, async () => {
    await refused(f, () => repo.unlinkDuplicate(f.ctx, input(f, l.linkId)), "DATABASE_UNAVAILABLE");
   });
  }
  const before = await snapshot(f);
  await expect(withTenant(c.runtime, f.ctx, async db => {
   const commandId = randomUUID(); await receipt(db, f.p.tenantId, f.jobId, l.duplicate, f.p.membershipId, "UnlinkDuplicate", commandId, { semanticKey: semantic(f.jobId, l.linkId, commandId) });
   await db.$client.query("INSERT INTO app.extra_duplicate_link(tenant_id,id,job_id,duplicate_id,canonical_id,kind,reverses_link_id,reason_code,command_id,actor_membership_id) VALUES($1,$2,$3,$4,$5,'unlink',$6,$7,$8,$9)", [f.p.tenantId, randomUUID(), f.jobId, l.duplicate, l.canonical, l.linkId, "linked_in_error", commandId, f.p.membershipId]);
  })).rejects.toMatchObject({ code: "23514", message: "INVALID_ORIGIN" });
  expect(await snapshot(f)).toEqual(before);
 }, 120_000);

 it("[D15] tenant isolation and spelling", async () => {
  const f = await organisation(), other = await organisation(), l = await linked(f);
  await refused(other, () => repo.readDuplicateLinks(other.ctx, f.jobId), "NOT_FOUND", f);
  await refused(other, () => repo.unlinkDuplicate(other.ctx, input(f, l.linkId)), "UNLINK_FORBIDDEN", f);
  await withTenant(c.runtime, other.ctx, async db => {
   for (const table of ["extra_duplicate_link", "command_receipt"]) expect((await db.$client.query(`SELECT * FROM app.${table} WHERE tenant_id=$1`, [f.p.tenantId])).rows).toEqual([]);
  });
  const raw = input(f, l.linkId), upper = { ...raw, commandId: raw.commandId.toUpperCase(), jobId: raw.jobId.toUpperCase(), actorMembershipId: raw.actorMembershipId.toUpperCase(), linkId: raw.linkId.toUpperCase() };
  const result = await repo.unlinkDuplicate(testTenantContext(f.p.tenantId.toUpperCase()), upper), before = await snapshot(f);
  expect(await repo.unlinkDuplicate(f.ctx, raw)).toEqual(result); expect(await snapshot(f)).toEqual(before);
 }, 60_000);

 it("[D16] nothing else changes", async () => {
  const f = await organisation(), l = await linked(f);
  await repo.linkOrderLine(f.ctx, orderInput(f, l.duplicate, await laterRevision(c, f)));
  const before = await protectedRows(f); await repo.unlinkDuplicate(f.ctx, input(f, l.linkId)); expect(await protectedRows(f)).toEqual(before);
  // Each D10 refusal checks every protected table, on this same job with its order-line link still present.
  await allowedRefusals(f, 2, 3);
 }, 120_000);

 it("[D17] readDuplicateLinks", async () => {
  const f = await organisation();
  expect(await repo.readDuplicateLinks(f.ctx, f.jobId)).toEqual({ version: "extra-duplicate-links.v1", jobId: f.jobId, revision: 0, activeLinks: [] });
  const first = await linked(f), second = await linked(f);
  const both = [{ linkId: first.linkId, duplicateId: first.duplicate, canonicalId: first.canonical }, { linkId: second.linkId, duplicateId: second.duplicate, canonicalId: second.canonical }].sort((a, b) => a.linkId.localeCompare(b.linkId));
  expect(await repo.readDuplicateLinks(f.ctx, f.jobId)).toEqual({ version: "extra-duplicate-links.v1", jobId: f.jobId, revision: 2, activeLinks: both });
  await repo.unlinkDuplicate(f.ctx, input(f, first.linkId, 2));
  expect(await repo.readDuplicateLinks(f.ctx, f.jobId)).toEqual({ version: "extra-duplicate-links.v1", jobId: f.jobId, revision: 3, activeLinks: [{ linkId: second.linkId, duplicateId: second.duplicate, canonicalId: second.canonical }] });
 }, 60_000);

 it("[D18] errors carry codes only", async () => {
  const f = await organisation(), l = await linked(f), actor = await member(f, "read_only", { kind: "tenant", id: f.p.tenantId });
  await refused(f, () => repo.unlinkDuplicate(f.ctx, input(f, l.linkId, 1, actor.id)), "UNLINK_FORBIDDEN");
  await exported(f, l.canonical); await refused(f, () => repo.unlinkDuplicate(f.ctx, input(f, l.linkId)), "EXTRA_EXPORTED");
  await refused(f, () => repo.unlinkDuplicate(f.ctx, input(f, l.linkId), async () => { throw new Error(noteCanary); }), "EXTRA_EXPORTED");
  const fresh = await organisation(), active = await linked(fresh);
  await refused(fresh, () => repo.unlinkDuplicate(fresh.ctx, input(fresh, active.linkId), async () => { throw new Error(descriptionCanary); }), "DATABASE_UNAVAILABLE");
  await allowedRefusals(await organisation());
  // Database detail is supplied only as a fault; it must never become an outward message.
  for (const [databaseCode, expected] of [["23505", "ALREADY_UNLINKED"], ["40001", "STALE_REVISION"], ["40P01", "STALE_REVISION"], ["23514", "DATABASE_UNAVAILABLE"], ["42501", "DATABASE_UNAVAILABLE"]] as const) {
   await spyQueries((sql, result) => {
    if (sql.includes("INSERT INTO app.extra_duplicate_link")) throw Object.assign(new Error(descriptionCanary), { code: databaseCode });
    return result;
   }, () => refused(fresh, () => repo.unlinkDuplicate(fresh.ctx, input(fresh, active.linkId)), expected));
   await spyQueries((sql, result) => {
    if (sql.includes("FROM app.job j")) throw Object.assign(new Error(noteCanary), { code: databaseCode });
    return result;
   }, () => refused(fresh, () => repo.readDuplicateLinks(fresh.ctx, fresh.jobId), expected));
  }
  for (const message of ["EXTRA_EXPORTED", "INVALID_ORIGIN", "COMMAND_CONFLICT"] as const) {
   await spyQueries((sql, result) => {
    if (sql.includes("INSERT INTO app.extra_duplicate_link")) throw new Error(message);
    return result;
   }, () => refused(fresh, () => repo.unlinkDuplicate(fresh.ctx, input(fresh, active.linkId)), message));
  }
  for (const value of [false, null, "true", undefined]) {
   await spyQueries((sql, result) => {
    if (/^SELECT\s/iu.test(sql) && /\bAS allowed\b/u.test(sql)) return { ...result, rows: value === undefined ? [] : [{ allowed: value }] };
    return result;
   }, () => refused(fresh, () => repo.unlinkDuplicate(fresh.ctx, input(fresh, active.linkId)), "UNLINK_FORBIDDEN"));
  }
  // codeOnly also runs for every refusal in D3-D16, including concurrent callers in D11.
 }, 120_000);
});
