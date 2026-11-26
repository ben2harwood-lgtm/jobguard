# Q57 · V2-G3: release a saved handover version to the customer by link, with "Acknowledge receipt"

**Tier:** RED (a no-sign-in customer capability link). **Builder:** Opus 5.5 thread. **Checker:** Codex, by an `@codex review` comment on the PR. **Base:** G2's PR from Q56, the builder thread's G2 branch, stacked on G1 #996. Start it once G2's PR is open, and draft the PR into that branch. **Branch:** the builder thread's own branch, in `config/lanes/v2-g3.json`. **Migration: 2058** (the next free number after FL-FX's 2057; G2 used 2043; final number set at merge). **Plan check:** Astra, frm-management-layer#3. Rules 1 to 30 apply. Planner: 26 Nov 18:35 UK.

## What it is (rev 1.3 lines 169 to 170; page "Your handover pack", line 290)
"Ordinary site completion plus an explicit release by the builder makes the pack available, independent of the financial lock. Acknowledgement records receipt only and cannot sign off a snag or the account." Done when: "a customer opens the approved version, sees an outstanding snag and later receives a corrected version." Screen: M3 `CustomerPack()` ("Newer version available", "Acknowledge receipt", and "Receipt only: acknowledging this pack does not agree the account or sign off any snag").

## Planner reading (Astra please confirm or correct)
1. **Release needs site completion and nothing financial.** "Ordinary site completion" means every included scope item's `app.scope_progress.stage` is `complete`. The `in_progress` → `complete` transition is in `0749_lp6d_remaining_routines.sql` lines 22 to 24. Release never reads the final-account lock, invoices or payments.
2. **One link per release, bound to one saved version and one recipient.** The recipient is the job's current customer contact. Read it the way E2 reads it, from `job_party_current` / `job_party_binding`; E2's `2029_v2_fact_reply.sql` lines 242 to 246 has the read policies. Copy that read; don't import it. The link is delivered only to the local catcher (`captureV2Delivery`), after commit.
3. **A new release supersedes the old.** Releasing version 2 makes version 1's link show "Newer version available" with a button to open version 2's link. The new link is delivered too. The old link still shows version 1 unchanged, read-only, because the customer may have kept it.
4. **Acknowledgement is receipt only.** It is one row per release with a time, and nothing else. It changes no snag, variation, account or lock, and the trigger list proves that (test 5).
5. **The token pattern is copied from E2**, the same as Q52 F7M: the token stored only as a hash, a per-transaction scope row, definer open, acknowledge and close functions, one refusal code, and a coarse failure limit. The link-side acknowledge inserts into a table with **no** watchdog trigger (Q52's lesson: `guard_watchdog_input` needs a bound request actor).
6. **G4 (who can read the pack: other firm, cancelled recipient) is the next piece.** This piece still proves the basics in test 3.

## Dry-check
- Against the G2 branch head when you start. Record the sha in the PR. Check G2's `app.v2_handover_version` (PK `(tenant_id, job_id, version)`, `content`, `content_hash`, `sources`) and its repository `list()`.
- `packages/db/migrations/0749_lp6d_remaining_routines.sql` lines 18 to 24: `app.scope_progress` (`stage`, `revision`).
- Token pattern: E2 #949 `claude/project-thread-49qd38` @ cf43ea480, `packages/db/migrations/2029_v2_fact_reply.sql`:
  - request table, lines 42 to 72;
  - cancel table, lines 74 to 85;
  - scope and failure tables, lines 174 to 200;
  - `_scoped` / `_scope_token` and the `jobguard_migration` read policies, lines 204 to 246;
  - `_scope_open`, `_view`, `_open`, `_receive` and `_close`, lines 273 to 400;
  - grants, line 402;
  - audit definers, lines 409 to 456.
- TS pattern: `v2-fact-reply-repository.ts` `open()` (line 229) and `receive()` (line 245). Web pattern: `apps/web/app/reply/[token]/page.tsx` / `view.tsx`, and `apps/web/app/api/v2/replies/route.ts` (token in the body).
- Also see F7M #994 (`claude/project-thread-trp08u-f7m`) for the same pattern already adapted to V2 with no watchdog-triggered table. Reuse its shape where it fits, but copy, because #994 is on another stack.
- `packages/db/src/v2-local-catcher.ts`: `captureV2Delivery(kind, recipient)`, which logs metadata only.

## Build
1. **Migration 2058** `packages/db/migrations/2058_v2_handover_release.sql`, with its note and proof file. Use the V2 fence, plus `to_regclass('app.v2_handover_version') IS NULL` → RETURN.
   - `app.v2_handover_release`:
     - columns `tenant_id`, `job_id`, `id`, `version` (FK to `v2_handover_version`), `content_hash` (must equal the version's, checked by trigger), `recipient_email`, `token_hash char(64) UNIQUE`, `expires_at` (at most 90 days), `command_id`, `actor_membership_id`, `released_at`;
     - PK `(tenant_id, job_id, id)`, UNIQUE `(tenant_id, command_id)`;
     - a BEFORE INSERT trigger refuses release unless every included scope item's `scope_progress.stage = 'complete'` (`V2_HANDOVER_SITE_NOT_COMPLETE`).
   - `app.v2_handover_acknowledgement`: `tenant_id`, `job_id`, `release_id`, `acknowledged_at`. PK `(tenant_id, job_id, release_id)`, so one per release. No other column.
   - Both tables: RLS enabled and forced; runtime policy `lp11_policy_tenant()` plus job EXISTS; `GRANT SELECT, INSERT` to `jobguard_runtime`; immutable trigger.
   - Link definers under `v2_handover_link_*` names, copied from E2's shape:
     - `_open(h)` returns only the saved version's `content`, the version number, the firm display name, whether a newer release exists for the job (and, if so, nothing about it but "newer version available"), and whether this release is acknowledged;
     - `_acknowledge(h, commandId)` inserts the acknowledgement once; a repeat returns the stored one;
     - `_close()`;
     - an expired or unknown link is one refusal (`HANDOVER_LINK_REFUSED`).
   - Run it twice; the second run changes nothing.
2. **Bootstrap.** Add the 2058 line after G2's 2043 line (rule 30).
3. **Repository** `packages/db/src/v2-handover-release-repository.ts`.
   - Builder side:
     - `release(context, jobId, sessionId, { version: "v2-handover-release-command.v1", commandId, handoverVersion })` returns the link once and stores only the hash. The actor comes from `app.v2_work_plan_editor`, under an advisory lock `handover:<jobId>` (G2's key).
     - `list(jobId)` returns each release with its version, time, recipient, acknowledged time and "superseded".
   - Link side: `open(token)` and `acknowledge(token, input)`, the way E2 does them.
   - After commit, `captureV2Delivery("v2_handover_release", recipient)`, once per release.
   - The audit events are `v2.handover.released` and `v2.handover.acknowledged`, with references and hashes only.
4. **Routes.**
   - Builder: `apps/web/app/api/jobs/[id]/handover/releases/route.ts`, with G2's gates. Watchdog line `"/api/jobs/[id]/handover/releases": "pre_live_allowed"`.
   - Customer: page `apps/web/app/handover/[token]/page.tsx` and `view.tsx`, and the write route `apps/web/app/api/v2/handover/route.ts`, with the token in the body. Use E2's `noindex`, `no-store` and `Referrer-Policy: no-referrer` headers.
5. **Screens.**
   - Builder: on G2's Handover page, "Release this version" appears on a saved version. It's disabled with "Finish the site work first" until site completion, and says "Release is independent of the financial lock". Version history shows "released to <recipient> · acknowledged <time>" or "acknowledgement pending".
   - Customer: M3's `CustomerPack()`: the pack, the receipt-only text, "Acknowledge receipt", and "Newer version available".
   - Text comes from pure helpers tested with `renderToStaticMarkup`.
6. **Lane** `config/lanes/v2-g3.json`, with each mount on G2's files noted: the Handover screen and the repository list.

## Tests
- **Seed tests**, appended:
  1. **Done-when case.** On the practice job, all included scope items are complete and the door-stop snag is open and agreed.
     - Release version 1. One catcher delivery to the customer's practice address.
     - The customer opens the link and sees the snag under "Outstanding snags", then presses Acknowledge.
     - The builder marks the snag checked, saves version 2 and releases it. One more delivery.
     - Version 1's link now says "Newer version available" and still shows version 1 unchanged. Version 2's link shows no outstanding snag.
     - The builder's history shows v1 acknowledged and v2 pending.
  2. Release with one scope item still in progress is refused, and there's no delivery.
  3. Refusals, all `HANDOVER_LINK_REFUSED` with the same body:
     - a made-up token;
     - an expired link;
     - a link of the second firm's job, opened while a first-firm builder is signed in.
     The page holds no amount, no other job and no token.
  4. Acknowledging twice is one row. UPDATE and DELETE are refused.
  5. Acknowledgement changes nothing else. Before and after the acknowledge, the row counts and latest rows of `snag_event`, `variation_approval`, final-account lock and invoice tables are identical.
  6. **Rule 30, firm A/B read check:** the second firm's runtime sees no rows of either table.
- **Rule 29 and capability confinement:** prove with SX's `assertCapabilityConfined`, or write "pending V2-SX" if SX #965 isn't on the base.
- **Browser:** one case at 360 px. Release, open as the customer in a second context with no sign-in, acknowledge, release v2, then reload v1's link and see "Newer version available".

## Done when
- A customer opens the released version by link, sees an outstanding snag and acknowledges receipt. Later they receive a corrected version. The builder sees both releases and the acknowledgement.
- Release is refused before site completion and never depends on the financial lock.
- CI1 is green, and the Codex check is clean or answered.
