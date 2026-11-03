import type { Pool } from "pg";
import type { PrivateVersionedStorage } from "@jobguard/storage";
import { sha256 } from "@jobguard/storage";
import { syntheticSpeechAudio } from "@jobguard/core";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";

export class SpeechAudioError extends Error {
  readonly code = "AUDIO_NOT_VERIFIED";
  constructor() { super("AUDIO_NOT_VERIFIED"); }
}

/** No new route or credential: this reader is for the dark fixture service only. */
export class FixtureSpeechAudioReader {
  constructor(private readonly pool: Pool, private readonly storage: PrivateVersionedStorage,
    private readonly context: VerifiedTenantContext) {}

  async read(tenantId: string, jobId: string, evidenceId: string): Promise<unknown> {
    if (tenantId !== this.context.tenantId) throw new SpeechAudioError();
    const row = await withTenant(this.pool, this.context, async db => (await db.$client.query<{
      id: string; job_id: string; object_key: string; object_version_id: string; sha256: string;
      byte_length: string; server_verified_at: Date;
    }>(`SELECT e.id,e.job_id,e.object_key,e.object_version_id,e.sha256,e.byte_length,e.server_verified_at
      FROM app.evidence_object e JOIN app.evidence_upload u
      ON (u.tenant_id,u.id)=(e.tenant_id,e.upload_id)
      WHERE e.tenant_id=$1 AND e.job_id=$2 AND e.id=$3 AND e.kind='original'
      AND e.evidence_type='synthetic_speech_audio' AND e.content_type='audio/wav'
      AND u.state='verified' AND u.object_version_id=e.object_version_id`, [tenantId,jobId,evidenceId])).rows[0]);
    if (!row) throw new SpeechAudioError();
    // Object I/O is deliberately outside the database transaction.
    const object = await this.storage.readExactVersion(row.object_key, row.object_version_id);
    if (object.key !== row.object_key || object.versionId !== row.object_version_id || object.contentType !== "audio/wav" ||
        object.byteLength !== Number(row.byte_length) || object.bytes.length !== object.byteLength ||
        sha256(object.bytes) !== row.sha256.trim() || row.sha256.trim() !== sha256(syntheticSpeechAudio())) {
      throw new SpeechAudioError();
    }
    return { contractVersion: "registered_speech_audio_v1", tenantId, jobId, evidenceId,
      state: "verified", environment: "synthetic_demo", evidenceType: "synthetic_speech_audio", contentType: "audio/wav",
      objectKey: row.object_key, objectVersionId: row.object_version_id, sha256: row.sha256.trim(),
      byteLength: object.byteLength, bytes: object.bytes, serverVerifiedAt: row.server_verified_at.toISOString() };
  }
}
