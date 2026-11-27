# Q63 · V2-G4: who can read the handover pack. The builder can stop a link, a changed customer stops the old one, and another firm sees nothing

**Tier:** RED (a no-sign-in customer capability link). **Builder:** Opus 5.5 thread. **Checker:** Codex, by an `@codex review` comment on the PR. **Base:** G3 #999 `claude/project-thread-trp08u-g3` @ a0514498a (on G2 #998). Record the head sha you start from. **Branch:** the builder thread's own branch, in `config/lanes/v2-g4.json`. **PR:** draft into G3's branch. **Migration: 2059** (the next free number; final number set at merge). **Plan check:** Astra, frm-management-layer#3. Rules 1 to 30 apply. Planner: 27 Nov 11:15 UK. Roadmap row G3 → **G4** "who can read the pack (other firm, cancelled recipient)".

## Planner reading (Astra please confirm or correct)
1. **The builder can stop a link.** A stop is one row per release, with a reason of at most 200 characters, and it can't be undone. A stopped link gets the same `HANDOVER_LINK_REFUSED` as an unknown one. To send the pack again, the builder releases again: a new release and a new link, as G3 already does.
2. **A changed customer stops the old link.** When a link is opened, its stored `recipient_email` is compared with the job's **current** customer email (the same `job_party_current` → `job_party_binding` → `customer_revision` read G3's `release()` uses). If they differ, or the job has no current customer, the link is refused. That covers a replaced customer and a removed email. The comparison is case-insensitive and trims spaces, so a cosmetic edit to the same address doesn't stop it.
3. **"Newer version available" ignores stopped releases.** A stopped release is never the "newer" one. If v2 is stopped, v1's link stops saying a newer version exists.
4. **Another firm sees nothing, by every path.** The builder routes refuse a second firm's builder (404, typed code). The link refuses a first-firm token whatever cookies are sent. The second firm's runtime sees no rows of the stop table.
5. **Acknowledgement stays receipt only**, and a stopped link can't acknowledge.

## Dry-check against G3 #999 @ a0514498a (rule 23)
- `packages/db/migrations/2058_v2_handover_release.sql`:
  - `app.v2_handover_release` (line 18), with `recipient_email` (line 24), `expires_at` and its 90-day check (lines 31 and 34);
  - `app.v2_handover_acknowledgement` (line 41);
  - control-plane scope and failure tables (lines 98 and 108);
  - `jobguard_migration` read policies (lines 137 to 146);
  - `v2_handover_link_scope_open(h)` (lines 152 to 180): it returns the release when the hash matches and it hasn't expired, else it logs a capped failure and returns NULL. **The stop and recipient checks go here**, before `RETURN r`;
  - `v2_handover_link_view(r)` (lines 185 to 195): `newerAvailable` (`(n.released_at, n.id) > (r.released_at, r.id)`) needs "and n is not stopped";
  - `_open` (line 198), `_acknowledge` (line 210), `_close` (line 232), grants (lines 237 to 239), audit definers (lines 244 to 281).
- `packages/db/src/v2-handover-release-repository.ts`: `releases()` (line 36), `release()` (line 64) with the recipient read (lines 87 to 91) and `assertV2Recipient`; `captureV2Delivery` after commit (line 116); `open()` (line 121).
- E2's cancel table, for shape: `2029_v2_fact_reply.sql` lines 74 to 85 on `claude/project-thread-49qd38` @ cf43ea480. Copy it; don't import it.
- E2's `jobguard_migration` read policies for `job_party_current`, `job_party_binding` and `customer_revision`: `2029_v2_fact_reply.sql` lines 242 to 246. 2059 adds its own copies of these policies, scoped through `v2_handover_link_scoped(t, j)`, because 2029 is on another stack.
- `tools/v2/bootstrap.mjs` lines 79 to 80: the 2058 line, the last V2 line on this base.

## Build
1. **Migration 2059** `packages/db/migrations/2059_v2_handover_release_stop.sql`, with its note and proof file. Use the V2 fence, plus `to_regclass('app.v2_handover_release') IS NULL` → RETURN.
   - `app.v2_handover_release_stop`: `tenant_id`, `job_id`, `release_id`, `command_id`, `actor_membership_id`, `reason varchar(200)`, `stopped_at`. PK `(tenant_id, job_id, release_id)`; UNIQUE `(tenant_id, command_id)`; FK to the release.
   - RLS enabled and forced; runtime policy `lp11_policy_tenant()` plus job EXISTS; `GRANT SELECT, INSERT` to `jobguard_runtime`; immutable trigger. A `jobguard_migration` read policy scoped by `v2_handover_link_scoped`.
   - The three scoped customer read policies from reading 2.
   - `CREATE OR REPLACE` of `v2_handover_link_scope_open` and `v2_handover_link_view` with the checks from readings 1 to 3. Everything else in them stays as 2058 has it. A stop or recipient refusal logs a failure like any other.
   - Run it twice; the second run changes nothing. The proof file records both function bodies' hashes before and after.
2. **Bootstrap.** Add the 2059 line after the 2058 line (rule 30: above FL-6's 2054 if that line is present).
3. **Repository.** `HandoverReleaseRepository.stop(context, jobId, sessionId, { version: "v2-handover-stop-command.v1", commandId, releaseId, reason })`:
   - the actor from `app.v2_work_plan_editor`, under G2's lock `handover:<jobId>`;
   - a replay with the same body returns the stored stop; a different body gives `HANDOVER_COMMAND_CONFLICT`; an unknown or other-job release gives `HANDOVER_RELEASE_NOT_FOUND`;
   - one audit event, `v2.handover.link_stopped`, with references only (no reason text, no email);
   - `releases()` gains `stoppedAt` and `recipientCurrent` (false when the job's customer email no longer matches).
4. **Route.** The same `/api/jobs/[id]/handover/releases` POST takes the new body. Keep G3's gates. No new watchdog line.
5. **Screen.** In G3's release history, each live link gets "Stop this link", with a reason box. History shows "link stopped <time>". When `recipientCurrent` is false, it shows "Sent to an earlier customer contact · this link no longer opens", plus "Release to the current customer". Text comes from pure helpers tested with `renderToStaticMarkup`.
6. **Lane** `config/lanes/v2-g4.json`. Note each mount on G3's files: the repository, the route, the application, `v2-handover-release.tsx`, the label helper, `bootstrap.mjs`, `seed.integration.test.mjs`, and `purchase-order-audit.integration.test.ts` (the stem and one "table absent" check).

## Tests
- **Seed tests**, appended:
  1. **Stop.** Release v1, then stop it. Its link is refused with G3's exact refusal body, and acknowledge is refused. The builder's history shows it stopped. Release again: one more catcher delivery, and the new link opens.
  2. **Changed customer.** Release v1 to the practice customer. Replace the job's customer through the ordinary customer-and-site path. v1's link is refused. A cosmetic change (upper case, a trailing space) doesn't refuse it. Release to the new customer: the new link opens, with one delivery to the new address.
  3. **Newer ignores stopped.** Release v1, release v2, stop v2. v1's link shows `newerAvailable: false`.
  4. **Other firm.** A second-firm builder gets 404 on GET and POST (release and stop) of the first firm's job. A first-firm token sent with second-firm cookies gets the refusal body. **Rule 30 firm A/B read check:** the second firm's runtime sees no `v2_handover_release_stop` rows.
  5. Replay and conflict for stop. UPDATE and DELETE are refused.
  6. A 2059 rerun changes nothing. G3's own seed tests still pass unchanged.
- **Rule 29:** if SX #965 is on the base, prove the new POST body with `assertCapabilityConfined` and the three refusals. Otherwise write "Rule 29: pending V2-SX".
- **Unit:** the zod command, the labels, the failure mapping.
- **Browser:** extend G3's `tools/v2/handover-release.browser.test.mjs` by one 360 px case: stop the link, reload the customer page, and see the refusal page.

## Known limits (to write in the PR)
- A link someone has already opened and saved as a page stays on their device. Stopping it only stops future opens.
- Hidden findings in the pack (G5) are the next piece.

## Done when
- The builder can stop a handover link, a link sent to a customer who has since been replaced no longer opens, and another firm can't read the pack by any path.
- CI1 is green, and the Codex check is clean or answered.
