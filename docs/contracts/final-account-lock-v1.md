# SV-4 final-account lock v1

Synthetic only. Dispatch addendum of 12 October 2026 overrides the older invoice-column proposal and uses migration `0132_final_account_lock.sql` after SV-2 `0128`. D12, D13 and G1 remain pending; this implements no detector, catch confirmation, reconciliation completion writer, fee or production send.

## Review and lock

The existing account assembler supplies the accepted baseline, approved captured variations and proof. Existing invoice/credit/receipt projections remain available. Review also lists every builder/final-review capture, including unpriced, rejected and withdrawn records, separately from approved commercial totals. Review reads no shadow relation. The prompt is **Anything else to add before you finish this job?** The declaration is **I've reviewed the work and extras on this job and this is my complete final account.** Its version is `final_account_declaration.v1`; the button is **Complete final account**.

Each distinct baseline scope identity needs a latest append-only `done | removed | deferred` disposition. These facts change no money. Tenant-scoped acceptance uses exactly `synthetic_final_check_terms.v1`. The only terms statements displayed are the four §10.2.10 statements:

- analyses job records;
- may identify possible unrecorded extras;
- compares them independently with the completed final account;
- may earn the success fee on paid recoveries that qualify.

`AddFinalReviewExtra` uses SH-1's `final_review` origin, price primitives and immutable identity contract. It creates capture, including unpriced capture; it grants no customer approval. Locking refuses new final-review commands afterwards. A completed pre-lock command can replay its original result. The existing LogBuilderExtra implementation is unchanged. Migration-owned triggers serialize capture receipt claims and source inserts with the job lock, without granting runtime UPDATE on job. Membership is rechecked after waiting for the job. Source revision/disposition/receipt writes precede the final audit-head lock.

`LockFinalAccount` accepts strict `final-account.lock.v1`: command ID, current final-account revision ID, expected revision and the closed declaration version. Tenant, actor, server time and hashes are server-derived. Lock creation requires an active owner, the small-builder synthetic track, the current unblocked account, complete dispositions and terms acceptance. One transaction writes its receipt, immutable lock and audit event. A replay with the same payload returns the original snapshot. A different payload returns `IDEMPOTENCY_CONFLICT`; a different command returns `FINAL_ACCOUNT_ALREADY_LOCKED` with the existing lock ID.

## Snapshot and verification

The lock binds tenant/job, account revision, baseline, every Log an extra in all five states, final-review captures, baseline lines, dispositions, declaration/terms versions, owner, exact server cutoff, command and audit event. Core delegates to SV-1's `createLockSnapshot`; three appended SV-1 exports reuse its private canonicaliser for the component hashes. SQL's private persistence encoder emits the same bytes; the repository checks all four hashes against core before commit. No helper is granted to PUBLIC or the shadow role.

The capture register contains logged and final-review extras only; baseline work is bound separately by the baseline identity and line-set hash. Source references bind complete stored source rows with a SHA-256, including original text and times. Each line reference also binds the complete account revision. Source encoding fixes UTC; public JSON timestamps retain PostgreSQL microseconds. SV-1's nonnegative amount envelope contains magnitudes for signed adjustments; the source reference binds the signed original, and authoritative account/invoice sums continue to use signed exact pence. A capture label is limited to SV-1's 4,000 characters; its source fingerprint binds the full original text. No label or magnitude determines an invoice amount or fee.

The verifier re-reads the locked account revision and captured identities and reports component-hash/digest mismatches. Later new captures are outside the original identity set; changes to the original sources are detected. The stored snapshot remains sufficient to reproduce SV-1's canonical bytes. Mutation triggers refuse UPDATE, DELETE and TRUNCATE even for the ordinary migration owner. A superuser can disable triggers; hashes and the audit chain do not defeat a privileged rewrite.

## Check facts and invoice binding

`final_account_lock_check` contains append-only `pending | failed | completed` facts, exact lock/cutoff binding and a nullable run ID reserved for SV-5. Runtime has SELECT only. `jobguard_shadow` has INSERT only on this table, guarded by an INVOKER trigger; no other pre-existing grant, policy or role changes. Its composite FK rejects a foreign lock, job or cutoff. The trigger sets server time and shares an advisory transaction lock with invoice issue; latest status governs issue. Equal fact timestamps are refused by uniqueness rather than arbitrarily deciding their order. SV-5 must implement evidence-complete runs and write these facts.

The new command and controlled routine require a lock and its exact completed check. Missing/pending completion gives `FINAL_CHECK_NOT_COMPLETE`; failed gives `FINAL_CHECK_FAILED`; no lock gives `FINAL_ACCOUNT_LOCK_REQUIRED`. The UI has the same fail-closed buttons and the fixed **Running JobGuard's final check** line. No shadow count or content participates in these projections.

The older invoice-without-lock path is NOT guarded yet; 'no unguarded final-invoice path remains' is HELD and owed by SV-5.

`customer_invoice` is unchanged, including its row shape. The new `final_account_invoice_binding` is keyed by tenant/job/invoice and stores kind, account revision, lock and check. An invoice with no side row is interpreted as `final` with no lock. `interim` is a value only; there is no new interim issue path. The existing deposit/practice paths remain unchanged.

Final issue binds the locked revision and refuses a second main invoice. Supplementary issue requires an existing main invoice and a current later revision whose predecessor chain reaches that lock; its baseline must match. It selects only commercial source identities absent from earlier final/supplementary invoices, including legacy invoices without side bindings. Replacing or removing an already-invoiced source is refused as a correction requirement; this leaf adds no correction policy. `final_account_invoiced_line` binds exact tenant/job/revision/line/scope identities and integer net, tax and gross. Its INVOKER trigger validates every source field. Candidate standard VAT uses the existing exact positive expression from migration 0028 and largest-remainder display allocation; the repository verifies totals and allocations with merged money, tax and allocation primitives before commit. Reference F7 is 3,360,000 / 672,000 / 4,032,000 pence, followed by 80,000 / 16,000 / 96,000 pence for the single added line. The test-only later revision is not a real catch path.

Invoice issue creates exact inline Decision approval, authorization, artifact, side bindings, simulated outbox, command receipt and audit atomically. It makes no business network call. Its side tables are immutable and FORCE RLS-protected. Runtime cannot insert bindings or checks directly. Existing grants and whole-row fingerprinted column lists have catalogue/upgrade proofs.

## Upgrade and owed work

An upgrade proof proves ITS OWN migration only: install everything before N, snapshot, apply N alone, compare; then apply everything after N and require success twice. Compare existing rows by named pre-existing columns after all migrations. Never assert that later migrations add no column or replace no function; the fingerprinted-table guard owns 'may never gain a column'.

The proof uses named-column `row_to_json(t)::text`, exact column types and captured primary-key identities, with seeded-row guards and rolled-back controls. A microsecond mutation/retype fails; a nullable column, replaced function and later inserted row pass the same comparator. Separate guards protect the fingerprinted tables. No existing row is backfilled or rewritten by 0132. Repair by an additive forward migration; never delete locks, commercial history or issued invoices to roll back.

SV-5 owns completion runs, catch confirmation/reveal screens, links for real catch revisions and closure of Q1's older issue path. Founder decisions remain owed for any other terms wording, widening the owner role, and monetary effects of removed/deferred dispositions. Real-data/release gates and independent Claude/Sol checks remain separate from this builder receipt.
