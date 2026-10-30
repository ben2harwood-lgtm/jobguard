# M5-9 synthetic signed evidence manifests

This slice adds an offline signing library and verifier, using installed Node crypto and the existing v3 evidence-pack and ENT-10b audit verifiers. No migration, new dependency, provider, public route, database grant or live key is introduced. Existing exports and HTTP contracts are unchanged.

`packages/db/src/signed-evidence-export.ts` is deliberately a local module, not a runtime package export. `SyntheticEvidenceSigner` creates in-memory synthetic Ed25519 keys. Supply an existing audit export and a canonical v3 evidence pack; signing checks their tenant match and validates both before producing `signed-evidence-export.v1`. This is a synthetic preparation tool, not a new authorized export endpoint. Parsing supplied material grants no access or producer provenance. Use only made-up material. The existing producer's authorization, redaction, hidden-data and audit controls remain responsible for gathering it; this library reads no business tables or objects.

The signed manifest binds tenant/job/case, audit export identity, asserted creation time, signer identity and version, signer fingerprint, evidence manifest digest, exact evidence artifact digest and normalized audit artifact digest. The v3 verifier checks declared scope/revision/object links, duplicate or missing sources, content hashes, lifecycle declarations and pre-lock section restrictions. The audit verifier checks the complete chain and checkpoint. Neither source content nor public keys are returned in reports. No financial amount or allocation is calculated or posted, and no lock, approval, settlement or reversal is changed. A replay under a different independently expected export or scope fails; repeated inspection of the same artifact is intentionally deterministic and has no side effects.

## Verification

After the normal workspace build, run:

```sh
node packages/db/tools/verify-signed-evidence-export.mjs bundle.json independent-context.json
```

The strict context shape is:

```json
{
  "version": "evidence-verification-context.v1",
  "tenantId": "<expected UUID>",
  "jobId": "<expected UUID>",
  "caseId": "<expected UUID>",
  "exportId": "<expected audit export UUID>",
  "checkedAt": "2026-10-29T08:00:00.000Z",
  "trustedKeys": []
}
```

Obtain the expected scope and public registry independently. Populate `trustedKeys` with retained `evidence-signer-key.v1` records: tenantId, signerId, keyVersion, algorithm (`Ed25519`), publicKeyPem, fingerprint (SHA-256 SPKI DER), notBefore, expiresAt, revoked and version. Never copy trust out of the bundle being inspected. Duplicate tenant/signer/version records are rejected, even if identical. Registry revocation is authoritative over the bundled record. A registry for another tenant or key fingerprint grants no trust. The outer trusted signer attests the embedded audit artifact; its per-export public key and checkpoint are not independently timestamped.

Exit 0 means integrity checked against the independently trusted fixture key and expected scope, 1 means verification/trust failed, and 2 means usage or unreadable JSON. `integrityValid` requires `signerTrusted`; a valid signature from an untrusted bundled key returns `integrityValid: false`. Reports always say `complete: false`: timestamps, checkpoint origin, producer provenance and the truth of the commercial claim are not established. Reports name the signer/version/fingerprint, algorithm, expiry and revocation assumptions. Missing/invalid material is a typed `SIGNED_EVIDENCE_EXPORT_INVALID` failure with no source data in the error.

## Rotation and preservation

Call `rotate` with a new unique version and a valid time interval. Subsequent signatures use that key; old private material is discarded by the signer. `verificationKeys()` returns copies of all retained public records for this tenant only. Preserve these independently before ending the synthetic process. Old bundles and signatures are never rewritten. A historically valid signature remains mathematically verifiable after key expiry; the report flags expiry at the supplied verification time and warns that the asserted signing time is unproven. Revoked keys remain cryptographically checkable but are untrusted. This library does not invent a revocation-date or compromise-grace policy.

Preserve exact original bundles and v3 source bytes, immutable object-version references, independent public-key registry snapshots, checkpoint material and verification instructions under the approved retention/access policy. Keep synthetic private keys out of exports, fixtures and logs. Do not treat hashes as anonymization. Retention/deletion approvals, persistent key custody and recovery, approved scope/recipient binding in a future delivery endpoint, real-key activation and production authorization remain separate work and gates.

Before a real release and periodically under the security owner's assurance programme, review Ed25519/SHA-256 support, key compromise/revocation evidence, preserved verifier execution and retained material readability. If an algorithm needs replacement, preserve the original signatures and verification material; add independently authorized preservation attestations rather than silently re-signing historical exports. No automatic schedule or live key management is enabled here. External timestamp verification remains M4-4; signatures establish integrity, never proof that work occurred or a commercial claim is true.

## M5-9 persisted synthetic store (0493)

`SignedEvidenceExportStore.persist(context, sessionActor, request)` takes the actor (`membershipId`, `identityUserId`) from the verified session, separately from the untrusted request. It accepts `signed-evidence-export-store.v1` with `authorizationId`, `actorMembershipId`, exact `recipient` (example.invalid only) and the signed `bundle`. A request actor differing from the session actor is refused; an active owner membership must belong to that session identity before creation or replay. Stored actor and audit attribution use the session actor, and the approval must still belong to that actor. It performs no delivery. The caller must obtain an explicit approved Decision for action `evidence_export.store`, subject type `recovery_case`, subject reference equal to the bundle case UUID, policy `signed-evidence-export-store.v1`, revision 0, null amount/currency, and content hash from `signedEvidenceBundleHash(bundle)`. This hashes the full schema-normalized bundle bytes, including the signed scope and key version. Approval recipient must match exactly, and authorization must be live and unrevoked. An active owner is required on both tracks. Production creation remains disabled.

An assurance connection provisions validated public records through `retainEvidenceExportKey`; runtime cannot insert keys. Reusing a tenant/signer/version with different material fails. Both tables force tenant RLS and retain immutable rows. The store checks the independent registry and the existing offline verifier before inserting. It preserves exact bundle text, the approval/recipient, tenant/job/case, signer/version/fingerprint and a tenant-qualified audit reference. SQL enforces the approval and scope bindings; a deferred audit check requires the matching event and hashes in the same transaction. Replay of identical export/approval/actor/recipient/bytes returns the stored identity without another event; conflicting replay fails. A replay acknowledges an existing record and does not deliver or reauthorize it.

Retrieve retained bundle text and public registry records through an authorized server/assurance path scoped to the tenant; pass independently obtained expected scope and retained records to the offline verifier above. There is no new HTTP/download endpoint. Rotation provisions a new version and never updates earlier rows, bundle bytes or signatures. Registry records are retained registration snapshots: current revocation evidence must still be supplied independently at verification time; this change introduces no revocation or compromise-grace policy. Private keys never enter either table. Audit contains references and hashes, with the exact recipient held only in the access-controlled export and authorization rows. Existing source minimization and pre-lock exclusion checks remain in the verifier.

The application verifies Ed25519 and source-file integrity; SQL guards authorization, relational scope, immutability and the matching audit record. This does not claim protection from a compromised privileged database writer or turn a bundled checkpoint into an external timestamp. Retention/deletion approvals, production custody and external timestamps remain release gates. Migration 0493 adds empty tables and one trigger function without backfill or changes to prior routines. Forward-fix with a new migration if needed; stop new creation and preserve existing records and verification keys instead of rolling back by deleting them. No new external service or operational alert is introduced.
