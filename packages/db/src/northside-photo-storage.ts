import type { Pool } from "pg";
import type { PrivateVersionedStorage, StoredObject } from "@jobguard/storage";
import { withTenant, type TenantTransaction, type VerifiedTenantContext } from "./tenant-context.js";

/** Generated Northside originals only. Each instance is bound to its authenticated tenant and job. */
export class NorthsidePhotoStorage implements PrivateVersionedStorage {
  constructor(private readonly pool: Pool, private readonly context: VerifiedTenantContext, private readonly jobId: string) {}

  /** Called inside beginUpload's transaction; scope and content type come from that upload, never a borrowed scope. */
  async put(db: TenantTransaction, upload: { id: string; objectKey: string }, versionId: string, bytes: Uint8Array) {
    const values = [this.context.tenantId, this.jobId, upload.id, upload.objectKey, versionId, Buffer.from(bytes)];
    const inserted = await db.$client.query(`INSERT INTO app.synthetic_evidence_original
      (tenant_id,job_id,upload_id,scope_item_id,object_key,object_version_id,environment,content_type,bytes)
      SELECT tenant_id,job_id,id,scope_item_id,object_key,$5,'synthetic_demo',expected_content_type,$6
      FROM app.evidence_upload WHERE tenant_id=$1 AND job_id=$2 AND id=$3 AND object_key=$4
      ON CONFLICT DO NOTHING RETURNING upload_id`, values);
    if (inserted.rowCount) return;
    const same = await db.$client.query(`SELECT 1 FROM app.synthetic_evidence_original o
      JOIN app.evidence_upload u ON (u.tenant_id,u.job_id,u.id,u.object_key)=(o.tenant_id,o.job_id,o.upload_id,o.object_key)
      WHERE o.tenant_id=$1 AND o.job_id=$2 AND o.upload_id=$3 AND o.object_key=$4 AND o.object_version_id=$5
      AND o.bytes=$6 AND o.scope_item_id IS NOT DISTINCT FROM u.scope_item_id AND o.content_type=u.expected_content_type`, values);
    if (!same.rowCount) throw new Error("immutable synthetic original conflict");
  }

  async readExactVersion(key: string, versionId: string): Promise<StoredObject> {
    const row = await withTenant(this.pool, this.context, async db => (await db.$client.query<{ bytes: Buffer; content_type: string }>(`
      SELECT o.bytes,o.content_type FROM app.synthetic_evidence_original o
      JOIN app.evidence_upload u ON (u.tenant_id,u.job_id,u.id,u.object_key)=(o.tenant_id,o.job_id,o.upload_id,o.object_key)
      WHERE o.tenant_id=$1 AND o.job_id=$2 AND o.object_key=$3 AND o.object_version_id=$4`,
    [this.context.tenantId, this.jobId, key, versionId])).rows[0]);
    if (!row) throw new Error("missing original");
    return { key, versionId, contentType: row.content_type, byteLength: row.bytes.length, bytes: row.bytes };
  }
  async createUploadUrl({ key }: { key: string }) { return `synthetic-db.invalid/${encodeURIComponent(key)}`; }
  async createDownloadUrl({ key, versionId }: { key: string; versionId: string }) { return `synthetic-db.invalid/${encodeURIComponent(key)}?version=${encodeURIComponent(versionId)}`; }
  async deleteExactVersion() { throw new Error("immutable synthetic original"); }
}
