# M4-23 evidence-based rollout checklist (unexecuted)

Nothing is enabled by this pack. G0–G5 remain closed for this work. Sandbox
success opens nothing. This checklist makes no regulatory approval, certification
or guaranteed recovery claim. No retroactive pilot billing is allowed. All owner,
approval and result slots below are intentionally blank; missing evidence stops
the affected release. Use fictional data and fake adapters for this work only.

## Shared entry evidence

- [ ] Exact candidate commit and deployment/configuration revisions: ____.
- [ ] G0 and applicable G1/G2/G3/G5 evidence; approved residency, retention,
  permissions, alerts, incident ownership, backups and restore rehearsal: ____.
- [ ] Current required CI against main, applicable PostgreSQL/migration, browser
  and evaluation results, and independent exact-head RED review: ____.
- [ ] M4-9, M4-10, M4-17 dependencies and integrated sandbox outcome/negative-case
  evidence, labelled by actual test type and environment: ____.
- [ ] Exact D01–D16 statuses/versions compared to the inventory; applicable rail
  declarations and policy/gate evidence independently inspected: ____.
- [ ] Explicit consenting tenants, jurisdictions, rail IDs, amounts/currency,
  immutable artifacts, limits, time window and rollback triggers: ____.
- [ ] [Rollback/disable plan](rollback-disable-plan.md) bound to deployed outbound
  pause and each selected per-rail switch, with refusal/drill evidence: ____.
- [ ] No-charge pilot population excluded from billing; any future activation
  needs a new explicit versioned agreement and migration task: ____.

Shared owner: ____; approval references: ____; entry review result: ____.

## G4-C contractor decision (separate release record)

- [ ] ENT-7 acceptance and D16/D02 approvals, solicitor-reviewed enterprise
  contract, D04/D05/D12 and selected rail's exact required policies: ____.
- [ ] Site-origin extra → contract approvals → export → billing/payment import →
  monthly statement/platform invoice → single collection → reconciliation: ____.
- [ ] Office entry, order line, client instruction, rejection, part payment,
  credit, duplicate, replay, revoked consent, uncertainty and competing rails
  produce no unjustified fee: ____.
- [ ] Penetration review of money surface and operational evidence: ____.
- [ ] G4-C approval authorizes only a bounded smoke; identify Stripe and/or
  GoCardless contractor rails individually. All G4-S rails stay disabled: ____.
- [ ] Follow [G4-C smoke steps](live-smoke-test-procedure.md#g4-c-contractor);
  reconcile actual effects and obtain independent review before expansion: ____.

G4-C owner: ____; bounded-smoke approval: ____; result: ____;
reconciled smoke review: ____; general-rollout approval: ____.

## G4-S small-builder decision (separate release record)

- [ ] Applicable D01/D02/D03/D05/D09/D11/D12/D13 approvals plus the selected
  rail's complete declared policies, including D04 and D06/D10 for pay-now: ____.
- [ ] Reviewed terms, no-charge pilot evidence, independent cumulative arithmetic,
  final-account lock, shadow isolation, attribution and production settlement/
  reversal/refund evidence; external-action and penetration reviews: ____.
- [ ] £320 overcharge/£32 fee principal and £800 Final Check/£80 fee principal
  chains reconcile; separately approved tax treatment recorded: ____.
- [ ] No proof, prevented loss, builder capture, pre-lock disclosure, partial
  receipt, replay/reorder, refund, consent revocation, unknown outcome and competing
  rails produce no unjustified positive fee or duplicate collection: ____.
- [ ] Subscription, Stripe fee, GoCardless fee and pay-now scopes assessed
  individually; subscription never offsets fees, customer money goes to the
  builder's account. All G4-C rails stay disabled: ____.
- [ ] G4-S approval authorizes only bounded actions; follow the
  [G4-S smoke steps](live-smoke-test-procedure.md#g4-s-small-builder), reconcile
  actual effects and obtain independent review before expansion: ____.

G4-S owner: ____; bounded-smoke approval: ____; result: ____;
reconciled smoke review: ____; general-rollout approval: ____.

## General rollout and separately gated billing

- [ ] One `release-record.v1` per track identifies the exact commit, production
  environment, phase, tenants, jurisdictions, enabled rail IDs, exact policy/gate
  approvals, consent, sandbox evidence and rollback plan: ____.
- [ ] `phase: general` references an independently reviewed, reconciled live smoke
  for the same scope. Inspect evidence content; a schema-valid reference alone
  does not prove execution, consent, approval or reconciliation: ____.
- [ ] Expanded construction billing has separate M4-18–M4-22 acceptance and an
  approved/tested jurisdiction/treatment matrix; everything else stays disabled.
  Deferred acceptance has an explicit approved scope change: ____.
- [ ] Expansion limits, monitoring window, reconciliation cadence, stop conditions
  and independently authorized restart owner are recorded: ____.

Rollout owner: ____; approval references: ____; result: ____.

## Fixture use and present limits

`packages/config/test/fixtures/release-record.g4-c.example.json` and
`release-record.g4-s.example.json` exercise the existing strict record schema only.
They are fictional bounded-smoke records, outside the checked-in inventory.
`____` means a visible unfilled slot, not an approver or evidence reference. The
schema requires a timestamp even for a revoked gate; `2000-01-01T00:00:00Z` is a
fictional format sentinel, not an approval time. Their gates are revoked and they
contain no policy approvals, so they cannot authorize inventory enablement.
`production_billing` is the required format literal, not a deployed environment.
Never submit these examples as release evidence.

CI continues to require the entire real inventory disabled with no release
records. This pack does not complete M4-23 integrated acceptance, obtain approvals,
perform live smoke, or open any gate. Source inspection, executed fixture tests
and independent review are separate evidence claims.
