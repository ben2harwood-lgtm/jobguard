import { randomUUID } from "node:crypto";
import type { Pool } from "pg";

/** Owner-only fictional agreement fact. No application/runtime activation path.
 * Predecessor upgrade fixtures before 0198 intentionally have no status table.
 */
export async function seedContractorAgreement(admin: Pool, tenantId: string, status: "active" | "inactive" | "suspended" = "active") {
 if (!(await admin.query("SELECT to_regclass('app.contractor_agreement_status_revision') present")).rows[0].present) return;
 const client = await admin.connect();
 try {
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.tenant_id',$1,true)", [tenantId]);
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,54))", [tenantId]);
  await client.query(`INSERT INTO app.contractor_agreement_status_revision(tenant_id,id,assignment_id,revision,status,schema_version,environment,fictional_source)
   SELECT $1,$2,a.id,coalesce((SELECT max(s.revision) FROM app.contractor_agreement_status_revision s WHERE s.tenant_id=$1 AND s.assignment_id=a.id),0)+1,
   $3,'contractor-agreement-status.v1','synthetic_demo',$4
   FROM (SELECT id FROM app.commercial_track_assignment WHERE tenant_id=$1 ORDER BY revision DESC LIMIT 1) a`,
   [tenantId, randomUUID(), status, `fictional-fixture:${randomUUID()}`]);
  await client.query("COMMIT");
 } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}
