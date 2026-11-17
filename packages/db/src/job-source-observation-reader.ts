import {createHash} from "node:crypto";
import {observationV1,type Observation,jobSourceTextV1} from "@jobguard/core";
import type {TenantTransaction} from "./tenant-context.js";
import {decodeJobSourceFixture} from "./job-source-fixtures.js";
/** Worker-facing ordinary runtime SELECTs only. Lifecycle/terms eligibility is owned by ShadowObservationReader/worker. */
export async function readJobSourceObservations(db:TenantTransaction,tenantId:string,jobId:string):Promise<Observation[]> {
 const rows=(await db.$client.query<{evidence_id:string;object_version_id:string;sha256:string;received:string;source_kind:"diary"|"customer_message";bytes:Buffer;byte_length:number;synthetic_fixture_ref:string|null}>(`
  SELECT o.evidence_id,o.object_version_id,o.sha256,to_char(o.source_received_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') received,o.source_kind,o.bytes,o.byte_length,o.synthetic_fixture_ref
  FROM app.job_source_original o
  JOIN (SELECT tenant_id,job_id,id,source_kind,evidence_id,object_version_id,sha256,source_received_at FROM app.job_diary_entry
   UNION ALL SELECT tenant_id,job_id,id,source_kind,evidence_id,object_version_id,sha256,source_received_at FROM app.customer_message_source) s
   ON(s.tenant_id,s.job_id,s.source_kind,s.id,s.evidence_id,s.object_version_id,s.sha256,s.source_received_at)=(o.tenant_id,o.job_id,o.source_kind,o.source_id,o.evidence_id,o.object_version_id,o.sha256,o.source_received_at)
  JOIN app.evidence_object e ON(e.tenant_id,e.job_id,e.id,e.object_version_id,e.sha256,e.server_received_at)=(o.tenant_id,o.job_id,o.evidence_id,o.object_version_id,o.sha256,o.source_received_at)
  JOIN app.evidence_upload u ON(u.tenant_id,u.job_id,u.id)=(e.tenant_id,e.job_id,e.upload_id)
  JOIN app.job_commercial_track t ON(t.tenant_id,t.job_id)=(o.tenant_id,o.job_id)
  WHERE o.tenant_id=$1 AND o.job_id=$2 AND o.environment='synthetic_demo' AND t.job_track='small_builder' AND t.environment='synthetic_demo'
   AND e.kind='original' AND e.scope_item_id IS NULL AND e.server_verified_at IS NOT NULL
   AND e.evidence_type=CASE WHEN o.source_kind='diary' THEN 'job_diary_text' ELSE 'customer_message_text' END
   AND e.object_key=o.object_key AND e.content_type=o.content_type AND e.byte_length=o.byte_length
   AND u.state='verified' AND u.server_verified_at IS NOT NULL AND u.scope_item_id IS NULL AND u.object_version_id=o.object_version_id
   AND u.object_key=o.object_key AND u.expected_sha256=o.sha256 AND u.expected_content_type=o.content_type AND u.server_received_at=o.source_received_at
   AND NOT EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE i.tenant_id=e.tenant_id AND i.evidence_id=e.id)
  ORDER BY o.evidence_id`,[tenantId,jobId])).rows;
 const result:Observation[]=[];
 for(const row of rows){
  if(!Buffer.isBuffer(row.bytes) || row.bytes.length!==Number(row.byte_length) || createHash("sha256").update(row.bytes).digest("hex")!==row.sha256)continue;
  let text:string;try{text=new TextDecoder("utf-8",{fatal:true,ignoreBOM:true}).decode(row.bytes)}catch{continue}
  if(!jobSourceTextV1.safeParse(text).success || !Buffer.from(text,"utf8").equals(row.bytes))continue;
  const kind=row.source_kind==="diary"?"note_or_voice":"customer_request";
  const fixture=decodeJobSourceFixture(row.synthetic_fixture_ref,text,kind);if(!fixture)continue;
  const parsed=observationV1.safeParse({version:"observation.v1",tenantId,jobId,kind,evidence:{id:row.evidence_id,objectVersionId:row.object_version_id,sha256:row.sha256,serverReceivedAt:row.received},...fixture});
  if(parsed.success)result.push(parsed.data);
 }
 return result;
}
