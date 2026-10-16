# SERIOUS-B4 — Batch 4 evidence and proof

Issued 16 October 2026, RED lane, based on `0bbb5ddbd074b791ece740a1861a6b7cc2fd6577`.

- S12: reject only a pending/quarantined upload still naming the failed version; a completed registration survives late failure.
- S13: migration `0167_evidence_proof_rework.sql` adds append-only same-stage predecessor links, unique roots and unique successors. Existing completion rows/receipt hashes remain unchanged. Replacement receipts name their predecessor; the application reads the current completion. The previously merged upload-lock invalidation protocol remains intact.
- S14: generated originals use `practiceOwnedJobsSql`; the existing material-requirement trigger follows the same immutable adoption ancestry and retains SKU/session isolation. The already-fixed inbox path is untouched.

This batch shares evidence/proof persistence and must serialize with other changes to those files. Migration 0167 is above supplied main's highest 0166; renumber at integration if required. Runner and MIGRATIONS.md stay untouched under MERGE-CHURN-1. No commercial rule, policy approval, real data, spending, new provider or external action is introduced.

Builder verification and CI-only PostgreSQL cases: `docs/verdicts/SERIOUS-B4/BUILDER_RECEIPT.md`. Technical acceptance is held for dispatcher CI, an independent verdict on the dispatcher-created exact commit, and separate acceptance. No self-acceptance or release claim.
