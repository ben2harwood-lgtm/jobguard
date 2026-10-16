# Night-audit triage — SERIOUS — 16 October 2026

**Source list located.** The original 13 October reports are at `/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/`: 89 primary `.md` area reports (12 with no numbered findings), containing exactly **190 BLOCKING + 179 LATER = 369 source entries**. Companion `.tests.md`/logs and “five weakest tests” recommendations are supporting material, not another set of 190 findings. Source links below identify report filename, original numbered finding and report line. The source list is external to Git; descriptions and dispositions are retained here so this report remains useful without those local files.

**Baseline:** supplied local `origin/main` and HEAD both `760fe6f52cb1364540c72092c3c882532d9b9d27`, dated 16 October 2026 10:21:54 +0100 (#216, MERGE-CHURN-1). Initial tree matched this commit. No fetch was performed: this report makes no claim about remote commits newer than that supplied tracking ref. Code line numbers refer to that exact main snapshot, not an audit branch. A branch's existence or a builder receipt saying “implemented” does not establish a merged fix.

**Rule:** Ben's `~/.local/share/full-steam/handoffs/FAST-MODE-2026-10-15.md` rules 3–5. SERIOUS requires a credible current path to wrong money, unauthorized data access/change, lost/corrupted data, an uncompletable main journey, or red CI on main. Synthetic status alone does not downgrade an existing supported journey or financial calculation. Dormant ports, unsupported scenarios, optional features, test weaknesses, wording, hardening and paperwork go to LATER unless such a path is established. A missing audit event is not automatically lost business data; a committed reference to a nonexistent authoritative record is a concrete provenance-corruption path.

**Disposition accounting (source entries, before deduplication):**

| Original label | Excluded by merged changes | SERIOUS | LATER | Total |
| --- | ---: | ---: | ---: | ---: |
| BLOCKING | 99 | 55 | 36 | 190 |
| LATER | 8 | 4 | 167 | 179 |
| Total | 107 | 59 | 203 | 369 |

The 59 SERIOUS source entries collapse to **32 distinct fixes in 9 area batches**. The 203 LATER source entries collapse to **153 stage-sweep items**. Aliases are evidence for the same fix, not additional tickets. Every numbered source entry is accounted for in one disposition. Some retained LATER claims are explicitly unproven/refuted; those are not repair orders.

**Scope and evidence:** read-only analysis; only these two reports are working-tree deliverables. No fixes, migrations, tests, configuration, lane registration, commits or acceptance records were added. Existing receipts, merge history and current source were inspected. Except the S06 pure calculation probe recorded below, the credible paths are source-inspected, not newly executed database/browser reproductions. This is a builder's triage, not an independent model verdict or technical acceptance.

Only the groups below are proposed future SERIOUS PR boundaries. Do not restart one-PR-per-source-report work. Existing unmerged work may be reused after subtracting already merged changes; it is not credited as fixed here. In particular MIGFIX-3/5/6/7 are not ancestors of this baseline; MIGFIX-1/2/4/8 are merged. This report authorizes no merge, release, production mode or policy approval.

## Batch 1 — Sign-in (1 fix; one future PR)

### S01 — Ten code requests exhaust the sign-in bucket for every web user.

- **Area:** Sign-in.
- **Source:** [mig-0107-0111#1](/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/mig-0107-0111.md:5).
- **SERIOUS criterion:** Main user journey cannot complete (sign-in).
- **Credible path on main:** `apps/web/app/api/auth/request/route.ts:4` passes `web-bootstrap` for every peer to `apps/api/src/auth/persisted-auth-provider.ts:32`. Ten distinct email requests in ten minutes make an unrelated eleventh user's valid code request return RATE_LIMITED.
- **Fix sketch:** Supply a deployment-verified peer identity to per-peer throttling while retaining independent email/global abuse controls; test two real adapter peers.

## Batch 2 — Contractor imports and schedule permissions (4 fixes; one future PR)

### S02 — A client-scoped approver can list another client's schedules.

- **Area:** Contractor imports and schedule permissions.
- **Source:** [dbsrc-15#1](/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/dbsrc-15.md:5).
- **SERIOUS criterion:** Someone can see data they should not (role/client scope).
- **Credible path on main:** `apps/api/src/contractor/work-order.application.ts:47` → `packages/db/src/sor-repository.ts:43`: one client grant satisfies the existence check; the unfiltered tenant-wide SELECT at :46 returns clients A and B to A's approver.
- **Fix sketch:** Refuse general SoR listing for client approvers or constrain it to an explicitly permitted scope; keep approval-pack access separate.

### S03 — Generated work-order imports change their site identities between calls.

- **Area:** Contractor imports and schedule permissions.
- **Source:** [api-contractor#1](/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/api-contractor.md:5), [dbsrc-17#2](/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/dbsrc-17.md:9).
- **SERIOUS criterion:** Data corrupted (generated import/site binding).
- **Credible path on main:** `apps/api/src/contractor/work-order.application.ts:34` regenerates each file; `packages/db/src/work-order-fixtures.ts:45` reloads equal-timestamp sites by random UUID, whereas :65–69 initially returns creation order. A→retry changes the CSV/site assignments and conflicts; a new command yields PARTY_CHANGE_REFUSED.
- **Fix sketch:** Persist or deterministically reload the original fictional site order and reuse it for initial import, replay and generated amendments.

### S04 — A partial demo-organisation setup permanently breaks generated imports.

- **Area:** Contractor imports and schedule permissions.
- **Source:** [api-contractor#2](/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/api-contractor.md:12).
- **SERIOUS criterion:** Main user journey cannot complete (contractor import).
- **Credible path on main:** `apps/api/src/contractor/work-order.application.ts:34` → `packages/db/src/work-order-fixtures.ts:40–50`: after a client has committed but a later contract/link/site operation fails, every retry takes the existing-client branch and reads a missing version or throws the incomplete-organisation error.
- **Fix sketch:** Make preparation resumable from persisted milestones or atomic, so a transient failure leaves a retryable import setup.

### S05 — Finance cannot use the generated work-order import offered by the application.

- **Area:** Contractor imports and schedule permissions.
- **Source:** [dbsrc-17#3](/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/dbsrc-17.md:13), [api-contractor#3](/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/api-contractor.md:19).
- **SERIOUS criterion:** Main user journey cannot complete (permitted finance import).
- **Credible path on main:** `apps/api/src/contractor/work-order.application.ts:27` always calls `prepareWorkOrderDemo`; `packages/db/src/work-order-fixtures.ts:34–36` calls contractor organisation/admin preparation before reaching the finance-permitted importer (`packages/db/src/work-order-repository.ts:58`). Finance lacks that administration authority.
- **Fix sketch:** Prepare the owned demo through an authorized setup flow and let permitted finance imports consume it without requiring organisation administration.

## Batch 3 — Quotes (6 fixes; one future PR)

### S06 — Discounted quote net is rounded twice and can be one penny wrong.

- **Area:** Quotes.
- **Source:** [pkg-src-82#2](/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/pkg-src-82.md:11), [mig-0008-0011#5](/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/mig-0008-0011.md:17).
- **SERIOUS criterion:** Wrong money.
- **Credible path on main:** `packages/core/src/quote.ts:35` rounds quantity×rate, then rounds the discount separately at :36. Saving 2.5×12,333p with 5% discount yields 29,290p instead of the once-rounded 29,291p; `packages/db/src/quote-repository.ts:8` stores it and final accounts reuse the evaluator.
- **Fix sketch:** Apply the discount to the exact quantity×rate rational and round the net line once under the existing half-even policy.

### S07 — Quote PDFs display unit rates as line net amounts.

- **Area:** Quotes.
- **Source:** [api-quote#1](/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/api-quote.md:7), [dbsrc-10#2](/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/dbsrc-10.md:8), [mig-0008-0011#3](/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/mig-0008-0011.md:11).
- **SERIOUS criterion:** Wrong money.
- **Credible path on main:** `apps/api/src/quote/quote.application.ts:5` previews through `packages/db/src/quote-delivery-repository.ts:19`, whose `netPence` is `unit_rate_pence::int`. A quantity-two £100 line prints £100 while the quote header is £200; :24–26 freezes those contradictory numbers.
- **Fix sketch:** Render each line's calculated discounted net using the same exact policy as the saved quote and verify line/header agreement.

### S08 — A quote can silently omit confirmed captured work.

- **Area:** Quotes.
- **Source:** [dbsrc-11#1](/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/dbsrc-11.md:5), [mig-0008-0011#2](/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/mig-0008-0011.md:8).
- **SERIOUS criterion:** Wrong money / data lost from the commercial snapshot.
- **Credible path on main:** `apps/api/src/quote/quote.application.ts:5` accepts supplied lines; `packages/db/src/quote-repository.ts:8` evaluates only that array and stores `issuable=true` without reconciling confirmed scope. Submit A alone from confirmed A+B (£100 each): an issuable £100 quote drops B without an exclusion.
- **Fix sketch:** Reconcile every confirmed scope identity to an included line or explicit recorded exclusion before making a quote issuable.

### S09 — A quote line can freeze another scope item's revision as its own source.

- **Area:** Quotes.
- **Source:** [dbsrc-11#2](/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/dbsrc-11.md:11), [api-quote#7](/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/api-quote.md:31).
- **SERIOUS criterion:** Data corrupted (immutable commercial lineage).
- **Credible path on main:** `packages/db/src/quote-repository.ts:10` inserts `scopeItemId=A, scopeRevisionId=RB` unchanged; `packages/db/migrations/0009_quote_pricing.sql:5` checks item and revision separately. The normal save service accepts this same-job pairing and also writes a false rate-observation source.
- **Fix sketch:** Validate item/revision ownership together and enforce the tenant/job/item/revision relationship in controlled persistence.

### S10 — Preview can show recipient A's document but return recipient B's send identity.

- **Area:** Quotes.
- **Source:** [api-quote#3](/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/api-quote.md:15).
- **SERIOUS criterion:** Data corrupted (preview artifact/recipient binding).
- **Credible path on main:** `apps/api/src/quote/quote.application.ts:5` combines `preview()` with a separate latest `view()`. At `packages/db/src/quote-delivery-repository.ts:21` A→B→A reuses A's older snapshot, while :34 returns B's latest ID/hash/recipient; subsequent download/send addresses that different artifact.
- **Fix sketch:** Build the preview response metadata from the exact document returned by preview, and bind subsequent operations to it.

### S11 — An unissued preview prevents acceptance of an already issued quote.

- **Area:** Quotes.
- **Source:** [api-quote#4](/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/api-quote.md:19), [dbsrc-00#2](/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/dbsrc-00.md:11).
- **SERIOUS criterion:** Main user journey cannot complete (quote acceptance).
- **Credible path on main:** `packages/db/src/acceptance-repository.ts:38` selects the newest preview; :39 refuses any other ID. Issue v1, preview unissued v2, then accept issued v1: STALE_ACCEPTANCE despite no supersession and a still-valid issued document.
- **Fix sketch:** Validate the named issued document and its explicit supersession/acceptance state rather than using the newest preview as authority.

## Batch 4 — Evidence and proof (3 fixes; one future PR)

### S12 — A late failed finalization can turn successfully verified evidence into rejected evidence.

- **Area:** Evidence and proof.
- **Source:** [dbsrc-05#1](/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/dbsrc-05.md:5), [mig-0000-0003#3](/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/mig-0000-0003.md:13), [mig-0024-0027#5](/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/mig-0024-0027.md:21), [mig-0054-0096#1](/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/mig-0054-0096.md:5).
- **SERIOUS criterion:** Data corrupted.
- **Credible path on main:** `apps/api/src/proof/proof.application.ts:14` exposes finalization; `packages/db/src/evidence.ts:84–88` reads storage outside the transaction and calls :136's unconditional rejection. Let retry B verify while A's earlier read is paused, then fail A: B's saved upload is overwritten as rejected.
- **Fix sketch:** Tie rejection to the still-current pending/quarantined attempt and version, preserving any completed verified registration.

### S13 — Invalidated completed proof cannot be replaced for the same stage.

- **Area:** Evidence and proof.
- **Source:** [api-proof#2](/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/api-proof.md:11), [dbsrc-10#5](/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/dbsrc-10.md:17), [mig-0000-0003#5](/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/mig-0000-0003.md:21), [mig-0012-0015#3](/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/mig-0012-0015.md:13), [mig-0024-0027#6](/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/mig-0024-0027.md:25), [mig-0054-0096#2](/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/mig-0054-0096.md:12).
- **SERIOUS criterion:** Main user journey cannot complete (proof rework).
- **Credible path on main:** `packages/db/src/proof-repository.ts:30` permanently keys completion receipts by job/scope/stage, and :33 inserts into `stage_completion`, still uniquely keyed by stage (`packages/db/migrations/0015_proof_stage_gates.sql:5`). Complete E1, invalidate it, finalize E2, then complete the same electrical stage: COMMAND_CONFLICT; changing the stage is not available in the application.
- **Fix sketch:** Represent replacement completion as an append-only revision linked to the original stage and update its current/rework projection; preserve replay identities.

### S14 — Owned adopted jobs cannot finalize their generated proof original.

- **Area:** Evidence and proof.
- **Source:** [api-proof#4](/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/api-proof.md:23), [mig-0054-0096#3](/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/mig-0054-0096.md:19).
- **SERIOUS criterion:** Main user journey cannot complete (adopted-job proof).
- **Credible path on main:** `packages/db/src/practice-session.ts:34` grants source-session ownership of adopted jobs, but `apps/api/src/proof/proof.application.ts:8` requires direct `job.practice_session_digest` equality when loading original bytes. Adopted jobs have no direct digest, so an authorized finalize fails `missing original`. The inbox portion of the migration report was already fixed by #184.
- **Fix sketch:** Use the shared adopted-job ownership predicate for synthetic original reads and the remaining adopted material ownership seam.

## Batch 5 — Final accounts and invoice artifacts (3 fixes; one future PR)

### S15 — Pending repricing removes already approved variation money from the final account.

- **Area:** Final accounts and invoice artifacts.
- **Source:** [dbsrc-06#2](/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/dbsrc-06.md:9), [mig-0024-0027#2](/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/mig-0024-0027.md:9), [mig-0012-0015#1](/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/mig-0012-0015.md:5).
- **SERIOUS criterion:** Wrong money.
- **Credible path on main:** `packages/db/src/variation-repository.ts:13` moves approved V1 to a pending priced V2. `packages/db/src/final-account-repository.ts:13` includes an approval only when `v.state='approved' AND v.current_revision_id=a.revision_id`. A £100 baseline plus approved £50 becomes £100 after merely proposing £70; V1's approval still exists.
- **Fix sketch:** Derive the account from the last effective approved commercial revision until a later revision is approved. The historical report's suggestion to erase the approved API amount would violate immutable-history rules.

### S16 — The immutable final-account lock accepts a draft that omits a subsequently approved extra.

- **Area:** Final accounts and invoice artifacts.
- **Source:** [api-file-final-account-lock#1](/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/api-file-final-account-lock.md:5), [dbsrc-06#3](/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/dbsrc-06.md:13), [mig-0129-0132#1](/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/mig-0129-0132.md:5).
- **SERIOUS criterion:** Wrong money.
- **Credible path on main:** `packages/db/src/final-account-lock-repository.ts:67` calls `packages/db/migrations/0132_final_account_lock.sql:274–278`. Assemble £100; approve +£50 elsewhere; lock the unchanged £100 draft. The routine checks the draft pointer, then snapshots current captures without checking they match its money lines.
- **Fix sketch:** Under the job/variation locks, compare the account's approved commercial sources with current effective approvals and require a rebuild on mismatch.

### S17 — Issued customer-invoice downloads contain text with a PDF header, not a readable PDF.

- **Area:** Final accounts and invoice artifacts.
- **Source:** [api-file-customer-invoice#4](/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/api-file-customer-invoice.md:20), [mig-0024-0027#7](/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/mig-0024-0027.md:29).
- **SERIOUS criterion:** Main user journey cannot complete (usable invoice download).
- **Credible path on main:** `packages/db/src/practice-invoice-repository.ts:34` invokes `packages/db/migrations/0095_job_parties.sql:367`, which concatenates text between PDF markers without PDF objects/xref/trailer; the lock-bound issuer repeats this at `packages/db/migrations/0132_final_account_lock.sql:390`. :39–40 serves those saved bytes unchanged.
- **Fix sketch:** Generate a valid deterministic PDF from the approved immutable invoice snapshot, retaining its hash and sandbox watermark.

## Batch 6 — Supplier documents and findings (3 fixes; one future PR)

### S18 — Recording a later delivery overwrites the cumulative delivery position.

- **Area:** Supplier documents and findings.
- **Source:** [dbsrc-16#3](/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/dbsrc-16.md:13).
- **SERIOUS criterion:** Data corrupted.
- **Credible path on main:** `apps/web/app/ui/supplier-documents.tsx:3` sends accepted=1 through “Record later delivery” after 8/10 were accepted. `packages/db/src/supplier-document-repository.ts:8` saves accepted=1 and missing=9 against the same delivery identity, and :9 returns it. The actual additional delivery leaves nine accepted and one missing; matching now treats revisions of that document as replacement totals (:203 in supplier-match-repository.ts).
- **Fix sketch:** Distinguish a genuinely additional delivery from a correction, retaining distinct delivery identities and projecting cumulative accepted/missing quantities consistently.

### S19 — A valid entirely rejected delivery makes automatic matching fail.

- **Area:** Supplier documents and findings.
- **Source:** [dbsrc-16#4](/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/dbsrc-16.md:17), [mig-0032-0035#5](/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/mig-0032-0035.md:17).
- **SERIOUS criterion:** Main user journey cannot complete (supplier matching).
- **Credible path on main:** `packages/db/src/supplier-match-repository.ts:85` creates an allocation for every selected receipt, including accepted quantity zero; :286 inserts it into `app.supplier_match_allocation`, whose positive-quantity check is at `packages/db/migrations/0037_supplier_matching.sql:4`. An authenticated receipt command can record zero accepted, after which matching rolls back.
- **Fix sketch:** Retain rejected delivery evidence while excluding zero quantities from allocation rows and returning a meaningful unmatched/review state.

### S20 — Re-evaluating unchanged supplier sources appends an audit reference to a finding that never exists.

- **Area:** Supplier documents and findings.
- **Source:** [api-file-things-to-check#3](/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/api-file-things-to-check.md:17), [dbsrc-04#5](/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/dbsrc-04.md:21).
- **SERIOUS criterion:** Data corrupted (append-only audit provenance).
- **Credible path on main:** `packages/db/src/discrepancy-repository.ts:25` audits a newly generated finding ID, then `ON CONFLICT ... DO NOTHING` discards its finding row. Evaluate identical sources/rule twice with different command IDs through Things to check: the second committed audit reference has no matching finding.
- **Fix sketch:** Resolve or insert the durable finding identity before auditing it and atomically store a replay/no-op result that references that identity.

## Batch 7 — Evidence packs and authorization (3 fixes; one future PR)

### S21 — Evidence-pack attachment approval commits after its caller's access has been revoked.

- **Area:** Evidence packs and authorization.
- **Source:** [api-file-evidence-pack#1](/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/api-file-evidence-pack.md:5), [mig-0040-0053#1](/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/mig-0040-0053.md:5).
- **SERIOUS criterion:** Someone can change data they should not (revoked session/member).
- **Credible path on main:** `apps/api/src/evidence-pack.application.ts:31–35` authorizes before calling the repository. Hold its case lock, start approval, revoke the session/member, then release the lock: `packages/db/src/evidence-pack-repository.ts:129–143` inserts approval without rechecking authority. The later list may fail only after that commit.
- **Fix sketch:** Recheck and fence the authenticated session/member and required permission inside the approving transaction after waits and before the write.

### S22 — Supported supplier recovery cases cannot generate their evidence packs.

- **Area:** Evidence packs and authorization.
- **Source:** [mig-0040-0053#3](/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/mig-0040-0053.md:13).
- **SERIOUS criterion:** Main user journey cannot complete (supplier recovery pack).
- **Credible path on main:** `packages/db/src/evidence-pack-sources.ts:86` handles supplier sources only for merchant_overcharge; :106–116 searches customer invoices for duplicate_supplier_payment and supplier prevention cases. Case opening accepts real same-job supplier source IDs, but pack generation cannot resolve them.
- **Fix sketch:** Route sources by the validated case book/source contract and support each currently accepted supplier case type.

### S23 — The generated source catalogue lets users open cases that can never be packed.

- **Area:** Evidence packs and authorization.
- **Source:** [mig-0040-0053#4](/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/mig-0040-0053.md:17).
- **SERIOUS criterion:** Main user journey cannot complete (case → evidence pack).
- **Credible path on main:** `packages/db/src/recovery-case-sources.ts:19` accepts a known catalogue label with recorded=false. `packages/db/src/evidence-pack-sources.ts:109,:116` then requires invoice/document UUIDs, so a case opened with the generated customer/supplier label fails EVIDENCE_PACK_SOURCE_NOT_FOUND on every pack attempt.
- **Fix sketch:** Align case-opening and pack source contracts: require recorded backing or resolve the exact immutable generated backing before accepting the case.

## Batch 8 — Inbox and operational authority (2 fixes; one future PR)

### S24 — One practice session can suppress another session's advisory inbox.

- **Area:** Inbox and operational authority.
- **Source:** [api-file-inbox-relevance#1](/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/api-file-inbox-relevance.md:5).
- **SERIOUS criterion:** Someone can change data they should not (session isolation).
- **Credible path on main:** `apps/api/src/inbox-relevance.application.ts:2` supplies DEMO_MEMBERSHIP_ID for every session. `packages/db/src/inbox-relevance-repository.ts:16,:19` keys preference writes/reads only by tenant and membership. Session A sets budget zero on A's job; B's separate job then shows budget zero and loses its advisories.
- **Fix sketch:** Scope preferences and command identity to the verified practice-session owner, keeping independent sessions' inboxes unchanged.

### S25 — A prevention command can commit while a concurrent membership revocation removes its authority.

- **Area:** Inbox and operational authority.
- **Source:** [mig-0097-0106#4](/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/mig-0097-0106.md:20).
- **SERIOUS criterion:** Someone can change data they should not (revoked role).
- **Credible path on main:** `packages/db/src/prevention-check-repository.ts:19` uses an unlocked active-owner read. Start a request while another transaction has an uncommitted revoked_at change; the request sees the previous owner, then can write facts/receipt/audit without waiting for and honoring the committed revocation.
- **Fix sketch:** Fence authorization against membership revocation before domain writes, then recheck persisted active authority under the same transaction.

## Batch 9 — Recovery eligibility and allocation (7 fixes; one future PR)

### S26 — F18 includes unpaid interest in the saved qualifying amount.

- **Area:** Recovery eligibility and allocation.
- **Source:** [dbsrc-12#1](/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/dbsrc-12.md:5), [mig-0112-0120#1](/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/mig-0112-0120.md:5).
- **SERIOUS criterion:** Wrong money (stored eligibility calculation).
- **Credible path on main:** `packages/db/src/recovery-eligibility-v3-repository.ts:39–45,:70–75` derives a single settlement state from the principal receipt and applies it to every fixture component. Settle £2,500 principal while the separate £120 interest is pending: F18 persists £2,620 qualifying. This is a synthetic eligibility record, not a production fee posting.
- **Fix sketch:** Require component-specific settled evidence for interest and persist a qualifying amount only for each actually settled component.

### S27 — An approved omission prevents allocation of a legitimate customer receipt.

- **Area:** Recovery eligibility and allocation.
- **Source:** [dbsrc-11#3](/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/dbsrc-11.md:17).
- **SERIOUS criterion:** Main user journey cannot complete (recovery allocation).
- **Credible path on main:** `packages/db/src/recovery-allocation-repository.ts:322` drops negative invoice lines, then :323 requires the remaining sum to equal invoice net. A £1,000 baseline +£125 extra −£25 omission totals £1,100, but the reader sums £1,125 and refuses the valid £384 receipt allocation.
- **Fix sketch:** Use the exact signed issued-invoice composition in both reader and controlled allocation routine, with consistent treatment of omissions.

### S28 — Ordinary penny-valued invoice lines prevent full-receipt allocation.

- **Area:** Recovery eligibility and allocation.
- **Source:** [dbsrc-11#4](/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/dbsrc-11.md:23), [mig-0133-0136#3](/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/mig-0133-0136.md:15).
- **SERIOUS criterion:** Main user journey cannot complete (recovery allocation).
- **Credible path on main:** `packages/db/src/recovery-allocation-repository.ts:337` requires each line net × blended invoice VAT ratio to be integer, as does `packages/db/migrations/0136_recovery_allocation.sql:236`. Lines 16,001p and 15,999p net on a £384 invoice trigger FRACTIONAL_CASE_SPLIT although the full receipt is valid.
- **Fix sketch:** Allocate from the issued line gross/tax facts using the existing exact-rational allocator rather than inventing integer blended-tax line amounts.

### S29 — A supplementary invoice cannot be allocated because the reader loads the whole cumulative account.

- **Area:** Recovery eligibility and allocation.
- **Source:** [mig-0133-0136#4](/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/mig-0133-0136.md:20).
- **SERIOUS criterion:** Main user journey cannot complete (supplementary receipt allocation).
- **Credible path on main:** `packages/db/src/recovery-allocation-repository.ts:321–323` reads all final_account_line rows instead of the issued subset. F7's £800 net supplementary invoice references a £34,400 cumulative account and fails the net-equality check; `packages/db/migrations/0136_recovery_allocation.sql:274` repeats the mismatch.
- **Fix sketch:** Use final_account_invoiced_line as the invoice-specific composition in the repository and SQL guard.

### S30 — Omitting a saved remittance changes the allocation from explicit baseline-only to pro rata.

- **Area:** Recovery eligibility and allocation.
- **Source:** [mig-0133-0136#1](/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/mig-0133-0136.md:5).
- **SERIOUS criterion:** Wrong money.
- **Credible path on main:** `packages/db/src/recovery-allocation-repository.ts:344` selects remittance only from the new request, and `packages/db/migrations/0136_recovery_allocation.sql:308` accepts that omission. After F6's explicit £24,000 baseline-only remittance is recorded, another review without its ID allocates 2,000,000/43p net to the catch instead of zero.
- **Fix sketch:** Resolve the receipt's authoritative verified remittance server-side and enforce its priority on every review/approval.

### S31 — A later credit changes the allocation of a receipt that had already settled.

- **Area:** Recovery eligibility and allocation.
- **Source:** [mig-0133-0136#2](/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/mig-0133-0136.md:10).
- **SERIOUS criterion:** Wrong money.
- **Credible path on main:** `packages/db/src/recovery-allocation-repository.ts:338` sums all saved line allocations/reversals without the receipt-time cutoff; `packages/db/migrations/0136_recovery_allocation.sql:267` does likewise. In the source's two-£1,410-line example, a later £192 item credit changes the earlier £3,000 receipt's catch share from 125,000p to 17,625,000/133p net.
- **Fix sketch:** Derive the outstanding denominator as of each receipt's effective time and keep subsequent credits as separately linked reversals.

### S32 — Invalidating an original remittance prevents reversing its saved recovery allocation.

- **Area:** Recovery eligibility and allocation.
- **Source:** [mig-0133-0136#5](/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/mig-0133-0136.md:25).
- **SERIOUS criterion:** Main user journey cannot complete / wrong unreversed money.
- **Credible path on main:** `packages/db/src/recovery-allocation-repository.ts:345–357` inherits the original remittance for reversal, then refuses it because it is invalidated; `packages/db/migrations/0136_recovery_allocation.sql:248` independently refuses it. Record a payment reversal after that invalidation: the original positive landing cannot be cancelled.
- **Fix sketch:** Reverse the original immutable allocation facts using the verified reversal source without requiring the original remittance to regain current eligibility.

## Batch boundaries and excluded work

Quote calculations and final-account assembly share the money evaluator; serialize their edits. Evidence and proof share upload/completion state; keep replacement work together and preserve the already merged invalidation-locking fix. The seven recovery eligibility/allocation fixes share the allocator and controlled SQL and form one batch. Evidence-pack authorization/source fixes share their loader and repository. Shared exports, registration and any future migrations serialize at integration. These are implementation overlaps, not reasons to split into a PR for each original audit area.

The [LATER report](NIGHT-AUDIT-TRIAGE-LATER-2026-10-16.md) contains the stage-end sweep and the complete 107-entry merged-exclusion ledger. Notable exclusions include the ledger reversal/capacity fixes (#199), membership-authority fixes (#198), quote supersession/re-acceptance (#209/#212), supplier matching/discrepancy fixes (#193/#202), and queued-role/migration atomicity fixes (#204). Do not reopen those already passed changes because an older audit report still says BLOCKING.

## Run receipt and limits

Node 24.17.0 was installed (`.nvmrc` pins 24.15.0); cached pnpm 10.28.1 was used through the pre-existing `/private/tmp/jg-migfix-2-bin/pnpm` wrapper with `npm_config_manage_package_manager_versions=false COREPACK_ENABLE_NETWORK=0`. Dependencies were supplied, not freshly installed. The normal pnpm launcher stalled and eventually refused its automatic version/signature fetch; that is not evidence of a compromised dependency or red main CI. No install/download command was issued.

| Command actually run | Result |
| --- | --- |
| `pnpm typecheck` | Exit 0; 7 tasks successful, 2 cached. |
| `LANE_BASE_REF=origin/main pnpm lint` | Exit 1 at lane guard: “Missing branch or self-comparison range; refusing a misleading pass.” Core purity passed. HEAD equals origin/main and the dispatcher has not committed this task. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | Exit 1 for the same self-comparison refusal. No alternate base, bypass or lane/config edit made. |
| `pnpm exec turbo run lint` | Exit 0; package lint 7 tasks successful, 2 cached. This does not replace the refused lane check. |
| `node tools/money-arithmetic-lint.mjs`; `node tools/commercial-boundary-lint.mjs` | Both exit 0. |
| `pnpm build` | Exit 0; 7 tasks successful, 2 cached; production Next build completed. Turbo warned that cache writes were not permitted. |
| `node --test tools/*.test.mjs` | Exit 0; 100 passed. |
| `pnpm --filter @jobguard/core --filter @jobguard/config --filter @jobguard/storage --filter @jobguard/ai --workspace-concurrency=1 -r exec vitest run src --maxWorkers=1` | Exit 0; core 93 files/2,532 tests; config 1/1; storage 1/2; AI 6/85. Fixture evaluation only; no live model evaluation. |
| `pnpm --filter @jobguard/web exec vitest run app --maxWorkers=1` | Exit 0; 36 files/812 tests. |
| `pnpm --filter @jobguard/db exec vitest run src --exclude 'test/**' --maxWorkers=1` | Exit 0; 10 files/110 source tests. No PostgreSQL guarantee claimed. |
| API source subset: `pnpm --filter @jobguard/api exec vitest run src --maxWorkers=1`, excluding seven known listener/database files listed below | Exit 1; 77 files passed, 1 suite failed; 1,627 tests passed, 1 skipped. The remaining final-account-lock isolation suite imports a PostgreSQL fixture and cannot obtain a listening port. |
| `pnpm openapi:check` | Exit 1: tsx CLI IPC listener rejected with EPERM. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | Exit 0; same source generator/snapshot check without tsx CLI's IPC listener. |
| S06 direct `node --input-type=module` probe importing built `packages/core/dist/quote.js` | Exit 0; 2.5 × 12,333p with 5% discount returned net 29,290p and total 35,148p, versus once-rounded 29,291p/35,149p. The first source probe using `--import tsx` from core failed because that package has no direct tsx dependency; the built-module probe succeeded. |
| `git diff --check` and final path/accounting checks | Exit 0; exactly the two requested new markdown paths; no tracked implementation/configuration changes. |

The API source subset excluded `src/auth/sso/action-paths.test.ts`, `src/contractor/contractor-practice-session.http.test.ts`, `src/contractor/site-extra-pricing.http.test.ts`, `src/contractor/site-extra.http.test.ts`, `src/contractor/site-visit.http.test.ts`, `src/health.test.ts`, and `src/shadow-isolation.application.test.ts`. Existing tests were not edited, disabled in configuration, or waived for CI.

Earlier broad attempts are retained as failures: API `vitest run src --maxWorkers=2` exited 1 (108 failed, 1,643 passed, 23 skipped, 108 listener errors; database isolation suites also could not bind). DB `vitest run src --maxWorkers=2` exited 1 because the substring filter also selected four `audit-*dbsrc*.integration.test.ts` files, which could not obtain ports; its operator reachability test timed out under concurrent build/test load (128 passed, 1 failed, 18 skipped). The narrowed DB source run above passed. A broad recursive unit attempt including core/config/storage/AI/web exited 1 after core collected emitted `dist/*.test.js` files: 5,062 passed and two failed opening nonexistent `dist/*.ts` source fixtures. The source-only and web runs above avoid that accidental compiled-test collection; the ordinary full-suite result is not represented as green.

Full `pnpm test`, `pnpm test:db`, `pnpm test:migrations` and browser journeys were not completed in this sandbox: it cannot bind localhost/start PostgreSQL. GitHub CI after dispatcher push must run the mandatory suites and lane check against the committed head. These local limitations and collection failures are not evidence of **red GitHub CI on main**; current remote CI status was not retrieved, so no S-item is asserted under that criterion. No professional/commercial approval, independent verdict, migration guarantee or browser verification is inferred from these checks.

Temporary raw logs are `/private/tmp/jg-audit-triage-{typecheck,lint,lanes,package-lint,build,tools-tests,source-tests,web-tests,db-source-tests,api-source-tests,openapi,openapi-direct}.log`; broader failed-attempt logs use `unit-tests`, `api-tests`, and `db-unit-tests`. These logs are local ephemeral evidence, not committed deliverables. The dispatcher commit message is `/private/tmp/jg-msg-audit-triage.txt`.

