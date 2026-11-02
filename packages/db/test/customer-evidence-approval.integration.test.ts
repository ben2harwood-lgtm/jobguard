import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { applyMigration, startBeforeMigration, type Cluster } from "./contractor-practice-session-fixtures.js";
import { ownerTx } from "./extra-fixtures.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { migrate, withTenant } from "../src/index.js";

const migration = "0529_customer_evidence_approval_guard.sql", hash = "a".repeat(64);
let c: Cluster, tenant: string, job: string, otherJob: string, actor: string;
let historical: unknown, historicalId: string, privileges: unknown;
const catalogue = () => c.admin.query("SELECT relacl,relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='app.variation_approval'::regclass");

async function revision() {
 const id = randomUUID(), scope = randomUUID(), revisionId = randomUUID();
 await ownerTx(c, tenant, async db => {
  await db.$client.query("INSERT INTO app.scope_identity(tenant_id,job_id,id) VALUES($1,$2,$3)", [tenant, job, scope]);
  await db.$client.query("INSERT INTO app.variation(tenant_id,id,job_id,scope_item_id,capture_kind,capture_text,description) VALUES($1,$2,$3,$4,'text','Fictional extra','Fictional extra')", [tenant, id, job, scope]);
  await db.$client.query("INSERT INTO app.variation_revision(id,tenant_id,job_id,variation_id,scope_item_id,revision,description,quantity_decimal,unit,unit_rate_pence,signed_delta_pence,content_hash,confirmed_by_membership_id,rate_provenance_kind,rate_source_ref,rate_source_hash,rate_version) VALUES($1,$2,$3,$4,$5,1,'Fictional extra','1','item',5000,5000,$6,$7,'human_entered','synthetic://fixture',$6,'fixture-v1')", [revisionId, tenant, job, id, scope, hash, actor]);
 });
 return { id, revisionId };
}
async function insertApproval(evidenceId: string | null, method = "customer_evidence") {
 const v = await revision(), id = randomUUID();
 await withTenant(c.runtime, testTenantContext(tenant), db => db.$client.query(
  "INSERT INTO app.variation_approval(id,tenant_id,job_id,variation_id,revision_id,revision,content_hash,signed_delta_pence,method,actor_membership_id,evidence_id,approved_at) VALUES($1,$2,$3,$4,$5,1,$6,5000,$7,$8,$9,clock_timestamp())",
  [id, tenant, job, v.id, v.revisionId, hash, method, actor, evidenceId]));
 return id;
}
async function evidence(targetJob = job, kind = "original", original: string | null = null) {
 const id = randomUUID(), upload = randomUUID();
 await ownerTx(c, tenant, async db => {
  if (kind === "original") await db.$client.query("INSERT INTO app.evidence_upload(tenant_id,id,job_id,object_key,expected_sha256,maximum_bytes,expected_content_type,state,retention_class,expires_at) VALUES($1,$2,$3,$4,$5,100,'image/png','pending','standard_evidence','2099-01-01')", [tenant, upload, targetJob, `fictional/${id}`, hash]);
  await db.$client.query("INSERT INTO app.evidence_object(tenant_id,id,upload_id,job_id,kind,original_evidence_id,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at) VALUES($1,$2,$3,$4,$5,$6,'site_photo',$7,'fictional-v1',$8,1,'image/png','standard_evidence',clock_timestamp(),clock_timestamp())", [tenant, id, kind === "original" ? upload : null, targetJob, kind, original, `fictional/${id}`, hash]);
 });
 return id;
}
const stored = (id: string) => c.admin.query("SELECT to_jsonb(a) value FROM app.variation_approval a WHERE tenant_id=$1 AND id=$2", [tenant, id]);
beforeAll(async () => {
 c = await startBeforeMigration(migration);
 const row = (await c.admin.query("SELECT v.tenant_id,v.job_id,m.id actor FROM app.variation v JOIN app.membership m ON m.tenant_id=v.tenant_id AND m.role='owner' LIMIT 1")).rows[0];
 tenant = row.tenant_id; job = row.job_id; actor = row.actor; otherJob = randomUUID();
 await c.admin.query("INSERT INTO app.job(tenant_id,id,title,status) VALUES($1,$2,'Fictional second job','live')", [tenant, otherJob]);
 // The predecessor accepts cross-job evidence. Upgrade must preserve immutable history.
 historicalId = await insertApproval(await evidence(otherJob));
 historical = (await stored(historicalId)).rows;
 privileges = (await catalogue()).rows;
 await applyMigration(c, migration);
 await migrate(c.admin); await migrate(c.admin);
}, 120000);
afterAll(async () => c?.close());

it("upgrades populated history without rewriting approvals and replays migrations safely", async () => {
 expect((await stored(historicalId)).rows).toEqual(historical);
 expect((await catalogue()).rows).toEqual(privileges);
 expect((await c.admin.query("SELECT count(*)::int n FROM pg_trigger WHERE tgrelid='app.variation_approval'::regclass AND tgname='variation_customer_evidence_guard'")).rows).toEqual([{ n: 1 }]);
});
it.each(["cross-job", "preview", "invalidated", "unverified", "missing", "null"])("rejects direct runtime INSERT citing %s evidence without an approval effect", async kind => {
 let id: string | null = randomUUID();
 if (kind === "cross-job") id = await evidence(otherJob);
 if (kind === "preview") id = await evidence(job, "preview", await evidence());
 if (kind === "invalidated") {
  id = await evidence();
  await ownerTx(c, tenant, db => db.$client.query("INSERT INTO app.evidence_invalidation(id,tenant_id,evidence_id,actor_membership_id,reason_code) VALUES($1,$2,$3,$4,'verification_invalid')", [randomUUID(), tenant, id, actor]));
 }
 if (kind === "unverified") {
  // Unverified bytes exist only as an upload: evidence_object.server_verified_at is NOT NULL.
  await ownerTx(c, tenant, db => db.$client.query("INSERT INTO app.evidence_upload(tenant_id,id,job_id,object_key,expected_sha256,maximum_bytes,expected_content_type,state,retention_class,expires_at) VALUES($1,$2,$3,$4,$5,100,'image/png','pending','standard_evidence','2099-01-01')", [tenant, id, job, `fictional/${id}`, hash]));
 }
 if (kind === "null") id = null;
 const before = (await c.admin.query("SELECT count(*)::int n FROM app.variation_approval")).rows;
 await expect(insertApproval(id)).rejects.toMatchObject({ code: "42501", message: "CUSTOMER_EVIDENCE_REQUIRED" });
 expect((await c.admin.query("SELECT count(*)::int n FROM app.variation_approval")).rows).toEqual(before);
});
it("accepts a verified original on the same job as customer_evidence without promoting its method", async () => {
 const evidenceId = await evidence(), id = await insertApproval(evidenceId);
 expect((await stored(id)).rows).toEqual([{ value: expect.objectContaining({ method: "customer_evidence", evidence_id: evidenceId, actor_membership_id: actor, job_id: job }) }]);
});
it("leaves builder attestation and MON-5's customer-authenticated refusal intact", async () => {
 const id = await insertApproval(null, "builder_attestation");
 expect((await stored(id)).rows[0].value.method).toBe("builder_attestation");
 await expect(insertApproval(null, "customer_authenticated")).rejects.toMatchObject({ code: "42501", message: "CUSTOMER_REFUSED" });
});
