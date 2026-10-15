import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { approvalRulesV1 } from "@jobguard/core";
import { ContractorRepository } from "./contractor-repository.js";
import { WorkOrderRepository } from "./work-order-repository.js";
import { addBranchClient, demoFile, demoRow, prepareWorkOrderDemo, type WorkOrderDemo } from "./work-order-fixtures.js";
import { verifiedTenantContextFromMembership, withTenant, type AuthenticatedMembership } from "./tenant-context.js";

/**
 * ENT-11a: the generated fictional contractor "Northside Property Services".
 * Everything is made THROUGH the merged commands (organisation commands, work-order import); no table is written directly.
 * Practice data only: every address ends in .invalid and nothing is ever sent. The numbers below are the TARGETS of the generator;
 * every figure the screens show is read back from the rows this seed created (see northsideFacts).
 */
export const northsideName = "Northside Property Services";
export const northsideTargets = { clients: 3, operatives: 40, ordersPerMonth: 2000, month: "2026-10" } as const;
/** Demo fixture values (to be set by Ben before real use): the Northside approval rules. Whole pence only. */
// demo placeholder figures, not product rules
export const northsideRules = approvalRulesV1.parse({
  version: "approval-rules.v1", proceedLimit: { pence: 25000, currency: "GBP" },
  bands: [
    { upToPence: 150000, steps: [{ role: "supervisor", timeLimitMinutes: 1440, escalationRole: "commercial_manager", alternateRoles: ["surveyor"] }] },
    { upToPence: null, steps: [{ role: "supervisor", timeLimitMinutes: 1440, escalationRole: "commercial_manager", alternateRoles: ["surveyor"] }, { role: "commercial_manager", timeLimitMinutes: 1440, escalationRole: "commercial_manager", alternateRoles: ["surveyor"] }] },
  ],
  clientApproval: { kind: "threshold", abovePence: 100000, beforeWorkAbovePence: 50000, timeLimitMinutes: 2880 },
  evidence: { photosRequired: true, residentConfirmationRequired: true },
});

export type NorthsideSeed = {
  companyName: string; clientIds: string[]; journey: { clientId: string; jobId: string; orderReference: string; operativeMembershipId: string };
  surveyorMembershipId: string; supervisorMembershipId: string; clientApproverMembershipId: string; clientApproverEmail: string;
};

const pad = (n: number, width = 4) => String(n).padStart(width, "0");
const addDays = (iso: string, days: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };

/** Idempotent per organisation (one tenant-level session lock): a second call returns the stored seed and writes nothing. */
export async function seedNorthsideDemo(pool: Pool, owner: AuthenticatedMembership): Promise<NorthsideSeed> {
  const lock = await pool.connect();
  try {
    await lock.query("SELECT pg_advisory_lock(hashtextextended($1,57))", [owner.tenantId]);
    const contractors = new ContractorRepository(pool), orders = new WorkOrderRepository(pool);
    const view = () => contractors.query(owner, { version: "contractor-query.v1", tenantId: owner.tenantId, resource: "organisation" });
    const command = async (fields: Record<string, unknown>) => contractors.command(owner, { version: "contractor-command.v1", environment: "synthetic_demo", commandId: randomUUID(), id: randomUUID(), expectedRevision: (await view()).revision, ...fields });
    const before = await view();
    if (before.units.some(u => u.name === northsideName)) return await storedSeed(pool, owner);

    // Clients 1..3, each with its own branch, team and contract (client 1 is the standard demo organisation; 2 and 3 are added by the merged helper).
    const region = (await command({ kind: "unit.create", unitKind: "region", parentId: owner.tenantId, name: northsideName })).id;
    const first = await prepareWorkOrderDemo(pool, owner, { siteCount: 12 });
    const second = await addBranchClient(pool, owner, first, "Elm", region);
    const third = await addBranchClient(pool, owner, second, "Birch", region);
    const demos: WorkOrderDemo[] = [first, second, third];

    // Northside's own approval rules replace the reference rules on every contract BEFORE any order is imported (an order binds the contract version current at import).
    for (const demo of demos) {
      const contracts = await contractors.query(owner, { version: "contractor-query.v1", tenantId: owner.tenantId, resource: "contracts" });
      const document = contracts.contracts.filter(c => c.client_id === demo.clientId).at(-1)!.document as Record<string, unknown>;
      await command({ kind: "contract.revise", clientId: demo.clientId, contractId: demo.contractId, document: { ...document, reference: `${String(document.reference).slice(0, 60)}-NS` }, rules: northsideRules });
    }

    // People: a supervisor and a surveyor (client 1), a client approver (client 1), and 40 operatives over the three teams (the demo operative is the first).
    const supervisorMembershipId = (await command({ kind: "member.invite", role: "supervisor", email: "supervisor@northside-fictional.invalid", scope: { kind: "team", id: first.teamId }, clientId: null, contractId: null })).id as string;
    const surveyorMembershipId = (await command({ kind: "member.invite", role: "surveyor", email: "surveyor@northside-fictional.invalid", scope: { kind: "branch", id: first.branchId }, clientId: null, contractId: null })).id as string;
    const clientApproverEmail = "client.approver@northside-fictional.invalid";
    const clientApproverMembershipId = (await command({ kind: "member.invite", role: "client_approver", email: clientApproverEmail, scope: { kind: "client", id: first.clientId }, clientId: first.clientId, contractId: first.contractId })).id as string;
    const teamOperatives: string[][] = [[first.operativeMembershipId], [], []];
    for (let i = 2; i <= northsideTargets.operatives; i++) {
      const team = (i - 1) % 3;
      teamOperatives[team]!.push((await command({ kind: "member.invite", role: "operative", email: `operative${pad(i, 2)}@northside-fictional.invalid`, scope: { kind: "team", id: demos[team]!.teamId }, clientId: null, contractId: null })).id as string);
    }

    // 2,000 orders in October 2026 (800 / 700 / 500), imported in files of 100 rows through the merged work-order import.
    const split = [800, 700, 500];
    const rows: Record<string, unknown>[] = [];
    demos.forEach((demo, c) => {
      for (let k = 1; k <= split[c]!; k++) {
        const issuedOn = `${northsideTargets.month}-${pad(((k - 1) % 28) + 1, 2)}`;
        rows.push(demoRow(demo, k + c * 1000, { workOrderReference: `NS-${c + 1}-${pad(k)}`, issuedOn, dueOn: addDays(issuedOn, 14), assignedMembershipIds: [teamOperatives[c]![(k - 1) % teamOperatives[c]!.length]!] }));
      }
    });
    for (let at = 0; at < rows.length; at += 100) {
      const result = await orders.importCsv(owner, { commandId: randomUUID(), name: `northside-${pad(at / 100, 3)}.csv`, kind: "generated", csv: demoFile(rows.slice(at, at + 100)) });
      if (result.counts.rejected !== 0) throw new Error(`The generated Northside orders were refused: ${JSON.stringify(result).slice(0, 600)}`);
    }
    return await storedSeed(pool, owner);
  } finally {
    await lock.query("SELECT pg_advisory_unlock(hashtextextended($1,57))", [owner.tenantId]).catch(() => undefined);
    lock.release();
  }
}

async function storedSeed(pool: Pool, owner: AuthenticatedMembership): Promise<NorthsideSeed> {
  return withTenant(pool, verifiedTenantContextFromMembership(owner), async db => {
    const q = async <T extends Record<string, unknown>>(sql: string, args: unknown[] = []) => (await db.$client.query<T>(sql, [owner.tenantId, ...args])).rows;
    const clients = await q<{ id: string }>("SELECT id FROM app.client_organisation WHERE tenant_id=$1 ORDER BY name,id");
    const person = async (email: string) => (await q<{ membership_id: string }>("SELECT membership_id FROM app.contractor_member WHERE tenant_id=$1 AND email=$2", [email]))[0]!.membership_id;
    const journey = (await q<{ job_id: string; client_id: string; reference: string; membership_id: string }>(
      `SELECT w.job_id,w.client_id,w.reference,a.membership_id FROM app.work_order w JOIN app.job_assignment a ON(a.tenant_id,a.job_id)=(w.tenant_id,w.job_id)
       JOIN app.contractor_member m ON(m.tenant_id,m.membership_id)=(a.tenant_id,a.membership_id) WHERE w.tenant_id=$1 AND w.reference='NS-1-0001' AND m.email='demo.operative@fictional.invalid' LIMIT 1`))[0];
    if (!journey) throw new Error("The generated Northside organisation is incomplete");
    return { companyName: northsideName, clientIds: clients.map(c => c.id), journey: { clientId: journey.client_id, jobId: journey.job_id, orderReference: journey.reference, operativeMembershipId: journey.membership_id },
      supervisorMembershipId: await person("supervisor@northside-fictional.invalid"), surveyorMembershipId: await person("surveyor@northside-fictional.invalid"),
      clientApproverMembershipId: await person("client.approver@northside-fictional.invalid"), clientApproverEmail: "client.approver@northside-fictional.invalid" };
  });
}

export type NorthsideFacts = { companyName: string | null; clients: number; operatives: number; ordersThisMonth: number; orderValuePence: number; extras: number };
/** Every figure on the demo screens: counted from the seeded rows, never typed in. */
export async function northsideFacts(pool: Pool, member: AuthenticatedMembership): Promise<NorthsideFacts> {
  return withTenant(pool, verifiedTenantContextFromMembership(member), async db => {
    const one = async (sql: string) => (await db.$client.query<Record<string, string | null>>(sql, [member.tenantId])).rows[0]!;
    const company = (await one("SELECT (SELECT name FROM app.org_unit WHERE tenant_id=$1 AND kind='region' AND name='Northside Property Services' LIMIT 1) v")).v;
    const clients = (await one("SELECT count(*)::text v FROM app.client_organisation WHERE tenant_id=$1")).v;
    const operatives = (await one("SELECT count(*)::text v FROM app.membership m WHERE m.tenant_id=$1 AND m.role='operative' AND m.revoked_at IS NULL")).v;
    const month = await one(`SELECT count(*)::text n,coalesce(sum(r.net_total_pence),0)::text v FROM app.work_order_current c JOIN app.work_order_revision r ON(r.tenant_id,r.id)=(c.tenant_id,c.revision_id)
      WHERE c.tenant_id=$1 AND r.status='ordered' AND r.issued_on>='2026-10-01' AND r.issued_on<'2026-11-01'`);
    const extras = (await one("SELECT count(*)::text v FROM app.extra_origin WHERE tenant_id=$1")).v;
    return { companyName: company ?? null, clients: Number(clients), operatives: Number(operatives), ordersThisMonth: Number(month.n), orderValuePence: Number(month.v), extras: Number(extras) };
  });
}

export type NorthsideExtra = {
  extraId: string; jobId: string; orderReference: string; description: string; note: string; state: string; loggedAt: string;
  hasPhoto: boolean; residentConfirmed: boolean; quotedPence: number | null; netPence: number | null; requestId: string | null; revisionHash: string | null;
  steps: Array<{ index: number; role: string; done: boolean }>; nextStepIndex: number | null; nextStepRole: string | null; clientRequired: boolean;
  linkIssued: boolean; linkClosed: string | null; outcome: string | null; clientApproverMembershipId: string | null; clientApproverEmail: string | null;
};
export async function northsideRole(pool: Pool, member: AuthenticatedMembership): Promise<string | null> {
  return withTenant(pool, verifiedTenantContextFromMembership(member), async db => (await db.$client.query<{ role: string }>("SELECT role FROM app.membership WHERE tenant_id=$1 AND id=$2 AND revoked_at IS NULL", [member.tenantId, member.membershipId])).rows[0]?.role ?? null);
}
/**
 * The extras this member may see, read from the rows. Operatives see what they raised; surveyors, supervisors and commercial managers see the jobs
 * their grants cover (the merged grant check); the owner sees all; a client approver sees only extras with an open link issued to them.
 */
export async function northsideExtras(pool: Pool, member: AuthenticatedMembership, role: string): Promise<NorthsideExtra[]> {
  return withTenant(pool, verifiedTenantContextFromMembership(member), async db => {
    const visible = role === "owner" || role === "admin" ? "true"
      : role === "operative" ? "o.raising_membership_id=$2"
      : role === "client_approver" ? "EXISTS(SELECT 1 FROM app.extra_client_link k WHERE k.tenant_id=o.tenant_id AND k.variation_id=o.variation_id AND k.approver_membership_id=$2 AND k.expires_at>clock_timestamp() AND NOT EXISTS(SELECT 1 FROM app.extra_client_link_closure c WHERE(c.tenant_id,c.link_id)=(k.tenant_id,k.id)))"
      : "app.xa_covers($2,ARRAY[$3::text],o.job_id,'job.read') IS NOT NULL";
    const rows = (await db.$client.query(`
      SELECT o.variation_id,o.job_id,w.reference,v.description,v.capture_text,o.evidence_id IS NOT NULL has_photo,o.resident_confirmation_evidence_id IS NOT NULL confirmed,
        (SELECT e.kind FROM app.extra_event e WHERE e.tenant_id=o.tenant_id AND e.variation_id=o.variation_id ORDER BY e.sequence DESC LIMIT 1) state,
        (SELECT r.signed_delta_pence::text FROM app.extra_approval_revision_binding b JOIN app.variation_revision r ON(r.tenant_id,r.job_id,r.id)=(b.tenant_id,b.job_id,b.variation_revision_id) WHERE b.tenant_id=o.tenant_id AND b.variation_id=o.variation_id ORDER BY b.logical_revision DESC LIMIT 1) quoted,
        o.server_recorded_at,q.id request_id,q.net_pence::text net,q.revision_hash,q.requirement,
        (SELECT coalesce(array_agg(f.step_index ORDER BY f.step_index),'{}') FROM app.extra_approval_step_fact f WHERE f.tenant_id=q.tenant_id AND f.request_id=q.id) done,
        EXISTS(SELECT 1 FROM app.extra_client_link k WHERE k.tenant_id=q.tenant_id AND k.request_id=q.id) link_issued,
        (SELECT c.kind FROM app.extra_client_link k JOIN app.extra_client_link_closure c ON(c.tenant_id,c.link_id)=(k.tenant_id,k.id) WHERE k.tenant_id=q.tenant_id AND k.request_id=q.id ORDER BY k.server_recorded_at DESC LIMIT 1) link_closed,
        (SELECT out.kind FROM app.extra_approval_outcome out WHERE out.tenant_id=q.tenant_id AND out.request_id=q.id) outcome,
        (SELECT cm.membership_id FROM app.contractor_member cm JOIN app.work_order wo ON(wo.tenant_id,wo.client_id)=(cm.tenant_id,cm.client_id) WHERE cm.tenant_id=o.tenant_id AND wo.job_id=o.job_id AND cm.membership_id IN(SELECT membership_id FROM app.membership WHERE tenant_id=o.tenant_id AND role='client_approver' AND revoked_at IS NULL) ORDER BY cm.membership_id LIMIT 1) client_member,
        (SELECT cm.email FROM app.contractor_member cm JOIN app.work_order wo ON(wo.tenant_id,wo.client_id)=(cm.tenant_id,cm.client_id) WHERE cm.tenant_id=o.tenant_id AND wo.job_id=o.job_id AND cm.membership_id IN(SELECT membership_id FROM app.membership WHERE tenant_id=o.tenant_id AND role='client_approver' AND revoked_at IS NULL) ORDER BY cm.membership_id LIMIT 1) client_email
      FROM app.extra_origin o JOIN app.variation v ON(v.tenant_id,v.job_id,v.id)=(o.tenant_id,o.job_id,o.variation_id)
      JOIN app.work_order w ON(w.tenant_id,w.job_id)=(o.tenant_id,o.job_id)
      LEFT JOIN LATERAL (SELECT * FROM app.extra_approval_request r WHERE r.tenant_id=o.tenant_id AND r.variation_id=o.variation_id ORDER BY r.request_revision DESC LIMIT 1) q ON true
      WHERE o.tenant_id=$1 AND o.job_track='contractor' AND o.provenance='command' AND ${visible}
      ORDER BY o.server_recorded_at,o.variation_id`, role === "operative" || role === "client_approver" ? [member.tenantId, member.membershipId] : role === "owner" || role === "admin" ? [member.tenantId] : [member.tenantId, member.membershipId, role])).rows;
    return rows.map((r): NorthsideExtra => {
      const steps = ((r.requirement?.steps ?? []) as Array<{ index: number; role: string }>).map(s => ({ index: s.index, role: s.role, done: ((r.done ?? []) as number[]).includes(s.index) }));
      const next = r.outcome ? undefined : steps.find(s => !s.done);
      return { extraId: r.variation_id, jobId: r.job_id, orderReference: r.reference, description: r.description, note: r.capture_text, state: r.state, loggedAt: new Date(r.server_recorded_at).toISOString(),
        hasPhoto: r.has_photo, residentConfirmed: r.confirmed, quotedPence: r.quoted === null || r.quoted === undefined ? null : Number(r.quoted), netPence: r.net === null || r.net === undefined ? null : Number(r.net), requestId: r.request_id ?? null, revisionHash: r.revision_hash ?? null,
        steps, nextStepIndex: next?.index ?? null, nextStepRole: next?.role ?? null, clientRequired: steps.some(s => s.role === "client_approver"),
        linkIssued: !!r.link_issued, linkClosed: r.link_closed ?? null, outcome: r.outcome ?? null, clientApproverMembershipId: r.client_member ?? null, clientApproverEmail: r.client_email ?? null };
    });
  });
}
export type NorthsideRate = { code: string; description: string; unit: string; ratePence: number };
/** The seeded rate card of the job's order (the schedule version the order was imported against). */
export async function northsideRateCard(pool: Pool, member: AuthenticatedMembership, jobId: string): Promise<NorthsideRate[]> {
  return withTenant(pool, verifiedTenantContextFromMembership(member), async db => (await db.$client.query<{ code: string; description: string; unit: string; rate_pence: string }>(
    `SELECT i.code,i.description,i.unit,i.rate_pence::text FROM app.work_order w JOIN app.work_order_current c ON(c.tenant_id,c.work_order_id)=(w.tenant_id,w.id)
     JOIN app.work_order_revision r ON(r.tenant_id,r.id)=(c.tenant_id,c.revision_id) JOIN app.sor_item i ON(i.tenant_id,i.version_id)=(r.tenant_id,r.sor_version_id)
     WHERE w.tenant_id=$1 AND w.job_id=$2 ORDER BY i.code`, [member.tenantId, jobId])).rows.map(r => ({ code: r.code, description: r.description, unit: r.unit, ratePence: Number(r.rate_pence) })));
}
