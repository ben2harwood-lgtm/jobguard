import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { jobPartiesSnapshotV1, preventionCommandV1, preventionCommandResultV1, preventionViewV1, preventionResultV1,
  preventionCompanyEligible, PreventionCheckError, PREVENTION_COMPANY_ELIGIBILITY_REFERENCE,
  type PreventionKind, type PreventionResultV1, type JobPartiesSnapshotV1 } from "@jobguard/core";
import { appendAuditBatch } from "./audit.js";
import { withTenant, type TenantTransaction, type VerifiedTenantContext } from "./tenant-context.js";
import { practiceOwnedJobsSql } from "./practice-session.js";
import { preventionRegisterFixtures, PREVENTION_FIXTURE_ID } from "./prevention-register-fixtures.js";

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const propertyKinds: readonly PreventionKind[] = ["listed_building", "conservation_area", "article_4", "planning_history", "flood"];
type PartiesRow = { snapshot: unknown; created_at: Date };

export class PreventionCheckRepository {
  constructor(private readonly pool: Pool) {}
  private syntheticOnly() { if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new PreventionCheckError("SYNTHETIC_ONLY"); }
  private async authorize(db: TenantTransaction, tenant: string, actor: string, job: string, practiceDigest?: string) {
    if (!(await db.$client.query(`SELECT 1 FROM app.membership WHERE tenant_id=$1 AND id=$2 AND role='owner'
      AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())`, [tenant,actor])).rowCount) throw new PreventionCheckError("FORBIDDEN");
    if (!(await db.$client.query(`${practiceOwnedJobsSql("$3")} SELECT 1 FROM app.job WHERE tenant_id=$1 AND id=$2
      AND ($3::text IS NULL OR id IN (SELECT id FROM practice_owned_job))`, [tenant,job,practiceDigest??null])).rowCount) throw new PreventionCheckError("NOT_FOUND");
  }
  private async parties(db: TenantTransaction, tenant: string, job: string): Promise<{ snapshot: JobPartiesSnapshotV1; savedAt: string } | null> {
    const row = (await db.$client.query<PartiesRow>(`SELECT s.snapshot,b.created_at FROM app.job_party_current c
      JOIN app.job_party_binding b ON(b.tenant_id,b.job_id,b.id)=(c.tenant_id,c.job_id,c.binding_id)
      JOIN app.job_party_snapshot s ON(s.tenant_id,s.job_id,s.binding_id)=(b.tenant_id,b.job_id,b.id)
      WHERE c.tenant_id=$1 AND c.job_id=$2`, [tenant,job])).rows[0];
    return row ? { snapshot: jobPartiesSnapshotV1.parse(row.snapshot), savedAt: row.created_at.toISOString() } : null;
  }
  private async watch(db: TenantTransaction, tenant: string, job: string, binding: string) {
    const row = (await db.$client.query<{ kind: string; watch_revision: number }>(`SELECT kind,watch_revision FROM app.counterparty_check
      WHERE tenant_id=$1 AND job_id=$2 AND binding_id=$3 AND kind IN('watch_start','watch_stop') ORDER BY watch_revision DESC LIMIT 1`, [tenant,job,binding])).rows[0];
    return { enabled: row?.kind === "watch_start", revision: row?.watch_revision ?? 0 };
  }
  private async viewIn(db: TenantTransaction, tenant: string, job: string) {
    const retrievedAt = (await db.$client.query<{ retrieved_at: Date }>("SELECT clock_timestamp() retrieved_at")).rows[0]!.retrieved_at.toISOString();
    const saved = await this.parties(db,tenant,job), current = saved?.snapshot ?? null;
    let property: PreventionResultV1[] = [], company: PreventionResultV1 | null = null;
    let watch = { enabled: false, revision: 0, results: [] as PreventionResultV1[] };
    if (current) {
      property = (await db.$client.query<{ result: unknown }>(`SELECT DISTINCT ON(kind) result FROM app.property_constraint_fact
        WHERE tenant_id=$1 AND job_id=$2 AND binding_id=$3 ORDER BY kind,created_at DESC,id DESC`, [tenant,job,current.bindingId])).rows.map(row=>preventionResultV1.parse(row.result));
      if (preventionCompanyEligible(current.customer)) {
        const result = (await db.$client.query<{ result: unknown }>(`SELECT result FROM app.counterparty_check WHERE tenant_id=$1 AND job_id=$2 AND binding_id=$3 AND kind='company' ORDER BY created_at DESC,id DESC LIMIT 1`, [tenant,job,current.bindingId])).rows[0];
        company = result ? preventionResultV1.parse(result.result) : null;
        watch = { ...await this.watch(db,tenant,job,current.bindingId), results: [] };
        if (watch.enabled) watch.results = (await db.$client.query<{ result: unknown }>(`SELECT DISTINCT ON(kind) result FROM app.counterparty_check
          WHERE tenant_id=$1 AND job_id=$2 AND binding_id=$3 AND watch_revision=$4 AND kind IN('companies_house_feed','gazette_feed') ORDER BY kind,created_at DESC,id DESC`, [tenant,job,current.bindingId,watch.revision])).rows.map(row=>preventionResultV1.parse(row.result));
      }
    }
    return preventionViewV1.parse({ version:"prevention-view.v1",environment:"synthetic_demo",jobId:job,retrievedAt,parties:current,customerType:current?.customer.type??null,
      payingParty:current&&saved?{name:current.payingParty.name,revisionId:current.payingPartyRevisionId,source:"Builder's saved paying-party record",retrievedAt,recordedAt:saved.savedAt}:null,
      companyEligibility:current&&preventionCompanyEligible(current.customer)?"eligible":"not run — not a registered company",
      eligibilityPolicyVersion:PREVENTION_COMPANY_ELIGIBILITY_REFERENCE,property,company,watch,realExternalActions:0 });
  }
  async view(context: VerifiedTenantContext, actor: string, job: string, practiceDigest?: string) {
    this.syntheticOnly();
    return withTenant(this.pool,context,async db=>{await this.authorize(db,context.tenantId,actor,job,practiceDigest);return this.viewIn(db,context.tenantId,job);});
  }
  async command(context: VerifiedTenantContext, actor: string, job: string, raw: unknown, practiceDigest?: string) {
    this.syntheticOnly();
    const parsed = preventionCommandV1.safeParse(raw);
    if (!parsed.success) throw new PreventionCheckError("INVALID_PREVENTION_COMMAND");
    const input = parsed.data, requestHash = digest({ job, input });
    return withTenant(this.pool,context,async db=>{
      const tenant = context.tenantId;
      await this.authorize(db,tenant,actor,job,practiceDigest);
      // One receipt claim, then aggregate serialization/current-party share guard;
      // domain writes finish before the audit head. No new privileged helper.
      const claim = await db.$client.query(`INSERT INTO app.command_receipt(command_id,tenant_id,command_type,semantic_key,request_hash,status,actor_membership_id)
        VALUES($1,$2,'prevention.check',$1::text,$3,'processing',$4) ON CONFLICT DO NOTHING RETURNING command_id`, [input.commandId,tenant,requestHash,actor]);
      if (!claim.rowCount) {
        const prior = (await db.$client.query(`SELECT request_hash,status,result FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2`, [tenant,input.commandId])).rows[0];
        if (!prior || prior.request_hash !== requestHash || prior.status !== "succeeded") throw new PreventionCheckError("COMMAND_CONFLICT");
        return preventionCommandResultV1.parse(prior.result);
      }
      await db.$client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`prevention:${tenant}:${job}`]);
      let current: JobPartiesSnapshotV1;
      try {
        // CH-3a owns the narrow share-lock path; runtime cannot lock job rows
        // directly because it intentionally has no UPDATE grant on that table.
        const row = (await db.$client.query<{ snapshot: unknown }>("SELECT app.require_current_job_parties($1,$2) snapshot", [tenant,job])).rows[0];
        current = jobPartiesSnapshotV1.parse(row?.snapshot);
      } catch (error) {
        const dbError=error as {code?:string;message?:string};
        if(dbError.message==="JOB_PARTIES_REQUIRED")throw new PreventionCheckError("PARTIES_REQUIRED");
        if(dbError.code==="P0002")throw new PreventionCheckError("NOT_FOUND");
        if(dbError.code==="42501")throw new PreventionCheckError("FORBIDDEN");
        throw error;
      }
      if (current.bindingId !== input.expectedBindingId) throw new PreventionCheckError("REVISION_CONFLICT");
      if (input.action !== "property" && !preventionCompanyEligible(current.customer)) throw new PreventionCheckError("NOT_REGISTERED_COMPANY");
      const auditId = randomUUID();
      let results: PreventionResultV1[] = [], watchRevision = 0;
      if (input.action === "property") results = preventionRegisterFixtures(propertyKinds,input.fixture,input.scenarioNow);
      else if (input.action === "company") results = preventionRegisterFixtures(["company"],input.fixture,input.scenarioNow);
      else {
        const previous = await this.watch(db,tenant,job,current.bindingId);
        if (previous.revision !== input.expectedWatchRevision) throw new PreventionCheckError("REVISION_CONFLICT");
        if (input.action === "start_watch" && previous.enabled) throw new PreventionCheckError("WATCH_ALREADY_STARTED");
        if (input.action !== "start_watch" && !previous.enabled) throw new PreventionCheckError("WATCH_NOT_STARTED");
        watchRevision = previous.revision;
        if (input.action === "evaluate_watch") results = preventionRegisterFixtures(["companies_house_feed","gazette_feed"],input.fixture,input.scenarioNow);
        else {
          watchRevision++;
          await db.$client.query(`INSERT INTO app.counterparty_check(tenant_id,id,job_id,binding_id,customer_revision_id,command_id,kind,watch_revision,source_id,source_name,retrieved_at,result,audit_event_id)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,'synthetic-watch-command.v1','Builder command (synthetic)',$9,NULL,$10)`,
          [tenant,randomUUID(),job,current.bindingId,current.customerRevisionId,input.commandId,input.action==="start_watch"?"watch_start":"watch_stop",watchRevision,input.scenarioNow,auditId]);
        }
      }
      for (const result of results) {
        if (input.action === "property") await db.$client.query(`INSERT INTO app.property_constraint_fact(tenant_id,id,job_id,binding_id,site_revision_id,command_id,kind,source_id,source_name,retrieved_at,result,audit_event_id)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [tenant,randomUUID(),job,current.bindingId,current.siteRevisionId,input.commandId,result.kind,result.source.id,result.source.name,result.retrievedAt,JSON.stringify(result),auditId]);
        else await db.$client.query(`INSERT INTO app.counterparty_check(tenant_id,id,job_id,binding_id,customer_revision_id,command_id,kind,watch_revision,source_id,source_name,retrieved_at,result,audit_event_id)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`, [tenant,randomUUID(),job,current.bindingId,current.customerRevisionId,input.commandId,result.kind,watchRevision,result.source.id,result.source.name,result.retrievedAt,JSON.stringify(result),auditId]);
      }
      const result = preventionCommandResultV1.parse({version:"prevention-command-result.v1",environment:"synthetic_demo",commandId:input.commandId,view:await this.viewIn(db,tenant,job),realExternalActions:0});
      await db.$client.query("UPDATE app.command_receipt SET status='succeeded',result=$3,completed_at=clock_timestamp() WHERE tenant_id=$1 AND command_id=$2", [tenant,input.commandId,JSON.stringify(result)]);
      await appendAuditBatch(db,[{id:auditId,version:"audit.v1",actorRef:`membership:${actor}`,eventType:`prevention.${input.action}`,subjectType:"job",subjectRef:job,
        payload:{references:{commandId:input.commandId,bindingId:current.bindingId,fixtureId:PREVENTION_FIXTURE_ID},hashes:{request:requestHash},classifications:{action:"operational"}}}]);
      return result;
    });
  }
}
