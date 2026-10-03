import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { jobPartiesCommandV1, jobPartiesCommandResultV1, jobPartiesWorkspaceV1, jobPartiesListV1, siteMatchKey } from "@jobguard/core";
import { appendAuditBatch } from "./audit.js";
import { withTenant, type TenantTransaction, type VerifiedTenantContext } from "./tenant-context.js";

export class JobPartiesError extends Error {
  constructor(readonly code: "FORBIDDEN" | "NOT_FOUND" | "INVALID_PARTIES" | "REVISION_CONFLICT" | "COMMAND_CONFLICT" | "CORRECTION_REASON_REQUIRED" | "SAME_PLACE_CONFIRMATION_REQUIRED" | "PARTY_NOT_FOUND" | "JOB_PARTIES_REQUIRED") { super(code); }
}
const normalizeUnit = (value: string) => value.normalize("NFKC").trim().toUpperCase().replace(/\s+/gu," ");
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export class JobPartiesRepository {
  constructor(private readonly pool: Pool) {}
  private async authorize(db: TenantTransaction, tenantId: string, actor: string) {
    const member = await db.$client.query(`SELECT 1 FROM app.membership WHERE tenant_id=$1 AND id=$2 AND role='owner'
      AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())`, [tenantId, actor]);
    if (!member.rowCount) throw new JobPartiesError("FORBIDDEN");
  }
  async list(context: VerifiedTenantContext, actor: string) {
    return withTenant(this.pool,context,async db=>{
      await this.authorize(db,context.tenantId,actor);
      const jobs=(await db.$client.query(`SELECT j.id,j.title,j.status,j.revision,coalesce(s.snapshot->'customer'->>'name','Details needed') AS "customerLabel",
      CASE WHEN s.snapshot IS NULL THEN 'Details needed' ELSE concat_ws(', ',s.snapshot->'site'->>'unit',s.snapshot->'site'->'addressLines'->>0,s.snapshot->'site'->>'postcode') END AS "siteLabel"
      FROM app.job j LEFT JOIN app.job_party_current x ON(x.tenant_id,x.job_id)=(j.tenant_id,j.id) LEFT JOIN app.job_party_snapshot s ON(s.tenant_id,s.binding_id)=(x.tenant_id,x.binding_id)
      WHERE j.tenant_id=$1 AND NOT EXISTS(SELECT 1 FROM app.sandbox_run r WHERE(r.tenant_id,r.job_id)=(j.tenant_id,j.id)) ORDER BY j.created_at,j.id`,[context.tenantId])).rows;
      return jobPartiesListV1.parse({version:"job-parties-list.v1",environment:"synthetic_demo",jobs});
    });
  }
  async view(context: VerifiedTenantContext, actor: string, jobId: string) {
    return withTenant(this.pool, context, async db => {
      await this.authorize(db, context.tenantId, actor);
      const j = (await db.$client.query<{ revision: number; status: string; snapshot: unknown }>(`SELECT j.revision,j.status,s.snapshot FROM app.job j LEFT JOIN app.job_party_current x ON(x.tenant_id,x.job_id)=(j.tenant_id,j.id) LEFT JOIN app.job_party_snapshot s ON(s.tenant_id,s.binding_id)=(x.tenant_id,x.binding_id) WHERE j.tenant_id=$1 AND j.id=$2`, [context.tenantId, jobId])).rows[0];
      if (!j) throw new JobPartiesError("NOT_FOUND");
      const current = j.snapshot ?? null;
      const customers = (await db.$client.query(`SELECT DISTINCT ON(customer_id) customer_id AS id,id AS "revisionId",revision,payload AS customer FROM app.customer_revision WHERE tenant_id=$1 ORDER BY customer_id,revision DESC`, [context.tenantId])).rows;
      const sites = (await db.$client.query(`SELECT DISTINCT ON(site_id) site_id AS id,id AS "revisionId",payload AS site,match_key::text AS "matchKey" FROM app.site_revision WHERE tenant_id=$1 ORDER BY site_id,revision DESC`, [context.tenantId])).rows;
      const recognition = (await db.$client.query(`SELECT r.job_id AS "jobId",r.status,r.started_at::text AS "startedAt",r.ended_at::text AS "endedAt" FROM app.job_party_recognition r JOIN app.job_party_recognition own ON(own.tenant_id,own.customer_id,own.site_id)=(r.tenant_id,r.customer_id,r.site_id) WHERE own.tenant_id=$1 AND own.job_id=$2 ORDER BY r.job_id`, [context.tenantId, jobId])).rows;
      return jobPartiesWorkspaceV1.parse({ version: "job-parties-workspace.v1", environment: "synthetic_demo", jobId, jobRevision: j.revision, status: j.status, current, customers, sites, recognition, realExternalActions: 0 });
    });
  }
  async command(context: VerifiedTenantContext, actor: string, jobId: string, raw: unknown) {
    const parsed = jobPartiesCommandV1.safeParse(raw);
    if (!parsed.success) throw new JobPartiesError("INVALID_PARTIES");
    const input = parsed.data, requestHash = digest({ jobId, input });
    try {
      return await withTenant(this.pool, context, async db => {
        await this.authorize(db, context.tenantId, actor);
        if (!(await db.$client.query(`SELECT 1 FROM app.job WHERE tenant_id=$1 AND id=$2`, [context.tenantId, jobId])).rowCount) throw new JobPartiesError("NOT_FOUND");
        const claim = await db.$client.query(`INSERT INTO app.command_receipt(command_id,tenant_id,command_type,semantic_key,request_hash,status,actor_membership_id)
          VALUES($1,$2,'job.parties',$5,$3,'processing',$4) ON CONFLICT DO NOTHING RETURNING command_id`, [input.commandId, context.tenantId, requestHash, actor, input.commandId]);
        if (!claim.rowCount) {
          const prior = (await db.$client.query(`SELECT request_hash,status,result FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2`, [context.tenantId, input.commandId])).rows[0];
          if (!prior || prior.request_hash !== requestHash || prior.status !== "succeeded") throw new JobPartiesError("COMMAND_CONFLICT");
          return jobPartiesCommandResultV1.parse(prior.result);
        }
        let result: Record<string, unknown>;
        if (input.action === "create_customer" || input.action === "revise_customer") {
          const id = input.action === "create_customer" ? randomUUID() : input.customerId;
          if (input.action === "create_customer") await db.$client.query(`INSERT INTO app.customer(tenant_id,id) VALUES($1,$2)`, [context.tenantId, id]);
          else {
            const current = (await db.$client.query(`SELECT max(revision)::int AS revision FROM app.customer_revision WHERE tenant_id=$1 AND customer_id=$2`, [context.tenantId, id])).rows[0]?.revision;
            if (current !== input.expectedRevision) throw new JobPartiesError("REVISION_CONFLICT");
          }
          const revisionId = randomUUID(), revision = input.action === "create_customer" ? 1 : input.expectedRevision + 1;
          await db.$client.query(`INSERT INTO app.customer_revision(tenant_id,id,customer_id,revision,payload) VALUES($1,$2,$3,$4,$5)`, [context.tenantId, revisionId, id, revision, JSON.stringify(input.customer)]);
          result = { id, revisionId, revision };
        } else if (input.action === "create_site") {
          const key = siteMatchKey(input.site);
          if (input.reuseSiteId) {
            if (!input.confirmSamePlace) throw new JobPartiesError("SAME_PLACE_CONFIRMATION_REQUIRED");
            const old = (await db.$client.query(`SELECT site_id AS id,id AS "revisionId",payload FROM app.site_revision WHERE tenant_id=$1 AND site_id=$2 ORDER BY revision DESC LIMIT 1`, [context.tenantId, input.reuseSiteId])).rows[0];
            if (!old || normalizeUnit(old.payload.unit ?? "") !== normalizeUnit(input.site.unit ?? "")) throw new JobPartiesError("PARTY_NOT_FOUND");
            result = { id: old.id, revisionId: old.revisionId, reused: true };
          } else {
            const id = randomUUID(), revisionId = randomUUID();
            await db.$client.query(`INSERT INTO app.site(tenant_id,id) VALUES($1,$2)`, [context.tenantId, id]);
            await db.$client.query(`INSERT INTO app.site_revision(tenant_id,id,site_id,revision,payload,match_key) VALUES($1,$2,$3,1,$4,$5)`, [context.tenantId, revisionId, id, JSON.stringify(input.site), key]);
            result = { id, revisionId, reused: false };
          }
        } else {
          const id = randomUUID();
          await db.$client.query(`SELECT app.bind_job_parties($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [context.tenantId, jobId, id, input.expectedJobRevision, input.parties.customerRevisionId, input.parties.payingPartyRevisionId, input.parties.siteRevisionId, input.action === "correct", input.reason ?? null, actor, input.commandId]);
          result = { id, revision: input.expectedJobRevision + 1 };
        }
        result = jobPartiesCommandResultV1.parse({ ...result, version:"job-parties-command-result.v1", environment: "synthetic_demo", commandId: input.commandId, realExternalActions: 0 });
        // Finish domain/receipt writes before taking the audit head: no later business locks.
        await db.$client.query(`UPDATE app.command_receipt SET status='succeeded',result=$3::jsonb,completed_at=clock_timestamp() WHERE tenant_id=$1 AND command_id=$2`, [context.tenantId, input.commandId, JSON.stringify(result)]);
        await appendAuditBatch(db, [{ id: randomUUID(), version: "audit.v1", actorRef: `membership:${actor}`, eventType: `job.parties.${input.action}`, subjectType: "job", subjectRef: jobId,
          payload: { references: { commandId: input.commandId, identityId: String(result.id) }, hashes: { request: requestHash }, classifications: { action: "operational" } } }]);
        return result;
      });
    } catch (error) {
      if (error instanceof JobPartiesError) throw error;
      const dbError = error as { code?: string; message?: string };
      if (dbError.message?.includes("CORRECTION_REASON_REQUIRED")) throw new JobPartiesError("CORRECTION_REASON_REQUIRED");
      if (dbError.code === "40001" || dbError.code === "23505") throw new JobPartiesError("REVISION_CONFLICT");
      if (dbError.code === "23503") throw new JobPartiesError("PARTY_NOT_FOUND");
      if (dbError.code === "42501") throw new JobPartiesError("FORBIDDEN");
      if (dbError.code === "P0002") throw new JobPartiesError("NOT_FOUND");
      throw error;
    }
  }
}
