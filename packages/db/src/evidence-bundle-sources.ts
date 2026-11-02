import { z } from 'zod';
import { dashboardCanonical as canonical, standaloneEvidencePackV3, verifyStandalonePackV3, type EvidenceSource } from '@jobguard/core';
import type { PrivateVersionedStorage } from '@jobguard/storage';
import type { TenantTransaction, AuthenticatedMembership } from './tenant-context.js';
import { loadExtraEvidenceSources, type ExtraEvidenceSources } from './extra-evidence-pack-sources.js';
import { assembleExtraSourcePack } from './extra-evidence-pack-repository.js';
import { loadEvidencePackSources } from './evidence-pack-sources.js';
import { bundleHash, EvidenceBundleError, type EvidenceBundleSource } from './evidence-bundle.js';
import type { BillingProjection } from './contractor-billing-repository.js';

const query = z.object({ version: z.literal('contractor-bundle-query.v1'), jobId: z.string().uuid(), extraId: z.string().uuid(), requestId: z.string().uuid() }).strict();
type Owner = { tenantId: string; jobId: string; subjectId: string; scopeItemId: string | null };
const pin = (s: EvidenceBundleSource) => ({ sourceId: s.sourceId, sourceVersion: s.sourceVersion, objectVersion: s.objectVersion, sha256: s.sha256 });
const fail = () => { throw new EvidenceBundleError(); };
function source(owner: Owner, id: string, kind: EvidenceBundleSource['kind'], content: string, version = bundleHash(content)): EvidenceBundleSource {
  return { ...owner, sourceId: id, kind, content, sourceVersion: version, objectVersion: `database-record:${bundleHash(content)}`, sha256: bundleHash(content), links: [] };
}
const legacyKind = { accepted_quote: 'accepted_quote', approval: 'approval', proof: 'proof', variation: 'variation', invoice: 'invoice', recovery_case: 'case_history', supplier_agreement: 'order', supplier_delivery: 'delivery', supplier_invoice: 'invoice' } as const;
function legacy(owner: Owner, records: EvidenceSource[]) {
  const sources = records.map(s => {
    if (s.jobId !== owner.jobId) return fail();
    return source(owner, s.sourceId, s.sourceId.startsWith('extra_origin:') ? 'origin' : legacyKind[s.kind], s.content, String(s.version));
  });
  records.forEach((record, index) => {
    if (!record.redactedFrom) return;
    const from = record.redactedFrom;
    const original = sources.find(s => s.sourceId === from.sourceId && s.sourceVersion === String(from.version) && s.sha256 === from.hash);
    if (!original) return fail();
    sources[index]!.links = [pin(original)];
  });
  return sources;
}
/** Existing recovery joins remain authoritative. Explicit selections are returned separately from the internal dependency pool; no default bank export. */
export async function loadRecoveryBundleSources(tx: TenantTransaction, tenantId: string, caseId: string, selectedSourceIds: string[]) {
  await tx.$client.query("SET LOCAL TIME ZONE 'UTC'");
  const loaded = await loadEvidencePackSources(tx, tenantId, caseId);
  if (new Set(selectedSourceIds).size !== selectedSourceIds.length) return fail();
  const owner = { tenantId, jobId: loaded.jobId, subjectId: caseId, scopeItemId: null };
  const ordinary = legacy(owner, loaded.sources);
  // Only allocations for this case, not an account feed. Keep reversals alongside the immutable landing facts.
  const landings = (await tx.$client.query<{ id: string; content: string; receipt: string; receipt_id: string; proof: string; evidence_id: string; valid: boolean }>(`
    SELECT a.id,row_to_json(a)::text content,a.receipt_id,a.evidence_id,
      json_build_object('id',r.id,'job_id',r.job_id,'status',r.status,'gross_pence',r.gross_pence,'currency',r.currency,'settled_at',r.settled_at)::text receipt,
      json_build_object('id',e.id,'scope_item_id',e.scope_item_id,'sha256',e.sha256,'byte_length',e.byte_length,'object_version_id',e.object_version_id)::text proof,
      (e.id IS NOT NULL AND e.kind='original' AND r.status IN('settled','reversed')
        AND EXISTS(SELECT 1 FROM app.evidence_upload u WHERE(u.tenant_id,u.job_id,u.id,u.object_version_id)=(e.tenant_id,e.job_id,e.upload_id,e.object_version_id) AND u.state='verified')
        AND a.gross_pence<=r.gross_pence AND a.eligible_net_pence<=a.gross_pence
        AND (SELECT sum(x.gross_pence) FROM app.landing_allocation x WHERE(x.tenant_id,x.receipt_id)=(a.tenant_id,a.receipt_id))<=r.gross_pence
        AND NOT EXISTS(SELECT 1 FROM app.evidence_invalidation x WHERE(x.tenant_id,x.evidence_id)=(e.tenant_id,e.id))) valid
    FROM app.landing_allocation a
    JOIN app.synthetic_recovery_receipt r ON(r.tenant_id,r.job_id,r.id)=(a.tenant_id,a.job_id,a.receipt_id)
    LEFT JOIN app.evidence_object e ON(e.tenant_id,e.job_id,e.id)=(a.tenant_id,a.job_id,a.evidence_id)
    WHERE(a.tenant_id,a.job_id,a.case_id)=($1,$2,$3) ORDER BY a.id`, [tenantId, loaded.jobId, caseId])).rows;
  for (const a of landings) {
    if (!a.valid) return fail();
    const proof = source(owner, `landing_proof:${a.evidence_id}`, 'proof', a.proof);
    const receipt = source(owner, `landing_receipt:${a.receipt_id}`, 'landed_money', a.receipt);
    const allocation = { ...source(owner, `landing_allocation:${a.id}`, 'landed_money', a.content), links: [pin(proof), pin(receipt)] };
    for (const record of [proof, receipt, allocation]) if (!ordinary.some(s => s.sourceId === record.sourceId)) ordinary.push(record);
    const reversed = (await tx.$client.query<{ id: string; content: string }>(`SELECT id,row_to_json(r)::text content FROM app.landing_reversal r
      WHERE(tenant_id,job_id,allocation_id)=($1,$2,$3) ORDER BY id`, [tenantId, loaded.jobId, a.id])).rows;
    for (const r of reversed) ordinary.push({ ...source(owner, `landing_reversal:${r.id}`, 'landed_money', r.content), links: [pin(allocation)] });
  }
  // Dependencies stay in the internal material pool for hash/version joins, but only the requested records are exported.
  for (const id of selectedSourceIds) if (!ordinary.some(s => s.sourceId === id)) return fail();
  return { sources: ordinary, selectedSourceIds, omissions: loaded.omissions };
}
export type ContractorBundleSources = { owner: Owner; ordinary: ExtraEvidenceSources; sources: EvidenceBundleSource[]; absentSections: ('export' | 'invoice' | 'payment')[] };

/** Internal snapshot reader. Call inside withEvidencePackV3Snapshot; existing current member/grant authority is checked before subject lookup. No hidden relation is queried. */
export async function loadContractorBundleSources(tx: TenantTransaction, actor: AuthenticatedMembership, raw: unknown): Promise<ContractorBundleSources> {
  const parsed = query.safeParse(raw); if (!parsed.success) return fail();
  const i = parsed.data;
  await tx.$client.query("SET LOCAL TIME ZONE 'UTC'");
  const allowed = (await tx.$client.query<{ tenant: string }>(`SELECT nullif(current_setting('app.tenant_id',true),'')::uuid::text tenant
    WHERE current_database()='jobguard_synthetic_demo'
    AND nullif(current_setting('app.tenant_id',true),'')::uuid=$1
    AND app.contractor_job_allowed($2,'job.read',$3)`, [actor.tenantId, actor.membershipId, i.jobId])).rows[0];
  if (!allowed) return fail();
  const ordinary = await loadExtraEvidenceSources(tx, { version: 'extra-source-query.v1', jobId: i.jobId, extraId: i.extraId });
  const values = [allowed.tenant, i.jobId, i.extraId, i.requestId];
  const found = (await tx.$client.query<{ scope_item_id: string; request: string; binding: string; revision: string; origin: string; net: string; hash: string; requirement: { steps: { role: string }[] } }>(`
    SELECT v.scope_item_id,row_to_json(q)::text request,row_to_json(b)::text binding,
      coalesce(row_to_json(r)::text,row_to_json(s)::text) revision,row_to_json(o)::text origin,
      q.net_pence::text net,q.revision_hash::text hash,q.requirement
    FROM app.extra_approval_request q
    JOIN app.variation v ON(v.tenant_id,v.job_id,v.id)=(q.tenant_id,q.job_id,q.variation_id)
    JOIN app.extra_origin o ON(o.tenant_id,o.job_id,o.variation_id)=(q.tenant_id,q.job_id,q.variation_id)
    JOIN app.extra_approval_revision_binding b ON(b.tenant_id,b.job_id,b.variation_id,b.id)=(q.tenant_id,q.job_id,q.variation_id,q.binding_id)
    LEFT JOIN app.variation_revision r ON(r.tenant_id,r.job_id,r.variation_id,r.id,r.content_hash,r.signed_delta_pence)=(b.tenant_id,b.job_id,b.variation_id,b.variation_revision_id,q.revision_hash,q.net_pence) AND r.scope_item_id=v.scope_item_id
    LEFT JOIN app.extra_sor_revision s ON(s.tenant_id,s.job_id,s.variation_id,s.id,s.content_hash,s.net_pence)=(b.tenant_id,b.job_id,b.variation_id,b.sor_revision_id,q.revision_hash,q.net_pence)
    WHERE (q.tenant_id,q.job_id,q.variation_id,q.id)=($1,$2,$3,$4)
      AND b.source_hash=q.revision_hash AND (r.id IS NOT NULL OR s.id IS NOT NULL)
      AND NOT EXISTS(SELECT 1 FROM app.extra_approval_request n WHERE n.tenant_id=q.tenant_id AND n.variation_id=q.variation_id AND n.request_revision>q.request_revision)
      AND NOT EXISTS(SELECT 1 FROM app.extra_approval_revision_binding n WHERE n.tenant_id=b.tenant_id AND n.variation_id=b.variation_id AND n.logical_revision>b.logical_revision)
      AND (SELECT kind FROM app.extra_event e WHERE(e.tenant_id,e.job_id,e.variation_id)=(q.tenant_id,q.job_id,q.variation_id) ORDER BY sequence DESC LIMIT 1)='approved'`, values)).rows[0];
  if (!found || !/^[1-9][0-9]*$/u.test(found.net) || BigInt(found.net) > 1_000_000_000_000n) return fail();
  const owner = { tenantId: allowed.tenant, jobId: i.jobId, subjectId: i.extraId, scopeItemId: found.scope_item_id };
  const requestSource = source(owner, `extra_approval_request:${i.requestId}`, 'approval', found.request);
  const b = JSON.parse(found.binding), r = JSON.parse(found.revision);
  if (b.source_revision_id !== r.id) return fail();
  const revision = source(owner, `${b.source_kind === 'ordinary' ? 'variation_revision' : 'extra_sor_revision'}:${r.id}`, 'variation', found.revision);
  const binding = source(owner, `extra_approval_revision_binding:${b.id}`, 'approval', found.binding);
  binding.links = [pin(revision)]; requestSource.links = [pin(binding)];
  const sources = [revision, binding, requestSource];
  const facts = (await tx.$client.query<{ id: string; content: string; step_index: number; step_role: string; approved_hash: string; approved_net_pence: string }>(`
    SELECT id,row_to_json(f)::text content,step_index,step_role,approved_hash::text,approved_net_pence::text
    FROM app.extra_approval_step_fact f WHERE(tenant_id,job_id,variation_id,request_id)=($1,$2,$3,$4) ORDER BY step_index`, values)).rows;
  if (facts.length !== found.requirement.steps.length || facts.some((f, index) => f.step_index !== index || f.step_role !== found.requirement.steps[index]?.role || f.approved_hash !== found.hash || f.approved_net_pence !== found.net)) return fail();
  for (const f of facts) sources.push({ ...source(owner, `extra_approval_step_fact:${f.id}`, 'approval', f.content), links: [pin(requestSource)] });
  const outcomes = (await tx.$client.query<{ id: string; content: string; kind: string }>(`SELECT id,row_to_json(o)::text content,kind FROM app.extra_approval_outcome o WHERE(tenant_id,job_id,variation_id,request_id)=($1,$2,$3,$4)`, values)).rows;
  if (outcomes.length !== 1 || outcomes[0]!.kind !== 'approved') return fail();
  sources.push({ ...source(owner, `extra_approval_outcome:${outcomes[0]!.id}`, 'approval', outcomes[0]!.content), links: facts.map(f => pin(sources.find(s => s.sourceId === `extra_approval_step_fact:${f.id}`)!)) });
  const exports = (await tx.$client.query<{ id: string; content: string }>(`SELECT id,row_to_json(l)::text content FROM app.billing_export_line l
    WHERE(tenant_id,job_id,extra_id,approval_request_id)=($1,$2,$3,$4)`, values)).rows;
  const absentSections: ContractorBundleSources['absentSections'] = [];
  if (!exports.length) absentSections.push('export', 'invoice', 'payment');
  for (const e of exports) {
    const exported = JSON.parse(e.content);
    if (exported.scope_item_id !== owner.scopeItemId || exported.revision_id !== r.id || exported.revision_hash !== found.hash ||
      String(exported.approved_net_pence) !== found.net || exported.approval_binding_id !== b.id) return fail();
    sources.push({ ...source(owner, `billing_export_line:${e.id}`, 'export', e.content), links: [pin(requestSource), pin(revision)] });
    // Full invoices/remittances may contain other jobs. Export only this line of each immutable allocation run,
    // including predecessor and reversal allocations. The whole-record digest remains a version commitment.
    const runs = (await tx.$client.query<{ id: string; predecessor_id: string | null; record_hash: string; line_id: string; projection: BillingProjection }>(`
      SELECT r.id,r.predecessor_id,encode(sha256(convert_to(row_to_json(r)::text,'UTF8')),'hex') record_hash,m.external_invoice_line_id line_id,r.projection
      FROM app.billing_line_match m JOIN app.billing_fact f ON(f.tenant_id,f.job_id,f.client_contract_id,f.id)=(m.tenant_id,m.job_id,m.client_contract_id,m.fact_id)
      JOIN app.billing_allocation_run r ON(r.tenant_id,r.job_id,r.client_contract_id,r.source,r.invoice_number)=(f.tenant_id,f.job_id,f.client_contract_id,f.source,f.invoice_number)
      WHERE(m.tenant_id,m.line_job_id,m.export_line_id)=($1,$2,$3) ORDER BY r.server_recorded_at,r.id`, [owner.tenantId, owner.jobId, e.id])).rows;
    if (!runs.length) { absentSections.push('invoice', 'payment'); continue; }
    for (const run of runs) {
      const content = projectBundleBillingLine(run);
      const line = run.projection.lines.find(l => l.lineId === run.line_id)!;
      sources.push(source(owner, `billing_allocation_run:${run.id}:${run.line_id}`, 'payment', content, run.record_hash));
      sources.push(source(owner, `billing_invoice_line:${run.id}:${run.line_id}`, 'invoice', canonical({ originalRecordHash: run.record_hash, line }), run.record_hash));
    }
  }
  return { owner, ordinary, sources, absentSections: [...new Set(absentSections)] };
}
/** Storage I/O is after the snapshot transaction commits; reuse the accepted exact-version/hash/length reader. */
export async function hydrateContractorBundleSources(loaded: ContractorBundleSources, storage: PrivateVersionedStorage) {
  const pack = await assembleExtraSourcePack(loaded.ordinary, storage);
  const ordinary = legacy(loaded.owner, pack.integrity.sources).filter(s => !loaded.sources.some(existing => existing.sourceId === s.sourceId));
  return [...ordinary, ...loaded.sources];
}
/** CH-8's envelope owns lock/capture identity. This conversion does not query shadow data or grant disclosure. */
export function smallBuilderBundleMaterial(text: string) {
  const report = verifyStandalonePackV3(text);
  if (!report.contentMatches || report.producerBindings !== 'synthetic-records') return fail();
  const pack = standaloneEvidencePackV3.parse(JSON.parse(text)), m = pack.manifest;
  const owner = { tenantId: m.tenantId, jobId: m.jobId, subjectId: m.caseId, scopeItemId: null };
  const sources = pack.sources.map(s => ({ ...source(owner, s.sourceId, s.kind === 'ordinary' ? 'case_history' : s.kind === 'attribution_revision' ? 'attribution' : s.kind, s.content, s.sourceVersion),
    objectVersion: s.objectVersion, links: s.links.map(l => ({ sourceId: l.sourceId, sourceVersion: l.sourceVersion, objectVersion: l.objectVersion, sha256: l.contentHash })) }));
  if (m.lifecycle.state === 'pre_lock') return { owner, sources, lifecycle: { state: 'pre_lock' as const }, absentSections: [] };
  const lock = sources.find(s => s.kind === 'lock'), capture = sources.find(s => s.kind === 'capture_snapshot');
  if (!lock || !capture) return fail();
  // Every downstream section is bound to the same immutable lock/capture snapshot, never today's working bill.
  for (const s of sources.filter(s => s.kind !== 'lock' && s.kind !== 'capture_snapshot' && s.kind !== 'case_history')) s.links = [...new Map([...s.links, pin(lock), pin(capture)].map(l => [canonical(l), l])).values()];
  return { owner, sources, lifecycle: { state: 'post_lock' as const, lock: pin(lock), captureSnapshot: pin(capture) },
    absentSections: m.sections.filter(s => s.status === 'absent').map(s => s.kind === 'attribution_revision' ? 'attribution' as const : s.kind) };
}

/** A derived projection, not an original invoice or a new money computation. Preserve exact fractions and signed reversals. */
export function projectBundleBillingLine(run: { id: string; predecessor_id: string | null; record_hash: string; line_id: string; projection: BillingProjection }): string {
  const lines = run.projection.lines.filter(l => l.lineId === run.line_id);
  if (lines.length !== 1) return fail();
  return canonical({ version: 'bundle-billing-line-projection.v1', originalRecordHash: run.record_hash, runId: run.id,
    predecessorId: run.predecessor_id, line: lines[0], allocations: run.projection.allocations.map(a => ({
      sourceRef: a.sourceRef, originalSourceRef: a.originalSourceRef, lines: a.lines.filter(l => l.lineId === run.line_id),
    })).filter(a => a.lines.length) });
}
