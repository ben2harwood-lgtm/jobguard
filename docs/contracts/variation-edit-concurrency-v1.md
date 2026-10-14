# Variation edit concurrency

`variation-command.v1` revision requests require `expectedRevisionId`: the UUID the builder loaded, or explicit `null` when pricing a captured extra for the first time. Missing values fail validation. Existing propose, approve and reject payloads are unchanged. Old edit clients must reload the updated application before submitting another edit.

The application compares this value with its read, then `insertPricedVariation` locks the variation and compares the stored pointer with the new revision's `previousRevisionId` before any revision or rate-observation insert. A mismatch raises `VariationRevisionConflict` (`code: VARIATION_REVISION_CONFLICT`), exposed as HTTP 409 by both variation HTTP adapters. The browser retains the pointer from when editing starts.

First pricing uses the captured variation and scope identity, previous revision `null`, and revision number 1. It leaves capture, lineage, track and origin records intact. Price arithmetic continues through `priceVariation`.

Rejection locks the targeted variation, requires its exact current revision in `priced` state and refuses any existing approval for that revision before inserting a rejection. Approval and rejection share the same variation lock. Approved commercial history cannot be cancelled by a stale rejection.

No migration, grant, external action or fee-policy change. Revision retry idempotency and revision/rejection audit events remain separate LATER findings from the night audit.
