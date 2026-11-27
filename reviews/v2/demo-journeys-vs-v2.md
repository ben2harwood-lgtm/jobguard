# The checked demo's journeys against V2 (Q62, V2-SQ4)

**Demo:** Tommy's demo, commit `32decb2c1` on `claude/project-thread-qytlkj` (#918), read only. **V2:** `v2/main` at `652bcce38`. **Probe:** the 11 demo specs not on `v2/main` were run unchanged against `v2/main` on CI (run 45992038099, head `9b01ad35f`, both projects), then taken out of this PR again.

## Summary

- **58 journeys.** A journey is one demo spec matching `TOMMY-*`, `DUI-*`, `DEMO-*` or `real-*` at `32decb2c1`. The packet's count of 61 and its names `DEMO-J4-meter`, `DEMO-J5-trial` and `DEMO-J5-trial-final-check` don't exist at that commit.
- **Wholly On V2: 0.** So this PR adds no `V2-DEMO-*` spec.
  - V2's own parts on `v2/main` are five migrations: the work plan, plan edits, plan disposition, plan-variation scope and crew contacts (2002, 2003, 2004, 2020, 2027).
  - They come with three `api/v2-backend` routes (quote prompts, quote activation and the work plan) and the designed Work page.
  - No demo step needs any of these. Every route a demo spec calls exists on both `main` and `v2/main`.
- **Shared v1: 47 journeys.** These specs are already on `v2/main` (45 unchanged; `DEMO-J1-core-1000` and `DEMO-J3-shadow` changed since the demo). They pass on `v2/main` CI through main's v1 routes, so each step is "Shared v1" (plan-check condition 2), not "On V2".
- **Not on `v2/main`: 11 journeys** (`TOMMY-DEMO` and the ten `DUI-*` specs).
  - In the probe, 3 of their 16 tests passed in both projects: two of `DUI-3`'s three, and `DUI-4-company-money`. Those steps are "Shared v1".
  - Every other test stopped at a "Missing" step. Most of those steps are the demo's designed screens, which are only on #918.
  - A probe stops at the first failure, so later steps in those tests are listed as "Not reached", with the V2 PR that would carry them where there is one.

### The five most useful Missing steps, in order

1. **The designed capture and review screen** (`DUI-1a`): `.designed-capture` is not on `v2/main`. It is the first screen a builder uses. The demo has it in `apps/web/app/ui/jobguard-app.tsx` and `apps/web/app/(designed)/design-fit.css` on #918. V2's own capture is the walk stack (#920 B1A, #957 B1B, #973 B1C, #993 B1E) and the spoken quote (#1002 SQ1, #1003 SQ2, #1004 SQ3).
2. **A plain message for an empty quote** (`TOMMY-DEMO`): an empty "Make my draft" shows `INVALID_CAPTURE` on `v2/main`, where the demo says "add the work details first" (`apps/web/app/ui/jobguard-app.tsx` on #918). This is small and the builder sees it on day one.
3. **The designed quote editor and send** (`DUI-1b`): `.designed-quote` is not on `v2/main` (`apps/web/app/ui/quote-editor.tsx` on #918). V2's quote activation route is on `v2/main`, but its screen is not designed yet.
4. **Acceptance, start and proof in designed controls** (`DUI-2`): "Record practice acceptance" still sits inside a `jgd-legacy` block on `v2/main`. V2 PRs: F6 customer agreement links #923, and the F2 proof photo #991.
5. **Money after the final check** (`DUI-4-own-job-to-paid`, `DUI-4-found-extra-to-paid`, `DUI-3`):
   - the invoice list's `FINAL_ACCOUNT_LOCK_REQUIRED` alert is missing on `v2/main`;
   - so is the step that leads to "Issue supplementary invoice" after a found extra;
   - and the final-account button lacks the designed `btn` class.

   All three are in `apps/web/app/ui/customer-invoices.tsx` on #918. V2 PRs: K5A payment schedules #929, #992 and #961.

The designed Northside contractor screens (`DUI-5-northside`, `DUI-6-northside` and `DUI-6-northside-presenter`) are missing too. They rank lower because they are a contractor's tools, not a builder's first job.

### Where a demo screen is better than V2's (for a later packet)
- The designed capture, quote and invoice screens above. The files are `apps/web/app/ui/jobguard-app.tsx`, `quote-editor.tsx`, `customer-invoices.tsx`, `contractor-billing.tsx` and `apps/web/app/(designed)/design-fit.css` on #918.

## Known limits
- The list comes from the demo's tests, not from watching Ben's call. If Ben showed a step that no test covers, add it when he names it.
- The demo used main's v1 backend. "On V2" would mean V2 reaches the same outcome, not that it uses the same tables.
- A step's verdict comes from the routes its spec calls (an app route that exists on `main` as well as `v2/main` is shared v1) and, for the 11 probed journeys, from where the probe stopped.

## Journeys not on `v2/main` (probed)

| Journey | Step | What the builder sees in the demo | Verdict | V2 screen and route | Note |
| --- | --- | --- | --- | --- | --- |
| TOMMY-DEMO | 1 | "Make my draft" with empty details says "add the work details first" | Missing | `/jobs/new`, `/api/jobs/capture` | `v2/main` shows "We could not make the draft (INVALID_CAPTURE)". |
| TOMMY-DEMO | 2 | Half-typed quote numbers key by key never crash; a not-live job's diary is calm | Not reached | `/jobs/[id]/work`, `/jobs/[id]/records` | Shared v1 routes. |
| DUI-1a | 1 | A fresh own job: designed capture, "Make my draft", "Check and edit my draft" | Missing | `/jobs/new`, `/api/jobs/capture` | `.designed-capture` not found. V2: walk stack #920, #957, #973, #993; SQ1 to SQ3 #1002 to #1004. |
| DUI-1a | 2 | Review, confirm scope, customer and site, "Price the work" | Not reached | `/jobs/[id]/work` | Shared v1; SQ2 #1003 prices review rows. |
| DUI-1b | 1 | Price the work and save a draft revision in the designed quote editor | Missing | `/jobs/[id]/work#quote` | `.designed-quote` not found. |
| DUI-1b | 2 | Quote preview, "Simulate sending this quote", delivery facts | Not reached | `/jobs/[id]#quote` | Shared v1. |
| DUI-2 | 1 | "Record customer acceptance" in designed controls | Missing | `/jobs/[id]/overview` | The control is still inside `jgd-legacy`. V2: F6 #923. |
| DUI-2 | 2 | Start the accepted job, proof of the work, approve an exact extra | Not reached | `/jobs/[id]/work#work-proof`, `#variations-title` | V2: F2 #991, F3 #995. |
| DUI-3 | 1 | Designed declaration, saved processing, evidence and one confirmed catch | Missing | `/jobs/[id]/work#final-check` | "Complete final account" lacks the designed `btn` class. |
| DUI-3 | 2 | Zero and many held signals show identical unlocked and incomplete views | Shared v1 | `/jobs/[id]/work#final-check` | Passed in the probe, both projects. |
| DUI-3 | 3 | Priced and unpriced final-review extras need separate acknowledgement | Shared v1 | `/jobs/[id]/work#final-account-title` | Passed in the probe, both projects. |
| DUI-4-company-money | 1 | A company-only session gets no practice invoice access from Money | Shared v1 | `/jobs/[id]/money#customer-invoices` | Passed in the probe, both projects. |
| DUI-4-found-extra-to-paid | 1 | A found extra appears with its proposed price and reaches a paid supplementary invoice (three cases) | Missing | `/jobs/[id]/money`, `/jobs/[id]/work#variation-…` | "Issue supplementary invoice" not offered at that point. V2: K5A #929, #992. |
| DUI-4-own-job-to-paid | 1 | A blank firm's own £900 job, from "Start a new job" to an issued final invoice | Missing | `/jobs/new`, `/jobs/[id]/work#final-account-title` | The `lock-bound-invoices` alert `FINAL_ACCOUNT_LOCK_REQUIRED` is not shown. |
| DUI-4-own-job-to-paid | 2 | Practice receipt, reverse it, paid end report | Not reached | `/jobs/[id]/money#invoice-…` | Shared v1. |
| DUI-5-northside | 1 | Designed Northside finds saved work across 2,000 orders, site origin and role-bound decisions | Missing | `/northside`, `/contractor/work-orders` | No "Work orders" link in the designed Northside navigation (10 min timeout). |
| DUI-5-northside | 2 | Billing and reconciliation, extras approvals | Not reached | `/approvals/extras` | Shared v1. |
| DUI-6-northside-presenter | 1 | Northside presenter path: sign in, client approvals, approve an exact revision | Missing | `/northside?designed=1` | `main.contractor-settlement` not found. |
| DUI-6-northside | 1 | Full Northside through billing, statement and dashboard at 360 and 1280 px | Missing | `/northside?designed=1`, `/site/extra`, `/approvals/extras` | `main.contractor-settlement` not found. |

## Journeys already on `v2/main` (Shared v1)

### DEMO-A1-rest

Demo file `apps/web/e2e/DEMO-A1-rest.spec.ts`. On `v2/main`: yes, unchanged. Routes it uses: 22, all shared v1.

| Step | What the builder sees in the demo | Verdict | V2 screen and route | Note |
| --- | --- | --- | --- | --- |
| 1 | DEMO-S evidence after lock: ordinary intake is refused; imported old evidence stays usable and fee-free | Shared v1 | `/demo-s/shadow-30000`, `/sign-in`, `/jobs/x/recovery-journey`, `/api/decisions`, `/api/jobs/x/proof`, `/api/jobs/x/final-account` | Passes on `v2/main` CI through main's v1 routes; no V2 route or table. |
| 2 | DEMO-S disputed attribution: an unmatched included claim persists as disputed with no fee | Shared v1 | as above |  |
| 3 | DEMO-S unpaid catches: a real revealed catch stays unpaid and fee-free at the customer-approval blocker | Shared v1 | as above |  |
| 4 | DEMO-S partial and duplicate receipts: one command reduces the balance once and never qualifies as settlement | Shared v1 | as above |  |
| 5 | DEMO-S unknown outcomes: a committed receipt with a lost reply pauses changes and reconciles to one saved receipt | Shared v1 | as above |  |
| 6 | DEMO-S partial receipts: a part allocation uses the invoice ratio and leaves the rest unallocated | Shared v1 | as above |  |
| 7 | DEMO-S unpaid catches: a customer-approved, invoiced catch with no receipt still earns no fee | Shared v1 | as above |  |

### DEMO-A1-scenarios

Demo file `apps/web/e2e/DEMO-A1-scenarios.spec.ts`. On `v2/main`: yes, unchanged. Routes it uses: 9, all shared v1.

| Step | What the builder sees in the demo | Verdict | V2 screen and route | Note |
| --- | --- | --- | --- | --- |
| 1 | DEMO-S no proof: a pending original cannot complete work or authorize an invoice | Shared v1 | `/classic`, `/api/decisions`, `/api/jobs/x`, `/api/jobs/x/proof` | Passes on `v2/main` CI through main's v1 routes; no V2 route or table. |
| 2 | DEMO-S prevention: advisory checks and prevented spend never become recovered cash | Shared v1 | as above |  |
| 3 | DEMO-S corrupted evidence: wrong immutable version fails verification and cannot complete | Shared v1 | as above |  |
| 4 | DEMO-S disclosure before lock: real detection and support disclosure remain ineligible after lock | Shared v1 | as above |  |
| 5 | DEMO-S tenant isolation: foreign session and same-session foreign job cannot read or attach evidence | Shared v1 | as above |  |
| 6 | DEMO-S stale authority: revoked session cannot replay a successful command or create new work | Shared v1 | as above |  |
| 7 | DEMO-S stale authority: a superseded approval target cannot be replayed onto a newer price | Shared v1 | as above |  |

### DEMO-J1-core-1000

Demo file `apps/web/e2e/DEMO-J1-core-1000.spec.ts`. On `v2/main`: yes, with changes since the demo. Routes it uses: 12, all shared v1.

| Step | What the builder sees in the demo | Verdict | V2 screen and route | Note |
| --- | --- | --- | --- | --- |
| 1 | DEMO-J1 guide link alone makes a fresh five-line draft | Shared v1 | `/demo-s`, `/jobs/x`, `/jobs/x/value`, `/api/jobs/x`, `/api/session`, `/api/decisions` | Passes on `v2/main` CI through main's v1 routes; no V2 route or table. |
| 2 | DEMO-J1 fresh selection launch, five-line job, completed worker check, receipts, reversal, correction, source links and saved report | Shared v1 | as above |  |

### DEMO-J2

Demo file `apps/web/e2e/DEMO-J2.spec.ts`. On `v2/main`: yes, unchanged. Routes it uses: 15, all shared v1.

| Step | What the builder sees in the demo | Verdict | V2 screen and route | Note |
| --- | --- | --- | --- | --- |
| 1 | DEMO-J2 recovery-18800 reaches all five figures through the complete fresh journey | Shared v1 | `/jobs/x/recovery-journey`, `/demo-s`, `/api/jobs/x/recovery-allocations`, `/api/jobs/x/final-check`, `/api/recovery-cases/x/evidence-packs` | Passes on `v2/main` CI through main's v1 routes; no V2 route or table. |

### DEMO-J3-integrity

Demo file `apps/web/e2e/DEMO-J3-integrity.spec.ts`. On `v2/main`: yes, unchanged. Routes it uses: 24, all shared v1.

| Step | What the builder sees in the demo | Verdict | V2 screen and route | Note |
| --- | --- | --- | --- | --- |
| 1 | DEMO-J3-INTEGRITY: database-backed checks and demo-only helper refusals across the full journey | Shared v1 | `/demo-s/shadow-30000`, `/classic`, `/sign-in`, `/api/decisions`, `/api/jobs/x/diary`, `/api/jobs/x/shadow-demo/customer-link` | Passes on `v2/main` CI through main's v1 routes; no V2 route or table. |

### DEMO-J3-shadow

Demo file `apps/web/e2e/DEMO-J3-shadow.spec.ts`. On `v2/main`: yes, with changes since the demo. Routes it uses: 20, all shared v1.

| Step | What the builder sees in the demo | Verdict | V2 screen and route | Note |
| --- | --- | --- | --- | --- |
| 1 | DEMO-J3 fresh shadow-30000 completes customer approvals, one paid invoice, £800 Q and verified packs | Shared v1 | `/demo-s/shadow-30000`, `/jobs/x/shadow-journey`, `/jobs/x/value`, `/api/jobs/x/diary`, `/api/jobs/x/final-check/catches`, `/api/recovery-cases/x/evidence-packs` | Passes on `v2/main` CI through main's v1 routes; no V2 route or table. |

### DEMO-S-chooser

Demo file `apps/web/e2e/DEMO-S-chooser.spec.ts`. On `v2/main`: yes, unchanged. Routes it uses: 9, all shared v1.

| Step | What the builder sees in the demo | Verdict | V2 screen and route | Note |
| --- | --- | --- | --- | --- |
| 1 | DEMO-S …: resume by reference, saved report with its screens, and reset | Shared v1 | `/sign-in`, `/demo-s/recovery-18800`, `/meter`, `/api/auth/session`, `/api/jobs/capture`, `/api/jobs/x/shadow-demo` | Passes on `v2/main` CI through main's v1 routes; no V2 route or table. |
| 2 | DEMO-S chooser saves honest blockers for all families on both browser projects | Shared v1 | as above |  |
| 3 | DEMO-S lost-response replay, reset, immutable report and cross-company denial | Shared v1 | as above |  |
| 4 | DEMO-S launches a fresh shadow job, resumes it and resets without inventing results | Shared v1 | as above |  |

### DEMO-VOICE-PHONE

Demo file `apps/web/e2e/DEMO-VOICE-PHONE.spec.ts`. On `v2/main`: yes, unchanged. Routes it uses: 5, all shared v1.

| Step | What the builder sees in the demo | Verdict | V2 screen and route | Note |
| --- | --- | --- | --- | --- |
| 1 | real worker recognises fictional microphone audio locally, reviews and saves the guided draft | Shared v1 | `/practice-company`, `/jobs`, `/practice-company/walkthrough`, `/api/jobs/capture`, `/api/jobs/x/proposal` | Passes on `v2/main` CI through main's v1 routes; no V2 route or table. |
| 2 | no getUserMedia gives a plain typed fallback without model requests | Shared v1 | as above |  |
| 3 | a model download failure preserves typed work | Shared v1 | as above |  |
| 4 | a same-size WASM hash mismatch preserves typing before any model download | Shared v1 | as above |  |

### TOMMY-acceptance-recovery

Demo file `apps/web/e2e/TOMMY-acceptance-recovery.spec.ts`. On `v2/main`: yes, unchanged. Routes it uses: 3, all shared v1.

| Step | What the builder sees in the demo | Verdict | V2 screen and route | Note |
| --- | --- | --- | --- | --- |
| 1 | The whole spec (its tests are generated in a loop) | Shared v1 | `/classic`, `/api/jobs/capture`, `/api/jobs/x/quotes/acceptance` | Passes on `v2/main` CI through main's v1 routes; no V2 route or table. |

### TOMMY-demo-faults

Demo file `apps/web/e2e/TOMMY-demo-faults.spec.ts`. On `v2/main`: yes, unchanged. Routes it uses: 5, all shared v1.

| Step | What the builder sees in the demo | Verdict | V2 screen and route | Note |
| --- | --- | --- | --- | --- |
| 1 | support-v01 persisted integrity: a lost committed acceptance reply reconciles one operation; report UX recovery separately | Shared v1 | `/classic`, `/api/jobs/x/quotes/acceptance`, `/api/jobs/x/quotes/activation`, `/api/jobs/x/confirm` | Passes on `v2/main` CI through main's v1 routes; no V2 route or table. |
| 2 | concurrent confirm-scope and open-recovery commands preserve one scope and one case, or recover the exact held command | Shared v1 | as above |  |

### TOMMY-money-gaps

Demo file `apps/web/e2e/TOMMY-money-gaps.spec.ts`. On `v2/main`: yes, unchanged. Routes it uses: 16, all shared v1.

| Step | What the builder sees in the demo | Verdict | V2 screen and route | Note |
| --- | --- | --- | --- | --- |
| 1 | support-v02: matched fresh jobs exclude dismissed shelves and a pending £50 from the same final bill | Shared v1 | `/jobs`, `/classic`, `/jobs/x/recovery-journey`, `/api/jobs`, `/api/jobs/capture`, `/api/decisions` | Passes on `v2/main` CI through main's v1 routes; no V2 route or table. |
| 2 | support-v04: a lost committed £384 allocation reply reconciles before exact replay and keeps one £320 principal | Shared v1 | as above |  |

### real-customer-link-own-quote

Demo file `apps/web/e2e/real-customer-link-own-quote.spec.ts`. On `v2/main`: yes, unchanged. Routes it uses: 1, all shared v1.

| Step | What the builder sees in the demo | Verdict | V2 screen and route | Note |
| --- | --- | --- | --- | --- |
| 1 | own practice quote accepted in a separate customer browser (…) | Shared v1 | `/practice-company` | Passes on `v2/main` CI through main's v1 routes; no V2 route or table. |

### real-customer-link-recipient

Demo file `apps/web/e2e/real-customer-link-recipient.spec.ts`. On `v2/main`: yes, unchanged. Routes it uses: 1, all shared v1.

| Step | What the builder sees in the demo | Verdict | V2 screen and route | Note |
| --- | --- | --- | --- | --- |
| 1 | missing saved email gives guidance, then the added email works | Shared v1 | `/practice-company` | Passes on `v2/main` CI through main's v1 routes; no V2 route or table. |
| 2 | the first saved customer email follows through to acceptance | Shared v1 | as above |  |

### real-diary-extra-link

Demo file `apps/web/e2e/real-diary-extra-link.spec.ts`. On `v2/main`: yes, unchanged. Routes it uses: 3, all shared v1.

| Step | What the builder sees in the demo | Verdict | V2 screen and route | Note |
| --- | --- | --- | --- | --- |
| 1 | REAL-DIARY-EXTRA-LINK: own job diary opens reachable extra-work controls | Shared v1 | `/practice-company`, `/jobs/x/records`, `/jobs/x/work` | Passes on `v2/main` CI through main's v1 routes; no V2 route or table. |

### real-discard-draft

Demo file `apps/web/e2e/real-discard-draft.spec.ts`. On `v2/main`: yes, unchanged. Routes it uses: 8, all shared v1.

| Step | What the builder sees in the demo | Verdict | V2 screen and route | Note |
| --- | --- | --- | --- | --- |
| 1 | discard a mistaken draft and keep a quoting job (…) | Shared v1 | `/practice-company`, `/jobs/x/overview`, `/jobs`, `/api/jobs/capture`, `/api/jobs/x`, `/api/jobs/x/discard` | Passes on `v2/main` CI through main's v1 routes; no V2 route or table. |

### real-fc-ordinary-words-saved-estimate

Demo file `apps/web/e2e/real-fc-ordinary-words-saved-estimate.spec.ts`. On `v2/main`: yes, unchanged. Routes it uses: 5, all shared v1.

| Step | What the builder sees in the demo | Verdict | V2 screen and route | Note |
| --- | --- | --- | --- | --- |
| 1 | ordinary words survive the authorised saved reveal with £180.00 and one finding | Shared v1 | `/practice-company`, `/classic`, `/api/jobs/x/final-check`, `/api/jobs/x/final-check/catches`, `/api/jobs/x/variations` | Passes on `v2/main` CI through main's v1 routes; no V2 route or table. |

### real-fc-ordinary-words

Demo file `apps/web/e2e/real-fc-ordinary-words.spec.ts`. On `v2/main`: yes, unchanged. Routes it uses: 4, all shared v1.

| Step | What the builder sees in the demo | Verdict | V2 screen and route | Note |
| --- | --- | --- | --- | --- |
| 1 | ordinary towel-rail words persist one possible extra with both sources and exact proposed pence; ceiling certificate stays non-commercial | Shared v1 | `/practice-company`, `/classic`, `/api/jobs/x/final-check`, `/api/jobs/x/customer-invoices` | Passes on `v2/main` CI through main's v1 routes; no V2 route or table. |

### real-fc-recovery-screen-now

Demo file `apps/web/e2e/real-fc-recovery-screen-now.spec.ts`. On `v2/main`: yes, unchanged. Routes it uses: 7, all shared v1.

| Step | What the builder sees in the demo | Verdict | V2 screen and route | Note |
| --- | --- | --- | --- | --- |
| 1 | The whole spec (its tests are generated in a loop) | Shared v1 | `/practice-company`, `/classic`, `/api/jobs/x/final-check`, `/api/jobs/x/parties`, `/api/jobs/x/final-account/lock` | Passes on `v2/main` CI through main's v1 routes; no V2 route or table. |

### real-fc-typed-recovery

Demo file `apps/web/e2e/real-fc-typed-recovery.spec.ts`. On `v2/main`: yes, unchanged. Routes it uses: 8, all shared v1.

| Step | What the builder sees in the demo | Verdict | V2 screen and route | Note |
| --- | --- | --- | --- | --- |
| 1 | ordinary typed job retains its bill through bounded worker recovery | Shared v1 | `/practice-company`, `/classic`, `/api/jobs/x/final-check`, `/api/jobs/x/parties`, `/api/jobs/x/final-account/lock` | Passes on `v2/main` CI through main's v1 routes; no V2 route or table. |

### real-fc-typed-sources

Demo file `apps/web/e2e/real-fc-typed-sources.spec.ts`. On `v2/main`: yes, unchanged. Routes it uses: 4, all shared v1.

| Step | What the builder sees in the demo | Verdict | V2 screen and route | Note |
| --- | --- | --- | --- | --- |
| 1 | The whole spec (its tests are generated in a loop) | Shared v1 | `/practice-company`, `/classic`, `/api/jobs/x/final-check`, `/api/jobs/x/customer-invoices` | Passes on `v2/main` CI through main's v1 routes; no V2 route or table. |

### real-found-extra-to-paid

Demo file `apps/web/e2e/real-found-extra-to-paid.spec.ts`. On `v2/main`: yes, unchanged. Routes it uses: 10, all shared v1.

| Step | What the builder sees in the demo | Verdict | V2 screen and route | Note |
| --- | --- | --- | --- | --- |
| 1 | a found own-job extra appears with its proposed price and reaches a paid supplementary invoice: …, main ${scenario.paid? | Shared v1 | `/practice-company`, `/classic`, `/api/jobs/x/parties`, `/api/jobs/x/final-check`, `/api/jobs/x/final-check/catches` | Passes on `v2/main` CI through main's v1 routes; no V2 route or table. |

### real-found-money-attention

Demo file `apps/web/e2e/real-found-money-attention.spec.ts`. On `v2/main`: yes, unchanged. Routes it uses: 9, all shared v1.

| Step | What the builder sees in the demo | Verdict | V2 screen and route | Note |
| --- | --- | --- | --- | --- |
| 1 | paid main bill still flags an approved unbilled catch on Today and overview | Shared v1 | `/practice-company`, `/today`, `/jobs/x/overview`, `/api/jobs/x/variations`, `/api/jobs/x/final-account`, `/api/jobs/x/final-account/lock` | Passes on `v2/main` CI through main's v1 routes; no V2 route or table. |

### real-front-door-keeps-firm

Demo file `apps/web/e2e/real-front-door-keeps-firm.spec.ts`. On `v2/main`: yes, unchanged. Routes it uses: 1, all shared v1.

| Step | What the builder sees in the demo | Verdict | V2 screen and route | Note |
| --- | --- | --- | --- | --- |
| 1 | blank practice firm survives closing the browser | Shared v1 | `/jobs` | Passes on `v2/main` CI through main's v1 routes; no V2 route or table. |

### real-gap-firm-onboarding

Demo file `apps/web/e2e/real-gap-firm-onboarding.spec.ts`. On `v2/main`: yes, unchanged. Routes it uses: 5, all shared v1.

| Step | What the builder sees in the demo | Verdict | V2 screen and route | Note |
| --- | --- | --- | --- | --- |
| 1 | verified owner names the fictional firm before opening jobs | Shared v1 | `/sign-in`, `/firm-details`, `/api/auth/session`, `/api/firm-profile`, `/api/auth/invitations` | Passes on `v2/main` CI through main's v1 routes; no V2 route or table. |
| 2 | unsigned, non-owner, ambiguous and lost sessions never retain an actionable owner form | Shared v1 | as above |  |

### real-gap-plan-preview

Demo file `apps/web/e2e/real-gap-plan-preview.spec.ts`. On `v2/main`: yes, unchanged. Routes it uses: 4, all shared v1.

| Step | What the builder sees in the demo | Verdict | V2 screen and route | Note |
| --- | --- | --- | --- | --- |
| 1 | unsigned visitor can compare practice plans without company access | Shared v1 | `/plans`, `/sign-in`, `/api/subscriptions/current`, `/api/subscriptions/commands` | Passes on `v2/main` CI through main's v1 routes; no V2 route or table. |
| 2 | public catalogue survives failed reads and lost company access without previous private figures | Shared v1 | as above |  |

### real-gap-proof-by-trade

Demo file `apps/web/e2e/real-gap-proof-by-trade.spec.ts`. On `v2/main`: yes, unchanged. Routes it uses: 8, all shared v1.

| Step | What the builder sees in the demo | Verdict | V2 screen and route | Note |
| --- | --- | --- | --- | --- |
| 1 | prepared unanswered example retains the certificate walkthrough and resumes | Shared v1 | `/practice-company`, `/jobs/x/value`, `/practice-company/walkthrough`, `/api/jobs/x/final-account`, `/api/jobs/x/customer-invoices`, `/api/jobs/x/final-account/lock` | Passes on `v2/main` CI through main's v1 routes; no V2 route or table. |

### real-journey-money-status

Demo file `apps/web/e2e/real-journey-money-status.spec.ts`. On `v2/main`: yes, unchanged. Routes it uses: 10, all shared v1.

| Step | What the builder sees in the demo | Verdict | V2 screen and route | Note |
| --- | --- | --- | --- | --- |
| 1 | walk 2: two locked bills need attention and accepted money stays separate | Shared v1 | `/practice-company`, `/jobs/new`, `/jobs/x/overview`, `/api/jobs/x/final-check`, `/api/jobs/x/final-account/lock` | Passes on `v2/main` CI through main's v1 routes; no V2 route or table. |
| 2 | walk 2: paid example job has saved amounts on every designed screen | Shared v1 | as above |  |

### real-journey-next-state

Demo file `apps/web/e2e/real-journey-next-state.spec.ts`. On `v2/main`: yes, unchanged. Routes it uses: 4, all shared v1.

| Step | What the builder sees in the demo | Verdict | V2 screen and route | Note |
| --- | --- | --- | --- | --- |
| 1 | walk 2 saved facts select the no-extra account and paid end states | Shared v1 | `/practice-company`, `/jobs/x/value`, `/api/jobs/xx`, `/api/jobs/x/final-check` | Passes on `v2/main` CI through main's v1 routes; no V2 route or table. |

### real-journey-next-to-paid-send

Demo file `apps/web/e2e/real-journey-next-to-paid-send.spec.ts`. On `v2/main`: yes, unchanged. Routes it uses: 3, all shared v1.

| Step | What the builder sees in the demo | Verdict | V2 screen and route | Note |
| --- | --- | --- | --- | --- |
| 1 | blank firm sends its exact practice quote without a worker click | Shared v1 | `/practice-company`, `/api/jobs/x/quotes/delivery`, `/api/jobs/x/quotes/delivery/execute` | Passes on `v2/main` CI through main's v1 routes; no V2 route or table. |

### real-journey-next-to-paid

Demo file `apps/web/e2e/real-journey-next-to-paid.spec.ts`. On `v2/main`: yes, unchanged. Routes it uses: 4, all shared v1.

| Step | What the builder sees in the demo | Verdict | V2 screen and route | Note |
| --- | --- | --- | --- | --- |
| 1 | walk 2: Continue opens the pending extra approval | Shared v1 | `/practice-company`, `/api/jobs/x/final-account`, `/api/jobs/x/customer-invoices`, `/api/jobs/x/variations` | Passes on `v2/main` CI through main's v1 routes; no V2 route or table. |

### real-journey-receipt-balance-now

Demo file `apps/web/e2e/real-journey-receipt-balance-now.spec.ts`. On `v2/main`: yes, unchanged. Routes it uses: 7, all shared v1.

| Step | What the builder sees in the demo | Verdict | V2 screen and route | Note |
| --- | --- | --- | --- | --- |
| 1 | own-job receipt defaults to its balance and reaches Paid | Shared v1 | `/practice-company`, `/api/jobs/x/final-check`, `/api/jobs/x/customer-invoices`, `/api/jobs/x/customer-invoices/x/receipts` | Passes on `v2/main` CI through main's v1 routes; no V2 route or table. |

### real-lock-pending-extra

Demo file `apps/web/e2e/real-lock-pending-extra.spec.ts`. On `v2/main`: yes, unchanged. Routes it uses: 8, all shared v1.

| Step | What the builder sees in the demo | Verdict | V2 screen and route | Note |
| --- | --- | --- | --- | --- |
| 1 | both waiting extras must be intentionally left off before completing | Shared v1 | `/api/jobs/x/final-account/lock`, `/api/decisions`, `/api/jobs/x/final-account` | Passes on `v2/main` CI through main's v1 routes; no V2 route or table. |
| 2 | after approval and rebuilding only the unpriced extra still waits | Shared v1 | as above |  |

### real-overview-paid-status

Demo file `apps/web/e2e/real-overview-paid-status.spec.ts`. On `v2/main`: yes, unchanged. Routes it uses: 4, all shared v1.

| Step | What the builder sees in the demo | Verdict | V2 screen and route | Note |
| --- | --- | --- | --- | --- |
| 1 | ordinary own job shows due, part paid and paid on the overview | Shared v1 | `/practice-company`, `/jobs/x`, `/api/jobs/x/final-check`, `/api/jobs/x/final-account/lock` | Passes on `v2/main` CI through main's v1 routes; no V2 route or table. |

### real-own-job-promise

Demo file `apps/web/e2e/real-own-job-promise.spec.ts`. On `v2/main`: yes, unchanged. Routes it uses: 3, all shared v1.

| Step | What the builder sees in the demo | Verdict | V2 screen and route | Note |
| --- | --- | --- | --- | --- |
| 1 | own blank-firm job finds omitted hallway work and confirms only a draft extra | Shared v1 | `/practice-company`, `/classic`, `/api/jobs/x/variations` | Passes on `v2/main` CI through main's v1 routes; no V2 route or table. |

### real-own-job-to-paid

Demo file `apps/web/e2e/real-own-job-to-paid.spec.ts`. On `v2/main`: yes, unchanged. Routes it uses: 7, all shared v1.

| Step | What the builder sees in the demo | Verdict | V2 screen and route | Note |
| --- | --- | --- | --- | --- |
| 1 | REAL-OWN-JOB-TO-PAID: a blank firm | Shared v1 | `/practice-company`, `/classic`, `/api/jobs/x/final-account`, `/api/jobs/x/customer-invoices`, `/api/jobs/x/final-account/lock` | Passes on `v2/main` CI through main's v1 routes; no V2 route or table. |

### real-parties-atomic-save

Demo file `apps/web/e2e/real-parties-atomic-save.spec.ts`. On `v2/main`: yes, unchanged. Routes it uses: 3, all shared v1.

| Step | What the builder sees in the demo | Verdict | V2 screen and route | Note |
| --- | --- | --- | --- | --- |
| 1 | walk 2 invalid postcode leaves no customer | Shared v1 | `/practice-company`, `/api/jobs/capture`, `/api/jobs/x/parties` | Passes on `v2/main` CI through main's v1 routes; no V2 route or table. |
| 2 | walk 2 decorating words suggest editable parties | Shared v1 | as above |  |

### real-practice-firm-name-invoice

Demo file `apps/web/e2e/real-practice-firm-name-invoice.spec.ts`. On `v2/main`: yes, unchanged. Routes it uses: 5, all shared v1.

| Step | What the builder sees in the demo | Verdict | V2 screen and route | Note |
| --- | --- | --- | --- | --- |
| 1 | blank firm’s ordinary-words job reaches an invoice bearing its saved name | Shared v1 | `/firm-details`, `/practice-company`, `/api/jobs/x/final-account`, `/api/jobs/x/final-check`, `/api/jobs/x/customer-invoices` | Passes on `v2/main` CI through main's v1 routes; no V2 route or table. |

### real-practice-firm-name

Demo file `apps/web/e2e/real-practice-firm-name.spec.ts`. On `v2/main`: yes, unchanged. Routes it uses: 3, all shared v1.

| Step | What the builder sees in the demo | Verdict | V2 screen and route | Note |
| --- | --- | --- | --- | --- |
| 1 | blank firm saves its name and issues an ordinary-words quote | Shared v1 | `/firm-details`, `/practice-company`, `/api/jobs/x/quotes/acceptance` | Passes on `v2/main` CI through main's v1 routes; no V2 route or table. |

### real-proof-keeps-finished

Demo file `apps/web/e2e/real-proof-keeps-finished.spec.ts`. On `v2/main`: yes, unchanged. Routes it uses: 3, all shared v1.

| Step | What the builder sees in the demo | Verdict | V2 screen and route | Note |
| --- | --- | --- | --- | --- |
| 1 | REAL-PROOF-KEEPS-FINISHED: own practice job retains finished after proof, then diary restarts it | Shared v1 | `/practice-company`, `/api/jobs/x/work-state`, `/api/jobs/x/diary` | Passes on `v2/main` CI through main's v1 routes; no V2 route or table. |

### real-quote-firm-sequence-screen

Demo file `apps/web/e2e/real-quote-firm-sequence-screen.spec.ts`. On `v2/main`: yes, unchanged. Routes it uses: 4, all shared v1.

| Step | What the builder sees in the demo | Verdict | V2 screen and route | Note |
| --- | --- | --- | --- | --- |
| 1 | two own jobs keep their references across revision and reload | Shared v1 | `/practice-company`, `/classic`, `/api/jobs/x/quotes/delivery`, `/api/jobs/x/quotes/artifacts/x` | Passes on `v2/main` CI through main's v1 routes; no V2 route or table. |

### real-quote-firm-sequence-server

Demo file `apps/web/e2e/real-quote-firm-sequence-server.spec.ts`. On `v2/main`: yes, unchanged. Routes it uses: 3, all shared v1.

| Step | What the builder sees in the demo | Verdict | V2 screen and route | Note |
| --- | --- | --- | --- | --- |
| 1 | two runtime previews use one firm sequence and a revised quote retains its reference | Shared v1 | `/practice-company`, `/classic`, `/api/jobs/x/quotes/delivery` | Passes on `v2/main` CI through main's v1 routes; no V2 route or table. |

### real-split-review-recovery

Demo file `apps/web/e2e/real-split-review-recovery.spec.ts`. On `v2/main`: yes, unchanged. Routes it uses: 3, all shared v1.

| Step | What the builder sees in the demo | Verdict | V2 screen and route | Note |
| --- | --- | --- | --- | --- |
| 1 | walk 2 Split reaches confirmed scope without guessing quantity | Shared v1 | `/practice-company`, `/api/jobs/x/proposal`, `/api/jobs/x/review` | Passes on `v2/main` CI through main's v1 routes; no V2 route or table. |
| 2 | Split names a cleared child … before REVIEW_INCOMPLETE | Shared v1 | as above |  |
| 3 | walk 2 unanswered questions explain why scope remains draft | Shared v1 | as above |  |
| 4 | unsupported one-line capture retains repeated Split history and live add/merge count | Shared v1 | as above |  |

### real-stale-after-approve

Demo file `apps/web/e2e/real-stale-after-approve.spec.ts`. On `v2/main`: yes, unchanged. Routes it uses: 8, all shared v1.

| Step | What the builder sees in the demo | Verdict | V2 screen and route | Note |
| --- | --- | --- | --- | --- |
| 1 | updates the stale bill explicitly and keeps saved dispositions | Shared v1 | `/api/jobs/x/final-account/lock`, `/api/decisions`, `/api/jobs/x/final-account` | Passes on `v2/main` CI through main's v1 routes; no V2 route or table. |

### real-tour-one-saved-job-now

Demo file `apps/web/e2e/real-tour-one-saved-job-now.spec.ts`. On `v2/main`: yes, unchanged. Routes it uses: 9, all shared v1.

| Step | What the builder sees in the demo | Verdict | V2 screen and route | Note |
| --- | --- | --- | --- | --- |
| 1 | hand step 3 saves customer and site before sending | Shared v1 | `/practice-company`, `/jobs`, `/api/session`, `/api/jobs`, `/api/jobs/capture` | Passes on `v2/main` CI through main's v1 routes; no V2 route or table. |
| 2 | own-job refusal waits for an explicit alternative | Shared v1 | as above |  |
| 3 | cancel sample reading before and after capture without another command | Shared v1 | as above |  |
| 4 | foreign selectors and reset-session resume never capture an alternative | Shared v1 | as above |  |

### real-tour-readable-steps

Demo file `apps/web/e2e/real-tour-readable-steps.spec.ts`. On `v2/main`: yes, unchanged. Routes it uses: 1, all shared v1.

| Step | What the builder sees in the demo | Verdict | V2 screen and route | Note |
| --- | --- | --- | --- | --- |
| 1 | viewer walk 2 gives every completed autoplay step time to read | Shared v1 | `/practice-company` | Passes on `v2/main` CI through main's v1 routes; no V2 route or table. |
| 2 | explicit Next releases reading; Stop prevents another command and Close restores interaction | Shared v1 | as above |  |

### real-wayin-linked-practice

Demo file `apps/web/e2e/real-wayin-linked-practice.spec.ts`. On `v2/main`: yes, unchanged. Routes it uses: 11, all shared v1.

| Step | What the builder sees in the demo | Verdict | V2 screen and route | Note |
| --- | --- | --- | --- | --- |
| 1 | fictional sign-in opens the same own practice firm without the classic detour | Shared v1 | `/sign-in`, `/today`, `/jobs/x$`, `/api/jobs/x`, `/api/jobs/capture`, `/api/auth/practice` | Passes on `v2/main` CI through main's v1 routes; no V2 route or table. |
| 2 | own jobs at /jobs/new start empty while the classic example keeps six suggestions | Shared v1 | as above |  |

### real-words-natural-items

Demo file `apps/web/e2e/real-words-natural-items.spec.ts`. On `v2/main`: yes, unchanged. Routes it uses: 4, all shared v1.

| Step | What the builder sees in the demo | Verdict | V2 screen and route | Note |
| --- | --- | --- | --- | --- |
| 1 | walk 2 ordinary words become reviewable work | Shared v1 | `/practice-company`, `/api/jobs/x/proposal`, `/api/jobs`, `/api/jobs/capture` | Passes on `v2/main` CI through main's v1 routes; no V2 route or table. |
| 2 | ordinary words keep … as an overall-price question | Shared v1 | as above |  |
| 3 | unsupported wording retains one editable unpriced line and the honest Split prompt | Shared v1 | as above |  |

