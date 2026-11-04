import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { acceptRateSuggestion, recentRateBaseline, MAX_MONEY_PENCE, type RateObservationInput } from "@jobguard/core";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";

const uuid = z.guid().transform(value => value.toLowerCase());
const label = z.string().trim().min(1).max(100).transform(value => value.toLowerCase());
const digest = z.string().regex(/^[a-f0-9]{64}$/u);
export const storedRateQueryV1 = z.object({ version: z.literal("rate-query.v1"), asOf: z.iso.datetime({ offset: true }).transform(value => new Date(value).toISOString()),
  unit: label, taxBasis: label, category: label, region: label }).strict();
export const storedRateAcceptanceV1 = z.object({ version: z.literal("rate-suggestion-accept.v1"), commandId: uuid,
  query: storedRateQueryV1, jobId: uuid, scopeItemId: uuid, currentRevisionId: uuid,
  acceptedRatePence: z.number().int().min(0).max(MAX_MONEY_PENCE), baselineHash: digest }).strict();
const acceptanceResult = z.object({ id: uuid, actorId: uuid, recordHash: digest, provenance: z.literal("suggestion_accepted") }).strict();
const humanActor = z.object({ kind: z.literal("human"), sessionDigest: digest }).strict();
const storedAcceptancesV1 = z.array(z.object({
  id: uuid, jobId: uuid, scopeItemId: uuid, previousRevisionId: uuid,
  acceptedRatePence: z.number().int().min(0).max(MAX_MONEY_PENCE),
  unit: label, taxBasis: label, category: label, region: label, actorId: uuid,
  acceptedAt: z.iso.datetime(), recordHash: digest, baselineHash: digest,
  policyVersion: z.literal("rate-baseline.v1"), provenance: z.literal("suggestion_accepted"), environment: z.literal("synthetic_demo"),
  sources: z.array(z.object({ observationId: uuid, jobId: uuid, scopeItemId: uuid,
    sourceScopeRevisionId: uuid, provenance: z.enum(["entered", "suggestion_accepted"]) }).strict()).min(3),
}).strict());
const observationSql = `SELECT coalesce(jsonb_agg(jsonb_build_object(
 'version','rate-observation.v1','id',o.id,'tenantId',o.tenant_id,'jobId',o.job_id,
 'scopeItemId',o.scope_item_id,'sourceScopeRevisionId',o.source_scope_revision_id,
 'effectiveAt',to_char(o.effective_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
 'unit',o.unit,'ratePrincipalPence',o.rate_principal_pence,'currency',o.currency,
 'taxBasis',o.tax_basis,'category',o.category,'region',o.region,'provenance',o.provenance,'kind','rate',
 'traced',r.id IS NOT NULL AND i.state='confirmed' AND r.unit=o.unit AND r.unit_price_pence=o.rate_principal_pence
 ) ORDER BY o.id),'[]'::jsonb) AS observations
 FROM app.rate_book_observation o
 LEFT JOIN app.scope_revision r ON (r.tenant_id,r.job_id,r.scope_item_id,r.id)=
 (o.tenant_id,o.job_id,o.scope_item_id,o.source_scope_revision_id)
 LEFT JOIN app.scope_identity i ON (i.tenant_id,i.job_id,i.id)=(o.tenant_id,o.job_id,o.scope_item_id)
 WHERE o.tenant_id=$1`;
/** Read only immutable M1 observations: acceptance rows deliberately never enter this query. */
async function storedBaseline(db: PoolClient, tenantId: string, raw: unknown) {
  const query = recentRateBaseline({ ...storedRateQueryV1.parse(raw), tenantId }, []).query;
  const { rows } = await db.query<{ observations: (RateObservationInput & { traced: boolean })[]; baseline_hash: string }>(
    `WITH stored AS (${observationSql}) SELECT observations,
     encode(sha256(convert_to(jsonb_build_object('policyVersion','rate-baseline.v1','query',$2::jsonb,'observations',observations)::text,'UTF8')),'hex') baseline_hash FROM stored`,
    [tenantId, JSON.stringify(query)]);
  const stored = rows[0]!;
  const untraced = stored.observations.filter(row => !row.traced).map(row => ({ observationId: row.id, reason: "untraced_source" as const }));
  const traced = stored.observations.filter(row => row.traced).map(({ traced: _traced, ...row }) => row);
  const sourceFingerprints = new Map<string, string>(), conflicts = new Set<string>();
  for (const row of traced) {
    const fingerprint = JSON.stringify({ ...row, id: undefined });
    const previous = sourceFingerprints.get(row.sourceScopeRevisionId);
    if (previous !== undefined && previous !== fingerprint) conflicts.add(row.sourceScopeRevisionId);
    sourceFingerprints.set(row.sourceScopeRevisionId, fingerprint);
  }
  const conflicting = traced.filter(row => conflicts.has(row.sourceScopeRevisionId))
    .map(row => ({ observationId: row.id, reason: "conflicting_source_revision" as const }));
  const baseline = recentRateBaseline(query, traced.filter(row => !conflicts.has(row.sourceScopeRevisionId)));
  return { ...baseline, exclusions: [...baseline.exclusions, ...untraced, ...conflicting], baselineHash: stored.baseline_hash };
}

/** Dark persistence seam. No application composition or provider actions. */
export class RateSuggestionRepository {
  constructor(private readonly pool: Pool) {}
  async read(context: VerifiedTenantContext, query: unknown) {
    storedRateQueryV1.parse(query);
    return withTenant(this.pool, context, db => storedBaseline(db.$client, context.tenantId, query));
  }
  async readAcceptances(context: VerifiedTenantContext, actor: unknown, rawJobId: unknown) {
    const person = humanActor.parse(actor), jobId = uuid.parse(rawJobId);
    return withTenant(this.pool, context, async db => {
      const rows = storedAcceptancesV1.parse((await db.$client.query<{ result: unknown }>(
        "SELECT app.read_rate_suggestion_acceptances($1,$2) result", [person.sessionDigest, jobId])).rows[0]!.result);
      if (rows.some(row => row.jobId !== jobId)) throw new Error("INVALID_ACCEPTANCE_HISTORY");
      return rows;
    });
  }
  async accept(context: VerifiedTenantContext, actor: unknown, raw: unknown) {
    const person = humanActor.parse(actor), input = storedRateAcceptanceV1.parse(raw);
    return withTenant(this.pool, context, async db => {
      // Same tenant-wide lock in SQL: serializes command replay and target acceptance races.
      await db.$client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`rate-suggestion:${context.tenantId}`]);
      const baseline = await storedBaseline(db.$client, context.tenantId, input.query);
      // SQL rechecks authority even on replay and independently recomputes the rate.
      const result = acceptanceResult.parse((await db.$client.query<{ result: { id: string; actorId: string; recordHash: string; provenance: "suggestion_accepted" } }>(
        "SELECT app.accept_rate_suggestion($1,$2,$3::jsonb) result",
        [context.tenantId, person.sessionDigest, JSON.stringify({ ...input, query: baseline.query })])).rows[0]!.result);
      // Replays survive later observations. New writes must also satisfy the pure core proposal.
      if (baseline.baselineHash === input.baselineHash) acceptRateSuggestion({ ...baseline, exclusions: [] }, {
        version: "rate-acceptance-proposal.v1", tenantId: context.tenantId, currentRevisionId: input.currentRevisionId,
        newRevisionId: result.id, scopeItemId: input.scopeItemId, actorId: result.actorId, acceptedRatePence: input.acceptedRatePence });
      return result;
    });
  }
}
