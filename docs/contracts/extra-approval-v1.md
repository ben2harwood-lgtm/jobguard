# Extra approval foundation v1 — ENT-5, 13 October 2026

Issued against main `6659fb58791ec22588948f005b2bd4f6b299fa48`, built ahead on ENT-3d `82f05c2af245255a84921108e554ecab4e065054`. This is a proposal evaluator and immutable source-binding foundation, not an enabled approval chain. BUILD_PLAN §§9.1.3–9.1.7, §9.2 ENT-5 and §2.4 remain binding. Real data is OFF; no spending, invoice, fee or provider execution is issued. D02, D06, D12 and D16 are not approved here.

All answers below are quoted from `~/.local/share/full-steam/jg-orders/next-wave/BEN-ANSWERS-20261013.md`, card **jobguard-twenty-product-decisions-2026-10-13**:

- Q01/Q05/Q11: “Surveyors price; site staff report; supervisors withdraw.” Only surveyor pricing, the supplied site-staff classification and supervisor withdrawal constraints are issued. The reporting matrix and wider withdrawal roles are HELD.
- Q04: “Keep separate approvers across versions; never allow self-approval.” Pure constraints use explicitly supplied synthetic person identities. Different step slots cannot be occupied by the same person across revisions. A repeated approval of the same slot returns `held_repeat_semantics`; no persisted identity key is selected.
- Q05: “Record both; show uncertainty; later approval does not erase breaches.” Start and finish are separate supplied facts with explicit uncertainty. Established breaches remain append-only input history. The foundation preserves supplied facts; the chain now derives timing from linked site-visit bounds under the 3 November source amendment in `extra-approval-chain-v1.md`.
- Q06: “Set both amounts; customer follows required company approvals.” The merged rule schema requires explicit T and Y for threshold rules. Comparisons are independent: net ≤ X, net > T, net > Y, with null above every threshold. Y < T remains admissible under the merged schema. No combined interpretation or proceed permission is created. A supplied required customer step follows the company steps.
- Q08: “Keep original approvers; enable only agreed backups after agreed waits.” Pure eligibility takes explicit original identities, agreed backup identities and an established elapsed-wait condition. It selects no wait, timer origin or notification authority.
- Q14: “Keep history; stop future actions and cancel unused permission.” Pure history preservation cancels unused supplied authority on authority loss and refuses future actions. It grants no historical read or export entitlement.

The evaluator validates `approvalRulesV1` without changing it. It binds explicit immutable rule/contract/revision identities and hashes, GBP Money or null, evidence and timer terms into a frozen proposal. No state can become `approved` through this function. Reference rules and test values are synthetic examples, never defaults. It records separate threshold comparisons without interpreting inconsistent T/Y terms.

Q02 (dispatcher): `extra_approval_revision_binding` binds an existing `extra_sor_revision` or `variation_revision` to an approval identity. It preserves source price, quantities, adjustment, baseline and hash. New source checks use named columns. Logical predecessor bindings must be the same tenant/job/extra and adjacent revision. No submission, pricing, event or current-state writer is enabled; the future side-cache amendment needs coordinator recording.

Q07 (dispatcher): a `contract_rule` fact has no human actor or grant. It may precede a required client step. The merged ENT-4a `approvalSnapshotValid` currently requires it to be the sole step and requires an actor UUID. That validator and its tests remain unchanged. Downstream compatibility amendment is HELD with integrated chain execution.

Remaining holds: Q01 pricing inputs/rounding/revision components; Q03 applicable contract; Q04 persisted person/repeat rules; Q05 wider reporting authority (linked-visit timing source resolved by Ben, 3 Nov 2026, card jobguard-ent-5-timing-source); Q06 amounts and T/Y composition; Q08 timer terms/backups; Q10 send/cancel roles/lifetimes/resends; Q11 rejection/wider withdrawal; Q12 client retry/history; Q13 identity bridge; Q14 export/refusal audit; Q15 scheduler/executor; Q16 query/automatic submission. UI is parked. No existing logged extra is submitted automatically.

Migration 0157 creates only the two issued immutable tables. Runtime SELECT only, FORCE RLS, no callable business writer. Owner-created test specimens are not command or actor authority. Held writers must take every business lock before audit head; existing job advisory lock seed 417 and administration seed 54 remain unchanged. No business locks, audit append or deferred business writer are introduced here.

Timing source amendment (Ben, 3 Nov 2026, card jobguard-ent-5-timing-source): “Use visit times for ENT-5”. The chain reads recorded visit start and finish through the extra's tenant/job-qualified origin link. Both bounds are shown as a visit interval with uncertainty; multiple extras never acquire invented exact work times. No linked visit stays `not_derived`, and no finish stays unknown. Strict before-start/after-finish comparisons derive step timing; equal or overlapping times stay uncertain. The immutable requirement snapshot supplies the client-before-work requirement. An operative statement of `under_way` or `finished` is also required for a true breach; `not_started` or no statement stays uncertain. Historical breaches survive later approvals and revisions; see `extra-approval-chain-v1.md` for the response and supersession rules. This resolves the source/timing portion of Q05 only; other held items remain open; the proceed ruling below resolves only its fact-recording hold.

## Remaining held rules amendment — ENT-5, 4 November 2026

Authority: Ben's 4 November instruction, “Make all the decisions, say yes, and just get it coding”, and the router's Q04/Q06/Q08/Q11/Q16 rulings recorded in `~/.local/share/full-steam/AGENT_CHOICES.md`. This section supersedes the historical holds for those questions above. These are company defaults; changing a default requires a new immutable rule version, never an edit to an existing request snapshot. Ben may reverse these defaults. Synthetic practice only; no live services or release authority is added.

- **Q04:** a person occupies only one step of an extra across request revisions. That person may approve the same slot on a new request revision; they may never occupy another slot. A repeat on the same request/step returns the original durable command result with no second fact, outcome or audit effect. The receipt still binds type, person, request, step, hash, net and rejection reason, and current membership and job grants are checked on replay. Changed content conflicts. Self-approval remains refused. Existing persisted identity is the membership key; no Q13 identity bridge is invented. Rejection also occupies its required slot in subsequent revisions.
- **Q06:** T and Y belong to the immutable rule version and have no built-in monetary defaults. All example amounts are made-up fixtures. `net > T` and `net > Y` remain independent, including Y < T; equality is not above, and an unpriced extra is above both. Any required client step follows every required company step. This grants no permission to proceed with work.
- **Q08:** new company-step snapshots default to two working days, counted Monday–Friday in Europe/London at the same local wall-clock time, including clock changes. No external holiday calendar is consulted. A new rule version may specify `waitWorkingDays` (1–260); explicit null selects that version's existing `timeLimitMinutes` override. Existing snapshots without the field retain their elapsed-minute terms. `escalationRole` and `alternateRoles` name the backup roles, still requiring a current grant covering the job. A null escalation role and no alternates means no backup: no escalation fact is created, and the original approver's mandatory item remains waiting and overdue. Original approvers stay eligible. The mandatory queue shows an overdue/backup notice in the app only; no email, outbound message or automatic submission is added. Existing synthetic Graphile discovery/task registration is reused; the live scheduler remains held under Q15.
- **Q11:** any currently required, eligible approver may reject with a reason. A supervisor, surveyor or commercial manager with a current job-covering grant may withdraw before the outcome is final. Both outcomes are append-only. A revision creates a fresh request; it does not erase the earlier outcome, timing or approval history. Approve/withdraw continue to serialize on the existing job lock and unique outcome key.
- **Q16:** submission is always a person's explicit `SubmitExtra` command. Logging, pricing, queries, timers and revisions do not automatically submit a logged extra. Revising an already submitted extra retains the existing explicit revision command's new-request behavior.

Q01 (pricing), Q03 (applicable contract), Q14 (exports/authority-loss behavior) and Q15 (live scheduling/execution) remain held. Other unresolved invitation, identity and proceed questions are unchanged. No ENT-5-wide completion or production approval is claimed.

Migrations reserved here: 0930 (cross-revision separation), 0931 (withdrawal and replay authority), 0932 (new snapshot wait terms and existing timer consumers); 0933 (expand-compatible rule validation); 0934 unused. No columns or stored row formats change. Roll forward to correct a routine; do not rewrite immutable snapshots or outcomes. Deployment order is migrations before application code. Existing pin/scanner holds and actual validation are recorded in `docs/verdicts/ENT-5b/BUILDER_RECEIPT.md`.

## ENT-5 proceed statement ruling — 4 November 2026

Ben instructed the router to decide and proceed ("Make all the decisions, say yes,
and just get it coding"). The router's ruling in AGENT_CHOICES.md is that site
staff may record "proceeding before approval", with a reason, as a fact only.
This closes only the Q05 proceed hold; all other holds remain unchanged.

`RecordExtraProceed` records one append-only operational statement, with the
session-derived operative, server time, reason and exact priced request/revision.
It uses the sibling reporting authority: a current operative with assigned job
coverage and site-origin capture entitlement. The strict input accepts no actor,
tenant, clock, amount, requirement or approval. Current authority is checked on
replay too. Supervisors may read history through their existing covered-job grant.
Only a current priced, undecided request accepts a new statement; stale/unpriced
requests are refused. A retry is bound to its complete original input.

The statement never approves, fills or skips a step, changes a requirement, or
feeds pricing, billing or exports. The extra screen shows its immutable history.
Where the bound snapshot explicitly requires client approval before work, the
existing client breach projection includes this statement as a reported breach,
including without a visit-derived time. It does not invent an exact work time.
Later approval, a revision or a visit change cannot erase the earlier statement
or breach. Held T/Y composition stays uncertain; no new requirement is inferred.

Synthetic data only. Migration 0905 adds a side table without changing predecessor
row shapes. Forward-fix only: preserve statements; disable the route if needed.
No provider call, new alert or production release is introduced.
