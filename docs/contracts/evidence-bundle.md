# M4-3 synthetic evidence bundles

`evidence-bundle-manifest.v1` is additive to the existing v1/v3 TEXT packs. It is an
internal assembler/export API, not a new public download route or send command.
Existing stored packs and attachment approvals are unchanged. There is no migration.

Run `loadContractorBundleSources` in `withEvidencePackV3Snapshot` with the already
authenticated membership. It checks current job-read authority and the latest
approved request, exact revision/hash/net, every snapshotted step and outcome.
It uses the merged ENT-5 origin/proof reader and tenant/job/extra-qualified joins.
Call `hydrateContractorBundleSources` after the transaction commits: the existing
storage reader checks exact original version, hash, length and media type. Pass the
result to `assembleEvidenceBundle`. Missing exports/invoices/payments remain
explicit absent sections; they are never invented from an approval or redirect.

`loadRecoveryBundleSources` reuses the merged immutable quote/acceptance, variation,
proof, supplier order/delivery/invoice and case-history joins, adding case-specific
landing allocation, restricted receipt metadata, proof references and reversals.
It returns an internal source/dependency pool plus explicit selected IDs. The caller
pins selected versions/hashes and selects disclosure separately. Receipt capacity,
proof version and invalidation are checked; this reader does not post or recompute
money. It retains reversal history and does not declare a receipt qualifying.

`smallBuilderBundleMaterial` consumes a content-checked, synthetic-records CH-8
export. It preserves all eight section bytes and lock/capture identities; section
association links in the new manifest bind that CH-8 lifecycle snapshot. It does
not run detection, grant disclosure, or replace the existing must-surface check.
Only the existing checked producer may supply this input. Pre-lock inputs have no
shadow sections or absent-section placeholders. No new shadow reader is introduced.

The assembler rejects duplicate IDs/selections/recipients, altered content, missing
original inputs, conflicting exact-version links and tenant/job/subject/scope
mislinks. Selected entries and files use code-unit order. PDF object offsets, ZIP
STORE members, CRCs and DOS epoch metadata are deterministic. The PDF is a readable
index; exact source bytes are UTF-8 JSON artifacts in the ZIP. No dependency is added.

Disclosure is explicit per selection. `metadata` creates an identity/hash-only
artifact linked to its checked original; original free text, storage keys and bank
payloads are excluded. `original` is deliberate disclosure of that exact record.
Contractor billing status is a labelled derived line projection with the original
allocation-run digest, predecessor and exact signed allocations. Other invoice
lines, invoice totals, raw remittances and account feeds are excluded.

The returned manifest digest commits to recipients, the exact artifact set, PDF,
source identities, derivative modes, lifecycle and checkpoint reference. It is the
value a future send authorization must bind, together with the existing action
contract. Assembly itself does not approve, persist or send anything. A caller must
not reuse a TEXT-pack approval for this distinct exported set.

After building the installed packages, offline verification needs no database:

```
node packages/db/tools/verify-evidence-bundle.mjs bundle.zip \
  --trusted-manifest-sha256 <independently-obtained-digest> \
  --trusted-checkpoints independent-checkpoints.json
```

The checkpoint file is an array of `{tenantId, sequence, headHash}` records with
sequence encoded as a positive integer string. Trust material must arrive through
an independent channel. A reference match does not prove audit-event inclusion or
externally anchor the chain. Reports distinguish intact/damaged bytes, absent files,
missing/untrusted/trusted checkpoint references, manifest authority and absent
sections. Exit 0 means export integrity and independent reference agreement only;
1 means findings; 2 means invalid input. External claims always remain unverified:
hashes do not certify workmanship, customer agreement, settlement truth or fees.
M4-4 trust/anchoring and all production/security/commercial gates remain separate.

Validation: focused unit/CLI/standard-ZIP checks run locally. The new PostgreSQL
integration test uses real ENT-5 commands and RLS; it must run in CI, since this
sandbox cannot start PostgreSQL or bind localhost. Independent RED review and
full required CI against current main remain outstanding.
