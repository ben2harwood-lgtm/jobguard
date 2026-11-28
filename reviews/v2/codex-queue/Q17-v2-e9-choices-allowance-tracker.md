# Q17 · V2-E9: customer choices and PC sums tracker

> **Rules this piece must meet (read before writing code).** AGENTS.md rev 3.0 and BUILD_PLAN.md on `main`, plus `codex-queue/01-RULES.md`. Ben's build rules checklist `reviews/v2/codex-queue/02-BUILD-RULES-CHECKLIST.md` (version 1.1, in this repo on branch `claude/project-thread-cw5qv5`) applies in full, and its rules 1 to 18 go in the PR's "Rules met" list. The rule missed most on 24 Nov is the **audit chain (AGENTS.md §5.7)**: every command that changes data appends exactly one event with `appendAuditBatch` (`packages/db/src/audit.ts`) in the same transaction (`audit.v1`, actor `membership:<id>`, event type `v2.<thing>.<verb>`, no payload key `version`, a replay appends nothing), with a test that a forced failure after the insert leaves neither row nor event. Also: RLS forced and a second-firm test for any new table; exact decimal strings for money; sends only to the local catcher; hidden financial findings never reach a crew, customer or audit payload. The checker rejects the PR if any is missing.

Tier: **RED** (money). Migration **2022**. Astra: yes. Usefulness **very high**, effort **M**. Rework risk: **high** (E1 is in review).
Rules: `01-RULES.md` (audit chain, catcher only, shared files, no edits to others' files). Plan: V2 build plan rev 1.3 (PR #915). Piece v2-e9, section 2B item 17.
**Starts:** PARKED (25 Nov 01:10 UK, planner miss, out of rounds; Ben decides on another round). Restart from the corrected section below. Was: now. **Base:** E1's branch `claude/project-thread-vur4ba` (#919). Draft PR against it. It drafts extras through the variation path already on the base, so it does not wait for F3.


> **Customer link rule (01-RULES rule 16):** copy the existing customer job link's anonymous-access database check, not F6's (#923); recorded customer agreements are immutable to the app role; seed proofs pass in the full V2 suite without tripping the sign-in rate limit.

## Dry-check against the code (planner, 25 Nov 00:10 UK)
**Verified, with exact routes.** E1 (#919) has `app.v2_open_fact` with `kind = 'customer_choice'` (`choice_question`, `choice_may_change_price`). The existing variation route is `POST jobs/:id/variations` with `variation-command.v1` (`apps/api/src/variation/contracts.ts`).
- **Over the allowance:** `action: "propose"`, with `price` given as `quantity`, `unit`, `unitRatePence` (an integer number of pence) and `direction: "addition"`. Existing money format; no new rounding.
- **Back under the allowance:** close the open proposal with the builder's `action: "reject"`. Never send `"approve"`.
- If the builder can't reject their own proposal on this base, stop and report.

## Writing the draft safely without touching main's variation code (planner decision, 25 Nov 01:00 UK, E9's last round)
The variation command is main's live money path. **Do not extract, refactor or edit** `apps/api/src/variation/variation.application.ts` or `packages/db/src/variation-repository.ts`. E9 instead relies on what those files already guarantee, which the planner checked on v2/main @ bade747e:
- `propose` → `logBuilderExtra` claims a `command_receipt` with `commandId = proposalId`. An exact retry replays, and a retry with the same id but different content refuses (`COMMAND_CONFLICT`).
- `reject` is idempotent on `rejectionId`: it locks the variation row, returns the prior rejection, and uses `ON CONFLICT DO NOTHING`.
- `approve` needs the exact current priced revision, and a rejected variation can't be approved.

**Design.**
1. **Deterministic ids, matching the real contract (corrected 25 Nov 01:10 UK).**
   - **The miss.** `propose`'s strict schema (`apps/api/src/variation/contracts.ts` line 4) has **no** `revisionId`. When `propose` carries a price, `logBuilderExtra` makes the priced revision with `randomUUID()` (`variation-repository.ts` line 182). So an E9-chosen revision id can't ride on `propose`.
   - **Step a, propose unpriced.** Call `propose` with `proposalId = v5(tenant, choice id, choice version, "excess")` and **`price: null`**. This creates an unpriced draft, and the `command_receipt` on `proposalId` makes a retry replay.
   - **Step b, price it with revise.** Call `revise` with `variationId = proposalId`, `revisionId = v5(proposalId, "price")`, `expectedRevisionId: null` and the excess price. `revise` already takes a client-chosen `revisionId`, and an exact committed revise replays: the application returns early when the committed revision matches.
   - **Rejection id.** `rejectionId = v5(proposalId, "superseded")`, used with the variation's **current** revision id, read back through the existing variation read and never assumed.
   - **The intent row** records which step is done: `proposed`, `priced`, `withdrawn`. Reconcile resumes from the last step (rule 3 below).
   - **First commit is the flow test, not a pre-build step** (changed 25 Nov 12:45 UK: Codex's sandbox cannot start PostgreSQL). The builder's first commit adds one V2 seed test, beside the existing seed tests, that uses only main's variation code: propose an unpriced builder extra (`price: null`), then `revise` it with `expectedRevisionId: null` and the deterministic revision id, and assert that the revision is accepted and that a replay of the same revise is exact. Push that commit alone and let CI's V2 seed job (CI1) run it. Mac lane B may run it too. Build the rest of E9 only after that test is green on the pushed head, and link the CI run in the PR body. If it fails, stop and report the failing assertion (rule 23). Do not change main's variation code, and do not price through `propose`.
2. **Intent first.** E9's own transaction saves the choice version plus an intent row `(choice version, action propose|withdraw, variation id, state pending)` and its audit event, then commits. Only then does it call the variation command. A second E9 transaction marks the intent `done`.
3. **Reconcile on every read and command.** Any `pending` intent is finished before anything else:
   - variation exists and matches → mark the intent done;
   - otherwise → call the command again with the same ids.

   Nothing is orphaned and nothing is duplicated.
4. **Stale excess.** When a choice changes, or drops back to equal or under:
   - **Withdraw first.** E9 withdraws the old draft (`reject` with its fixed `rejectionId` on the current revision) **before** it commits the new choice version as current. An old excess therefore can't stay approvable.
   - **If the builder already approved the old draft,** the reject refuses. E9 then records the new choice and shows "Approved extra no longer matches this choice: raise a credit if needed". It never changes an approved variation.
   - **Then propose.** A new excess gets a new draft from the new version's ids.
5. **Reason code.** Main's reject writes the fixed reason `customer_did_not_approve`. E9's intent row keeps the true reason, `superseded_by_choice_change`, linked to the rejection id, and the tracker shows E9's reason. This is a question for Astra (below). It is not a reason to edit main.

**Tests (seed suite, real PostgreSQL).** Force a failure at each seam:
- after the intent commits;
- after propose;
- before the intent is marked done.

Also force a failure between propose and revise. Each must end, after a retry or read, with exactly one variation, one priced revision (id `v5(proposalId, "price")`), one receipt and one audit event per step. Also test:
- over → equal after a draft exists: the draft is rejected and can't be approved;
- the builder approves, then the choice changes: the approval stands, the warning shows, and there is no second draft;
- an id clash with different content refuses;
- the same choice version proposed twice concurrently gives one variation;
- second-firm isolation.

**Lane:** E9's lane file must **not** list the two variation files above. If the design can't be met without changing them, stop and report.

**Planner note for Astra (RED plan check, with E9's verdict):** Is main's fixed reject reason acceptable for a draft withdrawn by a choice change, given that E9 records the true reason? The alternative, a reason parameter on main's reject, would be its own RED packet and is not part of E9.

## Screen files and mounts (planner, 25 Nov 00:25 UK; copy this wording verbatim into the builder's brief)
**One mount is allowed**, in `apps/web/app/(designed)/jobs/[id]/money/page.tsx` only: one import line plus one element, rendered only when `process.env.JOBGUARD_LOCAL_V2 === "1"`. Add that file to your lane file with the note `"mount only, owned by main (live Money tab)"`. Change nothing else in that file. The builder's choices and allowances section goes in a new component file you own. No other screen file may be touched. This overrides any other line in this packet or brief about editing screen files.

## Goal
Each customer choice (tiles, sanitaryware, worktop, paint) has an allowance (for example tiles at £25/m²) and a "decide by" date. If the choice goes over the allowance, a variation is **drafted** for the difference, never committed.

## Scope
- Table: allowance per choice (E1 customer-choice fact, allowance amount and basis per unit or total, decide-by date, chosen item and price). Commands with one audit event each.
- Over allowance: draft one variation for the difference through the existing variation-draft route, linked to the choice; the builder reviews it. Under or equal: nothing drafted.
- A late choice (past decide-by) is flagged to the builder **in E9's Money section only**. The on-plan flag is cut to a later piece, **E9P**: the c2/c3 plan read (`work-plan.application.ts`, `v2-work-plan-repository.ts`) has no hook for a customer-choice deadline, and E9 may not edit c2/c3 or mount on the Plan screen.
- Never changes the accepted quote or any committed price.

## Acceptance cases added (Web Codex acceptance findings, frm-management-layer#3 comment 7145931890 (24 Nov 22:12 UK), folded in by the planner 22:25 UK)
- **Back under allowance after a draft exists.** If a choice moves from over the allowance back to equal or under, the existing draft is cancelled or superseded through the existing draft transition (name it in the PR) and can never be approved for the old excess. Test it.

## Done when
- Tiles chosen at £31/m² for 6 m² against £25/m² drafts one £36 (plus VAT as the existing rules apply) variation, uncommitted; a choice at or under allowance drafts nothing; changing the choice updates the same draft rather than adding another; a late choice is flagged; replay, stale version, second-firm and audit tests per the rules. CI green apart from Vercel.
