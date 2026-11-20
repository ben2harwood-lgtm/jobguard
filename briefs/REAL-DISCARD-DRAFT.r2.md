Changed in r2: section A now also replaces app.lp5_command_result with one 'discard' branch; allowlist adds lp5-command-catalog.ts, lp6d-runtime-classification.json and (after #857) the LP-12 owner list; later note on 'lost' reuse added.

# REAL-DISCARD-DRAFT — build brief (JobGuard, NOPR, RED; written 20 Nov 2026 08:3x by Opus 5.5 helper)

Base: JobGuard origin/main 228aa98740f64d201b90a61574581b686b73fa2e (checked 08:29). Line numbers are at that commit.
Dispatch AFTER open #857 (LP-12 narrow owners) merges: it takes migration 0768 and changes which role owns checked routines.
Source: coordinator/burn-2026-11-20/jg-walk-fixes.md:79; REAL-BUILDER-WALK-3-2026-11-11.md:173-176 (new stop 1).

PROBLEM
1. Every press of "Make my draft" saves a job, and a mistaken one sits on Today and Jobs as "being drafted" for good: nothing in
   apps/web/app offers discard, and a draft job has no way out except quoting (packages/core/src/job.ts:14; DB 0765:1789-1797).
2. The only end state is "lost", reached only from quoting after a declined quote (job.ts:15, jobs-screens.tsx:131).

SMALLEST CHANGE (the discard is a saved state plus its command receipt; no row is ever deleted)
A. New migration packages/db/migrations/<next free number>_discard_draft_job.sql (0769 if #857 took 0768):
   - register ('job.discard_draft','command.v1','owner','route_before_begin','discard','commercial',NULL) in app.command_type_registry,
     as 0729_duplicate_disposition_command_lifecycle.sql:4 does;
   - one SECURITY DEFINER routine app.discard_draft_job(p_tenant,p_job,p_expected,p_actor,p_command,p_authorization), copying the
     authority checks of app.start_quote_from_review (0521_lp5a_commands.sql:536-556: current tenant, live owner membership, processing
     receipt of this command type with semantic_key 'job:<id>:discard', approved unexpired authorization for action 'discard_draft'),
     then refuse unless the job is status 'draft', provenance 'system_generated_quote', revision = p_expected and has no contractor track
     (same test as 0521 start_quote_from_review job check), then UPDATE app.job SET status='lost', revision=revision+1.
   - CREATE OR REPLACE app.lp5_command_result(uuid,jsonb), copied byte for byte from the latest definition on the main you branch
     from (at 228aa98 that is 0729_duplicate_disposition_command_lifecycle.sql:64-485; use a later one if #857 or anything else redefines
     it), with exactly one added CASE branch. Without it every discard fails at completion: the routine is `CASE adapter ... END CASE`
     with no ELSE (0729:478-484), so an unknown adapter raises CASE_NOT_FOUND, and complete_command (0724:375) calls it on every command.
     The added branch:
       WHEN 'discard' THEN SELECT jsonb_build_object('jobId',j.id,'revision',j.revision,'status',j.status) INTO value FROM app.job j
        WHERE j.tenant_id=t AND j.id=subject::uuid AND j.status='lost' AND j.revision=expected_revision+1
         AND j.xmin::text=pg_current_xact_id()::text AND r.command_type='job.discard_draft' AND r.semantic_key='job:'||j.id::text||':discard';
     Keep its existing owner and grants exactly as on the base (0521:490 owner jobguard_command_writer, 0521:493 revokes, unless #857
     changed them). Every existing branch stays unchanged; the existing command suites in pnpm test:db prove they still behave.
   - Nothing else.
   - owner, REVOKE and the single runtime GRANT exactly as LP-12 (#857) sets them for checked routines on the main you branch from.
B. packages/db/src/review-repository.ts: a DiscardDraftJob mutation beside ConfirmProposalReview (:61-82) that calls the routine.
   packages/db/src/job-parties-repository.ts:45-47 list(): also exclude jobs with a succeeded 'job.discard_draft' receipt
   (app.command_receipt, semantic_key 'job:'||j.id||':discard'), the same way it already excludes sandbox_run jobs. One fact, one place;
   Today and the Jobs list both read /api/jobs, so both drop it.
C. packages/core/src/job.ts: add reason "draft_discarded" and draft -> lost. apps/api/src/capture/contracts.ts: discardDraftCommandV1
   {contractVersion "draft_discard_v1", commandId, expectedRevision}. apps/api/src/capture/capture.application.ts: discard(jobId,raw),
   built like confirm() at :16 (this.access.job ownership check first; commandType job.discard_draft; actionType discard_draft;
   amountPence null; contentHash sha256 of "job:<id>:discard:<revision>").
D. NEW apps/web/app/api/jobs/[id]/discard/route.ts, a copy of ../confirm/route.ts (409 on conflict, 400 refusal, 503 database).
E. apps/web/app/(designed)/jobs-screens.tsx Overview (:157 card): when job.status==="draft" only, a second button "Discard this draft",
   then "Yes, discard it" / "Keep it"; on success go to /jobs. Words: "Discarding hides this draft. Nothing was sent to a customer."
F. packages/core/src/watchdog.ts: classify "/api/jobs/[id]/discard" and "command:job.discard_draft" as "pre_live_allowed" (as :140, :224).

FILES ALLOWED TO CHANGE
The files named in A-F; their migration note packages/db/migration-notes/<n>_discard_draft_job.md and proof
packages/db/test/migration-proofs/<n>_discard_draft_job.proof.json (as 0767 has);
packages/db/test/lp5-command-catalog.ts (only: add one `discardDraftRegistryRow` matching the new registry row and append it to
`currentCommandRegistryRows` at :618; 14 test files compare that list with the live registry, e.g. customer-signin.integration.test.ts:67);
packages/db/test/lp6d-runtime-classification.json (only: add one entry for "app.discard_draft_job(uuid,uuid,integer,uuid,uuid,uuid)",
classified like "app.start_quote_from_review(...)" at :272, value "LP-6c"; lp6d-routines.integration.test.ts:177-189 fails for any
runtime-executable SECURITY DEFINER routine not listed there); after #857 merges, also whichever of
packages/db/test/lp12-narrow-owners.ts / its integration test (lp12-narrow-owners.integration.test.ts:502) lists routines by owner,
if the new routine shows up there (add its one entry only; name the file in the handoff); packages/core/src/job.test.ts (add the new legal case,
keep every listed case); apps/web/app/(designed)/real-designed-screens.test.tsx (add cases only); NEW
packages/db/test/discard-draft-job.integration.test.ts; NEW apps/web/e2e/real-discard-draft.spec.ts; NEW config/lanes/real-discard-draft.json
(exact changed paths, not itself). Nothing else. If another existing assertion breaks, stop and report it; do not edit it.

FAILING-FIRST TESTS (write and run red on the base before A-F; record the red run)
1. packages/db/test/discard-draft-job.integration.test.ts, real PostgreSQL: a practice owner discards own draft -> status lost, revision+1,
   row still present, absent from JobPartiesRepository.list(); refused (job unchanged): quoting job, live/invoiced job, stale revision,
   another tenant's job, another practice session's job, non-owner actor, replay with a changed payload. Same command replayed = one result.
2. apps/web/e2e/real-discard-draft.spec.ts at 390x844 and 1280x900 (copy the start of real-customer-link-own-quote.spec.ts:7-15):
   make a draft, open /jobs/<id>/overview, "Discard this draft", "Yes, discard it"; it is gone from /jobs and /today; a quoting job
   shows no discard button; a POST to /discard for that quoting job is refused and it stays listed.

DONE LOOKS LIKE
- [ ] Both new tests red on the base, green after the change, on real PostgreSQL, at both widths.
- [ ] A draft made by mistake can be discarded in two taps and leaves Today and Jobs; its row, scope and receipt are kept.
- [ ] Nothing past draft (quote, acceptance, invoice, money) can be discarded, by button or by direct POST.
- [ ] Discarded draft cannot be confirmed afterwards (confirm route refuses: job no longer draft).
- [ ] capture.spec.ts, CH-3a.spec.ts, real-customer-link-own-quote.spec.ts, real-journey-next-state.spec.ts still pass.
- [ ] job.test.ts, real-designed-screens.test.tsx, watchdog tests, tsc, pnpm lint:lanes and git diff --check clean.

OUT OF SCOPE
Undo/restore of a discarded draft; bulk discard; discarding quoting jobs with an unsent quote; changing the "lost" wording or the
plain practice-firm screens; a new job status value; any edit to transition_job or start_quote_from_review; deleting anything.

CHECK: RED (database migration, SECURITY DEFINER routine, job life cycle, tenant and practice-session boundary).
One independent check that must RUN on real PostgreSQL, headless, 2 workers max, PLAYWRIGHT_SKIP_BROWSER_GC=1: pnpm test:migrations,
the new integration test, pnpm test:db, the new spec in both widths, then the four specs above; integrity guard as usual.
Source-only migration review or "e2e not run" is a HOLD. Confirm the red runs were recorded and nothing outside the allowlist changed.

NO-DUPLICATE NOTE
Checked: cc-work list (no discard line; only AAC/other "draft" lines), AGENT_CHOICES.md (no discard entry), astra-replies (no discard
reply), burn-2026-11-20 notes (only jg-walk-fixes.md:37 and :79), remote branches (only m4-*-draft-store and tommy-draft-retry-fix, unrelated),
open PRs #847-#857, #708, #489 and older: none adds discard. Overlap: #847 edits capture/route.ts and jobguard-app.tsx (not touched here);
#857 owns 0768 and routine ownership, hence "after #857". Finish list: walk 3 new stop 1, low priority.
Not verified: that runtime may read app.command_receipt inside list() (acceptance-repository.ts:47 reads it under withTenant, so likely);
if it cannot, stop and report: do not add grants or policies.

HANDOFF LINE
fix(jobs): a draft made by mistake can be discarded and leaves the jobs list — READY / tested: <commands+results> / not run: <omitted>
/ RED: one independent exact-head check on real PostgreSQL and browser runs before merge.

LATER NOTE (not for this build)
A discarded draft reuses "lost". The database still allows lost -> quoting (reopen_quote in 0765 transition_job), but runtime cannot
call transition_job and no app code calls reopen, so nobody can reach it today. Opening a discarded draft by its link shows
"This job did not go ahead" (jobs-screens.tsx:131).

(r2 repaired 20 Nov 2026 by Opus 5.5 helper from the plan check in REAL-DISCARD-DRAFT.md; lines re-read at 228aa98.)


# Keep it simple: rule for every Codex build order

Revision: rev 2, 25 Oct 2026 (Ben's card simplicity-check-before-launch; original rules from Keep It Simple plan rev 3, section 2; Ben-approved coding-run audit additions 7–11).
Build dispatchers append this whole file to every Codex build prompt, so an edit here reaches every later build.

**KEEP IT SIMPLE — builder rule.** Build the smallest clear, maintainable solution that fulfils the approved
task and preserves all required behaviour and controls.

1. Reuse suitable existing code before introducing new abstractions.
2. Do not introduce speculative frameworks, versions, configuration switches or layers. Preserve anything
   required by approved contracts, including compatibility and recovery.
3. Prefer one authoritative source for a fact, except where separate sources or independent verification are
   deliberately required.
4. Keep functions and files understandable. Treat 80-line functions, 800-line files and 1,500-line files as
   prompts to investigate, not automatic failures. Data-heavy files are exempt from size-based criticism.
5. Never simplify away child safety, privacy, identity, financial controls, access restrictions, audit evidence,
   data protection or independent acceptance.
6. Never refactor unrelated code during a repair or catch-up. Never change checks, protected fingerprints, stored
   formats or approved interfaces without the required separate authorisation.

7. After reading required instructions, inspect the affected source, callers and tests. Search explicit paths first; exclude generated evidence, logs and dependency trees unless they answer a specific question. If output is truncated, narrow the query. Once the behaviour and affected path are clear, implement.
8. Use an explicit working directory and the repository's existing interpreter, dependency tool and test runner. Establish these from available configuration once; do not guess paths or rediscover them between commands. Before a long or permission-gated run of a new helper, perform its cheap syntax/import check where available.
9. Reuse existing parsers, validators and test helpers before writing alternatives. Keep repair diffs focused; avoid whole-file formatting and unrelated cleanup unless required by the repository. Preserve necessary compatibility, isolation and evidence binding.
10. Test the changed behaviour and the existing rules that depend on it, not just input syntax. When extending a state or format, inspect its consumers and cover affected open/closed, permission or failure boundaries. Confirm that new regression tests run through the actual repository test runner before handing them off.
11. Complete required checks and advance to the required review or handoff. Repeat or broaden checks only when a change, failure, specific unresolved risk or explicit gate requires it. Keep evidence in the existing receipt. A real external hold blocks the affected action; it does not justify speculative code or new reporting machinery.

Explain any substantial new complexity in the existing task receipt. Do not introduce another reporting document.
