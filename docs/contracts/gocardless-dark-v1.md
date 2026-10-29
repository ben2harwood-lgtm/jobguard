# M4-15 dark Direct Debit specimen

RED: money. Built on the unmerged M4-12/M4-13 seams. This is deterministic,
in-memory, made-up sandbox evidence only. The fake payload/signature protocol is
not a claim about GoCardless's API or compatibility. No provider SDK is installed;
none is needed for this seam. The hosted URL uses the reserved `.invalid` domain.
No real endpoint, credentials, personal data, HTTP route, worker registration or
production adapter exists. Production is refused by the shared executor; its
adapter list defaults empty, and the fake advertises `productionEnabled: false`.

The fake setup consumes server-supplied approved Decision/notice assertions;
it does not authenticate a human or create authority. Provider defaults must be
disabled. One mandate per tenant is modelled; replacement and retry policy await
D04/D05. Created, pending submission, active, cancelled, failed and expired remain
separate; terminal events cannot be undone by delayed activation or setup replay.
Standing terms are rechecked by M4-12 immediately before initiation. Mandate
revocation blocks new debit submission; accepted/unknown requests are reconciled.
Refunds return original settled funds without starting another debit mandate.

The shared tenant-serialized reservation store owns all card and debit balances.
Creating a debit request reserves value; pending submission, submitted and
confirmed are not payout. Only a signed `paid_out` fake event settles it. Every
webhook authenticates the bounded raw body before parsing. Batch events have
separate transactions/results, content-bound IDs, strict environment/account
routing and exact tenant/command/object/amount bindings. Duplicate objects do not
repeat allocation. Errors and audit contain only codes/identifiers/states.

Definite pre-confirmation failure/cancellation releases the reservation. Late
failure, chargeback, failure after confirmation/payout, or progress after release
retains a reconciliation hold, never automatically opens the balance for another
rail. Stale progress never regresses payout. A refund reserved before a later
collection reversal is refused at execution. The existing immutable invoice,
current final-account revision, attribution, credit and exact-money checks apply
to both rails. No shadow queries or new money calculations were added.

No migration is needed: this slice adds no persistence or tables. M4-12's durable
ReservationStore implementation is still unregistered; in-memory tests prove the
seam, not PostgreSQL guarantees or restart durability of the fake provider.
Forward fix: keep the adapter unregistered if a fake lifecycle assumption changes.

NOT built: real provider protocol/settings, production endpoints/keys, durable
mandate/provider storage, manual reconciliation command/UI, notice sending,
replacement mandates, automated retries/dunning, live settlement or refund,
ledger postings, deployment. Production requires D04/D05 settings and notification
approval, D02/D01/D03/D13 as applicable, G4-S/G4-C, green CI on current main and one
independent Claude RED review. Sandbox success cannot satisfy those approvals.
Operational follow-up: a durable adapter must surface reconciliation holds and
per-event failures to the existing reconciliation workbench, without logging raw
payloads or signatures. No live alert or external action is introduced here.
