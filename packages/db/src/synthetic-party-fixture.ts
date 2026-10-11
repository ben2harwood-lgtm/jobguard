import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
/** Migration-role fixture setup only. Never called by application services or exposed as a routine. */
export async function seedSyntheticPartyFixture(client: PoolClient, tenantId: string, jobId: string) {
  if ((await client.query(`SELECT 1 FROM app.job_party_current WHERE tenant_id=$1 AND job_id=$2`, [tenantId, jobId])).rowCount) return;
  const c=randomUUID(),cr=randomUUID(),s=randomUUID(),sr=randomUUID(),b=randomUUID();
  await client.query(`INSERT INTO app.customer(tenant_id,id) VALUES($1,$2)`,[tenantId,c]);
  await client.query(`INSERT INTO app.customer_revision(tenant_id,id,customer_id,revision,payload) VALUES($1,$2,$3,1,'{"version":"customer.v1","name":"Practice Customer","type":"person","email":"practice-customer@example.invalid"}')`,[tenantId,cr,c]);
  await client.query(`INSERT INTO app.site(tenant_id,id) VALUES($1,$2)`,[tenantId,s]);
  await client.query(`INSERT INTO app.site_revision(tenant_id,id,site_id,revision,payload,match_key) VALUES($1,$2,$3,1,'{"version":"site.v1","addressLines":["14 Fictional Street"],"town":"London","postcode":"SW1A 1AA"}','["address","SW1A 1AA",["14 FICTIONAL STREET"],"LONDON",""]')`,[tenantId,sr,s]);
  await client.query(`INSERT INTO app.job_party_binding(tenant_id,id,job_id,revision,customer_id,customer_revision_id,paying_party_id,paying_party_revision_id,site_id,site_revision_id,provenance) SELECT $1,$2,id,revision,$4,$5,$4,$5,$6,$7,'backfilled_synthetic_fixture' FROM app.job WHERE tenant_id=$1 AND id=$3`,[tenantId,b,jobId,c,cr,s,sr]);
  await client.query(`INSERT INTO app.job_party_current(tenant_id,job_id,binding_id) VALUES($1,$2,$3)`,[tenantId,jobId,b]);
}
