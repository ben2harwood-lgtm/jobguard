import type { Pool } from "pg";
import { z } from "zod";
import {
  ExtraCommercialReadError, askedAgainstApprovedSummary, askedAgainstApprovedV1, classifyExtraWork, extraClaimRecordV1, extraCommercialReadAllowed,
  extraEntitlementContextV1, extraWorkListQueryV1, extraWorkListV1, notDisclosed, notRecorded, addExactPence, compareExactPence, exactPence, parseExactPence,
  serializeExactPence, type ExactPence, type ExtraCommercialRead, type ExtraWorkInput,
} from "@jobguard/core";
import { withTenant, InvalidTenantContextError, type TenantTransaction, type VerifiedTenantContext } from "./tenant-context.js";
import { RequestBindingRefusedError } from "./request-binding-error.js";

/**
 * EP-CC-R1: four read-only commercial reads over contractor extras. Authority comes only from the persisted session through
 * app.cr_read_scope (migration 0786): the actor, its role and the contractor jobs its current grants cover. Rows are then read
 * as the runtime role under tenant RLS, always restricted to that job set. Nothing here writes, audits or claims a receipt.
 * Resident contact, capture text, client recipients and the internal rationale are never selected.
 */
const uuid = z.guid();
type Row = Record<string, unknown>;
type Scope = { membershipId: string; role: string; feeReader: boolean; jobs: { jobId: string; teamId: string | null; duplicateGroups: { groupId: string; extras: { extraId: string; description: string }[] }[] }[] };
const scopeV1 = z.object({ version: z.literal("extra-commercial-read-scope.v1"), membershipId: uuid, role: z.string(), feeReader: z.boolean(),
  jobs: z.array(z.object({ jobId: uuid, teamId: uuid.nullable(), duplicateGroups: z.array(z.object({ groupId: uuid,
    extras: z.array(z.object({ extraId: uuid, canonicalId: uuid.optional(), description: z.string() }).loose()) }).strict()) }).strict()) }).strict();
const iso = (value: unknown) => (value as Date).toISOString();
const lc = (value: string) => value.toLowerCase();
const num = (value: unknown) => value === null || value === undefined ? null : Number(value);
const maxDate = (dates: (Date | null | undefined)[]) => dates.filter((d): d is Date => d instanceof Date).reduce((a, b) => (b > a ? b : a), new Date(0));

function failure(error: unknown): never {
  if (error instanceof ExtraCommercialReadError || error instanceof InvalidTenantContextError) throw error;
  if (error instanceof RequestBindingRefusedError) throw new ExtraCommercialReadError("PERMISSION_DENIED");
  const e = error as { code?: string; message?: string };
  if (e.message === "MODE_FORBIDDEN") throw new ExtraCommercialReadError("MODE_FORBIDDEN");
  if (e.message === "NOT_FOUND" || e.code === "P0002") throw new ExtraCommercialReadError("NOT_FOUND");
  if (e.code === "42501") throw new ExtraCommercialReadError("PERMISSION_DENIED");
  if (e.code === "22P02") throw new ExtraCommercialReadError("INVALID_QUERY");
  throw new ExtraCommercialReadError("DATABASE_UNAVAILABLE", { cause: error });
}

type Facts = Awaited<ReturnType<typeof loadFacts>>;
type Extra = Facts["extras"][number];

async function q(db: TenantTransaction, sql: string, args: unknown[]): Promise<Row[]> { return (await db.$client.query(sql, args)).rows as Row[]; }

/** Every row needed by any of the four reads, for the given covered jobs (and optionally one extra). One pass, no N+1. */
async function loadFacts(db: TenantTransaction, tenant: string, jobs: string[], extra: string | null) {
  const a = [tenant, jobs, extra];
  const scoped = "tenant_id=$1 AND job_id=ANY($2::uuid[]) AND ($3::uuid IS NULL OR variation_id=$3)";
  const extras = await q(db, `SELECT v.id extra_id,v.job_id,v.description,v.sor_code,v.sor_version_id,o.kind origin_kind,o.server_recorded_at raised_at,o.raising_membership_id,
     o.site_visit_id,o.evidence_id,o.resident_confirmation_evidence_id,o.work_order_revision_id origin_revision_id,
     w.id work_order_id,w.reference order_reference,w.contract_id,w.contract_version_id,cur.revision_id current_revision_id
    FROM app.variation v JOIN app.extra_origin o ON(o.tenant_id,o.job_id,o.variation_id)=(v.tenant_id,v.job_id,v.id)
    JOIN app.work_order w ON(w.tenant_id,w.job_id)=(v.tenant_id,v.job_id)
    LEFT JOIN app.work_order_current cur ON(cur.tenant_id,cur.work_order_id)=(w.tenant_id,w.id)
    WHERE v.tenant_id=$1 AND v.job_id=ANY($2::uuid[]) AND v.job_track='contractor' AND ($3::uuid IS NULL OR v.id=$3)
    ORDER BY o.server_recorded_at,v.id`, a);
  const events = await q(db, `SELECT variation_id,kind,sequence,reason_code,server_recorded_at FROM app.extra_event WHERE ${scoped} ORDER BY variation_id,sequence`, a);
  const sor = await q(db, `SELECT * FROM app.extra_sor_revision WHERE ${scoped}`, a);
  const bindings = await q(db, `SELECT b.variation_id,b.id,b.logical_revision,b.source_kind,b.sor_revision_id,b.actor_membership_id,b.server_recorded_at,
     coalesce(s.net_pence,r.signed_delta_pence) net_pence,p.server_recorded_at basis_at
    FROM app.extra_approval_revision_binding b
    LEFT JOIN app.extra_sor_revision s ON(s.tenant_id,s.id)=(b.tenant_id,b.sor_revision_id)
    LEFT JOIN app.variation_revision r ON(r.tenant_id,r.job_id,r.id)=(b.tenant_id,b.job_id,b.variation_revision_id)
    LEFT JOIN app.extra_pricing_basis p ON p.tenant_id=b.tenant_id AND p.variation_id=b.variation_id AND p.revision=s.revision
     AND p.revision_content_hash=s.content_hash AND p.pricing_basis='server_sor'
    WHERE b.tenant_id=$1 AND b.job_id=ANY($2::uuid[]) AND ($3::uuid IS NULL OR b.variation_id=$3) ORDER BY b.variation_id,b.logical_revision`, a);
  const requests = await q(db, `SELECT r.variation_id,r.id,r.request_revision,r.binding_id,r.net_pence,r.requirement,r.server_recorded_at,r.contract_version_id,r.rule_version_id,
     o.kind outcome_kind,o.reason_code,o.actor_kind outcome_actor_kind,o.by_rule,o.server_recorded_at outcome_at
    FROM app.extra_approval_request r LEFT JOIN app.extra_approval_outcome o ON(o.tenant_id,o.request_id)=(r.tenant_id,r.id)
    WHERE r.tenant_id=$1 AND r.job_id=ANY($2::uuid[]) AND ($3::uuid IS NULL OR r.variation_id=$3) ORDER BY r.variation_id,r.request_revision`, a);
  const steps = await q(db, `SELECT variation_id,request_id,step_index,step_role,actor_kind,approved_net_pence,server_recorded_at FROM app.extra_approval_step_fact WHERE ${scoped} ORDER BY request_id,step_index`, a);
  const escalations = await q(db, `SELECT variation_id,request_id,step_index,eligible_roles,fired_at FROM app.extra_escalation_fact WHERE ${scoped}`, a);
  const links = await q(db, `SELECT k.variation_id,k.id,k.request_id,k.server_recorded_at,c.kind closed_kind,c.server_recorded_at closed_at FROM app.extra_client_link k
    LEFT JOIN app.extra_client_link_closure c ON(c.tenant_id,c.link_id)=(k.tenant_id,k.id) WHERE k.tenant_id=$1 AND k.job_id=ANY($2::uuid[]) AND ($3::uuid IS NULL OR k.variation_id=$3)`, a);
  const duplicateLinks = await q(db, `SELECT id,kind,duplicate_id,canonical_id,server_recorded_at FROM app.extra_duplicate_link
    WHERE tenant_id=$1 AND job_id=ANY($2::uuid[]) AND ($3::uuid IS NULL OR duplicate_id=$3 OR canonical_id=$3) ORDER BY server_recorded_at,id`, a);
  const revisionIds = [...new Set(extras.flatMap(e => [e.origin_revision_id, e.current_revision_id]).filter(Boolean))] as string[];
  const orderRevisions = await q(db, `SELECT id,work_order_id,revision,status,created_at FROM app.work_order_revision WHERE tenant_id=$1 AND id=ANY($2::uuid[])`, [tenant, revisionIds]);
  const orderLines = await q(db, `SELECT revision_id,position,scope_item_id,client_line_reference,sor_code,unit,quantity,rate_pence FROM app.work_order_line
    WHERE tenant_id=$1 AND revision_id=ANY($2::uuid[]) ORDER BY revision_id,position`, [tenant, revisionIds]);
  const contractVersions = await q(db, `SELECT cv.id,cv.contract_id,cv.revision,cv.rule_version_id,rv.revision rule_revision FROM app.client_contract_version cv
    JOIN app.approval_rule_version rv ON(rv.tenant_id,rv.id)=(cv.tenant_id,cv.rule_version_id) WHERE cv.tenant_id=$1 AND cv.id=ANY($2::uuid[])`,
    [tenant, [...new Set(extras.map(e => e.contract_version_id))]]);
  const rateItems = await q(db, `SELECT i.version_id,i.code,i.description,i.unit,i.rate_pence,s.reference,s.effective_from::text effective_from FROM app.sor_item i
    JOIN app.sor_version s ON(s.tenant_id,s.id)=(i.tenant_id,i.version_id) WHERE i.tenant_id=$1 AND (i.version_id,i.code) IN (SELECT * FROM unnest($2::uuid[],$3::text[]))`,
    [tenant, extras.filter(e => e.sor_code).map(e => e.sor_version_id), extras.filter(e => e.sor_code).map(e => e.sor_code)]);
  const exportLines = await q(db, `SELECT l.id,l.extra_id,l.batch_id,l.approval_request_id,l.approved_net_pence,b.server_recorded_at exported_at FROM app.billing_export_line l
    JOIN app.billing_export_batch b ON(b.tenant_id,b.id)=(l.tenant_id,l.batch_id) WHERE l.tenant_id=$1 AND l.job_id=ANY($2::uuid[]) AND ($3::uuid IS NULL OR l.extra_id=$3)`, a);
  const lineIds = exportLines.map(l => l.id as string);
  const matches = await q(db, `SELECT m.export_line_id,f.source,f.invoice_number,m.external_invoice_line_id,f.job_id FROM app.billing_line_match m
    JOIN app.billing_fact f ON(f.tenant_id,f.id)=(m.tenant_id,m.fact_id) WHERE m.tenant_id=$1 AND m.export_line_id=ANY($2::uuid[]) AND f.payload->>'factType'='invoiced'`, [tenant, lineIds]);
  const invoiceJobs = [...new Set(matches.map(m => m.job_id as string))];
  const runs = await q(db, `SELECT r.id,r.job_id,r.source,r.invoice_number,r.projection,r.server_recorded_at FROM app.billing_allocation_run r WHERE r.tenant_id=$1 AND r.job_id=ANY($2::uuid[])
    AND NOT EXISTS(SELECT 1 FROM app.billing_allocation_run n WHERE n.tenant_id=r.tenant_id AND n.predecessor_id=r.id)`, [tenant, invoiceJobs]);
  const allocations = await q(db, `SELECT a.id,a.run_id,a.export_line_id,a.source_ref,a.rule,a.matched_extra_numerator::text n,a.matched_extra_denominator::text d,
     NOT EXISTS(SELECT 1 FROM app.billing_allocation_run x WHERE x.tenant_id=a.tenant_id AND x.predecessor_id=a.run_id) current
    FROM app.contractor_receipt_line_allocation a WHERE a.tenant_id=$1 AND a.export_line_id=ANY($2::uuid[]) ORDER BY a.run_id,a.id`, [tenant, lineIds]);
  const billingFacts = await q(db, `SELECT f.id,f.source,f.invoice_number,f.payload->>'factType' fact_type,f.source_event_id,f.match_valid,f.server_recorded_at FROM app.billing_fact f
    WHERE f.tenant_id=$1 AND f.job_id=ANY($2::uuid[]) AND (f.source,f.invoice_number) IN (SELECT * FROM unnest($3::text[],$4::text[])) ORDER BY f.server_recorded_at,f.id`,
    [tenant, invoiceJobs, matches.map(m => m.source), matches.map(m => m.invoice_number)]);
  const by = <T extends Row>(rows: T[], key: string) => { const m = new Map<string, T[]>(); for (const r of rows) { const k = r[key] as string; m.set(k, [...(m.get(k) ?? []), r]); } return m; };
  const ev = by(events, "variation_id"), bi = by(bindings, "variation_id"), rq = by(requests, "variation_id"), st = by(steps, "request_id"), es = by(escalations, "request_id"),
    lk = by(links, "variation_id"), ex = by(exportLines, "extra_id"), sr = by(sor, "variation_id");
  const revisions = new Map(orderRevisions.map(r => [r.id as string, { ...r, lines: orderLines.filter(l => l.revision_id === r.id) } as Row & { lines: Row[] }]));
  return {
    extras: extras.map(e => {
      const id = e.extra_id as string, exportLine = ex.get(id)?.[0] ?? null;
      const lineMatches = exportLine ? matches.filter(m => m.export_line_id === exportLine.id) : [];
      return { row: e, id, jobId: e.job_id as string, events: ev.get(id) ?? [], bindings: bi.get(id) ?? [], sor: sr.get(id)?.[0] ?? null,
        requests: (rq.get(id) ?? []).map(r => ({ ...r, steps: st.get(r.id as string) ?? [], escalations: es.get(r.id as string) ?? [] }) as Row & { steps: Row[]; escalations: Row[] }), links: lk.get(id) ?? [],
        duplicateLinks: duplicateLinks.filter(l => l.duplicate_id === id || l.canonical_id === id),
        originRevision: revisions.get(e.origin_revision_id as string) ?? null, currentRevision: revisions.get(e.current_revision_id as string) ?? null,
        contract: contractVersions.find(c => c.id === e.contract_version_id) ?? null,
        rateItem: e.sor_code ? rateItems.find(i => i.version_id === e.sor_version_id && i.code === e.sor_code) ?? null : null,
        exportLine, invoiceLines: lineMatches.map(m => ({ match: m, run: runs.find(r => r.source === m.source && r.invoice_number === m.invoice_number && r.job_id === m.job_id) ?? null })),
        allocations: exportLine ? allocations.filter(x => x.export_line_id === exportLine.id) : [],
        billingFacts: billingFacts.filter(f => lineMatches.some(m => m.source === f.source && m.invoice_number === f.invoice_number)) };
    }),
  };
}

const orderRevision = (e: Extra, which: "originRevision" | "currentRevision") => {
  const r = e[which];
  if (!r) throw new ExtraCommercialReadError("NOT_FOUND");
  return { workOrderId: r.work_order_id as string, reference: e.row.order_reference as string, revisionId: r.id as string, revision: Number(r.revision), status: r.status as "ordered" | "cancelled",
    lines: r.lines.map(l => ({ position: Number(l.position), scopeItemId: l.scope_item_id as string, clientLineReference: (l.client_line_reference as string | null) ?? null, rateCode: l.sor_code as string,
      unit: l.unit as string, quantity: l.quantity as string, ratePence: Number(l.rate_pence) })) };
};
const basis = (b: Row) => b.basis_at ? { kind: "server_sor" as const, recordedAt: iso(b.basis_at) } : { kind: "basis_not_recorded" as const };
const lifecycle = (e: Extra): ExtraWorkInput["lifecycle"] => {
  const kind = e.events.at(-1)?.kind as string | undefined;
  if (kind === undefined) throw new ExtraCommercialReadError("INCONSISTENT_WORK_INPUT");
  if (["exported", "billed", "part_paid", "paid", "credited", "billing_rejected"].includes(kind)) return "exported";
  return kind as ExtraWorkInput["lifecycle"];
};
type Step = { index: number; kind: string; role: string };
const nextStep = (r: Extra["requests"][number]): NonNullable<ExtraWorkInput["request"]>["nextStep"] => {
  const required = ((r.requirement as { steps?: Step[] })?.steps ?? []).slice().sort((x, y) => x.index - y.index);
  const done = new Set(r.steps.map(s => Number(s.step_index)));
  const step = required.find(s => !done.has(s.index));
  if (!step) return null;
  if (step.kind === "contract_rule") return { kind: "contract_rule" };
  if (step.role === "client_approver") return { kind: "client" };
  const escalated = r.escalations.filter(x => Number(x.step_index) === step.index).flatMap(x => x.eligible_roles as string[]);
  return { kind: "company", eligibleRoles: [...new Set([step.role, ...escalated])].sort() };
};
const zero = exactPence(0n);
const sum = (values: ExactPence[]) => values.reduce(addExactPence, zero);
const invoiceLine = (x: Extra["invoiceLines"][number]) => {
  const line = (x.run?.projection as { lines: { lineId: string; billedNet: unknown; creditedNet: unknown; paidNet: unknown; rejected: boolean }[] } | undefined)?.lines
    .find(l => l.lineId === x.match.external_invoice_line_id);
  return line ? { billed: parseExactPence(line.billedNet), credited: parseExactPence(line.creditedNet), paid: parseExactPence(line.paidNet), rejected: line.rejected } : null;
};
function billingTotals(e: Extra) {
  if (!e.exportLine) return null;
  const lines = e.invoiceLines.map(invoiceLine).filter(l => l !== null);
  return { billedNet: serializeExactPence(sum(lines.map(l => l.billed))), creditedNet: serializeExactPence(sum(lines.map(l => l.credited))),
    paidNet: serializeExactPence(sum(lines.map(l => l.paid))), rejected: lines.some(l => l.rejected) };
}
function workInput(e: Extra, scope: Scope): ExtraWorkInput {
  const latest = e.requests.at(-1) ?? null, life = lifecycle(e);
  const group = scope.jobs.find(j => j.jobId === e.jobId)?.duplicateGroups.find(g => g.extras.some(x => x.extraId === e.id)) ?? null;
  return {
    version: "extra-work-input.v1", lifecycle: life,
    // No evidence-attach command exists on main and no route enforces the rule's evidence flags, so "add evidence" is not an
    // action any role can perform today: the evidence gate is not entered from stored data (pure tests cover the state).
    evidence: null,
    priced: life === "logged" ? e.bindings.length > 0 || e.sor !== null : latest?.net_pence !== null && latest?.net_pence !== undefined,
    request: life === "logged" ? null : latest ? { nextStep: latest.outcome_kind ? null : nextStep(latest) } : null,
    entitlement: { flags: null, validDecision: null },
    duplicate: { unresolved: group !== null, excludedMembershipIds: [] },
    billing: life === "exported" ? billingTotals(e) : null,
  };
}

/** Members who reported or priced any member of the duplicate group; they may not resolve it (§3). */
function duplicateExcluded(facts: Facts, scope: Scope, e: Extra): string[] {
  const group = scope.jobs.find(j => j.jobId === e.jobId)?.duplicateGroups.find(g => g.extras.some(x => x.extraId === e.id));
  if (!group) return [];
  const members = facts.extras.filter(x => group.extras.some(g => g.extraId === x.id));
  return [...new Set(members.flatMap(x => [x.row.raising_membership_id as string | null, ...x.bindings.map(b => b.actor_membership_id as string)]).filter((m): m is string => !!m))].sort();
}
function revisionsOf(e: Extra) {
  const latest = e.requests.at(-1)?.id;
  return e.requests.map(r => ({
    requestId: r.id as string, requestRevision: Number(r.request_revision), netPence: num(r.net_pence), priced: r.net_pence !== null,
    status: (r.outcome_kind ?? (r.id === latest ? "pending" : "superseded")) as "pending",
    openedAt: iso(r.server_recorded_at), basis: r.binding_id ? basis(e.bindings.find(b => b.id === r.binding_id) ?? {}) : null,
    revisionReason: notRecorded("CC-S1"), answersRequest: notRecorded("CC-S1"),
    outcome: r.outcome_kind ? { kind: r.outcome_kind as "approved", reasonCode: (r.reason_code as string | null) ?? null, actorKind: r.outcome_actor_kind as "member", byRule: Boolean(r.by_rule), recordedAt: iso(r.outcome_at) } : null,
    steps: r.steps.map(s => ({ stepIndex: Number(s.step_index), role: s.step_role as string, actorKind: s.actor_kind as "member", approvedNetPence: num(s.approved_net_pence), recordedAt: iso(s.server_recorded_at) })),
  }));
}

export class ExtraCommercialReadRepository {
  constructor(private readonly pool: Pool) {}

  private async read<T>(context: VerifiedTenantContext, session: string, read: ExtraCommercialRead, job: string | null, extra: string | null,
    work: (db: TenantTransaction, scope: Scope, facts: Facts, tenant: string) => Promise<T>, contractFilter?: string): Promise<T> {
    if (!uuid.safeParse(session).success || (job !== null && !uuid.safeParse(job).success) || (extra !== null && !uuid.safeParse(extra).success)
      || (contractFilter !== undefined && !uuid.safeParse(contractFilter).success)) throw new ExtraCommercialReadError("INVALID_QUERY");
    if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new ExtraCommercialReadError("MODE_FORBIDDEN");
    const tenant = lc(context.tenantId);
    try {
      return await withTenant(this.pool, context, async db => {
        const raw = (await db.$client.query<{ s: unknown }>("SELECT app.cr_read_scope($1) s", [session])).rows[0]!.s;
        const scope = scopeV1.parse(raw) as Scope;
        if (!extraCommercialReadAllowed(scope.role, read)) throw new ExtraCommercialReadError("PERMISSION_DENIED");
        // A job outside the caller's grants, another company's job, or an unknown job reads the same: not found.
        const jobs = job === null ? scope.jobs.map(j => j.jobId) : scope.jobs.some(j => j.jobId === lc(job)) ? [lc(job)] : [];
        if (job !== null && jobs.length === 0) throw new ExtraCommercialReadError("NOT_FOUND");
        const facts = await loadFacts(db, tenant, jobs, extra === null ? null : lc(extra));
        if (extra !== null && facts.extras.length !== 1) throw new ExtraCommercialReadError("NOT_FOUND");
        if (contractFilter !== undefined && facts.extras.some(e => e.row.contract_id !== lc(contractFilter))) throw new ExtraCommercialReadError("NOT_FOUND");
        return work(db, scope, facts, tenant);
      });
    } catch (error) { failure(error); }
  }

  /** F1: what was ordered against what is claimed, the rate item, versions, duplicates; S2 fields are explicit not_recorded. */
  async entitlementContext(context: VerifiedTenantContext, session: string, jobId: string, extraId: string, options: { clientContractId?: string } = {}) {
    return this.read(context, session, "entitlement_context", jobId, extraId, async (_db, scope, facts) => {
      const e = facts.extras[0]!, binding = e.bindings.at(-1) ?? null, s = e.sor, item = e.rateItem, contract = e.contract;
      if (!contract) throw new ExtraCommercialReadError("NOT_FOUND");
      const groups = scope.jobs.find(j => j.jobId === e.jobId)!.duplicateGroups.filter(g => g.extras.some(x => x.extraId === e.id));
      return extraEntitlementContextV1.parse({
        version: "extra-entitlement-context.v1", environment: "synthetic_demo", jobId: e.jobId, extraId: e.id,
        extra: { description: e.row.description, rateCode: e.row.sor_code ?? null, raisedAt: iso(e.row.raised_at) },
        originOrder: orderRevision(e, "originRevision"), currentOrder: orderRevision(e, "currentRevision"), orderRevisionCurrent: e.row.origin_revision_id === e.row.current_revision_id,
        claimed: s ? { coverage: s.coverage, rateCode: s.sor_code, unit: s.unit, instructedQuantity: s.instructed_quantity ?? null, claimedQuantity: s.claimed_quantity, pricedQuantity: s.quantity,
          adjustment: { numerator: String(s.adjustment_numerator), denominator: String(s.adjustment_denominator) }, netPence: Number(s.net_pence) } : notRecorded("CC-S1"),
        rateItem: item ? { rateListVersionId: item.version_id, rateListReference: item.reference, effectiveFrom: item.effective_from, code: item.code, description: item.description, unit: item.unit, ratePence: Number(item.rate_pence) } : null,
        contract: { clientContractId: contract.contract_id, versionId: contract.id, revision: Number(contract.revision), ruleVersionId: contract.rule_version_id, ruleRevision: Number(contract.rule_revision) },
        currentBinding: binding ? { bindingId: binding.id, logicalRevision: Number(binding.logical_revision), sourceKind: binding.source_kind, netPence: num(binding.net_pence), basis: basis(binding) } : null,
        inclusionRule: notRecorded("CC-S2"), rateIncludes: notRecorded("CC-S2"), flags: notRecorded("CC-S2"), decision: notRecorded("CC-S2"), requestEvidence: notRecorded("CC-S2"),
        originEvidence: { photoEvidenceId: e.row.evidence_id ?? null, residentConfirmationEvidenceId: e.row.resident_confirmation_evidence_id ?? null },
        duplicateCandidates: groups.map(g => ({ groupId: g.groupId, extras: g.extras.map(x => ({ extraId: x.extraId, description: x.description })) })),
      });
    }, options.clientContractId);
  }

  /** F2: every request with its amount and outcome; pending kept apart from approved; reasons for revisions arrive with CC-S1. */
  async askedAgainstApproved(context: VerifiedTenantContext, session: string, jobId: string, extraId: string, options: { clientContractId?: string } = {}) {
    return this.read(context, session, "asked_against_approved", jobId, extraId, async (_db, _scope, facts) => {
      const e = facts.extras[0]!;
      const summary = askedAgainstApprovedSummary(e.requests.map(r => ({ requestId: r.id, requestRevision: Number(r.request_revision), netPence: num(r.net_pence),
        outcome: r.outcome_kind ? { kind: r.outcome_kind, reasonCode: r.reason_code ?? null } : null })));
      return askedAgainstApprovedV1.parse({ version: "extra-asked-against-approved.v1", environment: "synthetic_demo", jobId: e.jobId, extraId: e.id, revisions: revisionsOf(e),
        firstRequestedNetPence: summary.firstRequestedNetPence, pendingNetPence: summary.pendingNetPence, latestUnpricedPending: summary.latestUnpricedPending,
        approvedNetPence: summary.approvedNetPence, differencePence: summary.differencePence });
    }, options.clientContractId);
  }

  /** F4: open extras on the caller's covered jobs, one state each, with age. Contractor members only. */
  async workList(context: VerifiedTenantContext, session: string, rawQuery: unknown) {
    const parsed = extraWorkListQueryV1.safeParse(rawQuery);
    if (!parsed.success) throw new ExtraCommercialReadError("INVALID_QUERY");
    const f = parsed.data;
    return this.read(context, session, "work_list", null, null, async (db, scope, facts) => {
      const now = (await db.$client.query<{ now: Date }>("SELECT clock_timestamp() now")).rows[0]!.now;
      const items = [];
      for (const e of facts.extras) {
        const team = scope.jobs.find(j => j.jobId === e.jobId)?.teamId ?? null;
        const raised = e.row.raised_at as Date;
        if (f.orderReference !== undefined && e.row.order_reference !== f.orderReference) continue;
        if (f.rateCode !== undefined && e.row.sor_code !== f.rateCode) continue;
        if (f.clientContractId !== undefined && e.row.contract_id !== lc(f.clientContractId)) continue;
        if (f.teamId !== undefined && team !== lc(f.teamId)) continue;
        if (f.raisedFrom !== undefined && raised < new Date(f.raisedFrom)) continue;
        if (f.raisedTo !== undefined && raised > new Date(f.raisedTo)) continue;
        const input = workInput(e, scope);
        input.duplicate.excludedMembershipIds = duplicateExcluded(facts, scope, e);
        const c = classifyExtraWork(input);
        if (!c.open || (f.states !== undefined && !f.states.includes(c.state))) continue;
        const since = maxDate([raised, ...e.events.map(x => x.server_recorded_at as Date), ...e.bindings.map(b => b.server_recorded_at as Date),
          ...e.requests.flatMap(r => [r.server_recorded_at as Date, r.outcome_at as Date | null, ...r.steps.map(s => s.server_recorded_at as Date), ...r.escalations.map(x => x.fired_at as Date)]),
          e.exportLine?.exported_at as Date | undefined, ...e.billingFacts.map(x => x.server_recorded_at as Date)]);
        items.push({ jobId: e.jobId, extraId: e.id, description: e.row.description, orderReference: e.row.order_reference, rateCode: e.row.sor_code ?? null,
          clientContractId: e.row.contract_id, teamId: team, raisedAt: iso(raised), state: c.state, precedence: c.precedence, ownerRoles: [...c.ownerRoles], nextAction: c.nextAction,
          excludedMembershipIds: [...c.excludedMembershipIds], balance: c.balance, stateSince: since.toISOString(), ageSeconds: Math.max(0, Math.floor((now.getTime() - since.getTime()) / 1000)) });
      }
      items.sort((x, y) => x.precedence - y.precedence || y.ageSeconds - x.ageSeconds || (x.extraId < y.extraId ? -1 : 1));
      return extraWorkListV1.parse({ version: "extra-work-list.v1", environment: "synthetic_demo", generatedAt: now.toISOString(), items });
    });
  }

  /** F5: the contractor-only per-extra history, assembled from existing rows in time order. Fees only for the retained fee reader. */
  async claimRecord(context: VerifiedTenantContext, session: string, jobId: string, extraId: string, options: { clientContractId?: string } = {}) {
    return this.read(context, session, "claim_record", jobId, extraId, async (db, scope, facts) => {
      const e = facts.extras[0]!;
      const fees = scope.feeReader ? ((await db.$client.query<{ r: { contributions: Row[] } }>("SELECT app.cr_fee_trail($1,$2,$3) r", [session, e.jobId, e.id])).rows[0]!.r.contributions) : null;
      const history: { at: string; kind: string; ref: string; detail: Record<string, unknown> }[] = [];
      const push = (at: Date, kind: string, ref: string, detail: Record<string, unknown> = {}) => history.push({ at: at.toISOString(), kind, ref, detail });
      for (const r of [e.originRevision, e.currentRevision]) if (r && !history.some(h => h.ref === r.id)) push(r.created_at as Date, "order_revision", r.id as string, { revision: Number(r.revision), status: r.status });
      push(e.row.raised_at as Date, "raised", e.id, { kind: e.row.origin_kind });
      for (const x of e.events) push(x.server_recorded_at as Date, "event", `${e.id}:${x.sequence}`, { kind: x.kind, reasonCode: x.reason_code ?? null });
      for (const b of e.bindings) push(b.server_recorded_at as Date, "priced", b.id as string, { logicalRevision: Number(b.logical_revision), sourceKind: b.source_kind, netPence: num(b.net_pence), basis: basis(b).kind });
      for (const r of e.requests) {
        push(r.server_recorded_at as Date, "request_opened", r.id as string, { requestRevision: Number(r.request_revision), netPence: num(r.net_pence) });
        for (const s of r.steps) push(s.server_recorded_at as Date, "step_approved", `${r.id}:${s.step_index}`, { stepIndex: Number(s.step_index), role: s.step_role, actorKind: s.actor_kind });
        for (const x of r.escalations) push(x.fired_at as Date, "escalated", `${r.id}:${x.step_index}`, { stepIndex: Number(x.step_index), eligibleRoles: x.eligible_roles as string[] });
        if (r.outcome_kind) push(r.outcome_at as Date, "outcome", r.id as string, { kind: r.outcome_kind, reasonCode: r.reason_code ?? null, actorKind: r.outcome_actor_kind });
      }
      for (const k of e.links) {
        push(k.server_recorded_at as Date, "client_link_issued", k.id as string, { requestId: k.request_id });
        if (k.closed_kind) push(k.closed_at as Date, "client_link_closed", k.id as string, { kind: k.closed_kind });
      }
      for (const l of e.duplicateLinks) push(l.server_recorded_at as Date, "duplicate_link", l.id as string, { kind: l.kind, duplicateId: l.duplicate_id, canonicalId: l.canonical_id });
      if (e.exportLine) push(e.exportLine.exported_at as Date, "exported", e.exportLine.id as string, { batchId: e.exportLine.batch_id, approvedNetPence: num(e.exportLine.approved_net_pence) });
      for (const f of e.billingFacts) push(f.server_recorded_at as Date, "billing_fact", f.id as string, { factType: f.fact_type, source: f.source, invoiceNumber: f.invoice_number, matchValid: Boolean(f.match_valid) });
      for (const c of fees ?? []) push(new Date(c.recordedAt as string), "fee_contribution", `${c.derivationId}:${c.allocationId}`, { period: c.period, rule: c.rule });
      history.sort((x, y) => (x.at < y.at ? -1 : x.at > y.at ? 1 : 0));
      const groups = scope.jobs.find(j => j.jobId === e.jobId)!.duplicateGroups.filter(g => g.extras.some(x => x.extraId === e.id));
      return extraClaimRecordV1.parse({
        version: "extra-claim-record.v1", environment: "synthetic_demo", jobId: e.jobId, extraId: e.id,
        order: { originRevision: orderRevision(e, "originRevision"), currentRevision: orderRevision(e, "currentRevision") },
        origin: { kind: e.row.origin_kind, description: e.row.description, rateCode: e.row.sor_code ?? null, raisedAt: iso(e.row.raised_at), raisedByMembershipId: e.row.raising_membership_id ?? null,
          siteVisitId: e.row.site_visit_id ?? null, photoEvidenceId: e.row.evidence_id ?? null, residentConfirmationEvidenceId: e.row.resident_confirmation_evidence_id ?? null },
        pricing: e.bindings.map(b => ({ bindingId: b.id, logicalRevision: Number(b.logical_revision), sourceKind: b.source_kind, netPence: num(b.net_pence), basis: basis(b), recordedAt: iso(b.server_recorded_at) })),
        entitlement: { flags: notRecorded("CC-S2"), decisions: notRecorded("CC-S2") },
        requests: revisionsOf(e), requestEvidence: notRecorded("CC-S2"),
        duplicates: { links: e.duplicateLinks.map(l => ({ linkId: l.id, kind: l.kind, duplicateId: l.duplicate_id, canonicalId: l.canonical_id, recordedAt: iso(l.server_recorded_at) })),
          unresolvedCandidates: groups.map(g => ({ groupId: g.groupId, extras: g.extras.map(x => ({ extraId: x.extraId, description: x.description })) })) },
        billing: {
          exportLine: e.exportLine ? { exportLineId: e.exportLine.id, batchId: e.exportLine.batch_id, requestId: e.exportLine.approval_request_id, approvedNetPence: Number(e.exportLine.approved_net_pence), exportedAt: iso(e.exportLine.exported_at) } : null,
          invoiceLines: e.invoiceLines.flatMap(x => {
            const l = invoiceLine(x);
            if (!l || !x.run) return [];
            const outstanding = addExactPence(addExactPence(l.billed, exactPence(-l.credited.numerator, l.credited.denominator)), exactPence(-l.paid.numerator, l.paid.denominator));
            return [{ source: x.match.source, invoiceNumber: x.match.invoice_number, externalInvoiceLineId: x.match.external_invoice_line_id, runId: x.run.id,
              billedNet: serializeExactPence(l.billed), creditedNet: serializeExactPence(l.credited), paidNet: serializeExactPence(l.paid),
              balance: serializeExactPence(compareExactPence(outstanding, zero) < 0 ? zero : outstanding), rejected: l.rejected }];
          }),
          allocations: e.allocations.map(a => ({ allocationId: a.id, runId: a.run_id, sourceRef: a.source_ref, rule: a.rule, matchedExtraNet: { numerator: a.n, denominator: a.d }, current: Boolean(a.current) })),
          realConnection: notRecorded("D5"),
        },
        fees: fees ? { contributions: fees.map(c => ({ derivationId: c.derivationId, period: c.period, allocationId: c.allocationId, exportLineId: c.exportLineId, rule: c.rule,
          qualifyingPrincipal: c.qualifyingPrincipal, statements: c.statements })) } : notDisclosed,
        history,
      });
    }, options.clientContractId);
  }
}
