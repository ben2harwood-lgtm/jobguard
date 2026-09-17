import { randomUUID } from "node:crypto";
import type { Finding } from "@jobguard/core";
import type { TenantTransaction } from "./tenant-context.js";
export interface PersistFindingsResult { readonly created:number;readonly replayed:number; }
/** Application persistence kept deliberately separate from the pure checker package. */
export async function persistFindings(database:TenantTransaction,tenantId:string,snapshotRevision:number,findings:readonly Finding[]):Promise<PersistFindingsResult>{let created=0,replayed=0;for(const item of findings){const findingId=randomUUID();const raw=item.fingerprint.slice(0,32).split("");raw[12]="4";raw[16]=(["8","9","a","b"] as const)[Number.parseInt(raw[16]!,16)%4]!;const hex=raw.join("");const decisionId=`${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;await database.$client.query(`INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type) VALUES($1,$2,'finding',$3,$4) ON CONFLICT(tenant_id,id) DO NOTHING`,[decisionId,tenantId,item.subjectRef,item.actionType]);const inserted=await database.$client.query(`INSERT INTO app.job_finding(id,tenant_id,job_id,decision_id,fingerprint,kind,classification,title,detail,subject_ref,action_type,suggestion_confidence,snapshot_revision) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT(tenant_id,fingerprint) DO NOTHING RETURNING id`,[findingId,tenantId,item.jobId,decisionId,item.fingerprint,item.kind,item.classification,item.title,item.detail,item.subjectRef,item.actionType,item.suggestionConfidence,snapshotRevision]);if(inserted.rowCount)created++;else replayed++;}return{created,replayed};}
export async function suppressAdvisoryFinding(database:TenantTransaction,tenantId:string,findingId:string,reason:"low_value"|"low_confidence"|"daily_advisory_budget",policyVersion:string){await database.$client.query("INSERT INTO app.finding_suppression(id,tenant_id,finding_id,reason,policy_version) VALUES($1,$2,$3,$4,$5) ON CONFLICT(tenant_id,finding_id) DO NOTHING",[randomUUID(),tenantId,findingId,reason,policyVersion]);}
export async function listDecisionInbox(database:TenantTransaction,jobId?:string){return(await database.$client.query(`SELECT f.*,r.resolution,r.resolved_at,
  CASE f.kind WHEN 'required_proof' THEN 'proof.requirement.electrical-certificate' ELSE 'materials.review.generic' END rule_id,
  'finding-rules.v1' rule_version,j.title job_title,
  EXISTS(SELECT 1 FROM app.action_authorization a WHERE a.tenant_id=f.tenant_id AND a.decision_id=f.decision_id) authorized_action
 FROM app.job_finding f JOIN app.job j ON (j.tenant_id,j.id)=(f.tenant_id,f.job_id)
 LEFT JOIN LATERAL (SELECT resolution,resolved_at FROM app.decision_resolution dr WHERE dr.tenant_id=f.tenant_id AND dr.decision_id=f.decision_id ORDER BY dr.resolved_at DESC LIMIT 1) r ON true
 LEFT JOIN app.finding_suppression s ON s.tenant_id=f.tenant_id AND s.finding_id=f.id
 WHERE s.id IS NULL AND ($1::uuid IS NULL OR f.job_id=$1)
 ORDER BY (f.classification='mandatory') DESC,f.created_at,f.fingerprint`,[jobId??null])).rows;}
