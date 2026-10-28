import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
/** Explicit owner-only positive fixture for suites exercising other contracts.
 * Never called by production/demo code; missing agreement cases omit this step.
 * Earlier-schema upgrade fixtures retain their pre-MON-8 authority behavior.
 */
export async function seedActiveContractorAgreement(admin: Pool, tenant: string): Promise<void> {
  const installed = (await admin.query("SELECT EXISTS(SELECT 1 FROM public.jobguard_schema_migration WHERE migration_name='0318_server_plan_entitlements.sql') installed")).rows[0].installed;
  if (!installed) return;
  const db = await admin.connect();
  try {
    await db.query("BEGIN");
    await db.query("SELECT set_config('app.tenant_id',$1,true)", [tenant]);
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,54))", [tenant]);
    await db.query(`INSERT INTO app.contractor_agreement_status_revision(tenant_id,id,assignment_id,revision,status,schema_version,environment,fictional_source)
      SELECT $1,$2,a.id,1,'active','contractor-agreement-status.v1','synthetic_demo',$3
      FROM (SELECT * FROM app.commercial_track_assignment WHERE tenant_id=$1 ORDER BY revision DESC LIMIT 1) a
      WHERE a.commercial_track='contractor' AND NOT EXISTS(SELECT 1 FROM app.contractor_agreement_status_revision s WHERE s.tenant_id=$1 AND s.assignment_id=a.id)`,
      [tenant, randomUUID(), `fictional-fixture:${randomUUID()}`]);
    await db.query("COMMIT");
  } catch (error) { await db.query("ROLLBACK"); throw error; } finally { db.release(); }
}
