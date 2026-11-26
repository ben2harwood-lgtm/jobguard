# Q56 · V2-G2: handover pack. The builder chooses what goes in, previews it, and saves numbered versions

**Tier:** RED (a customer-facing document is assembled from job records; amounts must stay out). **Builder:** Opus 5.5 thread. **Checker:** Codex, by an `@codex review` comment on the PR. **Base:** G1 #996 `claude/project-thread-trp08u-g1` @ ee3160029 (on SYNC-1 #980). **Screen:** the M3 #956 "Handover" mock (`apps/web/app/(designed)/v2-mock-pages-3/pages-mock.tsx`, `Handover()` and `Pack()`; content in `fixture.ts` `packSections` and `packContent`); use its branch files if #956 isn't merged. **Branch:** the builder thread's own branch, in `config/lanes/v2-g2.json`. **PR:** draft into `claude/project-thread-trp08u-g1`. **Migration: 2043** (reserved for G2/G3; G3's release records take **2058**, the next free number after FL-FX's 2057). **Plan check:** Astra, frm-management-layer#3. Rules 1 to 30 apply. Planner: 26 Nov 18:25 UK.

## What it is (rev 1.3 lines 168 to 169)
"Built by positively choosing what goes in: approved scope, variations, customer-visible photos, manuals and certificates, snag status and contacts. Descriptions and version references only; amounts stay on the invoice route." "A saved list for each version with recipient, source versions and acknowledgement." This piece is the builder side: choose, preview and save a version. **Release, the customer's link and acknowledgement are G3 (Q57)**, stacked on this.

## Planner reading (Astra please confirm or correct)
1. **A version is a frozen snapshot.** Each saved version stores the exact text and references the customer will see, plus the **source versions** it was built from: accepted quote revision id, each approved variation revision id, each snag id with its main revision and last event sequence, each photo's evidence id and sha256, and the firm profile values used. A later change to the job never alters a saved version. A new version is needed instead.
2. **Positive choice per section and per item.** The six sections are M3's: What was done, Changes, Photos, Manuals and certificates, Outstanding snags, Contacts. A section is in only if ticked. Inside it, the builder ticks items: quote lines, approved variations, photos and snags. Nothing is in by default except the Contacts line, and even that can be unticked.
3. **No amounts, by two rules.** (a) The composer never reads a money column (no `unit_rate_pence`, `signed_delta_pence`, totals). (b) Every text line passes K3's no-amounts rule. The rule is copied as a shared helper here because K3 isn't on this base. A line that fails is refused with its reason, and the builder edits it.
4. **Manuals and certificates are typed lines.** G0 #958 (certificates checklist) is device-only and not on this base. The builder types each line and marks it "Included" or "Still needed: supplied separately". Nothing is uploaded in this piece.
5. **Outstanding snags come from G1.** Open and fixed snags, with the owner name and due date, and the G1 "agreed to leave open" note if there is one. Checked snags are not listed as outstanding.

## Dry-check against `claude/project-thread-trp08u-g1` @ ee3160029 (rule 23)
- G1: `packages/db/src/v2-snag-register-repository.ts`, which has `SnagRegisterEntry` (`owner`, `people`, `agreed`) and the repository at line 54; main's `packages/core/src/snag.ts` `buildSnagListV1` (state, due date); `apps/api/src/workspace/snag-register.application.ts`.
- `packages/db/migrations/0009_quote_pricing.sql` line 5: `quote_line` (`description`, `included`, `scope_item_id`, `quote_revision_id`); the accepted revision comes through `quote_acceptance` as `v2-crew-brief-repository.ts` `planTasks()` reads it (F1 stack) or `v2-work-plan-repository.ts` (on this base).
- `packages/db/migrations/0014_variations.sql`: `variation` (`state = 'approved'`, `description`) and `variation_revision` (`description`). Only approved revisions are offered.
- Photos: `app.evidence_object` and `app.evidence_invalidation`, read exactly as F6's `availablePhotos()` does (`v2-customer-extra-link-repository.ts` lines 132 to 139, on F6 #923). Copy the query; don't import from F6.
- `packages/db/src/firm-profile-repository.ts` lines 11 to 25 and 47 to 50: `trading_name`, `contact_email`, `contact_phone`.
- `tools/v2/bootstrap.mjs`: the last V2 line is G1's 2042 (line 76).

## Build
1. **Migration 2043** `packages/db/migrations/2043_v2_handover_version.sql`, with its note and proof file. Use the V2 fence as 2042 has it.
   - `app.v2_handover_version`: `tenant_id`, `job_id`, `version integer` (1, 2, …), `command_id`, `content jsonb` (the sections and lines exactly as shown), `sources jsonb` (reading 1), `content_hash char(64)` (sha256 of the canonical content), `actor_membership_id`, `recorded_at`. PK `(tenant_id, job_id, version)`; UNIQUE `(tenant_id, command_id)`; CHECK `version >= 1`.
   - RLS enabled and forced. Runtime policy is `lp11_policy_tenant()` plus a job EXISTS check. `REVOKE ALL … FROM PUBLIC`; `GRANT SELECT, INSERT` to `jobguard_runtime`; `app.reject_immutable_authorization_record()` BEFORE UPDATE OR DELETE. No SECURITY DEFINER function.
   - Run it twice; the second run changes nothing.
2. **Bootstrap.** Add the 2043 line after 2042. Rule 30: if FL-6's 2054 line is on the base, it goes above it.
3. **Pure composer** `packages/core/src/v2-handover-pack.ts`, with unit tests.
   - `composeHandoverPack(input, choice)` returns `{ content, refused[] }`.
   - `input` holds descriptions and references only. Its type has **no** money field, and a unit test asserts the keys.
   - `choice` lists the ticked sections and item ids, plus typed certificate lines.
   - The text follows M3's `packContent`, for example "Agreed change · <variation description>" and "<snag title> · <owner> · due <date>. <agreed note>".
   - `noAmounts(line)` is K3's rule copied: no currency signs, no `GBP`/`USD`/`EUR`, no `\d+[.,]\d{2}`, no "pence" or "pounds". The test copies K3's own cases.
4. **Repository** `packages/db/src/v2-handover-repository.ts`.
   - `sources(context, jobId)`: everything the builder can choose from. That is the accepted quote lines (included only), approved variations, verified photos, open and fixed snags with their G1 entries, and the firm profile contact. Each item carries its id and version.
   - `preview(context, jobId, choice)`: runs the composer and writes nothing.
   - `save(context, jobId, sessionId, { version: "v2-handover-save-command.v1", commandId, expectedVersion, choice })`:
     - The actor comes from `app.v2_work_plan_editor` and takes an advisory lock `handover:<jobId>`.
     - It refuses if `expectedVersion` isn't the latest (`HANDOVER_VERSION_CONFLICT`), if the composer refuses any line (`HANDOVER_LINE_REFUSED` with the reasons), or if no section is ticked.
     - It re-reads every chosen source under the lock and refuses if any is no longer offered (`HANDOVER_SOURCE_CHANGED`), for example a variation rejected or a photo invalidated.
     - A replay with the same body returns the stored version. A different body is `HANDOVER_COMMAND_CONFLICT`.
     - It writes one audit event, `v2.handover.version_saved`, with the version, content hash and source references only.
   - `list(context, jobId)`: every saved version, with its time and content hash.
   - Export it from `packages/db/src/index.ts`.
5. **Application and route.** Add `HandoverApplication` with the same mode and access checks as G1's application. The route is `apps/web/app/api/jobs/[id]/handover/route.ts` (GET sources and versions; POST preview or save). Add the watchdog line `"/api/jobs/[id]/handover": "pre_live_allowed"`, because it reads records and is not site work.
6. **Screen** `apps/web/app/(designed)/jobs/[id]/handover/page.tsx` under Job › Records, following M3's `Handover()`.
   - "Prepare handover · version N", with section and item ticks, typed certificate lines with Included or Still needed, and "Preview as the customer sees it".
   - "Save this version" replaces the mock's Release, which comes in G3.
   - Version history lists saved versions, each kept unchanged.
   - The mock's text stays: "Choose what goes in. No amounts go in the customer's pack. Missing certificates are listed as missing."
   - Empty and Problem views follow the mock. Text comes from pure helpers tested with `renderToStaticMarkup` (no jsdom).
7. **Lane** `config/lanes/v2-g2.json`. Note each mount: `index.ts` exports, `bootstrap.mjs` (one line), `seed.integration.test.mjs` (tests appended), `purchase-order-audit.integration.test.ts` (the stem and one "table absent" check), `watchdog.ts` (one line, owned by main), and the Records nav link (one line, owned by G1).

## Tests
- **Seed tests**, appended:
  1. **Done-when case.** On the practice job, with the splashback extension approved and the door-stop snag open and agreed, the builder ticks every section, three quote lines, the variation, one photo and the snag, and types two certificate lines (one Still needed).
     - Save makes version 1.
     - Its content shows "Agreed change · …", the snag with owner, due date and agreed note, the photo reference, and "Still needed: …".
     - A search of the stored JSON finds no pence value, no `£`, and none of the variation's or quote's amounts as digits.
  2. A new version: marking the snag checked, then saving version 2, drops the snag from Outstanding. Version 1 reads back byte-identical (content hash unchanged).
  3. Refusals: a typed line "Spare tiles worth £40" is refused with `amount`. A stale `expectedVersion` gets a conflict. A variation rejected between preview and save gets `HANDOVER_SOURCE_CHANGED`. A photo from another job isn't offered and is refused if named.
  4. Replay and conflict. UPDATE and DELETE are refused.
  5. **Rule 30, firm A/B read check:** the second firm's runtime sees no `v2_handover_version` rows for the first firm's job.
- **Rule 29:** the route is under `/api/jobs`. Still prove GET refuses no session, an invalid session and the second firm. If SX #965 isn't on the base, write "Rule 29: pending V2-SX".
- **Browser:** one case at 360 px. Tick, preview, save, then reload and see version 1 in the history.
- **Unit tests:** the composer, `noAmounts`, the zod command, the labels, and the route's failure mapping. Migration proof `2043_v2_handover_version.proof.json`.

## Known limits (to write in the PR)
- Certificates are typed lines, not files. Attaching the real documents comes after G0 and K6B.
- Nothing reaches the customer in this piece. G3 releases a saved version.

## Done when
- On the practice job, the builder chooses what goes in, previews the customer's view, and saves version 1. A later change needs version 2, and version 1 stays unchanged.
- No amount can be saved into a pack.
- CI1 is green, and the Codex check is clean or answered.
