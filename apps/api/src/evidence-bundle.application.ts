import type { Pool } from 'pg';
import {
  withEvidencePackV3Snapshot, loadContractorBundleSources, hydrateContractorBundleSources,
  assembleEvidenceBundle, verifyEvidenceBundle, bundleHash, EvidenceBundleError, ExtraSourceError,
  type VerifiedTenantContext, type AuthenticatedMembership,
} from '@jobguard/db';
import { contractorBundleCheckV1, bundleCheckResultV1, type BundleCheckReason } from './evidence-bundle.contracts.js';

type Storage = Parameters<typeof hydrateContractorBundleSources>[1];
export class BundleCheckError extends Error {
  constructor(readonly code: 'NOT_FOUND' | 'MODE_FORBIDDEN' | 'INVALID_INPUT') { super(code); }
}
const names = ['origin', 'approval', 'proof', 'variation', 'export', 'invoice', 'payment'];
const incomplete = (reason: BundleCheckReason) => bundleCheckResultV1.parse({ version: 'contractor-bundle-check.v1',
  sections: names.map(name => ({ name, state: 'not_checked' })), manifestDigest: null, report: null, reason });

/** Read-only, dark composition. Context and actor come from the authenticated caller, never the query. */
export class ContractorBundleCheckApplication {
  constructor(private readonly pool: Pool, private readonly storage: Storage) {}
  async check(context: VerifiedTenantContext, actor: AuthenticatedMembership, raw: unknown) {
    if (process.env.JOBGUARD_ENV !== 'synthetic_demo') throw new BundleCheckError('MODE_FORBIDDEN');
    const parsed = contractorBundleCheckV1.safeParse(raw);
    if (!parsed.success) throw new BundleCheckError('INVALID_INPUT');
    const input = parsed.data;
    // Refuse before loading any source or object. Same refusal for foreign and inaccessible jobs.
    const loaded = await withEvidencePackV3Snapshot(this.pool, context, async tx => {
      const allowed = (await tx.$client.query(`SELECT 1 FROM app.membership m
        WHERE current_database()='jobguard_synthetic_demo' AND m.tenant_id=$1 AND m.id=$2 AND m.identity_user_id=$3
        AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
        AND app.contractor_job_allowed(m.id,'job.read',$4)`,
      [context.tenantId, actor.membershipId, actor.identityUserId, input.jobId])).rows.length;
      if (context.tenantId !== actor.tenantId || !allowed) throw new BundleCheckError('NOT_FOUND');
      try { return await loadContractorBundleSources(tx, actor, input); }
      catch (error) {
        if (error instanceof EvidenceBundleError) return null;
        if (error instanceof ExtraSourceError && error.code !== 'EXTRA_PACK_MIGRATION_REQUIRED') return 'SOURCE_LINK_INVALID' as const;
        throw error;
      }
    });
    if (!loaded) return incomplete('APPROVAL_OR_SCOPE_INVALID');
    if (loaded === 'SOURCE_LINK_INVALID') return incomplete(loaded);
    let storageReason: BundleCheckReason | null = null;
    // Observe exact-version failures without exposing object names or bytes; the existing hydrator still validates them.
    const checkedStorage: Storage = {
      readExactVersion: async (key, versionId) => {
        let object;
        try { object = await this.storage.readExactVersion(key, versionId); }
        catch (error) { storageReason = 'MISSING_ORIGINAL'; throw error; }
        const expected = loaded.ordinary.originalObjects.find(o => o.key === key && o.versionId === versionId);
        if (object.key !== key || object.versionId !== versionId) storageReason = 'WRONG_VERSION';
        else if (!expected || object.byteLength !== object.bytes.length || object.bytes.length !== expected.byteLength ||
          object.contentType !== expected.contentType || bundleHash(object.bytes) !== expected.sha256) storageReason = 'ALTERED_FILE';
        return object;
      },
      createUploadUrl: input => this.storage.createUploadUrl(input),
      createDownloadUrl: input => this.storage.createDownloadUrl(input),
      deleteExactVersion: (key, version) => this.storage.deleteExactVersion(key, version),
    };
    let sources;
    try { sources = await hydrateContractorBundleSources(loaded, checkedStorage); }
    catch { return incomplete(storageReason ?? 'SOURCE_LINK_INVALID'); }
    try {
      const bundle = assembleEvidenceBundle({ version: 'evidence-bundle-input.v1', subject: { kind: 'extra', ...loaded.owner },
        lifecycle: { state: 'ordinary' }, sources, absentSections: loaded.absentSections,
        // Internal metadata inspection only. This opaque viewer reference grants no send/recipient authority.
        recipients: [actor.membershipId], checkpoint: null,
        selected: sources.map(({ sourceId, sourceVersion, objectVersion, sha256 }) => ({ sourceId, sourceVersion, objectVersion, sha256, disclosure: 'metadata' })),
      });
      const report = verifyEvidenceBundle(bundle.zip); // No independent trust is invented from the just-built digest.
      const present = new Set(bundle.manifest.entries.map(entry => entry.kind));
      return bundleCheckResultV1.parse({ version: 'contractor-bundle-check.v1',
        sections: [...new Set([...names, ...present, ...bundle.manifest.absentSections])].sort().map(name => ({ name,
          state: present.has(name as typeof bundle.manifest.entries[number]['kind']) ? 'present' : 'absent' })),
        manifestDigest: bundle.manifestHash, report, reason: null });
    } catch (error) { if (error instanceof EvidenceBundleError) return incomplete('SOURCE_LINK_INVALID'); throw error; }
  }
}
