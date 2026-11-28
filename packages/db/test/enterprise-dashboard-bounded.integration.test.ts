// EP-F6 (RED): bounded dashboard reads on the command-seeded Northside demo. Real PostgreSQL, synthetic data only.
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { dashboardFactsV1, projectEnterpriseDashboard, projectStoredDashboardBilling } from "@jobguard/core";
import { seedNorthsideDemo, PracticeWorkerSwitchRepository, ContractorRepository, ExtraRepository, EnterpriseDashboardRepository, contractorSessionContext, withTenant, type VerifiedTenantContext } from "../src/index.js";
import { enterpriseDashboardSourceSql, enterpriseDashboardScopeLockSql } from "../src/enterprise-dashboard-queries.js";
import { storedBilledSignalRowsV1 } from "../src/enterprise-dashboard-signals.js";
import { cluster, startSession, type Cluster } from "./contractor-practice-session-fixtures.js";
import { expectSameAsReference } from "./enterprise-dashboard-bounded-fixtures.js";

vi.setConfig({ testTimeout: 240_000, hookTimeout: 480_000 });
type Query = { version: "enterprise-dashboard-query.v1"; from: string; until: string; dimension: string; filters: Record<string, string | null>;
  offset: number; limit: number; drilldown?: { stage: string; group?: string | null; offset: number; limit: number } };
const periods = { all: ["2000-01-01T00:00:00Z", "2099-01-01T00:00:00Z"], august: ["2026-08-01T00:00:00Z", "2026-09-01T00:00:00Z"],
  september: ["2026-09-01T00:00:00Z", "2026-10-01T00:00:00Z"], recent: ["2026-11-01T00:00:00Z", "2099-01-01T00:00:00Z"] } as const;
const dimensions = ["region", "team", "operative", "client", "contract", "period"] as const;
const q = (period: keyof typeof periods, dimension: string, filters: Query["filters"] = {}, extra: Partial<Query> = {}): Query =>
  ({ version: "enterprise-dashboard-query.v1", from: periods[period][0], until: periods[period][1], dimension, filters, offset: 0, limit: 200, ...extra });
let c: Cluster;
let w: Awaited<ReturnType<typeof world>>;
beforeAll(async () => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); c = await cluster(); w = await world(); });
afterAll(async () => { await c?.close(); vi.unstubAllEnvs(); });

/** Digest-bound practice session for an existing member; the database resolves everything else. */
async function sessionFor(tenantId: string, membershipId: string) {
  const value = randomUUID(), digest = createHash("sha256").update(value).digest("hex");
  const identity = (await c.admin.query("SELECT identity_user_id FROM app.membership WHERE tenant_id=$1 AND id=$2", [tenantId, membershipId])).rows[0].identity_user_id;
  await c.admin.query(`INSERT INTO control_plane.contractor_practice_session(session_id,tenant_id,membership_id,identity_user_id,session_digest,created_at,expires_at)
    VALUES($1,$2,$3,$4,$5,clock_timestamp(),clock_timestamp()+interval '1 day')`, [randomUUID(), tenantId, membershipId, identity, digest]);
  return value;
}
async function world() {
  const owner = await startSession(c), tenantId = owner.p.tenantId;
  const seed = await seedNorthsideDemo(c.runtime, owner.p, owner.context);
  const jobs = (await c.admin.query<{ job_id: string; membership_id: string; client_id: string }>(`SELECT job_id,membership_id,client_id FROM (
    SELECT w.job_id,a.membership_id,w.client_id,row_number() OVER(PARTITION BY w.client_id ORDER BY w.reference) n FROM app.work_order w
    JOIN app.job_assignment a ON(a.tenant_id,a.job_id)=(w.tenant_id,w.job_id) WHERE w.tenant_id=$1 AND a.membership_id IS NOT NULL) x WHERE n<=14 ORDER BY client_id,n`, [tenantId])).rows;
  const grantOf = async (membershipId: string) => (await c.admin.query(`SELECT g.id FROM app.role_grant g WHERE g.tenant_id=$1 AND g.membership_id=$2
    AND NOT EXISTS(SELECT 1 FROM app.role_grant_revocation r WHERE(r.tenant_id,r.grant_id)=(g.tenant_id,g.id)) ORDER BY g.id LIMIT 1`, [tenantId, membershipId])).rows[0].id as string;
  const extras = new ExtraRepository(c.runtime), raised: string[] = [];
  const switches = new PracticeWorkerSwitchRepository(c.runtime);
  // Each capture is a real command by the switched-to practice worker, through the live practice session.
  const raise = async (jobId: string, membershipId: string) => {
    await switches.switchOn(await contractorSessionContext(c.runtime, owner.session), owner.p, owner.session,
      { version: "practice-worker-switch-on.v1", commandId: randomUUID(), workerId: membershipId });
    const context = await contractorSessionContext(c.runtime, owner.session);
    raised.push((await extras.raiseExtra(context, { version: "raise-extra.v1", commandId: randomUUID(), commandType: "LogSiteExtra", jobId,
      actorMembershipId: membershipId, grantId: await grantOf(membershipId), note: "Fictional EP-F6 note", description: "Fictional EP-F6 extra" })).variationId);
    await switches.switchOff(await contractorSessionContext(c.runtime, owner.session), owner.p, owner.session, { version: "practice-worker-switch-off.v1", commandId: randomUUID() });
  };
  for (const job of jobs) await raise(job.job_id, job.membership_id);
  // Two supervisor captures on the journey's team: no operative attribution, so an unattributed operative group.
  for (let i = 0; i < 2; i++) await raise(seed.journey.jobId, seed.supervisorMembershipId);
  // Owner-only clock fixture: spread captures over August, September and now, so periods select different rows.
  const admin = await c.admin.connect();
  try {
    await admin.query("BEGIN");
    await admin.query("ALTER TABLE app.extra_origin DISABLE TRIGGER USER");
    for (const [i, id] of raised.entries())
      if (i % 3 < 2) await admin.query("UPDATE app.extra_origin SET server_recorded_at=$2 WHERE tenant_id=$1 AND variation_id=$3",
        [tenantId, i % 3 === 0 ? "2026-08-15T10:00:00Z" : "2026-09-15T10:00:00Z", id]);
    await admin.query("ALTER TABLE app.extra_origin ENABLE TRIGGER USER");
    await admin.query("COMMIT");
  } catch (error) { await admin.query("ROLLBACK"); throw error; } finally { admin.release(); }
  const surveyor = seed.surveyorMembershipId;
  return { tenantId, seed, raised, jobs, finance: await sessionFor(tenantId, seed.financeMembershipId),
    supervisor: await sessionFor(tenantId, seed.supervisorMembershipId), surveyor: await sessionFor(tenantId, surveyor) };
}
/** The pre-EP-F6 path: all scoped facts from the unchanged source statement, filtered and grouped in TypeScript. */
async function reference(session: string) {
  const context = await contractorSessionContext(c.runtime, session);
  return withTenant(c.runtime, context, async db => {
    await db.$client.query(enterpriseDashboardScopeLockSql, [context.tenantId]);
    const row = (await db.$client.query(enterpriseDashboardSourceSql, [session, context.tenantId])).rows[0];
    return { facts: dashboardFactsV1.parse(row.facts), billed: storedBilledSignalRowsV1.parse(row.signal_billing), billing: row.billing as unknown[] };
  });
}
const repo = () => new EnterpriseDashboardRepository(c.runtime);
async function read(session: string, query: Query) { return repo().read(await contractorSessionContext(c.runtime, session), session, query); }
async function readBilling(session: string, query: Query) { return repo().readBilling(await contractorSessionContext(c.runtime, session), session, query); }
/** New path equals the reference, including the old NOT_FOUND rule for filter identities outside the actor's facts. */
async function compare(session: string, query: Query) {
  const ref = await reference(session);
  const has = (rows: { dimensions: Record<string, string | null> }[]) => Object.entries(query.filters).every(([k, v]) => rows.some(r => r.dimensions[k] === v));
  if (!has([...ref.facts.extras, ...ref.facts.closeouts, ...ref.billed.rows])) await expect(read(session, query)).rejects.toMatchObject({ code: "NOT_FOUND" });
  else { const { report } = await read(session, query); expectSameAsReference(report, projectEnterpriseDashboard({ ...ref.facts, cutoff: report.cutoff }, query)); }
  if (!has(ref.facts.extras)) await expect(readBilling(session, query)).rejects.toMatchObject({ code: "NOT_FOUND" });
  else {
    // Billing hashes bind the database's own source hash (EP-F6 repair 1); every other field must be equal.
    const { inputHash, outputHash, ...bounded } = await readBilling(session, query);
    const { inputHash: _i, outputHash: _o, ...expected } = projectStoredDashboardBilling(ref.facts, query, ref.billing);
    expect(bounded).toEqual(expected);
    expect([inputHash, outputHash].every(h => /^[a-f0-9]{64}$/u.test(h))).toBe(true);
  }
}
const dims = async () => (await reference(w.finance)).facts.extras.map(e => e.dimensions);

it("EP-F6 totals, groups and first pages equal the reference projection for several periods, dimensions and filters", async () => {
  const all = await dims(), journeyTeam = all.find(d => d.operative === null)!.team;
  const other = all.find(d => d.team !== journeyTeam)!, operative = all.find(d => d.operative !== null)!.operative!;
  expect(new Set(all.map(d => d.team)).size).toBe(3);
  // Each window selects a different, non-empty third of the captures (the clock fixture applied).
  const counts = await Promise.all((["august", "september", "recent"] as const).map(async p => (await read(w.finance, q(p, "team"))).report.totals.captured.count));
  expect(counts.every(n => n > 0) && counts.reduce((a, b) => a + b, 0) === w.raised.length).toBe(true);
  for (const period of Object.keys(periods) as (keyof typeof periods)[])
    for (const dimension of dimensions) await compare(w.finance, q(period, dimension));
  for (const filters of [{ team: other.team }, { client: other.client }, { contract: other.contract }, { region: other.region }, { operative }, { operative: null }, { team: journeyTeam, client: other.client }])
    for (const period of ["all", "september"] as const) await compare(w.finance, q(period, "operative", filters));
  // Group pages (two at a time) also equal the reference's same page.
  for (const offset of [0, 2, 4]) await compare(w.finance, q("all", "operative", {}, { offset, limit: 2 }));
  // The supervisor (journey team) and surveyor (its branch) are compared on their own scoped facts.
  for (const session of [w.supervisor, w.surveyor])
    for (const [period, dimension] of [["all", "team"], ["august", "operative"], ["recent", "period"], ["all", "client"]] as const) await compare(session, q(period, dimension));
});

it("EP-F6 a team- or branch-scoped user never sees another team's facts through any filter, group, page or drill-down", async () => {
  const all = await dims(), journeyTeam = all.find(d => d.operative === null)!.team, mine = all.find(d => d.team === journeyTeam)!;
  const other = all.find(d => d.team !== journeyTeam)!, foreignOperative = all.find(d => d.team !== journeyTeam && d.operative)!.operative!;
  const ownJobs = new Set((await reference(w.finance)).facts.extras.filter(e => e.dimensions.team === journeyTeam).map(e => e.jobId));
  for (const session of [w.supervisor, w.surveyor]) {
    for (const filters of [{ team: other.team }, { client: other.client }, { contract: other.contract }, { operative: foreignOperative }]) {
      await expect(read(session, q("all", "team", filters))).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(readBilling(session, q("all", "team", filters))).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
    for (const dimension of dimensions) {
      const { report } = await read(session, q("all", dimension, {}, { drilldown: { stage: "captured", offset: 0, limit: 200 } }));
      const rows = [...report.contributions, ...report.groups.flatMap(g => g.contributions), ...report.drilldown!.contributions];
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every(r => ownJobs.has(r.jobId))).toBe(true);
      if (dimension === "team") expect(report.groups.map(g => g.id)).toEqual([journeyTeam]);
    }
    const foreign = await read(session, q("all", "team", {}, { drilldown: { stage: "captured", group: other.team, offset: 0, limit: 200 } }));
    expect(foreign.report.drilldown).toMatchObject({ total: 0, contributions: [] });
    expect((await read(session, q("all", "client", { client: mine.client }))).report.groups.map(g => g.id)).toEqual([mine.client]);
  }
});

it("EP-F6 a second tenant sees nothing, and a session cannot be read under another tenant's context", async () => {
  const other = await startSession(c), contractors = new ContractorRepository(c.runtime);
  const view = await contractors.query(other.p, { version: "contractor-query.v1", tenantId: other.p.tenantId, resource: "organisation" });
  const viewer = await contractors.command(other.p, { version: "contractor-command.v1", environment: "synthetic_demo", commandId: randomUUID(), id: randomUUID(),
    expectedRevision: view.revision, kind: "member.invite", role: "read_only", email: `fictional.${randomUUID()}@fictional.invalid`,
    scope: { kind: "tenant", id: other.p.tenantId }, clientId: null, contractId: null });
  const session = await sessionFor(other.p.tenantId, viewer.id as string), first = (await dims())[0]!;
  const { report, signals } = await read(session, q("all", "team", {}, { drilldown: { stage: "captured", offset: 0, limit: 200 } }));
  expect(report.groupCount).toBe(0);
  expect(Object.values(report.totals).filter(t => t !== null).every(t => t!.count === 0)).toBe(true);
  expect(report.drilldown).toMatchObject({ total: 0, contributions: [] });
  expect(JSON.stringify({ report, signals })).not.toContain(w.tenantId);
  for (const raw of w.raised) expect(JSON.stringify({ report, signals })).not.toContain(raw);
  for (const filters of [{ team: first.team }, { client: first.client }]) await expect(read(session, q("all", "team", filters))).rejects.toMatchObject({ code: "NOT_FOUND" });
  // Tenant 1's session presented with tenant 2's verified context is refused by the database, not filtered.
  const foreignContext: VerifiedTenantContext = await contractorSessionContext(c.runtime, session);
  await expect(repo().read(foreignContext, w.finance, q("all", "team"))).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(repo().readBilling(foreignContext, w.finance, q("all", "team"))).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("EP-F6 paging through a drill-down returns every row exactly once, in the reference order", async () => {
  const ref = await reference(w.finance);
  for (const [dimension, group, size] of [["team", undefined, 7], ["period", `${periods.all[0]}/${periods.all[1]}`, 9], ["operative", null, 1]] as const) {
    const base = q("all", dimension);
    const expected = projectEnterpriseDashboard(ref.facts, base).contributions
      .filter(r => r.stage === "captured" && (group === undefined || r.group === group));
    const seen: unknown[] = [];
    for (let offset = 0; ; offset += size) {
      const { report } = await read(w.finance, { ...base, drilldown: { stage: "captured", ...(group === undefined ? {} : { group }), offset, limit: size } });
      expect(report.drilldown!.total).toBe(expected.length);
      seen.push(...report.drilldown!.contributions);
      if (report.drilldown!.complete) break;
      expect(report.drilldown!.contributions).toHaveLength(size);
    }
    expect(seen).toEqual(expected);
    expect(new Set(seen.map(r => JSON.stringify(r))).size).toBe(seen.length);
  }
  // A single group holding every capture is larger than one group page and says so.
  const { report } = await read(w.finance, q("all", "period"));
  expect(report.groups[0]!.totals.captured.count).toBe(w.raised.length);
  expect(report.groups[0]!.contributionPage).toEqual({ limit: 20, complete: false });
  // Group pages tile the full group list exactly once.
  const groups: (string | null)[] = [], groupCount = (await read(w.finance, q("all", "operative"))).report.groupCount;
  expect(groupCount).toBeGreaterThan(3);
  for (let offset = 0; offset < groupCount + 3; offset += 3) groups.push(...(await read(w.finance, q("all", "operative", {}, { offset, limit: 3 }))).report.groups.map(g => g.id));
  expect(groups).toEqual(projectEnterpriseDashboard(ref.facts, q("all", "operative")).groups.map(g => g.id));
});
