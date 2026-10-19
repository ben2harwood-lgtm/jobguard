import { randomUUID } from "node:crypto";
import { applyInitialSuppression, runJobChecks, type Finding, type JobFactSnapshot } from "@jobguard/core";
import { z } from "zod";
import { listPracticeFindingScopes } from "./practice-scope.js";
import type { TenantTransaction } from "./tenant-context.js";
import { practiceOwnedJobsSql } from "./practice-session.js";
export interface PersistFindingsResult { readonly created:number;readonly replayed:number; }
/** Application persistence kept deliberately separate from the pure checker package. */
export async function persistFindings(database:TenantTransaction,tenantId:string,snapshotRevision:number,findings:readonly Finding[]):Promise<PersistFindingsResult>{let created=0,replayed=0;for(const item of findings){const findingId=randomUUID();const raw=item.fingerprint.slice(0,32).split("");raw[12]="4";raw[16]=(["8","9","a","b"] as const)[Number.parseInt(raw[16]!,16)%4]!;const hex=raw.join("");const decisionId=`${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;await database.$client.query(`INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type) VALUES($1,$2,'finding',$3,$4) ON CONFLICT(tenant_id,id) DO NOTHING`,[decisionId,tenantId,item.subjectRef,item.actionType]);const inserted=await database.$client.query(`INSERT INTO app.job_finding(id,tenant_id,job_id,decision_id,fingerprint,kind,classification,title,detail,subject_ref,action_type,suggestion_confidence,snapshot_revision) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT(tenant_id,fingerprint) DO NOTHING RETURNING id`,[findingId,tenantId,item.jobId,decisionId,item.fingerprint,item.kind,item.classification,item.title,item.detail,item.subjectRef,item.actionType,item.suggestionConfidence,snapshotRevision]);if(inserted.rowCount)created++;else replayed++;}return{created,replayed};}
export async function suppressAdvisoryFinding(database:TenantTransaction,tenantId:string,findingId:string,reason:"low_value"|"low_confidence"|"daily_advisory_budget",policyVersion:string){await database.$client.query("INSERT INTO app.finding_suppression(id,tenant_id,finding_id,reason,policy_version) VALUES($1,$2,$3,$4,$5) ON CONFLICT(tenant_id,finding_id) DO NOTHING",[randomUUID(),tenantId,findingId,reason,policyVersion]);}
export async function listDecisionInbox(database:TenantTransaction,jobId?:string,practiceSessionDigest?:string){
 // Keep the reviewed ownership helper unchanged. Its tenant placeholder is
 // supplied by withTenant's verified transaction setting; $1 remains the job filter.
 const ownedJobsSql=practiceOwnedJobsSql("$2").replaceAll("$1", "current_setting('app.tenant_id', true)::uuid");
 return(await database.$client.query(`${ownedJobsSql} SELECT f.*,
  CASE WHEN f.classification='mandatory' AND f.kind='required_proof' THEN NULL ELSE r.resolution END resolution,r.resolved_at,
  CASE f.kind WHEN 'required_proof' THEN 'proof.requirement.electrical-certificate' ELSE 'materials.review.generic' END rule_id,
  'finding-rules.v1' rule_version,j.title job_title,
  EXISTS(SELECT 1 FROM app.action_authorization a WHERE a.tenant_id=f.tenant_id AND a.decision_id=f.decision_id) authorized_action
 FROM app.job_finding f JOIN app.job j ON (j.tenant_id,j.id)=(f.tenant_id,f.job_id)
 LEFT JOIN LATERAL (SELECT resolution,resolved_at FROM app.decision_resolution dr WHERE dr.tenant_id=f.tenant_id AND dr.decision_id=f.decision_id ORDER BY dr.resolved_at DESC LIMIT 1) r ON true
 LEFT JOIN app.finding_suppression s ON s.tenant_id=f.tenant_id AND s.finding_id=f.id
 WHERE (s.id IS NULL OR f.classification='mandatory')
 AND NOT EXISTS (SELECT 1 FROM app.job_finding newer
   WHERE (newer.tenant_id,newer.job_id,newer.kind,newer.subject_ref,newer.action_type)=
         (f.tenant_id,f.job_id,f.kind,f.subject_ref,f.action_type)
   AND (newer.snapshot_revision,newer.created_at,(newer.classification='mandatory')::int,newer.id) >
       (f.snapshot_revision,f.created_at,(f.classification='mandatory')::int,f.id))
 AND NOT EXISTS (SELECT 1 FROM app.scope_identity scope
   WHERE scope.tenant_id=f.tenant_id AND scope.job_id=f.job_id
     AND scope.id::text=split_part(f.subject_ref,':',1)
     AND ((j.status='draft' AND scope.state<>'reserved') OR (j.status<>'draft' AND scope.state<>'confirmed')))
 AND (f.kind<>'required_proof' OR NOT EXISTS (
   SELECT 1 FROM app.evidence_object e JOIN app.evidence_upload u
     ON (u.tenant_id,u.id,u.job_id,u.scope_item_id)=(e.tenant_id,e.upload_id,e.job_id,e.scope_item_id)
   WHERE e.tenant_id=f.tenant_id AND e.job_id=f.job_id
     AND e.scope_item_id::text=split_part(f.subject_ref,':',1)
     AND e.evidence_type=split_part(f.subject_ref,':',2) AND e.kind='original'
     AND u.state='verified' AND u.object_version_id=e.object_version_id
     AND NOT EXISTS (SELECT 1 FROM app.evidence_invalidation i WHERE (i.tenant_id,i.evidence_id)=(e.tenant_id,e.id))))
 AND ($1::uuid IS NULL OR f.job_id=$1) AND ($2::text IS NULL OR j.id IN (SELECT id FROM practice_owned_job))
 ORDER BY (f.classification='mandatory') DESC,f.created_at,f.fingerprint`,[jobId??null,practiceSessionDigest??null])).rows;}

const checkCommandV1 = z.object({ version: z.literal("finding-evaluation-command.v1"), commandId: z.string().uuid(),
 tenantId: z.string().uuid(), jobId: z.string().uuid() }).strict();
const checkPhaseResultV1 = z.object({ replay: z.boolean(), response: z.unknown().optional() }).strict();

/** The existing synthetic rule recipe is unchanged; only current persisted proof supplies proof facts.
 * The checked routine locks authority, job and command before this read. No network or later business lock. */
export async function evaluateDecisionChecks<T>(database: TenantTransaction, raw: unknown, digest: string,
 project: (rows: Awaited<ReturnType<typeof listDecisionInbox>>) => T): Promise<T & { evaluation: PersistFindingsResult }> {
 const command = checkCommandV1.parse(raw);
 const invoke = async (phase: "begin" | "persist" | "finish", data: unknown = {}) =>
  (await database.$client.query<{ result: unknown }>("SELECT app.decision_check_command($1,$2::jsonb,$3,$4::jsonb) AS result",
   [digest, JSON.stringify(command), phase, JSON.stringify(data)])).rows[0]!.result;
 const first = checkPhaseResultV1.parse(await invoke("begin"));
 if (first.replay) return first.response as T & { evaluation: PersistFindingsResult };
 const job = (await database.$client.query<{ revision: number }>("SELECT revision FROM app.job WHERE tenant_id=$1 AND id=$2",
  [command.tenantId, command.jobId])).rows[0]!;
 const scopes = await listPracticeFindingScopes(database, command.tenantId, command.jobId, 2);
 const proofs = (await database.$client.query<{ scope_item_id: string; evidence_type: string }>(`
  SELECT e.scope_item_id,e.evidence_type FROM app.evidence_object e JOIN app.evidence_upload u
   ON (u.tenant_id,u.id,u.job_id,u.scope_item_id)=(e.tenant_id,e.upload_id,e.job_id,e.scope_item_id)
  WHERE e.tenant_id=$1 AND e.job_id=$2 AND e.kind='original' AND u.state='verified'
   AND u.object_version_id=e.object_version_id
   AND NOT EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE (i.tenant_id,i.evidence_id)=(e.tenant_id,e.id))`,
  [command.tenantId, command.jobId])).rows;
 const firstScope = scopes[0], secondScope = scopes[1] ?? firstScope;
 const snapshot: JobFactSnapshot = { version: "job-fact-snapshot.v1", tenantId: command.tenantId, jobId: command.jobId,
  revision: job.revision, unresolvedQuestions: [], scopes: firstScope ? [
   { scopeItemId: firstScope.id, proofRule: "electrical", verifiedProofTypes: proofs.filter(p => p.scope_item_id===firstScope.id).map(p => p.evidence_type), materialsIncluded: false, valuePence: 20000 },
   { scopeItemId: secondScope!.id, proofRule: null, verifiedProofTypes: [], materialsIncluded: true, valuePence: 20000 },
  ] : [] };
 const selected = applyInitialSuppression(runJobChecks(snapshot), { minimumAdvisoryValuePence: 0, minimumSuggestionConfidence: 0, dailyAdvisoryBudget: 1 },
  Object.fromEntries(snapshot.scopes.map(scope => [scope.scopeItemId, scope.valuePence])));
 const evaluation = z.object({ created: z.number().int().nonnegative(), replayed: z.number().int().nonnegative() }).strict()
  .parse(await invoke("persist", { findings: [...selected.visible, ...selected.suppressed], suppressed: selected.suppressed.map(f => f.fingerprint) }));
 const response = { ...project(await listDecisionInbox(database, command.jobId, digest)), evaluation };
 await invoke("finish", { response });
 return response;
}
