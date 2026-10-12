# M4-8-S recovery allocation contracts

Status: core contracts and mapping implemented; persistence and transports HELD pending the dispatch lock-order clarification. Synthetic fixtures only. No production capability is enabled.

`recovery-allocation-command.v1` is a strict, versioned union:

- `review` and `allocate`: command ID, case ID, payment ID, selected finalized evidence ID, expected case revision and positive integer gross pence. An optional remittance evidence ID selects a source; it supplies neither shares nor a rule. `allocate` additionally requires the server review's approval hash.
- `review_reverse` and `reverse`: command ID, allocation ID, expected case revision and positive integer gross pence. An optional credit-note ID selects a merged credit fact; otherwise the intended source is the merged payment reversal. `reverse` additionally requires the approval hash.

All IDs are UUIDs. Amounts use the existing `1_000_000_000_000` pence magnitude limit. Tenant, settlement state, split, rule, exact rationals and reviewer fields are refused. These schemas do not themselves authorize or persist an action. The future application must resolve the verified principal per call, recheck current owner membership, bind an approved Decision to the exact server artifact and reject other deployment modes.

`recovery-receipt-facts.v1` is an internal mapping boundary, never an HTTP command. It requires complete invoice composition, `synthetic_demo`, receipt identity/effective time/source and exact gross, every line's original net/gross ratio, exact outstanding balance and earliest server existence time, optional reliable explicit shares and optional separate-invoice fact. The caller is responsible for obtaining these facts from immutable persisted records; a caller assertion of `compositionComplete` is not evidence.

`mapRecoveryReceiptToLines` passes these facts to SH-1's `allocateReceiptToLines`. SH-1 owns explicit → separate invoice → pro-rata priority, exact date comparison, the deposit exclusion and reversal sign/ratios. The mapping preserves the chosen source and serializes reduced numerators/denominators as decimal strings. It implements no second proportional allocation or rounding algorithm. `sumRecoveryDeemedNet` uses only SH-1 exact helpers and returns an exact fraction of pence; it establishes neither qualifying principal nor fee entitlement.

`assertRecoveryAllocationSplit` validates an integer gross/net/tax split with the shared exact helpers and ratio cross multiplication. A split must fit both the evidenced amount and the claim remainder. It does not calculate VAT or introduce a rounding policy. Fractional server-derived case splits remain refused under Q6; line deemed net remains rational and unrounded.

Fixture expectations proven in pure tests: F4 `2000000/43`, F4b `80000/1`, F5 deposit `0/1` then `40000/1`, F6 `0/1` with explicit non-catch remittance, F7 `80000/1` with the main invoice untouched. Fee-kernel cross-checks are test-only. Nothing fee-related is stored or derived by the implementation.

## Transaction composition hold

The merged `RecoveryCaseRepository.commandInTransaction` is the intended sole path for `record_landing` and `reverse_landing`. It must run after all caller business locks/writes; after return the caller may only append audit and commit. A newly recorded command has acquired the audit head. A replay returns before that append, so the caller's later audit batch acquires the head if needed.

The dispatch's final review line also forbids caller locks on job/case rows before the joined call. Required composite foreign keys acquire those rows' KEY SHARE locks on INSERT. No persistence caller has been added while that literal restriction remains unresolved. Acquiring the same case advisory key before all allocation INSERTs would preserve the advisory-key → job/case order used by `app.approve_synthetic_landing`; that interpretation requires the coordinator's clarification. Deferred foreign keys would merely move business locks after audit and are not a substitute. No existing table, v1 landing routine or financial record is changed.

Migration 0136 is reserved but not created. Its mandatory upgrade proof, grant catalogue, database conservation tests and browser journey remain owed. Saved F5/F7 remain separately held under Q2.
