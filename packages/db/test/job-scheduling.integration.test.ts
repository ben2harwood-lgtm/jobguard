import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { contractorPermissions, contractorPermits, contractorRoles, type ContractorGrant, type ContractorPermission } from "@jobguard/core";
import {
  ContractorPartyRepository, ContractorRepository, JobSchedulingRepository, MIGRATION_URLS, WorkOrderRepository, demoFile, demoRow, migrate, prepareWorkOrderDemo, verifiedTenantContextFromMembership, withTenant,
  type AuthenticatedMembership, type WorkOrderDemo,
} from "../src/index.js";
import { closeTestPools, freePort } from "./pool-test-utils.js";

let postgres: EmbeddedPostgres, admin: Pool, runtime: Pool, dir: string, contractors: ContractorRepository, parties: ContractorPartyRepository, orders: WorkOrderRepository, scheduling: JobSchedulingRepository;
const ctx = (p: AuthenticatedMembership) => verifiedTenantContextFromMembership(p);
const view = (p: AuthenticatedMembership) => contractors.query(p, { version: "contractor-query.v1", tenantId: p.tenantId, resource: "organisation" });
const command = async (p: AuthenticatedMembership, fields: Record<string, unknown>) => contractors.command(p, { version: "contractor-command.v1", environment: "synthetic_demo", commandId: randomUUID(), id: randomUUID(), expectedRevision: (await view(p)).revision, ...fields });
async function member(p: AuthenticatedMembership, role: string, scope: { kind: string; id: string }, clientId: string | null = null) {
  const id = randomUUID();
  await command(p, { kind: "member.invite", id, role, email: `${id}@fictional.invalid`, scope, clientId, contractId: null });
  return asMember(p, id);
}
async function asMember(p: AuthenticatedMembership, membershipId: string) {
  const row = (await admin.query<{ identity_user_id: string }>("SELECT identity_user_id FROM app.membership WHERE tenant_id=$1 AND id=$2", [p.tenantId, membershipId])).rows[0]!;
  return { ...p, membershipId, identityUserId: row.identity_user_id } as AuthenticatedMembership;
}
const importOf = (p: AuthenticatedMembership, csv: string, name = "scheduling.csv") => orders.importCsv(p, { commandId: randomUUID(), name, kind: "csv", csv });
const canary = { name: "Fictional Resident Canary", phone: "00000999888", email: "scheduling-canary@resident-canary.invalid" };
const withCanary = { kind: "contact", contact: { version: "resident-contact.v1", ...canary } };

/**
 * One organisation: region R with branches B1 (teams T1, T2) and B2 (team T3). Job J1 is imported for T1 with the demo operative assigned,
 * J2 for T2 with its own operative, J3 for T3, and J0 names no team at all.
 */
async function fixture() {
  const p = await contractors.startPractice(randomUUID()); const demo = await prepareWorkOrderDemo(runtime, p); const v = await view(p);
  const region = v.units.find(u => u.kind === "region")!.id, b1 = demo.branchId;
  const t1 = demo.teamId, t2 = (await command(p, { kind: "team.create", branchId: b1, name: "Fictional team two" })).id;
  const b2 = (await command(p, { kind: "unit.create", unitKind: "branch", parentId: region, name: "Fictional branch two" })).id;
  const t3 = (await command(p, { kind: "team.create", branchId: b2, name: "Fictional team three" })).id;
  const op1 = await asMember(p, demo.operativeMembershipId), op2 = await member(p, "operative", { kind: "team", id: t2 }), op3 = await member(p, "operative", { kind: "team", id: t3 });
  const unassigned = await member(p, "operative", { kind: "team", id: t1 });
  const row = (n: number, overrides: Record<string, unknown>) => demoRow(demo, n, { resident: withCanary, ...overrides });
  const result = await importOf(p, demoFile([
    row(1, { teamId: t1, assignedMembershipIds: [op1.membershipId] }), row(2, { teamId: t2, assignedMembershipIds: [op2.membershipId] }), row(3, { teamId: t3, assignedMembershipIds: [op3.membershipId] }), row(4, { teamId: null, assignedMembershipIds: [] }),
  ]));
  expect(result.counts).toMatchObject({ created: 4, rejected: 0 });
  const jobs = Object.fromEntries(await Promise.all(result.rows.map(async (r, i) => [`J${i === 3 ? 0 : i + 1}`, (await admin.query("SELECT job_id FROM app.work_order WHERE id=$1", [r.workOrderId])).rows[0].job_id as string])));
  return { p, demo, v, region, b1, b2, t1, t2, t3, op1, op2, op3, unassigned, jobs, orderIds: result.rows.map(r => r.workOrderId!) };
}
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "jg-ent2-sched-")); const port = await freePort(59500, 300);
  postgres = new EmbeddedPostgres({ databaseDir: dir, port, user: "postgres", password: "synthetic", persistent: false, createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
  await postgres.initialise(); await postgres.start();
  const control = new Pool({ host: "127.0.0.1", port, user: "postgres", password: "synthetic", database: "postgres" }); await control.query("CREATE DATABASE jobguard_synthetic_demo"); await control.end();
  admin = new Pool({ host: "127.0.0.1", port, user: "postgres", password: "synthetic", database: "jobguard_synthetic_demo" });
  await admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
  const own = MIGRATION_URLS.findIndex(url => url.pathname.endsWith("/0110_work_orders.sql")); expect(own).toBeGreaterThan(0);
  for (const url of MIGRATION_URLS.slice(0, own)) { await admin.query(await readFile(url, "utf8")); await admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [url.pathname.split("/").at(-1)]); }
  await migrate(admin);
  await admin.query("CREATE ROLE ent2_sched_login LOGIN PASSWORD 'synthetic' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; GRANT jobguard_runtime TO ent2_sched_login");
  runtime = new Pool({ host: "127.0.0.1", port, user: "ent2_sched_login", password: "synthetic", database: "jobguard_synthetic_demo", max: 6 });
  contractors = new ContractorRepository(runtime); parties = new ContractorPartyRepository(runtime); orders = new WorkOrderRepository(runtime); scheduling = new JobSchedulingRepository(runtime);
}, 180000);
afterAll(async () => { await closeTestPools(runtime, admin); await postgres?.stop(); if (dir) await rm(dir, { recursive: true, force: true }); });

const notFound = (promise: Promise<unknown>) => expect(promise).rejects.toMatchObject({ code: "NOT_FOUND", message: "NOT_FOUND" });
describe("CH-3b DW3 held cases: team-scoped positive cases against imported work-order jobs with a team and an assigned operative", () => {
  it("CH-3b DW3 held cases: the operative on the job and that team's supervisor read the resident contact; an operative outside the job's team gets the same 404 as a job that does not exist", async () => {
    const f = await fixture(), supervisor = await member(f.p, "supervisor", { kind: "team", id: f.t1 });
    // Positive: the assigned operative of J1 and the supervisor of T1, through the controlled CH-3b read routine.
    for (const reader of [f.op1, supervisor]) expect(await parties.readResident(reader, f.jobs.J1!), reader.membershipId).toEqual({ version: "contractor-resident-read.v1", environment: "synthetic_demo", jobId: f.jobs.J1, resident: withCanary });
    // Negative, identically: an operative outside the job's team, an operative of the team who is not assigned, the supervisor of another team, a job with no team, a job that does not exist.
    const outside = [f.op2, f.op3, f.unassigned, await member(f.p, "supervisor", { kind: "team", id: f.t2 }), await member(f.p, "supervisor", { kind: "team", id: f.t3 })];
    for (const reader of outside) { await notFound(parties.readResident(reader, f.jobs.J1!)); await notFound(parties.readResident(reader, randomUUID())); }
    const missing = await parties.readResident(f.op1, f.jobs.J2!).catch(e => e), absent = await parties.readResident(f.op1, randomUUID()).catch(e => e);
    expect(missing).toBeInstanceOf(Error); expect({ ...missing }).toEqual({ ...absent }); expect(missing.message).toBe(absent.message);
    // A job that names no team is unreadable by everyone: scope is never inferred from client, branch or team membership.
    for (const reader of [f.op1, supervisor, await member(f.p, "supervisor", { kind: "tenant", id: f.p.tenantId })]) await notFound(parties.readResident(reader, f.jobs.J0!));
  });
  it("lets roles with resident.read read through the scope that covers the job's team, and no role without it", async () => {
    const f = await fixture();
    const readers: Array<[string, AuthenticatedMembership, Record<string, boolean>]> = [];
    const add = async (label: string, role: string, scope: { kind: string; id: string }, expected: Record<string, boolean>) => readers.push([label, await member(f.p, role, scope), expected]);
    await add("supervisor of branch B1", "supervisor", { kind: "branch", id: f.b1 }, { J1: true, J2: true, J3: false });
    await add("surveyor of branch B2", "surveyor", { kind: "branch", id: f.b2 }, { J1: false, J2: false, J3: true });
    await add("commercial_manager of the region", "commercial_manager", { kind: "region", id: f.region }, { J1: true, J2: true, J3: true });
    await add("surveyor of team T2", "surveyor", { kind: "team", id: f.t2 }, { J1: false, J2: true, J3: false });
    await add("supervisor, tenant-wide", "supervisor", { kind: "tenant", id: f.p.tenantId }, { J1: true, J2: true, J3: true });
    for (const [label, reader, expected] of readers) for (const job of ["J1", "J2", "J3"]) {
      if (expected[job]) expect((await parties.readResident(reader, f.jobs[job]!)).resident, `${label} ${job}`).toEqual(withCanary); else await notFound(parties.readResident(reader, f.jobs[job]!));
    }
    // Roles that never hold resident.read (admin, finance, read_only) and the client approver get the same 404, tenant-wide or not.
    for (const [role, scope] of [["admin", { kind: "tenant", id: f.p.tenantId }], ["finance", { kind: "tenant", id: f.p.tenantId }], ["read_only", { kind: "tenant", id: f.p.tenantId }], ["client_approver", { kind: "client", id: f.demo.clientId }]] as const) {
      const reader = await member(f.p, role, scope, role === "client_approver" ? f.demo.clientId : null);
      for (const job of ["J1", "J2", "J3", "J0"]) await notFound(parties.readResident(reader, f.jobs[job]!));
    }
    await notFound(parties.readResident(f.p, f.jobs.J1!));
  }, 120000);
  it("follows the job's current revision: moving an order to another team moves who may read it, and the previous team loses access", async () => {
    const f = await fixture(); const supervisor1 = await member(f.p, "supervisor", { kind: "team", id: f.t1 }), supervisor2 = await member(f.p, "supervisor", { kind: "team", id: f.t2 });
    expect((await parties.readResident(f.op1, f.jobs.J1!)).resident).toEqual(withCanary); await notFound(parties.readResident(f.op2, f.jobs.J1!));
    const moved = await importOf(f.p, demoFile([demoRow(f.demo, 1, { resident: withCanary, expectedRevision: 1, teamId: f.t2, assignedMembershipIds: [f.op2.membershipId] })]), "move.csv");
    expect(moved.rows[0]).toMatchObject({ outcome: "revised" });
    expect((await admin.query("SELECT diff FROM app.work_order_revision WHERE id=$1", [moved.rows[0]!.revisionId])).rows[0].diff.fields).toEqual(["teamId", "assignedMembershipIds"]);
    for (const gone of [f.op1, supervisor1]) await notFound(parties.readResident(gone, f.jobs.J1!));
    for (const gained of [f.op2, supervisor2]) expect((await parties.readResident(gained, f.jobs.J1!)).resident).toEqual(withCanary);
    expect((await scheduling.assignments(supervisor2, f.jobs.J1!)).team).toMatchObject({ id: f.t2 }); await notFound(scheduling.assignments(supervisor1, f.jobs.J1!));
    // History is immutable: both revisions' assignments remain, and only the current one resolves scope.
    expect((await admin.query("SELECT count(*)::int n FROM app.job_assignment WHERE job_id=$1", [f.jobs.J1])).rows[0].n).toBe(4);
  });
  it("keeps the contact out of every list, projection and export the scheduling work adds", async () => {
    const f = await fixture(); const supervisor = await member(f.p, "supervisor", { kind: "team", id: f.t1 });
    const outputs = [await orders.overview(f.p), await orders.revisions(f.p, f.orderIds[0]!), await orders.revisions(supervisor, f.orderIds[0]!), await scheduling.assignments(supervisor, f.jobs.J1!), await scheduling.siteVisits(supervisor, f.jobs.J1!), await scheduling.assignments(f.op1, f.jobs.J1!)];
    const serialized = JSON.stringify(outputs);
    for (const value of Object.values(canary)) expect(serialized).not.toContain(value);
    expect(serialized).not.toMatch(/"(resident|residentContact|contact)"/u);
  });
  it("agrees with the pure scope rules for every non-operative role, scope kind, permission and job position", async () => {
    const f = await fixture(); const grants: Array<{ role: (typeof contractorRoles)[number]; scope: ContractorGrant["scope"]; actor: AuthenticatedMembership }> = [];
    for (const role of contractorRoles.filter(r => r !== "owner" && r !== "operative" && r !== "client_approver")) {
      const scopes: Array<ContractorGrant["scope"]> = role === "finance" ? [{ kind: "tenant", id: f.p.tenantId }] : [{ kind: "tenant", id: f.p.tenantId }, { kind: "region", id: f.region }, { kind: "branch", id: f.b1 }, { kind: "team", id: f.t1 }];
      for (const scope of scopes) grants.push({ role, scope, actor: await member(f.p, role, scope) });
    }
    const positions: Array<[string, { regionId: string; branchId: string; teamId: string }]> = [["J1", { regionId: f.region, branchId: f.b1, teamId: f.t1 }], ["J2", { regionId: f.region, branchId: f.b1, teamId: f.t2 }], ["J3", { regionId: f.region, branchId: f.b2, teamId: f.t3 }]];
    let checked = 0;
    await withTenant(runtime, ctx(f.p), async db => {
      for (const { role, scope, actor } of grants) for (const [job, position] of positions) for (const permission of contractorPermissions as readonly ContractorPermission[]) {
        const expected = contractorPermits([{ role, scope }], permission, { tenantId: f.p.tenantId, ...position });
        const actual = (await db.$client.query("SELECT app.contractor_job_allowed($1,$2,$3) allowed", [actor.membershipId, permission, f.jobs[job]])).rows[0].allowed;
        if (actual !== expected) throw new Error(`${role}@${scope.kind} ${permission} on ${job}: sql ${actual}, core ${expected}`);
        checked++;
      }
    });
    expect(checked).toBe(grants.length * positions.length * contractorPermissions.length);
  }, 120000);
  it("agrees with the pure operative rule: only an operative assigned to the job, in the job's team, acts on it", async () => {
    const f = await fixture(); const targetFor = (team: string, branch: string, assigned: boolean) => ({ tenantId: f.p.tenantId, regionId: f.region, branchId: branch, teamId: team, assigned });
    const cases: Array<[string, AuthenticatedMembership, string, string, string, boolean]> = [
      ["assigned operative on own job", f.op1, f.jobs.J1!, f.t1, f.b1, true], ["unassigned operative of the same team", f.unassigned, f.jobs.J1!, f.t1, f.b1, false],
      ["operative of another team on J1", f.op2, f.jobs.J1!, f.t1, f.b1, false], ["operative of another branch on J1", f.op3, f.jobs.J1!, f.t1, f.b1, false],
    ];
    await withTenant(runtime, ctx(f.p), async db => {
      for (const [label, actor, job, team, branch, assigned] of cases) for (const permission of contractorPermissions as readonly ContractorPermission[]) {
        const scopeTeam = (await db.$client.query("SELECT scope_id FROM app.role_grant WHERE membership_id=$1", [actor.membershipId])).rows[0].scope_id as string;
        const expected = contractorPermits([{ role: "operative", scope: { kind: "team", id: scopeTeam } }], permission, targetFor(team, branch, assigned));
        const actual = (await db.$client.query("SELECT app.contractor_job_allowed($1,$2,$3) allowed", [actor.membershipId, permission, job])).rows[0].allowed;
        if (actual !== expected) throw new Error(`${label} ${permission}: sql ${actual}, core ${expected}`);
      }
    });
    // Moving the operative to another team (ENT-1's team.move) revokes their grant: the assignment alone confers nothing.
    await command(f.p, { kind: "team.move", membershipId: f.op1.membershipId, fromTeamId: f.t1, toTeamId: f.t2 });
    await notFound(parties.readResident(f.op1, f.jobs.J1!));
    expect(await withTenant(runtime, ctx(f.p), async db => (await db.$client.query("SELECT app.contractor_job_allowed($1,'job.read',$2) allowed", [f.op1.membershipId, f.jobs.J1])).rows[0].allowed)).toBe(false);
  }, 120000);
});

describe("ENT-2 scheduling facts: a read projection only", () => {
  it("shows the assignment from the import to the people the job's scope covers, and refuses every other id with the same not-found", async () => {
    const f = await fixture(); const supervisor = await member(f.p, "supervisor", { kind: "team", id: f.t1 }), surveyor = await member(f.p, "surveyor", { kind: "branch", id: f.b1 });
    for (const reader of [supervisor, surveyor, f.op1]) expect(await scheduling.assignments(reader, f.jobs.J1!)).toEqual({ version: "job-assignments.v1", environment: "synthetic_demo", realExternalActions: 0, jobId: f.jobs.J1, workOrderId: f.orderIds[0], team: { id: f.t1, name: expect.any(String) }, operatives: [{ membershipId: f.op1.membershipId }] });
    for (const reader of [f.op2, f.unassigned, await member(f.p, "surveyor", { kind: "branch", id: f.b2 })]) { await notFound(scheduling.assignments(reader, f.jobs.J1!)); await notFound(scheduling.siteVisits(reader, f.jobs.J1!)); }
    await notFound(scheduling.assignments(supervisor, randomUUID())); await notFound(scheduling.assignments(supervisor, "not-a-uuid")); await notFound(scheduling.assignments(supervisor, f.jobs.J0!));
  });
  it("has no scheduling command: runtime cannot write assignments or visits, and a visit written by the owner (ENT-3's future writer) is projected with server times", async () => {
    const f = await fixture(); const supervisor = await member(f.p, "supervisor", { kind: "team", id: f.t1 });
    for (const table of ["job_assignment", "site_visit"]) for (const sql of [`INSERT INTO app.${table} DEFAULT VALUES`, `UPDATE app.${table} SET tenant_id=tenant_id`, `DELETE FROM app.${table}`]) await expect(withTenant(runtime, ctx(f.p), db => db.$client.query(sql)), sql).rejects.toMatchObject({ code: "42501" });
    expect((await scheduling.siteVisits(supervisor, f.jobs.J1!)).visits).toEqual([]);
    const wo = f.orderIds[0]!;
    await admin.query("SELECT set_config('app.tenant_id',$1,false)", [f.p.tenantId]);
    const client = await admin.connect();
    try {
      await client.query("SELECT set_config('app.tenant_id',$1,false)", [f.p.tenantId]);
      await client.query("INSERT INTO app.site_visit(tenant_id,id,job_id,work_order_id,membership_id,started_at) VALUES($1,$2,$3,$4,$5,clock_timestamp()-interval '1 hour')", [f.p.tenantId, randomUUID(), f.jobs.J1, wo, f.op1.membershipId]);
      await expect(client.query("UPDATE app.site_visit SET completed_at=started_at-interval '1 minute'")).rejects.toMatchObject({ code: "23514" });
      await expect(client.query("DELETE FROM app.site_visit")).rejects.toMatchObject({ code: "55000" });
      await expect(client.query("INSERT INTO app.site_visit(tenant_id,id,job_id,work_order_id,membership_id) VALUES($1,$2,$3,$4,$5)", [f.p.tenantId, randomUUID(), f.jobs.J2, wo, f.op1.membershipId])).rejects.toMatchObject({ code: "23503" });
    } finally { client.release(); }
    const visits = (await scheduling.siteVisits(supervisor, f.jobs.J1!)).visits;
    expect(visits).toHaveLength(1); expect(visits[0]).toMatchObject({ membershipId: f.op1.membershipId, completedAt: null });
    expect(Date.parse(visits[0]!.startedAt)).toBeLessThan(Date.now());
    // The projection is the same answer for the assigned operative and for the team's supervisor.
    expect((await scheduling.siteVisits(f.op1, f.jobs.J1!)).visits).toEqual(visits);
  });
  it("rejects an assignment that is not a real team member of the order's team, and an operative revoked after assignment loses access", async () => {
    const f = await fixture();
    const bad = await importOf(f.p, demoFile([demoRow(f.demo, 9, { teamId: f.t1, assignedMembershipIds: [f.op2.membershipId] }), demoRow(f.demo, 10, { teamId: f.t1, assignedMembershipIds: [f.p.membershipId] })]), "bad-assignees.csv");
    expect(bad.rows.map(r => r.errorCode)).toEqual(["ASSIGNMENT_INVALID", "ASSIGNMENT_INVALID"]);
    await command(f.p, { kind: "membership.revoke", membershipId: f.op1.membershipId });
    await notFound(parties.readResident(f.op1, f.jobs.J1!)); await notFound(scheduling.assignments(f.op1, f.jobs.J1!));
  });
});
