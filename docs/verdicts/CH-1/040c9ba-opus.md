VERDICT: PASS — bound to head 040c9bae70c003739b55941321defacbb3b440c2

Reviewer: fresh Claude Opus review agent spawned by the JobGuard integrator (Claude week, 9 Oct 2026); did not build, repair or order any commit in this PR.

**In short:** New practice jobs now go live under the v3 pricing rules. Each records one locked "activation terms" row and creates no £79 charge, no cap and no fee entries, and a repeated or simultaneous click adds nothing. The old (v1) pricing now appears only on the saved old-pricing sample job, behind the "Earlier proposed pricing (v1)" label. Every older test that was moved onto that sample changed only its import line, and the complete-journey test changed only its two navigation lines, exactly as Ben's rulings allow. CI on this exact head passed (288 browser tests, all PostgreSQL suites, lint, lanes and OpenAPI), and I found nothing that blocks the merge. I list three small follow-ups below; none of them belongs in this lane.

## Scope

`git diff origin/main...040c9ba` (merge base c283d4e), 71 files. I read: migration `0109_job_activation_terms.sql` in full, `activation-repository.ts`, `demo-seed.ts`, `activation-v3.ts` with its tests, the API contracts and the fee-illustration change, all four UI files (word-level diffs), `CH-1.spec.ts`, the new helper `v1-sample-job.ts`, every existing spec the PR changed (checked byte for byte), the lane line, the ledger line, and the round-4 and main-merge receipts. For context I also checked `commands.ts` (dispatcher and request hash), 0012/0053/0094/0095/0097 and the 0102/0103/0106/0107 migrations. I ran the lane lint locally with a simulated pull-request event. I ran no local DB or browser suite, because CI evidence on this exact head was available.

## Findings

No P1. No P2.

- **P3-1 (follow-up, outside the lane): the home "See the fee example" shortcut can lead to an empty panel.** `apps/web/app/ui/jobguard-app.tsx:49` mounts `FeeStatement jobId={jobs[0]?.id}` from the tool card at `:55`. `fee-statement.tsx:5` now returns `null` unless that job has a v1 activation. When the first listed job is a v3 job or has no activation, the button shows nothing. This matches Ben's ruling ("the real home shortcut stays unchanged") and DW3, but the shortcut is now a dead end. Suggest a CH-6 or owner card to hide it, relabel it, or point it at the saved v1 sample.
- **P3-2 (hand-off note, not a CH-1 defect): new v3 jobs cannot complete a synthetic recovery landing yet.** `packages/db/migrations/0097_recovery_case_current.sql:63-64` (`app.approve_synthetic_landing`) reads the v1 `cap_snapshot` and raises `0A000` "production and pilot fee posting disabled" when it is missing. It fails closed and writes no v1 fee rows, which is consistent with §10's "No new job writes to them". The integrator should still record that the eligible-landing step is unavailable for new jobs until the v3 recovery and fee leaves (CH-7/CH-8, MON-*) land.
- **P3-3 (copy): an internal identifier is shown to users.** `apps/web/app/ui/quote-editor.tsx:67` renders the raw string `reference_fee_policy_v3` (`data-testid="activation-policy"`) as visible text on a live v3 job. It is not forbidden copy, but it is jargon on a builder screen. Fine to leave for CH-6 copy work. Note that `CH-1.spec.ts:8` asserts this text.

## Answers

**1. Migration 0109.**
- **Terms table.** `app.job_activation_terms` (`0109:17-49`) is tenant-owned with a composite primary key. It is unique per job and per activation. It has tenant/job-qualified foreign keys to activation, quote version, the exact document version/hash (backed by the new `quote_document_job_identity` unique key, `:16`) and the SH-1 track (`:29-32`). It is owned by `jobguard_migration`, with ENABLE + FORCE RLS and a tenant policy (`:34-39`). Runtime has SELECT/INSERT only, and UPDATE/DELETE/TRUNCATE are revoked (`:40-41`). A BEFORE INSERT guard lets only `jobguard_migration` insert (`:42-48`), so the runtime role's INSERT grant is usable only through the routine. Updates and deletes are blocked by `reject_immutable_commercial_mutation` (`:49`). CHECKs pin the policy, the track, `none_recorded_pre_mon2a` and the small-job rule against the stored values (`:23-26`). CI's catalog test (`job-activation-terms.integration.test.ts:95-104`) confirms the RLS, owner, grants, SECURITY DEFINER and `proconfig`.
- **The v3 routine.** `switch_job_live_v3` (`:51-90`) is SECURITY DEFINER with `search_path=pg_catalog,app`. Runtime has only USAGE on `app`, so it cannot shadow objects. The routine checks, in order:
  - the tenant context matches the requested tenant (`:55`);
  - the job exists, then locks it `FOR UPDATE` (`:56-57`);
  - the actor is an active owner (`:58`);
  - the exact approved action matches: a processing `job.switch_live` command receipt for this command and actor, an authorization with matching hash, version, null amount/currency/recipient, `synthetic_demo_activation.v3`, unexpired and unrevoked, an approved resolution, and a decision on this job (`:59-65`);
  - the job has parties, per CH-3a (`:66`);
  - an existing terms row is replayed only when it matches, otherwise it raises a 40001 conflict (`:67-71`);
  - the job is accepted, at the expected revision and on the expected document (`:72`);
  - the document, the quote, the snapshot net, the acceptance and the issuable revision all match (`:73-77`).

  It then computes the highest sent net from `quote_send` (`:78-79`) and inserts the activation and the terms row. The SH-1 and CH-3a triggers still fire on the activation insert. It updates the job with a null cap (`:80-85`) and writes no `cap_snapshot`, obligation or journal rows. Execute is granted to runtime only (`:88-90`).
- **Saved v1 sample.**
  - **Immutable marker.** The marker cannot be changed after insert. Only `jobguard_migration` can set it, only for the synthetic tenant, and only with a session digest and the `v1_sample` scenario (`:96-104`).
  - **Created per session.** The seed trigger runs on `control_plane.practice_session` insert. That insert happens only inside the SECURITY DEFINER `app.issue_practice_session` (0094:45-62), so `current_user` is `jobguard_migration` there. No TS code inserts sessions directly. The trigger creates a draft job owned by the issuing session's digest, plus capture source, proposal and lines, and no financial rows (`:105-127`).
  - **Not selectable by new captures.** Captures always insert `practice_scenario='capture'` with the marker false (`capture-repository.ts:32`). The application routes only `savedV1Sample` jobs or already-v1 jobs to the legacy path (`activation-repository.ts:67`).
  - **Tested.** The owning session can open the sample, another session gets NOT_FOUND, it has zero financial rows, and runtime cannot flip the marker (`job-activation-terms.integration.test.ts:26-34`).
- **Expand-compatible.** `job_baseline_shape` is a strict superset of 0020's version for every existing row; only a new v3 row may have a null cap. `job_activation_check` (originally the table CHECK in 0012:12) and `job_practice_scenario_check` (0094) only gain values. The new column has a constant default (no table rewrite), and the new unique key is a superset of an existing key. The upgrade test (`:105-121`) applies 0109 over a database with a v1 activation, re-runs the migrations, and finds the v1 activation and cap rows byte-equal and zero terms rows.
- **No shared objects.** 0109 shares nothing with 0102, 0103 or 0107 (grep for every 0109 object name). 0106 mentions `control_plane.practice_session` only in a comment (`0106:8`), and 0109 adds its own trigger without touching any 0106 object.
- **Pure rename.** The 0104 → 0109 renumber is a 100% rename (`ab62523`), and nothing has edited the SQL since (`git log --follow`).
- **Minor, not a finding.** The v3 routine does not itself refuse the saved sample, and the v1 routine is not blocked at the database level for new jobs. Routing happens in the application (`activation-repository.ts:67`), which matches "v1 routines stay".

**2. v3 behaviour.**
- **No £79, cap or plan credit for new jobs.** Every "£79", "cap" and "Recovery cap" string in the four UI files is now behind `legacyPricing` (quote editor scenario select, v1 activation block and RecoveryGuard, `quote-editor.tsx:67`; `job-variations.tsx:50`; `commercial-integrity.tsx`; `fee-statement.tsx:5`). No other `apps/web/app` `.tsx` file contains the forbidden copy. Generated PDFs are uncompressed ASCII, so the byte scans in `CH-1.spec.ts:27-34` and in the DB test (`:122-127`) are real checks.
- **Small-job rule.** £1,000 is small; £18,800 and £30,000 are not (DB test `:35-42`). A higher sent net overrides the accepted net (`:43-47`). The boundaries £1,999.99 and £2,000.00 are covered in `activation-v3.test.ts`.
- **Plan context.** `none_recorded_pre_mon2a` is enforced as a DB CHECK and a zod literal; null and empty values are rejected (`activation-v3.ts`; core test).
- **v1 jobs.** Legacy pricing stays visible, only inside "Earlier proposed pricing (v1)" (`CH-1.spec.ts:21-25`).
- **Fee illustrations.** `fee-illustration.application.ts:3` refuses read (NOT_FOUND) and create (`V1_ACTIVATION_REQUIRED`) unless the activation is v1. The legacy start path is byte-identical to main's old `start` (I compared it mechanically).
- **No fee charged or derived.** The v3 routine writes no obligation or journal, and the B3 seed checkpoint amount is now null (`demo-seed.ts:64`). Existing demos replay safely by semantic key (`demo-bootstrap.ts:83-90`).

**3. Production fixes (attempt 3).**
- **`activation-repository.ts`: correct and race-safe.**
  - `lock()` is now a plain existence check (`:41-42`). The routine still takes the row lock (`0109:56`), and the dispatcher re-checks active owner membership before `lock()`, including on replay (`commands.ts:61-65`; test `:90-94`).
  - Concurrent first activations share the semantic key `practice-start-v3:${job}:${scenario}`. The request hash excludes `commandId` (`commands.ts:44-47`). So the loser either waits on the unique semantic key and then replays the winner's stored result, or its accepted-status read sees 'live' and returns the winner's view (`activation-repository.ts:70-73`). Inside the routine, a late caller sees the matching terms row and returns it.
  - The same command id with a different payload (scenario) still gives `COMMAND_CONFLICT` (test `:48-54`).
- **`quote-editor.tsx`: correct.** The start notice says "activation terms" for v3 and keeps the old "cap snapshot" text for v1 (`:67`).

**4. Changes to existing tests.**
- **Import lines only.** With the import path swapped back, UIWIRE-5, UIWIRE-8, UIWIRE-13, UIWIRE-14, UIWIRE-15, VALUE-1, M1-16-S, fee-statement and switch-live are byte-identical to origin/main (sha1 equal). MON-7 differs only on line 2, which moves `openReview` to the sample helper; `openQuote` stays on a fresh job, so `:65` stays at `:65`.
- **m1-15.** One import is added, and the two navigation lines (`goto("/")` and "See the fee example") are replaced by `openSampleFeeExample(page)`. Every assertion and `test.setTimeout(60_000)` is unchanged. The helper now runs a whole sample journey inside that 60 s budget, and CI passed with no retries.
- **Other helpers.** `helpers/capture-journey.ts` is byte-identical to main.
- **The new helper drives the real UI.** `v1-sample-job.ts` uses one real `page.request.get('/api/jobs')` to find the sample's id, then the real page, buttons and commands. It does no `page.route` interception.
- **No loosened checks anywhere in the diff.** I found no `skip`, `only`, `fixme` or `todo`, no new or longer timeout (the two 240 s hits are unchanged lines in UIWIRE-15 and VALUE-1), and no assertion added, removed or loosened in an existing spec.

**5. Tenant stamping and the watchdog registry.** CH-1 production code builds no tenant context by hand. Every repository and seed function takes a `VerifiedTenantContext`, and the tests use `testTenantContext` (TENANT-STAMP-1). CH-1 adds no route. It reuses `GET/POST /api/jobs/:id/quotes/activation` and the existing `job.switch_live` command, so there is nothing new to classify. `watchdog-registry.test.ts` passed in CI (api 729/729).

**6. Lane and founder-reserved areas.**
- **Lane lint.** With a simulated `pull_request` event (head 040c9ba, base c283d4e) the lint printed "Lane boundary passed", lane `ch-1`, with all 71 files allowed. CI's lint step printed the same.
- **Lane line.** There is one new `ch-1` line in name order, and no other lane line changed.
- **Ledger line.** The ledger amendment (`BUILD_PLAN.md`, §12.2 tail) is accurate: the renumber is a pure rename, 0107 belongs to M4-5-S #106, and 0108 to M0-6L #104.
- **Reserved areas untouched.** The diff has no `docs/decisions`, `packages/config`, `.github`, `tools/`, package or lockfile changes. There are no live providers or real data, and no production mode: the v3 routine hard-codes `synthetic_demo`, and the fixtures refuse anything but `JOBGUARD_ENV=synthetic_demo` (`demo-seed.ts:80`). There is no fee issuance or collection, no deployment or release, and no weakened CI.
- **Gates still pending.** D01 v3, D09 and G4-S remain pending (`BUILDER_RECEIPT.md:88`), and nothing in the diff activates them.

**7. CI.** Run 37947353704 (pull_request, head 040c9bae70c003739b55941321defacbb3b440c2) finished with **success**. The `checks` job took 17m25s (14:51:51 to 15:09:16), inside the 30-minute limit. Results:
- lane passed;
- core 1706/1706, api 729/729 plus `openapi:check`, web 448/448;
- PostgreSQL 62 files, 752/752, including `job-activation-terms.integration.test.ts` 11/11;
- production-build browser suite at mobile and desktop sizes: **288 passed**, 0 failed, 0 flaky or retried.

`secrets` and `dependency-review` also succeeded. None of the known main flakes appeared. The earlier failed run, 37934019683, was on old head 24bc0ed and is superseded: its M1-16-S and MON-7:65 failures were fixed in a1cc5ae, and its `M4-1-S` mobile focus race is the known flake.

---
_Generated by [Claude Code](https://claude.ai/code)_

