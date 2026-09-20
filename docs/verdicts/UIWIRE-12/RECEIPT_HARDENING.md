# Receipt hardening — builder change record

Base: `3e0ba5fdaf0d9daabf8740f2e0d3ee133f6fd9b2`. Author: ChatGPT, working under Ben's explicit instruction to continue JobGuard. This is NOT a Claude verdict or acceptance.

## Scope

Additive migration 0030 serializes command replay before inspecting receipts, binds reversals to tenant/job/invoice/payment, checks current membership even on replay, preserves legitimate pre-upgrade command hashes, and enforces existing integer-pence limits at the SQL entrypoint. Receipt balance and history are read in one statement snapshot. Bootstrap reports its actual migration-table count instead of the stale hardcoded 24.

API calendar dates reject impossible dates. A reusable exact pounds parser is supplied for the next UI repair; it uses integer arithmetic.

## Compatibility and deployment

No historical migration, invoice, receipt, reversal or audit is deleted or rewritten. The six-argument reversal routine remains as history but runtime EXECUTE is revoked: an old client that omits invoice binding must fail closed. Deploy the updated application and migration together; record/list paths retain their signature. No new table grants, real provider, fee eligibility, settlement path or production enablement is introduced.

## Tests added

A real PostgreSQL 0029-to-0030 upgrade with legacy receipts and reversal; fresh bootstrap; simultaneous same-command and changed-payload races; exact invoice binding; revoked and changed actor replay; direct SQL malformed input; cumulative bounds; coherent reads during writes; old-entrypoint denial and unchanged payment-table privileges. Existing partial/full/reversal/overpayment assertions remain, now isolated per test.

CI has not yet been observed for this new commit. Do not infer a pass from this record. Full unit/integration/type/lint/build and mobile/desktop regression results must be read from the candidate's actual CI run. Local full-repo execution is unavailable in this chat container (GitHub DNS/clone unavailable); connected GitHub CI is the execution environment.

Frontend unknown-outcome handling, editable payment dates and removal of direct DOM status mutation are the next continuation, not claimed complete by this commit. Independent Claude review, founder acceptance, main merge and deployment remain outstanding.
