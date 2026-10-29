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

Exit 0 means **synthetic integrity** verified under the supplied registry and expected scope, 1 means verification/trust failed, and 2 means usage or unreadable JSON. Reports always say `complete: false`: timestamps, checkpoint origin, producer provenance and the truth of the commercial claim are not established. Reports name the signer/version/fingerprint, algorithm, expiry and revocation assumptions. Missing/invalid material is a typed `SIGNED_EVIDENCE_EXPORT_INVALID` failure with no source data in the error.

## Rotation and preservation

Call `rotate` with a new unique version and a valid time interval. Subsequent signatures use that key; old private material is discarded by the signer. `verificationKeys()` returns copies of all retained public records for this tenant only. Preserve these independently before ending the synthetic process. Old bundles and signatures are never rewritten. A historically valid signature remains mathematically verifiable after key expiry; the report flags expiry at the supplied verification time and warns that the asserted signing time is unproven. Revoked keys remain cryptographically checkable but are untrusted. This library does not invent a revocation-date or compromise-grace policy.

Preserve exact original bundles and v3 source bytes, immutable object-version references, independent public-key registry snapshots, checkpoint material and verification instructions under the approved retention/access policy. Keep synthetic private keys out of exports, fixtures and logs. Do not treat hashes as anonymization. Retention/deletion approvals, persistent key custody and recovery, approved scope/recipient binding in a future delivery endpoint, real-key activation and production authorization remain separate work and gates.

Before a real release and periodically under the security owner's assurance programme, review Ed25519/SHA-256 support, key compromise/revocation evidence, preserved verifier execution and retained material readability. If an algorithm needs replacement, preserve the original signatures and verification material; add independently authorized preservation attestations rather than silently re-signing historical exports. No automatic schedule or live key management is enabled here. External timestamp verification remains M4-4; signatures establish integrity, never proof that work occurred or a commercial claim is true.
