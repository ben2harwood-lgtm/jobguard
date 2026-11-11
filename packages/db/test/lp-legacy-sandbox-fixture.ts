// Owner-connected setup at predecessor schemas where LP-2's checked creator does not exist yet.
// Product create/advance/replay behavior remains covered at the current schema by lp-job-doors-compatibility.
import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { appendAuditBatch } from "../src/audit.js";
import { DEMO_TENANT_ID } from "../src/demo-seed.js";
import { withTenant } from "../src/tenant-context.js";
import { testTenantContext } from "./tenant-context-test-utils.js";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const id = (value: string) => {
 const h = hash(value);
 return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;
};
export async function seedLegacySandbox(owner: Pool, session: string): Promise<string> {
 const tenant = DEMO_TENANT_ID, run = randomUUID(), job = randomUUID(), command = randomUUID();
 const digest = hash(session), payload = hash("create|core-1000|none");
 await withTenant(owner, testTenantContext(tenant), async db => {
  await db.$client.query(`INSERT INTO app.job(id,tenant_id,title,status,practice_session_digest,practice_scenario)
   VALUES($1,$2,'Synthetic practice job','quoting',$3,'core-1000')`, [job,tenant,digest]);
  await db.$client.query(`INSERT INTO app.sandbox_run(id,tenant_id,job_id,session_id,scenario,environment,status)
   VALUES($1,$2,$3,$4,'core-1000','synthetic_demo','active')`, [run,tenant,job,id(`practice-session:${digest}`)]);
  for (const [step,adapter,amount] of [[1,"fake_quote_review",100000],[2,"fake_job_progress",12500],[3,"fake_final_account",132000]] as const) {
   await db.$client.query(`INSERT INTO app.sandbox_work(id,tenant_id,run_id,step,adapter,input_hash,amount_pence,currency,environment,approved)
    VALUES($1,$2,$3,$4,$5,$6,$7,'GBP','synthetic_demo',true)`,
    [id(`${run}|work|${step}`),tenant,run,step,adapter,hash(`core-1000|${step}|${amount}|GBP`),amount]);
  }
  await db.$client.query(`INSERT INTO app.sandbox_run_event(id,tenant_id,run_id,event_index,kind,fake_clock_tick,command_id,payload_hash)
   VALUES($1,$2,$3,1,'created',0,$4,$5)`, [id(`${run}|event|${command}`),tenant,run,command,payload]);
  await appendAuditBatch(db,[{id:command,version:"audit.v1",actorRef:`synthetic-session:${digest}`,
   eventType:"sandbox.run.created",subjectType:"sandbox-run",subjectRef:run,
   payload:{references:{command},hashes:{payload},classifications:{sandbox:"operational"}}}]);
 });
 return run;
}

/** Owner-only historical SQL quote data, before the allocator exists. This is
 * fixture construction at the installed predecessor, never a runtime fallback.
 * Only quote prerequisites/artifacts/send/acceptance facts are constructed here;
 * callers retain the real activation and every subsequent money writer. */
export async function historicalAcceptedQuote(
 owner: Pool, context: import("../src/tenant-context.js").VerifiedTenantContext,
 name: string, netPence: number, practiceDigest: string | null = null,
) {
 if (process.env.JOBGUARD_ENV !== "synthetic_demo" || context.tenantId !== DEMO_TENANT_ID)
  throw new Error("Historical quote fixture requires fictional practice data");
 const { evaluateDraftQuote, quoteDocumentV1, renderQuotePdf } = await import("@jobguard/core");
 const { seedSyntheticPartyFixture } = await import("../src/synthetic-party-fixture.js");
 const db = await owner.connect(), tenant = context.tenantId;
 const job = randomUUID(), scope = randomUUID(), scopeRevision = randomUUID(), draft = randomUUID(), revision = randomUUID(), documentId = randomUUID();
 try {
  await db.query("BEGIN");
  if ((await db.query("SELECT to_regprocedure('app.allocate_quote_job_reference(uuid)') installed")).rows[0].installed)
   throw new Error("Historical quote fixture cannot replace current runtime writers");
  await db.query("SELECT set_config('app.tenant_id',$1,true)", [tenant]);
  await db.query(`INSERT INTO app.job(id,tenant_id,title,status,practice_session_digest,practice_scenario)
   VALUES($1,$2,$3,'quoting',$4::text,CASE WHEN $4::text IS NULL THEN NULL ELSE 'capture' END)`, [job,tenant,name,practiceDigest]);
  await seedSyntheticPartyFixture(db,tenant,job);
  await db.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')",[scope,tenant,job]);
  await db.query(`INSERT INTO app.scope_revision(id,tenant_id,job_id,scope_item_id,revision,description,quantity_decimal,unit,unit_price_pence,total_pence)
   VALUES($1,$2,$3,$4,1,'Generated fictional work','1','item',$5,$5)`,[scopeRevision,tenant,job,scope,netPence]);
  const line = { id:randomUUID(),scopeItemId:scope,scopeRevisionId:scopeRevision,description:"Generated fictional work",origin:"captured" as const,
   included:true,exclusionReason:null,quantity:"1",unit:"item",unitRatePence:netPence,discountPercent:"0",taxTreatment:"standard_rate_20" as const,
   rateProvenance:"entered" as const,category:"Work",region:null };
  const { totals } = evaluateDraftQuote({currency:"GBP",taxPolicyVersion:"candidate_m1_standard_v1",lines:[line]});
  await db.query("INSERT INTO app.quote_draft(id,tenant_id,job_id) VALUES($1,$2,$3)",[draft,tenant,job]);
  await db.query(`INSERT INTO app.quote_revision(id,tenant_id,job_id,quote_draft_id,revision,currency,tax_policy_version,subtotal_pence,discount_pence,net_pence,tax_pence,total_pence,issuable,blockers)
   VALUES($1,$2,$3,$4,1,'GBP','candidate_m1_standard_v1',$5,$6,$7,$8,$9,true,'[]')`,
  [revision,tenant,job,draft,totals.subtotal.pence,totals.discount.pence,totals.net.pence,totals.tax.pence,totals.total.pence]);
  await db.query(`INSERT INTO app.quote_line(id,tenant_id,job_id,quote_revision_id,scope_item_id,scope_revision_id,origin,description,included,quantity_decimal,unit,unit_rate_pence,discount_decimal,tax_treatment,rate_provenance,category,ordinal)
   VALUES($1,$2,$3,$4,$5,$6,'captured','Generated fictional work',true,'1','item',$7,'0','standard_rate_20','entered','Work',1)`,[line.id,tenant,job,revision,scope,scopeRevision,netPence]);
  await db.query("UPDATE app.quote_draft SET current_revision_id=$1,revision=1 WHERE tenant_id=$2 AND id=$3",[revision,tenant,draft]);
  const parties=(await db.query("SELECT app.require_current_job_parties($1,$2) snapshot",[tenant,job])).rows[0].snapshot;
  const recipient="fixture-customer@example.invalid";
  const document=quoteDocumentV1.parse({schemaVersion:"quote-document.v1",documentVersion:1,reference:"Q-0001",quoteRevisionId:revision,currency:"GBP",jobParties:parties,
   issuer:{name:"A Builder Ltd",address:["1 Trade Road","London"],email:"builder@example.invalid"},
   customer:{name:parties.customer.name,address:[...parties.site.addressLines,parties.site.town,parties.site.postcode],email:recipient},
   lines:[{scopeItemId:scope,description:line.description,quantity:"1",unit:"item",netPence}],exclusions:[],qualifications:[],
   subtotalPence:totals.subtotal.pence,discountPence:totals.discount.pence,netPence:totals.net.pence,taxPence:totals.tax.pence,totalPence:totals.total.pence});
  const pdf=renderQuotePdf(document), contentHash=createHash("sha256").update(pdf).digest("hex");
  await db.query(`INSERT INTO app.quote_document_version(id,tenant_id,job_id,quote_revision_id,document_version,reference,content_hash,object_key,object_version_id,pdf_byte_length,issuer,customer,snapshot)
   VALUES($1,$2,$3,$4,1,'Q-0001',$5::text,$6,$5::text,$7,$8,$9,$10)`,
  [documentId,tenant,job,revision,contentHash,`historical/quotes/${documentId}.pdf`,pdf.length,document.issuer,document.customer,document]);
  // Exact fictional historical send facts, satisfying the predecessor's real FKs
  // and approval trigger. There is no external executor or provider invocation.
  const decision=randomUUID(),resolution=randomUUID(),authorization=randomUUID(),outbox=randomUUID();
  const actor="d1500000-0000-4000-8000-000000000003",recipients=JSON.stringify([recipient]);
  await db.query("INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type) VALUES($1,$2,'quote_document',$3,'quote.send')",[decision,tenant,documentId]);
  await db.query("INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id) VALUES($1,$2,$3,'approved',$4)",[resolution,tenant,decision,actor]);
  await db.query(`INSERT INTO app.action_authorization(id,tenant_id,decision_id,resolution_id,actor_membership_id,action_type,recipient,content_hash,aggregate_revision,policy_version,expires_at)
   VALUES($1,$2,$3,$4,$5,'quote.send',$6,$7,1,'free-quote-send.v1',clock_timestamp()+interval '1 hour')`,[authorization,tenant,decision,resolution,actor,recipients,contentHash]);
  await db.query(`INSERT INTO app.action_outbox(id,tenant_id,authorization_id,adapter,provider_effect_key,action_type,recipient,content_hash,immutable_content,aggregate_revision,policy_version,authorization_expires_at,status,completed_at)
   VALUES($1,$2,$3,'fake_quote_delivery',$4,'quote.send',$5,$6,$7,1,'free-quote-send.v1',clock_timestamp()+interval '1 hour','succeeded',clock_timestamp())`,[outbox,tenant,authorization,`historical-quote:${documentId}`,recipients,contentHash,new TextDecoder().decode(pdf)]);
  await db.query("INSERT INTO app.quote_send(id,tenant_id,job_id,document_id,content_hash,authorization_id,outbox_action_id,recipients) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",[randomUUID(),tenant,job,documentId,contentHash,authorization,outbox,recipients]);
  const expected=(await db.query("SELECT revision FROM app.job WHERE tenant_id=$1 AND id=$2",[tenant,job])).rows[0].revision;
  // The 14-argument owner-only historical routine remains installed after LP-3;
  // its runtime successor is deliberately not used to populate older history.
  await db.query(`SELECT app.record_builder_attested_acceptance($1,$2,$3,$4,$5,1,$6,$7,$8,$9,'Practice Customer','email',clock_timestamp(),NULL)`,
   [tenant,randomUUID(),randomUUID(),job,documentId,contentHash,document.totalPence,expected,actor]);
  await db.query("COMMIT");
  return job;
 } catch(error) {await db.query("ROLLBACK");throw error;} finally {db.release();}
}
