# LP-13 downstream effects, v1

RED build-ahead on LP-12 at `f8bc1823ed596b6457fc8865c66eaa96ad4da5f9`.
All fixtures use made-up data.

| Item | Safeguard on this base | Regression coverage |
| --- | --- | --- |
| 0017 invoice-number burning | LP-8a (0766) withdraws standalone reservation and direct runtime writes. The invoice routines in 0764 allocate within checked issuance. | LP-13 checks repeated reservation, direct writes, revoked approval and cross-firm access, then compares issued records. LP-8a and invoice suites cover legitimate allocation, concurrency, replay and rollback. |
| 0053 legacy unknown raiser | The 0765 trigger records `legacy_unrecorded` and `legacy_synthetic_capture` with NULL membership and command. Fee qualification is controlled separately. | LP-13 inserts a legacy capture and verifies the stored attribution. The origin suites cover the normal command path. |
| 0003 scope progress actor | LP-6d (0749) verifies the bound tenant and actor before looking up progress. A legal transition updates scope progress only. | LP-13 checks missing binding, forged settings, a foreign firm, invalid reason and stale revision. It verifies start, completion and rework alongside stable job, price, invoice, fee, approval and cap state. |
| 0120 SSO audit connection | LP-11 (0765) loads the connection to open a protected audit scope for its tenant before sealing the event. | LP-13 tests an unknown connection and checks exact audit placement with a stale tenant setting. The identity and audit suites cover legitimate SSO and event custody. |
| 0095 adoption replay | The 13-argument overload remains retired and revoked. LP-5 and LP-6 bind command and replay to the authorized actor. | LP-13 tests refusal of the retired overload, denial for another actor claiming the original actor's result, and repeat replay by the original actor with stable effect counts. |

Migration `0769_lp13_low_value_batch.sql` follows LP-12's 0768 and has an
empty catalogue proof. The upgrade test installs the predecessor, records
the relevant routine definitions, owners, ACLs, search paths, relations,
policies and an existing sequence number, then checks exact preservation
after 0769. It also checks continued denial of standalone reservation and
continued execute grants for checked invoice issuance. The marker requires
no backfill or data rollback.

Before landing, reconcile the branch with main and recheck migration order.
The RED review applies to the exact head reviewed.
