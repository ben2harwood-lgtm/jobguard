Built by Codex; dispatched 13 Oct 2026.

# CH-7-INSURER — BLOCKED preflight receipt

Actual builder: Codex. The requested Claude Sonnet fallback attribution does not describe this session and is not used. Check lane RED; no builder verdict or acceptance. Builder receipt only — not independently verified, not accepted.

Base, origin/main and unchanged final HEAD: `1f54750cf4b8a5f499d5dcb1be9beed2add989a5`. Branch: `codex/sandbox/ch-7-insurer`. Initial working tree was clean. No git write, commit, push, PR, merge, provider call, approval or release.

## STOP / BLOCKING requirements

1. **Part A, A5 job lock.** `packages/db/migrations/0003_job_spine.sql:111` gives runtime SELECT/INSERT on `app.job` and revokes UPDATE. A row-level FOR SHARE lock requires UPDATE privilege. The new SECURITY INVOKER review guard cannot take the requested lock with those privileges. A5 explicitly requires STOP if a new grant is needed; no grant was added. The existing `app.require_current_job_parties` in `0095_job_parties.sql:140–147` locks as SECURITY DEFINER, but raises JOB_PARTIES_REQUIRED without a binding. Substituting it would break the dispatched unchanged behavior for a job with no payer record. No substitute was built. Requested coordinator amendment: a narrow persisted-session/owner-checked SECURITY DEFINER lock helper, without application table write grants.
2. **Part A, A6 required payer versus Rule G.** Three merged setup calls omit `payer`: API test line 43; DB test lines 339 and 351. Requiring the new fact makes those calls fail before their intended assertions. The draft authorizes the input addition only in the core test, not these setup lines. They remain byte-identical. Requested coordinator amendment: add only `payer:"not_insurer"` to those three calls. No default, fixture detection, test mock or other substitute was added to bypass the required-field contract.
3. **Part B, approved F21 text versus Rule G.** DB test line 305 unconditionally asserts `expect(good.result.reason).toBeNull()` for both F17 and F21. Part B requires F21's reason to be the approved non-null message. This assertion is absent from the complete allowed expected-value edit list. It remains byte-identical. Requested coordinator amendment: conditional exact approved-message assertion for F21, retaining the null assertion for F17. No implementation or workaround was built.
4. **Pinned-base lane check.** The underlying lane checker with the required `LANE_BASE_REF=4db73817ab7b3be4993fe8b01279ac0e1b8cf836` exited 1: `Lane boundary FAILED: Lane ch-7-insurer cannot edit: "docs/verdicts/FIXLATER-5/BUILDER_RECEIPT.md"`. Current origin/main/HEAD are the issued base 1f54750; the working-tree diff against them contains no FIXLATER-5 edit. No lane widening or alternate-base rerun was used. Coordinator must reconcile the pinned lint base with the issued base.

Coordinator questions were submitted asynchronously; no answer was received before this receipt. Elapsed time is not authorization. Both feature parts remain stopped.

## Newest definition / main wins

Definitions source-inspected using a repository-wide migration search:

- `app.guard_recovery_eligibility_v3`: newest definition `0130_recovery_eligibility_v3_f17_timing.sql:6`, not the draft's pre-merge 0123. It preserves F17's paid-before exclusion.
- `app.require_recovery_eligibility_v3_effect`: newest definition `0119_recovery_eligibility_v3.sql:132`.
- Merged `0134_recovery_case_terms.sql` defines neither routine. Both would be restated from the files above when the blockers are resolved.
- Main has `0131_practice_feed_facts.sql`; the draft's open-PR status is stale. Migration 0142 remains reserved for this task; no migration file or registry entry has been created.

No routine was restated, so the two routine diffs are empty. No merged table/column/policy/grant was altered; no row backfill or update.

## Changes left for dispatcher

- One compact, name-ordered `ch-7-insurer` lane row, with exactly the dispatched allowlist.
- This receipt, the saved tests-first draft patch and unchanged-file evidence.
- `/private/tmp/jg-msg-ch-7-insurer.txt`: intended docs/preflight commit message only; not a feature completion message.

No feature, schema, API, core evaluator, UI, test or migration change remains in the working tree. The temporary tests-first edits to the three initially clean test files were saved as `PART_B_TESTS_DRAFT.patch` and restored to their exact original bytes after the blockers were found. The patch is a **draft artifact, not an applied test change**. No file was deleted. No build output, pnpm store or test-results directory was intentionally created.

## Rule before / after and grants

Before and after are identical: insurer handling remains unimplemented on this branch; old F19 individual-interest and F21 reasons remain held; the existing v3 predicate and timing rule remain unchanged. No default payer was introduced. D03 remains proposed, production remains disabled, environment remains synthetic_demo.

**Every new GRANT: none.** Standard F: no new direct INSERT/UPDATE/DELETE grant was added to jobguard_runtime on any table. The eventual mark table must give runtime SELECT at most and write through its own session-bound owner-checked SECURITY DEFINER routine; the addendum overrides the draft's INSERT grant and no-SECURITY-DEFINER instruction. That routine was not built while A5 is stopped.

## Locks

Requested order (not implemented): review command → case → payer-mark → job → audit; mark command → payer-mark → job → audit. Membership verification precedes those business locks. Source inspection found the existing recovery-case repository uses membership then case advisory lock and audit, with no job row lock; the job-party repository's binding path calls the merged controlled binding routine which locks the job row. No payer-mark path exists on main. No runtime lock execution or concurrency proof was run; no claim of verified lock ordering is made.

## Wording evidence and tests-first

The copied message bytes were checked with Node's UTF-8 SHA-256:

| Message | Characters | SHA-256 |
|---|---:|---|
| Individual interest | 173 | fb24c95b4190d5b342b52302d5f5e18734f6b75a06b1c943de313359fa07a72f |
| Unpaid bill reduced | 163 | 44e291a1874a9c230b704f972df2a547fcb4d67256d1c0f69114682decaf0e21 |

Both match the issued values and contain U+2019. This is a deterministic string check, not an implementation test or independent review.

The saved draft was written before any implementation. Its seven appended core tests cover B1/B2 message bytes, F19 pending/header behavior, paid-before precedence, unchanged F18 interest, G5 reasonHeld release and legacy reader compatibility. It also contains the authorized F21 expected-value edits and browser F19 exact-message assertion. Self-inspection found its attempted browser F21 row replacement did not match main's button text; it is therefore incomplete and must not be applied as a finished patch. All draft test edits were restored. No test assertion was weakened or left changed.

First tests-first command: `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/recovery-eligibility-v3.test.ts`, with the required PATH export. Only the pnpm warning appeared; Vitest never reported collection or execution. The run was interrupted, exit **130**, zero reported tests. This is NOT a first failing implementation-test run, nor a pass. The local pnpm launcher points at the installed v11 executable; the inspected tool-cache directory has 11.8.0 and 9.0.0 entries, no 10.28.1 entry. No install/download was requested. No alternate package-manager invocation was used.

## Acceptance coverage status

| Issued acceptance | Status |
|---|---|
| A1–A7 / DB 1–15, 17 | NOT BUILT / NOT RUN: Part A blockers above. No acceptance test is claimed for them. |
| B1/B2 / DB 16 | Core test draft written first, preserved but unapplied; targeted run interrupted before Vitest. Database/browser NOT RUN. |
| DB 11's wording / reasonHeld cases | Planned assertions only; blocked before database test or migration implementation. |
| DB 18 upgrade proof | NOT BUILT / NOT RUN. Must use old F19/F21 saved reviews and named-column canonical text, full column types, identity-matched rows and all required rolled-back controls when unblocked. |
| API dispatch/refusals/reply | NOT BUILT / NOT RUN, Part A stopped. Existing API test untouched. |
| Browser Part A | NOT BUILT / NOT RUN, Part A stopped. No UI source inspected to justify a control/API journey. |

No acceptance line is marked complete. The required own integration test titles for contractor routes are absent from the issued header, and watchdog.ts is outside this lane. The CH-7 task card scopes this path to small-builder synthetic reviews. No contractor route/registry change was made; scope must be reconciled if a contractor write path is required.

## Commands and results

Read-only inspection batches used pwd, git status/rev-parse/branch/diff/show, rg, cat, sed, nl and ls to read AGENTS, applicable BUILD_PLAN cards/contracts, prior receipts, merged routine definitions, repositories, schemas, existing tests, migration registry and installed tooling. Their records are in `COMMANDS.md`; no source inspection is described as an executed implementation check.

| Check / operation | Result |
|---|---|
| Initial `git status --short` | Exit 0, clean. |
| HEAD / origin/main / branch | Exit 0, both 1f54750; correct branch. |
| Lane row insertion / draft-test writes / saving draft and restoring originals | Exit 0 each; no implementation writes. |
| `memory_pressure` and `df -g /System/Volumes/Data` before tests | Shell exit 0: 75% free memory; 90 GB available. Earlier read: 74% / 90 GB. |
| Targeted core tests-first command above | Interrupted exit 130; no Vitest count. |
| Unbounded temporary-directory filename search | Interrupted exit 130; no result used. |
| `ps -axo pid,ppid,etime,comm` | Permission refused: `zsh:1: operation not permitted: ps`. Diagnostic STOP; no alternative. No safety escalation or auto-review rejection occurred. |
| Node string-hash / JSON parse check | Exit 0, two expected lengths/hashes, 147 lane entries. |
| `LANE_BASE_REF=4db73817ab7b3be4993fe8b01279ac0e1b8cf836 node tools/agent-lane-boundary-lint.mjs` | Exit 1, unrelated merged FIXLATER-5 receipt outside lane. This is the underlying node checker, not a successful pnpm lint:lanes run. |
| `git diff --check` | Exit 0, no whitespace errors. |
| Unchanged-file hash comparison | Exit 0, all eight sampled files equal origin/main. See UNCHANGED_FILES.json. |

NOT RUN: `pnpm exec turbo run typecheck --force`, `pnpm exec turbo run lint --force`, `pnpm build --concurrency=2 --force`, the requested pnpm lint and lint:lanes wrappers, dependency build, API unit files, openapi:check. Both feature parts are explicitly stopped and no implementation change remains; the attempted launcher never reached the targeted suite. No cache-hit green is claimed. Whole repository/package suites were not run.

NOT RUN (sandbox cannot start PostgreSQL / a browser): `packages/db/test/recovery-insurer-money.integration.test.ts` (not created), `packages/db/test/recovery-eligibility-v3.integration.test.ts`, `packages/db/test/tenancy.integration.test.ts`, `apps/web/e2e/CH-7.spec.ts`, test:db, test:migrations, test:e2e. No sockets, PostgreSQL or browser were started. No heavy-slot run or helper delegation occurred.

## Self-inspection

This is builder source inspection only. Final diff against origin/main contains one lane row plus receipt artifacts; all merged implementation and tests remain unchanged. No permanent test pins shared files or fingerprints. The saved hash evidence is receipt-only. No SECURITY DEFINER, grant, provider, UI, version or timeout change. No independent verdict was generated. The block at the existing F21 null assertion was detected before implementing either wording change.

`git diff --stat origin/main` (tracked files):

```text
 config/agent-lane-assignments.json | 1 +
 1 file changed, 1 insertion(+)
```

Git's tracked diff omits untracked receipt files; the final inventory below and `git status --short` explicitly include them. No file outside the lane changed.

## Held / follow-up

Original production, allocator, fee derivation, live bank receipts, missed-variation insurer rules, dedicated evidence type and other marking roles remain held. UI marking/read-model controls remain held. Fee terms and practice facts are already merged on this base; their draft-unmerged status is not repeated as current. Future SV-5 / M4-8-S / M4-9-S / SV-6 / live receipt work still owes the shared payer and per-payment-mark rule once it exists.

Fresh Opus plus separate Sol review and separate acceptance remain required after a complete build and CI. Final head is unchanged 1f54750; there is no new implementation commit to review.

## Exact STOP contexts (unchanged)

### apps/api/src/recovery-eligibility-v3.application.test.ts:43

```ts
42:  vi.stubEnv("JOBGUARD_ENV","synthetic_demo");vi.spyOn(PracticeAccess.prototype,"job").mockResolvedValue(principal as never);
43:  const original={id:randomUUID(),revision:1,caseRevision:2,sourceEventId:randomUUID(),result:evaluateRecoveryEligibilityV3({version:"recovery-eligibility-facts.v3",environment:"synthetic_demo",tenantId:principal.context.tenantId,jobId:job,caseId,fixture:"F18",settlement:"settled",paymentTiming:"after_opening",sourceRef:randomUUID()})};
44:  vi.spyOn(RecoveryEligibilityV3Repository.prototype,"review").mockResolvedValue(original);
```

### packages/db/test/recovery-eligibility-v3.integration.test.ts:305

```ts
304:  const good=await valid.repo.review(ctx,valid.jobId,review(valid.c,name),actor,valid.auth.digest);
305:  expect(good.result.reason).toBeNull();
306:  const f=await fixture(type);if(movement)await f.advance(movement);
```

### packages/db/test/recovery-eligibility-v3.integration.test.ts:339

```ts
338:  expect(stored).toEqual({result:r.result,source_event_id:r.sourceEventId});
339:  expect(r.result).toEqual(evaluateRecoveryEligibilityV3({version:"recovery-eligibility-facts.v3",environment:"synthetic_demo",tenantId:T,jobId:f.jobId,caseId:f.c.id,fixture:"F17",settlement:"settled",paymentTiming,sourceRef:r.sourceEventId}));
340:  expect((await f.cases.listForMember(ctx,f.jobId,actor)).find(c=>c.id===f.c.id)?.eligibilityV3).toEqual(r);
```

### packages/db/test/recovery-eligibility-v3.integration.test.ts:351

```ts
350:   // Deliberately propose £450 irrespective of the stored timing, as a raw writer could.
351:   const result=evaluateRecoveryEligibilityV3({version:"recovery-eligibility-facts.v3",environment:"synthetic_demo",tenantId:T,jobId:f.jobId,caseId:f.c.id,fixture:"F17",settlement:"settled",paymentTiming:"after_opening",sourceRef:sourceEventId});
352:   const id=randomUUID(),commandId=randomUUID(),payloadHash=createHash("sha256").update(commandId).digest("hex");
```

### packages/db/migrations/0003_job_spine.sql:111

```ts
110:  EXECUTE format('CREATE POLICY tenant_isolation ON app.%I FOR ALL TO jobguard_runtime,jobguard_migration USING (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
111:  EXECUTE format('GRANT SELECT, INSERT ON app.%I TO jobguard_runtime',n); EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON app.%I FROM jobguard_runtime',n);
112: END LOOP; END $$;
```

## Final artifact inventory

- `docs/verdicts/CH-7-INSURER/COMMANDS.md`: SHA-256 `58780fad63136866c4df136f67791ec11758ee715f0e586ad6284082ddf6e181`.
- `docs/verdicts/CH-7-INSURER/PART_B_TESTS_DRAFT.patch`: SHA-256 `909d740a09efa59fdda54ed26fdacfb053905d82d1e41ffe22a459c59a23c103`.
- `docs/verdicts/CH-7-INSURER/UNCHANGED_FILES.json`: SHA-256 `718edbe0edf7da659fbf90a19e0757064b034d192e3499e7325c37f5055ad3ec`.

Final inspection command: git diff --check; git diff --stat origin/main; git status --short; Python artifact inventory and changed-file assertion. Shell exit 0; only the lane row is a tracked edit, plus four untracked receipt artifacts. No implementation test ran. Intended message file exists outside the repository. Final HEAD remains `1f54750cf4b8a5f499d5dcb1be9beed2add989a5`.


## Round 1 — 13 October 2026

Built by Codex; dispatched 13 Oct 2026. Builder receipt only — not independently verified, not accepted. The earlier sections are the **historical preflight receipt**, not the current change inventory. Round 1 is a partial build, not technical acceptance or a release-ready feature. No commit, git add, checkout, push, PR, merge, provider action, professional approval or release was performed.

Initial/final HEAD: `f1180b548157b7866a49e554ba130968434ce95e` (the dispatcher's doc-only preflight commit). Initial origin/main: `1f54750cf4b8a5f499d5dcb1be9beed2add989a5`. During work origin/main advanced externally to `ec6ad4d2a411bf058cb1f107419d68da9fdffc05` (#172 SV-3-ABORT, with the preceding FEE-PINS-1 merge). Those changes do not replace either eligibility routine or add a migration. No refresh or git write was attempted. The source changes are against f1180b5; diff against the moving origin/main also contains reverse differences for the unrelated merges. The lane checker uses merge-base and passes with the latest origin/main. The user-issued Round 1 `LANE_BASE_REF=origin/main` replaces the old pinned lint base; no lane widening was made.

### Merged precedent, exact evidence

**Precedent found:** `origin/main:packages/db/migrations/0095_job_parties.sql:140` declares `app.require_current_job_parties(uuid,uuid)` SECURITY DEFINER with fixed `search_path=pg_catalog,app`; **:142 checks tenant context itself; :143 locks app.job FOR SHARE; :149 assigns jobguard_migration ownership; :150 revokes PUBLIC; :151 grants runtime EXECUTE**. Application precedent: `origin/main:packages/db/src/quote-document-repository.ts:2` and **:6** call that routine instead of locking app.job directly. `origin/main:packages/db/migrations/0096_watchdog_live.sql:54–68` independently documents why runtime cannot lock job and provides the migration-owner tenant-checked share-lock pattern. SV-4's `0132_final_account_lock.sql:196–208` supplies a runtime-callable definer which checks owner/tenant, then locks the job, then checks owner again; its stronger live/final-review preconditions are unsuitable for unchanged draft/no-binding reviews.

Actual read-only searches:

```sh
git grep -n -E 'FOR (SHARE|UPDATE)|SECURITY DEFINER|require_current_job_parties' origin/main -- packages/db/migrations/0095_job_parties.sql
git grep -n -E 'FROM app.job .*FOR (SHARE|UPDATE)|set_config\(.app.tenant_id|TENANT_CONTEXT' origin/main -- packages/db/migrations/0003* packages/db/migrations/0006* 'packages/db/migrations/009*.sql' 'packages/db/migrations/0100*.sql'
git grep -n -E 'FROM app.job.*FOR (SHARE|UPDATE)' origin/main -- packages/db/migrations
git grep -n -E 'require_current_job_parties|prepare_final_review_extra|final_lock_require_owner' origin/main -- packages/db/src apps/api
git grep -n 'FUNCTION app.guard_recovery_eligibility_v3\|FUNCTION app.require_recovery_eligibility_v3_effect' origin/main -- packages/db/migrations
```

The new `app.lock_recovery_payer_job` mirrors the 0095 pattern, allowing an absent payer binding (Q2). It handles missing/malformed/mismatched tenant context, explicitly sets the checked transaction-local context for FORCE RLS, checks the persisted session and active owner, checks session ownership of the job, and takes FOR SHARE under migration ownership. Both new definer entry points have their own owner predicate and fixed search_path. The writer derives its actor from the persisted session, not from command JSON. No new app.job grant exists. This implements the coordinator's A5 ruling rather than the preflight's proposed additional job grant/helper approval question.

### What changed, and what remains stopped

- **A2–A5:** migration 0142 adds the single payer function; append-only tenant/job/payment/evidence-qualified marks; timestamp/immutability triggers using the merged functions; an invoker insert guard; deferred audit completeness; a checked definer writer and job-lock helper. It restates the newest guard from **0130:6** and the newest effect trigger from **0119:132**, with only Part A's changes and the independent F19 wording/reasonHeld changes. See `ROUND_1_guard_recovery_eligibility_v3.diff` and `ROUND_1_require_recovery_eligibility_v3_effect.diff`. 0134 defines neither routine. No merged migration, table, column, grant, policy or stored row is altered. 0142 is registered by name in numeric order; two tenancy catalog rows were added in name order, with every earlier row unchanged.
- **A7:** strict versioned command/result schemas, mark/withdraw repository, existing endpoint version dispatch, additive immutable reply field, and typed refusal rules. Owner/session authority precedes replay. Same command/payload/job returns the original mark after later revisions; changed payload/job conflicts. The database computes the command hash, copies the exact original evidence metadata, and accepts no client payer, amount, binding or time. Each mark is one payment; no bulk/whole-job exception. Mark writes on contractor-track jobs are refused after owner authentication, so this small-builder command adds no contractor write path or registry row. Mark commands create no review, fee, allocation or external action.
- **Independent B1/B2 F19:** approved constants and reader enum; individual-interest reason; pending-header and compensation-header preservation; F19's reasonHeld release; legacy held/null reader compatibility; one added exact-message assertion in the existing browser test. F19 principal stays 250000p, interest stays 0p; F18 interest remains 12000p/null. No existing assertion or expected value was replaced.
- **A6 remains STOPPED in full.** The review repository is byte-identical, the required payer fact has not been introduced, no default or fixture detection was added, and review-audit payer references are not implemented. The SQL guard is a backstop: an ordinary application F18/F19 candidate on an unmarked insurer-paid job is refused rather than saved as an insurer exclusion. Do not release this partial build as completed insurer review support.
- **F21 remains STOPPED.** Its header/line reasons are still null and its reasonHeld values still true, in core and SQL. The approved unpaid-bill string is only a constant/reader value; no F21 activation or assertion change occurred. The old draft patch remains an unapplied historical artifact.

The four stopped lines are byte-identical to f1180b5: API test **:43**, DB test **:339**, **:351** and **:305**. Their exact preceding/current/following lines are preserved in the preflight STOP-context section above, and both complete test files are fingerprinted in `ROUND_1_UNCHANGED_FILES.json`. No update to them is requested again in this round; the coordinator's ruling is still pending.

### Exact acceptance dependencies and evidence

| Acceptance ID | Round 1 status |
| --- | --- |
| A1 | SQL exclusion backstop built; complete application insurer decision remains blocked by A6. |
| A2 | Shared SQL payer join built; repository review call is the A6 dependency, unchanged. |
| A3/A4 | Mark persistence, evidence, owner/session, state, timestamp and audit enforcement built; PostgreSQL NOT RUN. |
| A5 G1/G2/G3 | Controlled job lock and insurer branch built. New lock-context/catalog tests written before these routines; extra amount/refusal/concurrency controls were appended during self-inspection. PostgreSQL NOT RUN. |
| A5 G4 / F21 part of G5 | BLOCKED by DB :305's F21 null assertion; unchanged. |
| A5 F19 part of G5 | Built independently, with real core failing-then-passing tests; DB/browser NOT RUN. |
| A6 | BLOCKED by API :43 and DB :339/:351 missing payer setup facts. No implementation or workaround. |
| A7 | Schema/dispatch/refusal/unit checks passed; real persistence/replay/authorization awaits CI. V1/v3 API unit replies remain covered. |
| B1 | Both exact constants/hashes tested. Only the F19 message is activated. |
| B2 / DB16 F19, F18 and legacy readers | Core tests passed; F19 database and browser definitions written, NOT RUN. |
| B2 / DB16 F21, all-new-review reasonHeld release | BLOCKED by DB :305. F21 null/held behavior retained. |
| DB1, DB2 qualifying/exclusion application results, DB3 review plus payer audit, DB4 old-exclusion preservation, DB5 review toggles, DB6 other-payment exclusion, DB8 pending insurer exclusion, DB10 payer-change application outcomes | BLOCKED by A6's three setup lines. The independent mark portions of DB3/DB5 and the shared-payer lookup in DB2 are written. No full acceptance is claimed. |
| DB7 and DB9 | Independent paid-before/mark and supplier/prevention control tests written, NOT RUN. |
| DB11 | Part A raw SQL mismatch/success controls written. F21 message/null/ASCII controls and F21 held-flag release BLOCKED by :305. No null assertion changed. |
| DB12–DB14 | New core/API/DB tests cover strict input, evidence identity/tenant/job/kind, actor/session/refusals, state/revision, audit rollback, immutable rows, timestamp pin, replay and job conflict. Core/API passed; DB NOT RUN. |
| DB15 | Two-connection mark→review blocking observation with pg_stat_activity and no sleeps written, NOT RUN. This qualifying-after-mark path uses the existing evaluator; it does not prove A6 or the missing review-audit references. |
| DB17 | Catalog tests written under the superseding standard F/coordinator ruling: SELECT-only table, controlled definer entry points, invoker guards and fixed search_path. NOT RUN. The draft's INSERT grant/all-invoker expectation is superseded, not silently used. |
| DB18 | Rule-9 upgrade proof written and TypeScript-checked, PostgreSQL NOT RUN. Real repository writes before N use a test-only previous-evaluator F19 encoding (explicit module mock), then return to the current evaluator before applying N. This is synthetic upgrade fixture preparation, not a live integration or previous-binary verification. Named original rows/full column types, N alone, all later migrations twice, microsecond/retype/nullable/replaced-function/later-insert rolled-back controls and identity matching are included. |
| Core payer parity/refusal coverage for required fact (DB1/DB2/DB7/DB8) | BLOCKED by A6. Existing neutral core parity tests still pass; no missing-payer refusal is claimed. |
| Browser Part A insurer exclusion | BLOCKED by A6's incomplete application result; no browser test with an unimplemented success assertion was added. F19's independent wording assertion was added; F21 row/assertion unchanged. |

No acceptance ID is independently verified or accepted. The table separates written tests, source inspection, local unit execution and outstanding PostgreSQL/browser execution.

### Standard F — every new GRANT

1. 0142:13 — `GRANT EXECUTE ON FUNCTION app.recovery_job_payer_type(uuid,uuid) TO jobguard_runtime`.
2. 0142:39 — `GRANT SELECT ON app.recovery_payment_payer_mark TO jobguard_runtime`.
3. 0142:69 — `GRANT EXECUTE ON FUNCTION app.lock_recovery_payer_job(uuid,uuid,uuid) TO jobguard_runtime`.
4. 0142:179 — `GRANT EXECUTE ON FUNCTION app.write_recovery_payment_payer_mark(uuid,uuid,jsonb) TO jobguard_runtime`.

No new direct INSERT/UPDATE/DELETE grant on any money, membership, authorization, receipt, audit or job table. No routine is granted to PUBLIC. Runtime cannot assume the migration owner. RLS/definer checks constrain authenticated context; this is not proof against compromised privileged credentials or application-selected false context.

### Locks and self-inspection

Review: authenticated membership lock → command advisory → case advisory → payer-mark advisory → controlled job FOR SHARE → inserts/claim lines → audit head. Mark: authenticated membership lock → mark-command advisory → payer-mark advisory → controlled job FOR SHARE → guarded insert → audit head. The trigger/helper rechecks the already-locked owner row; it acquires no different membership after the business locks. Replay rechecks authority and returns stored data, with no new audit append. Deferred effects read audit/lines and acquire no business lock after audit.

Source-inspected `recovery-case-repository.ts:73–80,121–132`: membership then case advisory, no direct job row lock. `job-parties-repository.ts` takes membership/receipt before `bind_job_parties`; `0095:118` takes job FOR UPDATE before binding changes and never takes a payer-mark/case advisory key. `0097:43–49` takes case advisory then job, not the opposite. No merged path uses the new payer-mark key, and no inspected path takes the same case/job pair in reverse. This is source inspection, not runtime/concurrency proof. DB15 and the catalog tests remain CI evidence owed.

Self-inspection corrected my new core test's Node import, moved only the newly added tenancy rows to their proper name-order positions, made the later-insert upgrade control rolled back, and removed an undefined evidence property from my new withdrawal test input so it tests state conflict rather than strict-schema refusal. All merged expected values/assertions remain unchanged. Only new tests and the allowed added F19 browser assertion/catalog rows change merged test files. Both routine diffs match their newest definitions plus the documented changes. No new timeout/deadline, merged-file permanent fingerprint test, AI/provider change, package install/download, screen change or direct money grant. Whole task files overlap with later A6/F21 work and must serialize on this branch.

### Checks actually run

All pnpm commands used `export PATH="$HOME/Library/pnpm/bin:$PATH"`, followed by the already installed `/private/tmp/jg-pnpm-ent-10a2` launcher, which runs cached pnpm **10.28.1**. Node **v24.17.0**. No download/install. Before heavy work memory was 75% then 72% free; disk was 93 GB then 92 GB available.

| Command | Exit / actual result |
| --- | --- |
| `pnpm --version` | 0; 10.28.1 |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/recovery-payment-payer.test.ts` before schema implementation | 1; missing module, 1 failed suite, zero collected tests. Written-first schema test, not a test assertion failure/pass. |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/recovery-payment-payer.test.ts src/recovery-eligibility-v3.test.ts` before F19 changes | 0; 2 files, 35 tests passed. |
| `pnpm exec turbo run build --filter=@jobguard/db... --force --concurrency=2` | 2; own new core test imported node:crypto without core Node typings. Fixed in own test; no merged test changed. |
| F19 tests-first `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/recovery-eligibility-v3.test.ts` | 1; 2 failed, 26 passed. Failures: held flag remained true, pending interest reason remained the pending string. |
| Same two-file core run after F19 implementation | 0; 39 passed. |
| Final same two-file core run, including constant/hash check | 0; **40 passed**, 2 files. |
| `pnpm exec turbo run typecheck --force` | 0; **7 executed tasks, 0 cached**. |
| `LANE_BASE_REF=origin/main pnpm lint --force` | 0; boundary/purity/money/commercial checks passed; runs `turbo run lint --force`, **7 executed tasks, 0 cached**. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0; ch-7-insurer lane passed against moving origin/main. Repeated after receipt completion below. |
| `pnpm build --concurrency=2 --force` | 0; **7 executed tasks, 0 cached**, Next generated 30 pages. |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/recovery-payment-payer.application.test.ts src/recovery-eligibility-v3.application.test.ts` | 0; **25 passed**, 2 files. API tests are mocks, not database/HTTP live integration. Written before application changes; no pre-implementation API run was made because its new dependency had not been built. |
| `pnpm --filter @jobguard/db exec tsc --noEmit --target ES2023 --module NodeNext --moduleResolution NodeNext --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --skipLibCheck test/recovery-insurer-money.integration.test.ts` | 0; no diagnostic. Repeated after additions/corrections to own integration tests; compilation only, no PostgreSQL execution. |
| `node apps/api/dist/generate-openapi.js` before wrapper refusal | Generated a broad compiled-decorator artifact; its exit code was not retained in the displayed tool output. Not an official source-generator pass. |
| `node apps/api/dist/generate-openapi.js --check` before wrapper refusal | 0 against that generated form; compiler metadata differs from tsx. Own generator modification was restored to exact HEAD bytes. See ROUND_1_OPENAPI_GENERATOR_NOTE.md. |
| `pnpm openapi:check` | **1 / STOP:** `Error: listen EPERM: operation not permitted /var/folders/nh/lx6ycbfd1l937f5qhj0cdvhh0000gn/T/tsx-501/72034.pipe`. No alternative to that operation was attempted after refusal. CI owes this official check. |
| `git diff --check`, JSON/hash/unchanged-file inspection and exact routine diffs | 0; nine sampled unchanged files match f1180b5, including both stopped test files, v3 review repository, merged routine migrations and restored OpenAPI. Final inventory below. |

Turbo emitted `WARNING IO error: Operation not permitted (os error 1)` during forced dependency/check/build work. The checks still executed (0 cache hits for passing final checks). No shared-cache repair, permission escalation or alternate cache-write attempt was made. Build also warned about the existing CSS `end` alignment value; no unrelated CSS edit was made.

**NOT RUN, sandbox cannot start PostgreSQL / a browser:** `packages/db/test/recovery-insurer-money.integration.test.ts`, `packages/db/test/recovery-eligibility-v3.integration.test.ts`, `packages/db/test/tenancy.integration.test.ts`, `apps/web/e2e/CH-7.spec.ts`, `pnpm test:db`, `pnpm test:migrations`, `pnpm test:e2e`. These are mandatory CI checks, not skipped passes. No database/browser command or heavy-slot helper was invoked. Whole package/repository tests were not run under the dispatcher's at-most-three-file rule. AI evaluation is inapplicable: no AI/model/prompt/parser change. No dependency reinstall or clean-install proof was performed; this uses the dispatcher's preinstalled dependencies. Generated build output is ignored and absent from the change inventory; no delete command was used to clean it.

### Remaining release gates and dispatcher handoff

A6 and F21 rulings remain pending, and the partial insurer application path is deliberately incomplete. 0142 must not ship as feature completion. CI must run PostgreSQL fresh/upgrade/catalog/replay/concurrency and browser suites plus the official OpenAPI source check after the dispatcher commits/pushes. Fresh Opus + separate Sol verdicts must bind the exact resulting commit; separate acceptance and founder merge/release remain owed. No builder verdict or independent sign-off was produced.

Production remains disabled; D03 remains proposed; environment synthetic_demo. Fee issuance, allocation, derivation, live receipts, missed-variation insurer handling, mark screens, a dedicated evidence type and non-owner marking remain held. Future SV-5 / M4-8-S / M4-9-S / SV-6 and live receipt work owe the shared payer/mark rule; no new platform obligation/posting/outbox is created here. No migration backfill. Forward fix preserves mark/review/claim/audit history and compatible readers; an older application can read earlier data but may hit the stricter new insurer SQL guard.

Intended conventional commit message is written to `/private/tmp/jg-msg-ch-7-insurer.txt`; the dispatcher commits it. Final HEAD remains f1180b548157b7866a49e554ba130968434ce95e.

### Round 1 final inventory

Final whitespace check and lane check: exit 0. `ROUND_1_INVENTORY.json` records source/artifact byte counts and SHA-256 (receipt itself excluded to avoid a recursive fingerprint). `ROUND_1_UNCHANGED_FILES.json` pins only receipt evidence, never a permanent test. Every changed/untracked file was checked against the exact issued allowlist. No implementation file outside it changed. `git diff --stat f1180b5` before this inventory append:

```text
 apps/api/src/recovery-case.application.ts         |   7 ++
 apps/api/src/recovery-case.contracts.ts           |  11 ++-
 apps/web/e2e/CH-7.spec.ts                         |   1 +
 docs/contracts/recovery-eligibility-v3.md         |  10 ++
 docs/verdicts/CH-7-INSURER/BUILDER_RECEIPT.md     | 113 ++++++++++++++++++++++
 docs/verdicts/CH-7-INSURER/COMMANDS.md            |  38 ++++++++
 packages/core/src/index.ts                        |   1 +
 packages/core/src/recovery-eligibility-v3.test.ts |  34 ++++++-
 packages/core/src/recovery-eligibility-v3.ts      |  13 ++-
 packages/db/MIGRATIONS.md                         |   4 +
 packages/db/src/index.ts                          |   1 +
 packages/db/src/migrate.ts                        |   1 +
 packages/db/test/tenancy.integration.test.ts      |   2 +
 13 files changed, 231 insertions(+), 5 deletions(-)
```

Git's tracked stat omits new files: core payer schema/test; DB writer repository, 0142 and insurer integration test; API payer application test; four Round 1 evidence artifacts plus this final inventory. See `git status --short` and the inventory. The existing lane row was already committed in f1180b5 and was not changed in Round 1. The two entire stopped test files and the original OpenAPI file remain unchanged. The final standalone DB test typecheck after all fixture/control corrections exited 0. No further source change followed the passing root forced checks; only added/corrected DB test definitions and receipt evidence changed.

Intended commit message exists at /private/tmp/jg-msg-ch-7-insurer.txt. Final HEAD is f1180b548157b7866a49e554ba130968434ce95e; builder committed nothing.


## Round 2 — 13 October 2026

Built by Codex; dispatched 13 Oct 2026. **Builder receipt only — not independently verified, not accepted.** Initial working tree clean; branch `codex/sandbox/ch-7-insurer`, initial/final HEAD `ee4917f70c29834ac2291220af8310a3a932bda9`. `origin/main` remained `ec6ad4d2a411bf058cb1f107419d68da9fdffc05`. No git-writing command, commit, push, PR, merge, provider call, approval or release. Read this receipt first, then both issued orders at `~/.local/share/full-steam/jg-orders/CH-7-INSURER-issued.txt` and `CH-7-INSURER-r1-lock-redesign.txt`, AGENTS and applicable BUILD_PLAN/contracts. This section supersedes Round 1's pending A6/F21 rulings.

### Coordinator rulings applied

- **F21 remains unchanged.** Header/line `reason:null`, header/line `reasonHeld:true`, Q=0. DB test **305** and every earlier F21 expectation remain untouched. The insurer exclusion is a **different fact**, the required server fact `payer:"insurer_unmarked"`, with its own result/header/line reason `Insurer proceeds never qualify`. It applies only to withheld-customer-payment fixtures. F21 is the separate merchant unpaid-bill fact and receives no insurer reason. No result field/version is added; each review owns its existing reason field. The unpaid-bill constant is retained, byte-exact and documented, but not activated. Original G4, F21 G5, DB11's null-F21 refusal and DB16's non-null-F21 expectation are superseded by this ruling, not implemented or relaxed tests.
- **A6 built assuming the coordinator setup patch.** API **43**, DB **339** and **351** remain byte-identical. No schema default, production fallback, fixture detection or test alteration bypasses their new required payer fact. The coordinator will add only `payer:"not_insurer"` there. The core helper receives the explicitly authorized setup-only input addition; none of its existing expected values changes.
- **A5/standard F retained.** The merged precedent remains `0095_job_parties.sql:140–151`: migration-owned definer, tenant check, job FOR SHARE and runtime EXECUTE; application `quote-document-repository.ts:6` calls it. The checked helper from Round 1 mirrors it, sets/checks tenant context, carries its own persisted-session/owner predicate and allows missing bindings. No new app.job grant, or money/membership/authorization/receipt/audit-table write grant.

### Changes and before/after behavior

Core now requires `payer: not_insurer | insurer_unmarked | insurer_customer_own`. An unmarked insurer payment passes SV-1 `proceeds:"insurer"`, so SV-1 computes zero; every claim component gets the insurer reason. Paid-before still wins over insurer, and insurer wins over pending. Marked insurer payments retain F18 262000p / F19 250000p with the compensation header. F17 supplier refunds and F15/F21/F22 retain their existing figures, reasons and held flags. F19's approved individual-interest message, added in Round 1, remains ahead of pending for that interest line, behind paid-before/insurer. No new fee or money posting.

The review repository authenticates/locks owner membership before replay, takes command then case locks, validates the immutable source, takes the exact payer-mark lock then controlled job FOR SHARE, and only then derives payer/binding/mark in **one SQL query**. It calls `app.recovery_job_payer_type` (the single current-payer join); JavaScript does not infer payer from customer type. Missing binding is explicitly `not_insurer`. Insurer audit references additionally include current `payingPartyBindingId` and the `payerMarkId` when a customer-own mark is used. Mark/withdraw/payer correction only changes a subsequent review. Reads/replay retain saved JSON and do not recompute history.

Before Round 2 the application submitted an ordinary candidate which the insurer SQL backstop refused. After Round 2 it can save an insurer exclusion, and can save a qualifying candidate after a customer-own mark. No merged table, column, policy, grant or row was altered. 0142 changes in this round are **comments only**; its two routine bodies equal ee4917f exactly. Newest merged definitions are still guard `0130:6`, effect `0119:132` (0134 defines neither). Fresh routine comparisons against those definitions are in `ROUND_2_guard_recovery_eligibility_v3.diff` and `ROUND_2_require_recovery_eligibility_v3_effect.diff`. Their only behavior changes remain the documented Round 1 G1–G3, insurer line reason, F19 message and F19 held release. F17 timing is preserved. Existing v3 result/policy labels stay as issued; v1 is untouched.

Locks: review membership → command → case → payer-mark → job → audit; mark membership → mark-command → payer-mark → job → audit. The SQL insert guard repeats already held locks. `recovery-case-repository.ts:73–80,121–132` holds membership/case but no job row lock; `job-parties-repository.ts:119` enters `0095:118`'s job FOR UPDATE before changing binding, without taking a case/payer-mark key. `0097_recovery_case_current.sql:43–49` takes case then job, never the reverse. The new query holds the job lock while reading payer and binding and holds the payment lock while reading the latest mark. No different business lock is acquired after audit. This is source inspection; the two-connection proof is NOT RUN.

### Tests / acceptance map

Tests for required payer and independent insurer outcomes were added **before** implementation. First core run: 41 failed / 13 passed across two files (new payer inputs rejected by the old strict schema; missing-payer refusal also failed). After implementation: **54 passed / 2 files**. The primary new DB snapshot/control cases and the one new browser journey were also written before A6; they are NOT RUN. Supplementary raw/refusal/DB16 controls and an API client-payer refusal were added during source inspection, not presented as tests-first or live execution.

| Acceptance | Current evidence / limits |
| --- | --- |
| A1/A6; DB1 | Core `[A1 A6 DB1]` F18/F19 component exclusions pass. DB `[A1 A6 DB1 DB3 DB4 DB5]` saves exclusions, confirms no fee journal, NOT RUN. |
| A2; DB2 | Existing shared-payer lookup/catalog definition plus new `[A2 A6 DB2]` person/business/customer-insurer/separate-payer/same-as-customer controls; `[A6 DB2]` unbound job / omitted audit refs. DB NOT RUN. Core neutral/customer-own controls pass. |
| A3/A4/A7; DB3–5 | Existing mark evidence metadata/revision/replay tests, new full exclude → mark → qualify → withdraw → exclude → re-mark → qualify for both F18/F19; exact binding/mark audit refs and canonical-text earlier-review preservation. DB NOT RUN. |
| DB6 | `[A6 DB6]` receipt-384 mark cannot qualify receipt-3000. NOT RUN. |
| DB7/8/9 | Core precedence and unchanged supplier/prevention/F21 controls pass; existing F20 before/after mark and F17/F22 tests plus new pending insurer/F21 database cases. NOT RUN. |
| DB10 | `[A6 DB10]` insurer → person → insurer binding revisions affect only new snapshots. NOT RUN. |
| A5/DB11 | Existing raw nonqualifying insurer/incorrect insurer reason controls; supplementary `[A5 DB11 Round2]` incorrect null insurer reason and held header refuse with zero rows. F21 null is allowed and unchanged as ruled; no ASCII/message2 F21 activation. DB NOT RUN. |
| A4/DB12–14 | Existing role/session/tenant/job/evidence/source/state/revision/immutability/audit/replay definitions preserved. Supplementary strict-field/missing-evidence DB rollback assertions added. Core strict schema passes; API status/refusal/dispatch mocks pass except coordinator-owned setup below. DB NOT RUN. |
| A5/DB15 | Existing mark transaction blocks review with exact blocker PID in pg_stat_activity, no sleeps/timeouts added. Own Round 1 query now observes the new pre-insert SELECT advisory lock instead of INSERT. Qualifying post-commit expectation untouched. NOT RUN. |
| B1/B2/DB16 | Both constants' lengths/hashes pass. F19 wording/header/pending/legacy/F18 interest core checks pass. DB F19 exact message/hash, pending F19, unchanged 12000p/null F18 interest and preserved null/held F21 defined, NOT RUN. F21 message2 activation intentionally absent under ruling. |
| DB17 | Round 1 FORCE-RLS/owner/standard-F/no-job-grant/fixed-search-path/definer-own-check catalogs retained. NOT RUN. |
| DB18/rule 9 | Legacy F19 interest null/held and F21 null/held are written through a **test-only snapshot of the pre-A6 repository** before N. Snapshot source is from ee4917f; it uses real PostgreSQL transactions/previous guards, without querying N's functions before N exists. The existing test-only old-evaluator adapter supplies the required neutral fact only while seeding that previous schema; after N it is off. This is synthetic previous-schema fixture preparation, not a previous binary or live integration. Named canonical text, full column types, primary-key row matching, N alone, all later migrations twice, and all five rolled-back controls retained. NOT RUN. |
| Browser Part A | One appended `[A1 A6 Browser]` F18 journey creates an insurer and binds it through existing `/parties` API commands, then checks zero/Excluded/exact insurer reason before and after reload. Existing CH-3a API journey and capture helper support this without UI changes. NOT RUN. All existing browser/F21 assertions remain byte-identical. |

No task assertion is independently verified or accepted. Production, live receipts, allocator/fee derivation, missed-variation insurer handling, mark screens/read models, dedicated evidence type and non-owner marking remain held. Future SV-5 / M4-8-S / M4-9-S / SV-6 and live receipt work still owe the shared payer/mark rule. D03 remains proposed; `productionEnabled:false`, synthetic_demo only. No AI/model/prompt changes; eval inapplicable.

### Exactly which tests fail until the coordinator setup patch

**Observed locally:** `apps/api/src/recovery-eligibility-v3.application.test.ts:43`, test **“replays the immutable v3 command result when the workbench has a newer candidate”** fails `INVALID_COMMAND` before its assertions. Combined API run: **25 passed, 1 failed**, 2 files. Neither this setup nor any of its assertions was changed.

**Predicted by source inspection, database NOT RUN:** `packages/db/test/recovery-eligibility-v3.integration.test.ts:339` makes all three **“F17 refund settled %s opening: repository, saved result and core/SQL parity”** variants (800 microseconds BEFORE / exactly AT / 800 microseconds AFTER) fail `INVALID_COMMAND`. Line **351** is shared by both **“F17 runtime-role raw qualifying insert for a %s-opening refund cannot commit”** variants (before / equal), **“F17 runtime-role raw qualifying insert after opening still commits with complete components and audit”**, and **“0130 upgrade from 0119 preserves an existing saved F17 candidate byte-for-byte without backfill”**. Each encounters missing-payer validation before its intended SQL assertion. That is **7 database tests**, not executed failures. DB **305** is unchanged and requires no patch. Exact adjacent contexts for all four lines remain in the historical receipt; `ROUND_2_UNCHANGED_FILES.json` proves both complete test files equal ee4917f.

### Every GRANT in 0142 (unchanged from Round 1)

1. :13 `GRANT EXECUTE ON FUNCTION app.recovery_job_payer_type(uuid,uuid) TO jobguard_runtime`.
2. :39 `GRANT SELECT ON app.recovery_payment_payer_mark TO jobguard_runtime`.
3. :69 `GRANT EXECUTE ON FUNCTION app.lock_recovery_payer_job(uuid,uuid,uuid) TO jobguard_runtime`.
4. :179 `GRANT EXECUTE ON FUNCTION app.write_recovery_payment_payer_mark(uuid,uuid,jsonb) TO jobguard_runtime`.

Standard F: no new direct write grant to runtime on any job, money, membership, authorization, receipt or audit table; no PUBLIC execution; no role assumption grant. FORCE-RLS and context/owner checks constrain correctly authenticated application use, not compromised privileged credentials or a false application-selected tenant. No new GRANT in Round 2.

### Commands actually run / checks

Node v24.17.0; preinstalled cached pnpm 10.28.1. No install/download/clean-install proof. Every pnpm shell begins with `export PATH="$HOME/Library/pnpm/bin:$PATH"`; final Turbo commands additionally prepend `/private/tmp/jg-pnpm-ent-10a2` so child processes use the same pinned cached launcher. Logs: `/private/tmp/jg-ch-7-insurer-r2-*.log`. Before heavy runs memory 67–68% free and disk 85–86 GB available; no threshold failure.

| Actual command / operation | Exit / result |
| --- | --- |
| `pwd; git status --short; rg --files ...`; receipt read first | 0; clean, correct worktree. |
| `rg --files --hidden -g '!node_modules' -g '!.git'` task-path search; `cat` receipt | 0 each. |
| `cat AGENTS.md; rg -n ... BUILD_PLAN.md; ls /private/tmp/jg-orders .../jg-orders` | 1 from absent order paths. No result taken from absent paths. |
| `/private/tmp` listing / COMMANDS / BUILD_PLAN card / package reads | 0; listing output truncated, not counted as full contents inspection. Prior command inventory identified exact full-steam order path. |
| `cat` both full-steam orders; targeted A1–A7/B1–B2/order chunks, contracts/source/SQL/test reads with cat/sed/rg | Read batches 0; diagnostic batches 1 for absent guessed practice-material-pool/upgrade-proof-utils paths or cat on the launcher directory. Actual files found using rg and read. No permission refusal in those reads. |
| `git rev-parse HEAD origin/main`; newest-definition `git grep ... origin/main -- packages/db/migrations`; read-only source/diff/grant searches | 0. One lock search batch 2 from an absent guessed 0097 filename; actual 0097_recovery_case_current.sql read afterwards. No unsafe operation retried. |
| Python test-first core/DB/browser additions and saved previous-repository snapshot | 0; database/browser NOT RUN. |
| Core two-file tests-first `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/recovery-eligibility-v3.test.ts src/recovery-payment-payer.test.ts` | 1; 41 failed / 13 passed, 2 files. |
| Python core/repository implementation, 0142 comment/doc updates, own supplementary DB/API tests | 0. No merged assertion changed. |
| Same core two-file run after implementation | 0; **54 passed**, 2 files. |
| Initial `pnpm exec turbo run build --filter=@jobguard/db... --force --concurrency=2` through explicit pinned launcher but without its directory on child PATH | Interrupted **130**; child pnpm emitted v11 warning then no build completion. No pass claimed. |
| Same forced dependency build after child PATH correction | 0; **3 successful, 0 cached**. No permission escalation/cache repair. |
| Standalone DB-test `pnpm --filter @jobguard/db exec tsc --noEmit --target ES2023 --module NodeNext --moduleResolution NodeNext --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --skipLibCheck test/recovery-insurer-money.integration.test.ts` | Initial 1 (underlying tsc 2): own helper argument `fixture` shadowed factory type, TS2344. Renamed own argument to `name`; next run 0. Final supplementary-test run recorded below. Compilation only. |
| `pnpm exec turbo run typecheck --force` | 0; **7 successful, 0 cached**, 49.727s. |
| API two-file `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/recovery-eligibility-v3.application.test.ts src/recovery-payment-payer.application.test.ts` | **1**; **25 passed / 1 failed**, 2 files, exact coordinator setup failure above. Mocks, not a live integration. |
| `LANE_BASE_REF=origin/main pnpm lint --force` | 0; actual purity/lane/money/commercial checks plus **7 forced tasks, 0 cached**, 38.058s. |
| `pnpm build --concurrency=2 --force` | 0; **7 successful, 0 cached**, 1m42.017s, 30 pages generated. |
| `pnpm openapi:check` | **1 / STOP**: `Error: listen EPERM: operation not permitted /var/folders/nh/lx6ycbfd1l937f5qhj0cdvhh0000gn/T/tsx-501/29170.pipe`. No alternate route/generator tried. Original OpenAPI unchanged; CI owes official check. |
| Read-only git diff/status/whitespace checks; Python unchanged-file and routine comparison artifacts | 0; 8 unchanged files, both routine bodies exactly ee4917f, diffs against newest main recorded. |
| Python supplementary pending-F19/F18-interest DB checks and exact unpaid-bill doc reference | 0; DB tests NOT RUN, added during source inspection after final root checks. Only test definitions/docs changed. |
| `node --version`; `pnpm --version` | 0; v24.17.0 / 10.28.1. |

Turbo warned `IO error: Operation not permitted (os error 1)` during forced commands; they still completed with zero cache hits. No cache permissions workaround/escalation attempted. Build's existing CSS `end` warning is untouched. OpenAPI's socket refusal is a sandbox refusal, not an automatic approval-review rejection. No alternate route after it. Whole repository/package tests were not run under the at-most-three-file rule; all Vitest runs used maxWorkers=2, two files, one test run at a time. Database/browser suites were never invoked. No helper agent/delegation.

**NOT RUN (sandbox cannot start PostgreSQL / a browser):** `packages/db/test/recovery-insurer-money.integration.test.ts`, `packages/db/test/recovery-eligibility-v3.integration.test.ts`, `packages/db/test/tenancy.integration.test.ts`, `apps/web/e2e/CH-7.spec.ts`, `pnpm test:db`, `pnpm test:migrations`, `pnpm test:e2e`. These are owed CI checks, not passed/skipped checks. The official OpenAPI check was attempted and stopped before source generation. Fresh/upgrade/privilege/RLS/effect/audit/replay/concurrency checks and browser journeys remain unverified.

### Source inspection / handoff

Re-read the diff against ee4917f and origin/main. Only lane files changed; origin/main's unrelated FEE-PINS-1 / SV-3-ABORT merges appear as reverse diff differences because this branch starts before them. They were not edited. The lane checker uses the merge-base. No lane widening, security-pin edits, changed timeout, erased assertion, deleted file/row, merged migration change, data backfill, provider or UI source change. API/DB coordinator files are entirely unchanged; the core helper's input-only payer addition is the only pre-existing core-test-line change. Browser changes are one append only; original F21 row/count and F19 assertions stay untouched. Own Round 1 integration definitions were adapted for the new required fact/earlier lock and the previous-schema writer fixture, without relaxing their expected result or identity checks. Eight unchanged files are SHA-256 recorded in `ROUND_2_UNCHANGED_FILES.json` as receipt evidence, never permanent fingerprint tests. No implementation change followed the forced checks; only supplementary DB test definitions, docs and receipt artifacts.

0142 remains registered by name in numeric order and is not renumbered. Rollback is forward fix preserving immutable marks/reviews/lines/audit and compatible readers; an older writer may hit the stricter insurer guard. No operational alert/provider/config/credential is introduced. Work touching these eligibility routines/repository/tests must serialize with this task.

No implementation STOP remains from the F21/A6 rulings. **Handoff holds:** coordinator's three setup-only additions; CI database/browser/official OpenAPI checks; fresh Opus and separate Sol verdicts bound to the exact dispatcher commit, separate acceptance, founder merge/release. Do not describe this as accepted or fully green. Intended conventional commit subject/body written to `/private/tmp/jg-msg-ch-7-insurer.txt`; dispatcher commits after this turn. Builder committed nothing; final HEAD stays ee4917f70c29834ac2291220af8310a3a932bda9.


### Round 2 final verification / inventory

- Final standalone DB integration-test TypeScript check (same command above, including the supplementary DB16 definitions): **exit 0**, no diagnostics. No PostgreSQL execution.
- `LANE_BASE_REF=origin/main pnpm lint:lanes`: **exit 0**, ch-7-insurer passes against ec6ad4d. No lane edits.
- `git diff --check`: **exit 0**. Final read-only inventory checks every changed/untracked path against this lane, rechecks the two complete coordinator test files and OpenAPI, confirms the browser original prefix and authorized input-only core-helper change, and verifies the test-only previous repository snapshot against ee4917f. This is receipt evidence, not a permanent test.
- `ROUND_2_INVENTORY.json` records final file byte counts/hashes (receipt excluded to avoid recursion). `COMMANDS.md` is appended with the Round 2 operation inventory. Receipt and commit-message writes: exit 0. No git write.

Tracked diff against ee4917f (untracked receipt artifacts are included separately in the inventory):

```text
 .../src/recovery-payment-payer.application.test.ts |  10 +-
 apps/web/e2e/CH-7.spec.ts                          |  15 ++
 docs/contracts/recovery-eligibility-v3.md          |  18 +-
 docs/verdicts/CH-7-INSURER/BUILDER_RECEIPT.md      | 106 ++++++++++++
 docs/verdicts/CH-7-INSURER/COMMANDS.md             |  23 +++
 packages/core/src/recovery-eligibility-v3.test.ts  |  36 +++-
 packages/core/src/recovery-eligibility-v3.ts       |   9 +-
 packages/db/MIGRATIONS.md                          |   4 +-
 .../db/migrations/0142_recovery_insurer_money.sql  |   6 +-
 .../db/src/recovery-eligibility-v3-repository.ts   |  20 ++-
 .../recovery-insurer-money.integration.test.ts     | 181 ++++++++++++++++++++-
 11 files changed, 403 insertions(+), 25 deletions(-)
```

Final HEAD ee4917f70c29834ac2291220af8310a3a932bda9. Dispatcher message path: `/private/tmp/jg-msg-ch-7-insurer.txt`. Builder committed nothing.


## Catch-up round — 13 October 2026, dispatcher 3

Built by Codex. The dispatch's Claude Sonnet fallback attribution does not describe this session. This entry supersedes earlier setup-patch holds only for the checks actually executed below; it is builder evidence, not an independent verdict or acceptance. Check lane RED; not yet a PR.

Initial and final HEAD: `d9277e397ca6916859f857fb818302b7d905909f`. Incoming `origin/main`: `269874640468a6e1dfdfed63edd4ce187d1d9dbb`. Git remains in the dispatcher's in-progress merge. No git write command, commit, staging, merge completion, push, PR, install, package download, provider call or approval was performed. The committed coordinator setup patch at HEAD is unchanged.

### Scope and self-review (builder source inspection only)

Resolved exactly three conflict blocks, placing incoming main first and CH-7's original addition after it:

- `packages/core/src/index.ts:65`: main's site-extra-pricing export, followed by recovery-payment-payer.
- `packages/db/src/migrate.ts:80`: main's 0140 entry, followed by 0142. No 0141 entry: ENT-3d is not on main yet.
- `packages/db/MIGRATIONS.md:954`: main's complete 0140 section, followed by the original 0142 section at line 973.

One-off byte assertions reconstructed each file from origin/main plus the unchanged CH-7 addition; all passed. These are receipt evidence, not permanent fingerprint tests. Every marker was removed from the three files. No merged test, pinned value, lane policy, SQL migration or other source file was edited. Shared-file edits serialize this catch-up with ENT-3c; the dispatcher completes the merge. No prompt/model/schema/policy change, backfill, new alert, external action or compatibility change was introduced. Existing 0142 forward-fix guidance and synthetic/production holds remain unchanged.

Tests-first: no new test or behavior was introduced in this conflict-only round. Existing CH-7 unit files were run unchanged. No new first-failing test run is claimed; earlier implementation tests-first evidence remains in its historical sections.

### Commands and executed results

Every pnpm shell started with `export PATH="$HOME/Library/pnpm/bin:$PATH"`. Successful pnpm invocations then prepended the existing `/private/tmp/jg-pnpm-ent-10a2` launcher (cached pnpm 10.28.1); no launcher was created or changed. Heavy commands used the required `~/.local/bin/heavy-slot` with `HEAVY_SLOTS=2`. Tests used exactly two files per run, `--maxWorkers=2`, sequentially; no build/test overlap. Memory probes (`memory_pressure | tail -1`) and `df -g /System/Volumes/Data` before each heavy command exited 0: memory 64–69% free, disk 80–83 GB available. Node was v24.17.0. Dependencies were preinstalled; no clean-install proof is claimed.

| Command / operation | Exit and result |
| --- | --- |
| `pwd`, `git status --short`, `git rev-parse HEAD`, `git rev-parse origin/main`, `git diff --stat`, conflict-marker `rg`, `cat AGENTS.md` | Initial inspection batch 0; exactly three conflicted paths, HEAD/main recorded above. |
| `cat ~/.local/share/full-steam/handoffs/jobguard-task.md`; `cat`/`sed` the three conflict files, `BUILD_PLAN.md` task/contracts, recovery contract, package.json files, Turbo config, prior receipt and heavy-slot; `rg` task/test/grant/lane paths | Read-only batches 0; some long outputs truncated, targeted follow-up reads used. No evidence inferred from truncated portions. |
| `git log -4 --oneline`; source/test/lane `rg`; `sed`/`nl` lane checker, grant and acceptance searches | 0; coordinator setup patch is the current committed HEAD; source-inspected, not tested DB guarantees. |
| `command -v pnpm`; `ls -l` default launcher and guessed `~/.local/bin/pnpm`; `cat` default and existing cached launchers | Read batch 0; the guessed `~/.local/bin/pnpm` path did not exist (`ls` 1); actual launchers read. Default launcher points at global v11. |
| Python initial SHA-256 inventory and asserted main-first conflict resolution | 0; 1,619 initial files inventoried, exactly three conflict files changed. |
| `~/.local/bin/heavy-slot ch-7-insurer-typecheck pnpm exec turbo run typecheck --force` with default launcher | Interrupted 130 after pnpm v11 warning/stall, zero reported Turbo tasks. NOT a typecheck pass or executed typecheck. No packages downloaded. |
| Same exact typecheck command using the existing cached pinned launcher | **0; 7 successful, 0 cached**, 30.974s. Used `--force`; one completed execution of each task. |
| `LANE_BASE_REF=origin/main node tools/lint.mjs` | **1**; core purity passed (153 files); lane checker refused incoming main paths in the unresolved Git index. Money/commercial checks were not reached in this wrapper. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | **1**, same incoming-main paths; no allowlist change or alternate comparison base attempted. |
| `node tools/money-arithmetic-lint.mjs`; `node tools/commercial-boundary-lint.mjs` | **0 each**; money/commercial boundaries passed separately. |
| `~/.local/bin/heavy-slot ch-7-insurer-lint pnpm exec turbo run lint --force`, with `LANE_BASE_REF=origin/main` | **0; 7 successful, 0 cached**, 27.338s. Used `--force`, once. Package lint passed; root lane check remains failed as recorded above. |
| `~/.local/bin/heavy-slot ch-7-insurer-core pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/recovery-eligibility-v3.test.ts src/recovery-payment-payer.test.ts` | **0; 2 files, 54 tests passed**, 454ms. |
| `~/.local/bin/heavy-slot ch-7-insurer-build pnpm build --concurrency=2 --force` | **0; 7 successful, 0 cached**, 2m7.364s; 30 static pages. Used `--force`, once. Existing workspace-root/CSS/cache warnings remain untouched. |
| `~/.local/bin/heavy-slot ch-7-insurer-api pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/recovery-eligibility-v3.application.test.ts src/recovery-payment-payer.application.test.ts` | **0; 2 files, 26 tests passed**, 2.01s. Mocks prove application contracts, not live provider or PostgreSQL integration. Coordinator setup patch now passes its unit assertion. |
| `pnpm openapi:check` | **1 / STOP** before generation: `Error: listen EPERM: operation not permitted /var/folders/nh/lx6ycbfd1l937f5qhj0cdvhh0000gn/T/tsx-501/41102.pipe`. No alternative route, socket workaround or escalation attempted. |
| Python post-check preservation/ordering/marker assertions and SHA-256 comparison | **0**; main content exact, both additions retained, exactly three edited files, 1,616 other initial files unchanged before this receipt append. |
| `git diff --check`, `git diff --stat`, `git diff --cached --stat`, `git diff --numstat HEAD --` the three files, `git rev-parse HEAD`; final targeted `rg`, `sed`, `nl`, memory/disk probes | **0**; whitespace clean, original index still unresolved for dispatcher, no Git write. |
| Python receipt append and intended-message write; final SHA-256/marker/head verification | **0**; only receipt documentation and three conflict files edited. Final evidence verified in the final command output. |

### NOT RUN and STOPs

- `packages/db/test/recovery-insurer-money.integration.test.ts`, `packages/db/test/recovery-eligibility-v3.integration.test.ts`, `packages/db/test/tenancy.integration.test.ts`, `pnpm test:db`, `pnpm test:migrations`: **NOT RUN (cannot start PostgreSQL here; explicitly excluded by catch-up order)**. This includes upgrade, privilege/RLS, audit and concurrency proofs.
- `apps/web/e2e/CH-7.spec.ts`, `pnpm test:e2e`: **NOT RUN (cannot start a browser here; explicitly excluded by catch-up order)**.
- Official OpenAPI verification: **NOT COMPLETED**, command exited 1 at the sandbox socket refusal above. No schema-generation pass is claimed.
- Lane/root boundary wrapper: **BLOCKING check failure** at `tools/agent-lane-boundary-lint.mjs:233`. The checker includes cached incoming-main paths before merge completion (lines 227–229); all reported paths were already in the starting merge and remain byte-identical. Dispatcher must complete the merge and obtain checks on that head; no rule was weakened.
- Shared helper telemetry emitted `sysctl: sysctl fmt -1 1024 1: Operation not permitted`, `sysmon request failed with error: sysmond service not found`, and `pgrep: Cannot get process list`. These internal probes could not verify load/process counts. The supplied helper continued and returned each wrapped command's exit; no telemetry bypass/helper edit, standalone retry, or permission escalation was attempted. Memory/disk probes above worked. Turbo also reported `IO error: Operation not permitted (os error 1)` warnings but all completed forced tasks had zero cache hits; no cache-permission workaround was attempted.

### GRANT inventory

No new or modified GRANT in this catch-up. The inherited 0142 migration is SHA-256 unchanged; its complete existing grant list remains:

1. `0142:13`: `GRANT EXECUTE ON FUNCTION app.recovery_job_payer_type(uuid,uuid) TO jobguard_runtime`.
2. `0142:39`: `GRANT SELECT ON app.recovery_payment_payer_mark TO jobguard_runtime`.
3. `0142:69`: `GRANT EXECUTE ON FUNCTION app.lock_recovery_payer_job(uuid,uuid,uuid) TO jobguard_runtime`.
4. `0142:179`: `GRANT EXECUTE ON FUNCTION app.write_recovery_payment_payer_mark(uuid,uuid,jsonb) TO jobguard_runtime`.

Standard F: no new direct INSERT/UPDATE/DELETE grants to jobguard_runtime on money, membership, authorization, receipt or audit tables; runtime has SELECT only on the inherited mark table and writes through its checked routine. This round source-inspected existing grants; database verification was NOT RUN.

### Preservation evidence

Full initial SHA-256 inventory: `/private/tmp/ch-7-insurer-catchup-before.json` (1,619 paths). After checks, all 1,616 paths other than the three conflict files were unchanged; this receipt is the only subsequent documentation edit. No test pins were introduced. Final content hashes below include the unchanged setup-patch tests and security/lane/lock files:

| File | SHA-256 |
| --- | --- |
| packages/core/src/index.ts | 10284867e92df107d50f7f04a947d744cd19da52b60ff1964902fe13874d52a4 |
| packages/db/MIGRATIONS.md | a1bee221ff2b876637f7f7ceab57ba525e02aa07b8879e08d9967ae5b1cfa571 |
| packages/db/src/migrate.ts | 3318f9eab84cd216bf1b8af01ee8114dd9b073341de5de616e27e48f5006b743 |
| packages/db/migrations/0142_recovery_insurer_money.sql | eb6067e4a73f91e198502fe1886e2498710a413c1836308b650f13243e4b3865 |
| apps/api/src/recovery-eligibility-v3.application.test.ts | 9c915222c20f601b5330292d94516354bf7d02453c3b5c4898703aa32d1ab465 |
| packages/db/test/recovery-eligibility-v3.integration.test.ts | 8d510762057de627398d8df071bce4b0ada3f21f33e09b00082d8d7d1526307a |
| apps/api/src/auth/context-boundary.test.ts | a848f5e873ca9cc0811e90adf5a35ae18fe4f1ae1da5f889f00ea29ccd287d35 |
| config/agent-lane-assignments.json | 12dd6fc9b55155710a1834b557a4fba5c3c3733e394404b821535353588d0bd7 |
| packages/core/src/watchdog.ts | efe6f104c0a9e7ae408ce661b23fcbd181a11eb6dce65624ba61b14a73ff9de9 |
| packages/db/test/watchdog-command-harness.ts | 3bad6abf073b44b84575a7421ddaf7b275d9a75d2d93b20bcf744ed4d3fbbbd6 |
| packages/db/test/command-replay-contract.integration.test.ts | db2315937aad7fe0443f020060a2575aa79f509ec344a35dd8387626ba5de62f |
| pnpm-lock.yaml | 06b501e413424d77fc5c3a1ac0f481b7230c271e36bfbde2cb953385ccccd349 |

`git diff --stat` before this receipt append (Git still has unmerged index entries, even though the working-tree markers are removed):

```text
 packages/core/src/index.ts | Unmerged
 packages/core/src/index.ts |  1 +
 packages/db/MIGRATIONS.md  | Unmerged
 packages/db/MIGRATIONS.md  | 19 +++++++++++++++++++
 packages/db/src/migrate.ts | Unmerged
 packages/db/src/migrate.ts |  1 +
 3 files changed, 21 insertions(+)
```

The original staged incoming merge is 40 files, 4,210 insertions, 11 deletions plus the three unmerged entries; it was present at task start and its files were not edited. Full staged-stat snapshot:

```text
 BUILD_PLAN.md                                      |   2 +
 apps/api/openapi.json                              | 180 ++++++
 apps/api/src/app.module.ts                         |   3 +-
 apps/api/src/auth/context-boundary.test.ts         |   2 +-
 apps/api/src/auth/sso/saml-fixlater-6.test.ts      |  93 ++++
 .../site-extra-pricing.application.test.ts         | 190 +++++++
 .../contractor/site-extra-pricing.controller.ts    |  43 ++
 .../src/contractor/site-extra-pricing.http.test.ts | 130 +++++
 apps/api/src/contractor/site-extra.application.ts  |  53 ++
 apps/api/src/workspace/application.ts              |   2 +-
 apps/api/src/workspace/index.ts                    |   1 +
 .../contractor/jobs/[id]/order-check/route.test.ts |  30 +
 .../api/contractor/jobs/[id]/order-check/route.ts  |  17 +
 .../jobs/[id]/site-extras/sor/route.test.ts        |  47 ++
 .../contractor/jobs/[id]/site-extras/sor/route.ts  |  19 +
 .../contractor/jobs/[id]/sor-items/route.test.ts   |  29 +
 .../api/contractor/jobs/[id]/sor-items/route.ts    |  16 +
 apps/web/e2e/SV-3.spec.ts                          |  26 +-
 config/agent-lane-assignments.json                 |   9 +-
 docs/contracts/site-extra-pricing-v1.md            | 126 +++++
 docs/verdicts/ENT-3c/BUILDER_RECEIPT.md            | 488 +++++++++++++++++
 docs/verdicts/FEE-PINS-1/BUILDER_RECEIPT.md        | 107 ++++
 docs/verdicts/FIXLATER-6/BUILDER_RECEIPT.md        | 138 +++++
 docs/verdicts/SV-2/BUILDER_RECEIPT_main-merge.md   |   6 +
 docs/verdicts/SV-3-ABORT/BUILDER_RECEIPT.md        |  61 +++
 .../core/src/enterprise-domain/fee-pins.test.ts    |  78 +++
 packages/core/src/index.ts                         | Unmerged
 packages/core/src/site-extra-pricing.test.ts       | 213 +++++++
 packages/core/src/site-extra-pricing.ts            | 142 +++++
 packages/core/src/watchdog.ts                      |   3 +
 packages/db/MIGRATIONS.md                          | Unmerged
 packages/db/migrations/0140_site_extra_pricing.sql | 257 +++++++++
 packages/db/src/migrate.ts                         | Unmerged
 packages/db/src/site-extra-pricing-queries.ts      |  62 +++
 packages/db/src/site-extra-repository.ts           | 121 ++++
 ...erprise-identity-fixlater-6.integration.test.ts | 284 ++++++++++
 packages/db/test/extra-origin.integration.test.ts  |   2 +-
 .../site-extra-order-check.integration.test.ts     | 177 ++++++
 .../site-extra-pricing-basis.integration.test.ts   |  69 +++
 packages/db/test/site-extra-pricing-fixtures.ts    | 188 +++++++
 .../site-extra-pricing-upgrade.integration.test.ts | 193 +++++++
 .../db/test/site-extra-pricing.integration.test.ts | 610 +++++++++++++++++++++
 packages/db/test/tenancy.integration.test.ts       |   4 +
 40 files changed, 4210 insertions(+), 11 deletions(-)
```

| Local check log | SHA-256 |
| --- | --- |
| /private/tmp/ch-7-insurer-catchup-api.log | 07f7b490f159d4d9679d45db7bac5cb12d6df7f72d9ad05c1247c91d99839bfa |
| /private/tmp/ch-7-insurer-catchup-boundaries.log | f807139eb07a8e44a038ffa8a09c4dd1273406c1975dd4e4ce01ec7fdb18fc3f |
| /private/tmp/ch-7-insurer-catchup-build.log | 1dbb1e1890b70cf6fc240d2791432c7eae8b2aaf74bd93d65e574f42a796ebce |
| /private/tmp/ch-7-insurer-catchup-core.log | 721f92efaeca45a90842a4cebbb8afd5a40b147eeff30882133af5d605abf635 |
| /private/tmp/ch-7-insurer-catchup-lanes.log | ac41d9e1bbe7c51a029b6c7af32f0901026330ad4f0582cfe1df84625bd37f4c |
| /private/tmp/ch-7-insurer-catchup-lint.log | 85148a577def642b018491fa697071b8d9a8ad5c505288dab11e1ed2b9774a35 |
| /private/tmp/ch-7-insurer-catchup-openapi.log | 25e846006b62f4b774790fd32c979d8060f75f43f82d2c15e35be3e6b26a5b66 |
| /private/tmp/ch-7-insurer-catchup-typecheck-pinned.log | 145254258800e9556035e8392f857c172d39352e9c60052e7e27372a9b4a0989 |
| /private/tmp/ch-7-insurer-catchup-typecheck.log | 102793ff63f14838e2128a536735d9bfe137d42109599a180da7e8bf73ab2cc4 |

Handoff remains RED: independent exact-commit verdicts, separate acceptance, database/browser/OpenAPI and lane verification on the completed merge belong to the dispatcher/reviewers/CI. No acceptance claimed. Final unchanged HEAD: `d9277e397ca6916859f857fb818302b7d905909f`. Intended merge message: `/private/tmp/jg-msg-ch-7-insurer.txt`. Dispatcher alone completes and commits this merge.


## Repair r4 — 13 October 2026, dispatcher 3

Actual builder: Codex. The existing truthful first-line attribution is retained; Codex was available in this session. Initial and final HEAD: `c97581cdc3c9e4a95e266ff939bed98ceb5ac135`. No commit, index write, branch change, push, acceptance or independent verdict was made by the builder.

### Repairs and tests-first evidence

- `packages/db/test/recovery-insurer-money.integration.test.ts:112`: cast the `format` argument to `text`, resolving the reported 42P18 setup ambiguity. Existing assertions are preserved.
- `packages/db/src/recovery-eligibility-v3-repository.ts:55`: detect the payer table introduced atomically by 0142 before using that schema. The merged timing upgrade proof executes the CURRENT repository at `recovery-timing-pin.integration.test.ts:326` after installing only migrations before 0127. Its call fails at the repository query, before any 0142 routine exists. This is absence of the helper, not an overload ambiguity in a restated SQL routine. Explicit UUID casts are also added to the repository helper call at line 58.
- Before 0142, the repository retains the earlier payer-independent evaluation and the earlier database guards. Once the payer table exists, the exact original advisory lock, checked job-lock helper and payer decision remain required; a missing helper is not caught or ignored. Membership, job ownership, revision and replay checks still precede this schema check. Migration 0142 is byte-identical; all its helper arguments inside PL/pgSQL are already UUID values and the helper is created before its callers.
- Added `[r4 AC9] current repository reviews F18 before the payer migration exists` in this piece's integration file at line 131, with its pre-0142 setup at lines 122–123. It uses the actual current repository, real database guards and F18 evaluator, then includes its saved rows in the existing upgrade comparison. The test was written BEFORE the repository repair and setup cast. First local failing run: **NOT RUN (database suites expressly excluded; cannot start PostgreSQL here)**. The supplied CI run 38441477159 on the initial head is the pre-repair failure evidence: 42P18 in this piece's setup and 42883 in merged AC9, 117 passing DB files, 2 failing files, 1703 passing tests, 1 failing test, 39 skipped. This is CI evidence supplied by the dispatcher, not a local reproduction. The new test awaits CI execution.
- No merged test, pinned list/value, fingerprint, watchdog registration/harness or coordinator patch file was edited. Both files changed by coordinator commit d9277e3 remain byte-identical to the supplied head.

### OpenAPI N2 — STOP / verification still owed

Ran the documented `pnpm --filter @jobguard/api openapi:generate`, exit **1** before the generator source executes. Exact refusal: `Error: listen EPERM: operation not permitted /var/folders/nh/lx6ycbfd1l937f5qhj0cdvhh0000gn/T/tsx-501/85374.pipe` (Node v24.17.0). No alternate launcher, compiled generator, escalation or socket workaround was attempted after that refusal. `pnpm openapi:check` is **NOT RUN** because it invokes the same denied generator wrapper. Dispatcher/CI must run generation and the official check on the committed repair.

Source inspection: the insurer command dispatches through the existing `/jobs/{id}/recovery-cases/eligibility` action. This piece changes no Swagger controller annotations, path, operation summary or registered schema. Its body is `unknown` and no Zod-to-Swagger response schema is registered. The existing OpenAPI entry at `apps/api/openapi.json:1944` already describes that unchanged action. Expected generator output for this piece is therefore unchanged (an inference from source, not an executed generator comparison); no supported manual artifact edit was identified. `apps/api/openapi.json` is byte-identical. N2 has no local PASS; the generator/check hold remains.

### Executed commands and results

All pnpm commands started with `export PATH="$HOME/Library/pnpm/bin:$PATH"`, then prepended the pre-existing `/private/tmp/jg-pnpm-ent-10a2` launcher for cached pnpm 10.28.1. Node: v24.17.0. Dependencies were already installed; no download, install or clean-install claim. Heavy commands used `HEAVY_SLOTS=2` and `~/.local/bin/heavy-slot`, sequentially, with no test/build overlap. Vitest runs had two explicit files each and `--maxWorkers=2`. Every pre-heavy `memory_pressure | tail -1` and `df -g /System/Volumes/Data` exited 0: 67–68% free memory, 78–79 GB disk available, above the required floors.

| Command | Exit / counts / result |
| --- | --- |
| `pwd`; `git status --short`; `git rev-parse HEAD`; `git rev-parse origin/main`; `git show --stat d9277e3`; `git diff --check`; `git diff --stat`; `git diff --name-only`; targeted `git diff --` source/test | 0 each; initial tree clean, unchanged HEAD; whitespace clean. Read-only Git commands only. |
| `cat AGENTS.md`; `cat ~/.local/share/full-steam/handoffs/jobguard-task.md`; `cat` the supplied CI excerpt; `sed` applicable BUILD_PLAN CH-7 and contracts, 0142, repository, both integration files and earlier receipt; package/config/controller/bootstrap/generator and prior OpenAPI note inspection via `cat`, `sed`, `rg`, `nl`, `head`, `tail`; `command -v pnpm`; `node --version`; cached launcher/heavy-slot inspection | Read-only inspections succeeded, except the following explicitly recorded missing-path probes. Long combined output was narrowed with targeted reads; no implementation-test claims from source inspection. |
| Initial `rg`/`cat` probes for `apps/api/src/recovery-payment-payer.controller.ts`, `apps/api/src/recovery-payment-payer.contracts.ts` and `apps/api/src/workspace.controller.ts` | Missing paths; grouped commands exited 2, 1 and 0 respectively. Actual dispatch/controller located by subsequent source searches; no files created at guessed paths. |
| Python tracked-file SHA-256 baseline inventory | 0; 1,619 tracked paths snapshotted to `/private/tmp/ch-7-insurer-r4-before.json`. |
| `apply_patch` test-first regression addition; setup cast and repository repair | Successful; only this piece's repository/test changed. No local DB first-failing run. |
| `pnpm --filter @jobguard/api openapi:generate` | 1; socket EPERM before generation, STOP as above. |
| `~/.local/bin/heavy-slot ch-7-insurer-r4-core pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/recovery-eligibility-v3.test.ts src/recovery-payment-payer.test.ts` | **0; 2 files, 54 tests passed**, 415ms. |
| `~/.local/bin/heavy-slot ch-7-insurer-r4-api pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/recovery-eligibility-v3.application.test.ts src/recovery-payment-payer.application.test.ts` | **0; 2 files, 26 tests passed**, 2.00s. These mocks prove application contracts, not PostgreSQL or live provider behavior. |
| `~/.local/bin/heavy-slot ch-7-insurer-r4-typecheck pnpm exec turbo run typecheck --force` | **0; 7 successful tasks, 0 cached**, 48.293s; once with `--force`. |
| `LANE_BASE_REF=origin/main node tools/lint.mjs` | **0**; core purity (153 TS files), lane, money arithmetic and commercial boundaries passed. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | **0**; ch-7-insurer lane passed against origin/main 269874640468a6e1dfdfed63edd4ce187d1d9dbb. No lane-file edits. |
| `~/.local/bin/heavy-slot ch-7-insurer-r4-lint pnpm exec turbo run lint --force`, `LANE_BASE_REF=origin/main` | **0; 7 successful tasks, 0 cached**, 37.564s; once with `--force`. Root lint wrapper checks executed separately above. |
| `~/.local/bin/heavy-slot ch-7-insurer-r4-build pnpm build --concurrency=2 --force` | **0; 7 successful tasks, 0 cached**, 1m4.181s; once with `--force`. |
| Python post-check hash/preservation assertions; receipt append; intended commit-message write; final tracked-file inventory and Git diff/HEAD inspection | 0; only the two repair files and this appended receipt differ from the initial head. |

The required heavy-slot helper printed `sysctl: sysctl fmt -1 1024 1: Operation not permitted`, `sysmon request failed with error: sysmond service not found` and `pgrep: Cannot get process list`; it continued and the specified commands ran. No alternative telemetry route was attempted. Separate memory/disk probes passed. Turbo printed IO permission warnings while completing all forced tasks. Existing Next workspace-root/CSS/cache warnings were left untouched.

Full command logs: `/private/tmp/ch-7-insurer-r4-{core,api,typecheck,lint,build,boundaries,lanes,openapi-generate}.log`.

### NOT RUN

- `packages/db/test/recovery-insurer-money.integration.test.ts` (including new r4 AC9), `packages/db/test/recovery-timing-pin.integration.test.ts`, `packages/db/test/recovery-eligibility-v3.integration.test.ts`, `packages/db/test/tenancy.integration.test.ts`, `pnpm test:db`, `pnpm test:migrations`: **NOT RUN (cannot start PostgreSQL here; DB suites expressly excluded by this repair order)**. Includes schema compatibility, RLS, privileges, audit, concurrency and migration verification.
- `apps/web/e2e/CH-7.spec.ts`, `pnpm test:e2e`: **NOT RUN (cannot start a browser here; browser suites excluded)**.
- `pnpm openapi:check`: **NOT RUN (documented generator wrapper denied its IPC socket)**. Generation attempted and failed; no generated-artifact pass claimed.
- Whole-package/repository test suites: **NOT RUN (dispatcher owns them; memory limits)**. Clean install: **NOT RUN (preinstalled dependencies; no downloads allowed)**. Live providers/models, eval and release checks: **NOT RUN / not changed by this repair**.

### Grants and Standard F

New GRANTs in r4: **none**. No SQL migration bytes changed. For the existing 0142 grant inventory required by the order, one line each:

- `0142:13`: `GRANT EXECUTE ON FUNCTION app.recovery_job_payer_type(uuid,uuid) TO jobguard_runtime;`
- `0142:39`: `GRANT SELECT ON app.recovery_payment_payer_mark TO jobguard_runtime;`
- `0142:69`: `GRANT EXECUTE ON FUNCTION app.lock_recovery_payer_job(uuid,uuid,uuid) TO jobguard_runtime;`
- `0142:179`: `GRANT EXECUTE ON FUNCTION app.write_recovery_payment_payer_mark(uuid,uuid,jsonb) TO jobguard_runtime;`

Standard F: application login has SELECT only on the new money-fact table; there is no direct INSERT, UPDATE or DELETE grant. Writes continue through the existing session-bound SECURITY DEFINER writer with its own owner/role check. No contractor route, permission, watchdog guard or replay contract is changed in r4.

### Self-review (builder source inspection only)

Affected guarantees: exact SQL parameter typing and compatibility of the current synthetic repository with earlier upgrade schemas. Membership and persisted session checks, revision checks, durable command identity, audit payloads, payer-origin rules and current-schema locks remain intact. No new external action, migration/backfill, environment setting, operational alert, prompt or model change. Compatibility change is limited to pre-0142 synthetic schemas; current-schema financial logic is unchanged. The migration's existing forward-fix/rollback guidance remains in force. No merged assertion was weakened or edited and no new byte/hash-pinning test was added. No STOP requiring merged-test before/after edits arose. Database execution and exact-head CI remain necessary evidence; this is neither an independent review nor acceptance.

### Byte-preservation evidence

Before receipt append, only the two repair files changed and 1,617 other tracked files were byte-identical. After this appended receipt, only those three paths differ; all 1,616 other tracked paths remain byte-identical. Full inventories: `/private/tmp/ch-7-insurer-r4-before.json` and `/private/tmp/ch-7-insurer-r4-after.json`. Selected final SHA-256 values (receipt excluded to avoid a self-hash):

| File | SHA-256 |
| --- | --- |
| `packages/db/src/recovery-eligibility-v3-repository.ts` | `ab6374d12d4083460066b9b3ad4452636c8dda2789b7020b1049ccef1edd800f` |
| `packages/db/test/recovery-insurer-money.integration.test.ts` | `67e63b2245366170c2ba79bfefcac2f665621e6ec5b411cf124453c1f9da9f07` |
| `packages/db/test/recovery-timing-pin.integration.test.ts` | `a2f06daecbdbefd75e28617825dbb92e67627113d7854e558b5cce88046a4e0f` |
| `apps/api/src/recovery-eligibility-v3.application.test.ts` | `9c915222c20f601b5330292d94516354bf7d02453c3b5c4898703aa32d1ab465` |
| `packages/db/test/recovery-eligibility-v3.integration.test.ts` | `8d510762057de627398d8df071bce4b0ada3f21f33e09b00082d8d7d1526307a` |
| `packages/db/migrations/0142_recovery_insurer_money.sql` | `eb6067e4a73f91e198502fe1886e2498710a413c1836308b650f13243e4b3865` |
| `apps/api/openapi.json` | `c368255cd5e89140d2c4d6422a373edab192e478c773ddf20fed1a21a51413b5` |
| `config/agent-lane-assignments.json` | `12dd6fc9b55155710a1834b557a4fba5c3c3733e394404b821535353588d0bd7` |

Repair diff from the supplied head (not the complete PR diff):

```text
 docs/verdicts/CH-7-INSURER/BUILDER_RECEIPT.md      | 92 ++++++++++++++++++++++
 .../db/src/recovery-eligibility-v3-repository.ts   |  7 +-
 .../recovery-insurer-money.integration.test.ts     |  8 +-
 3 files changed, 105 insertions(+), 2 deletions(-)
```

Final unchanged HEAD: `c97581cdc3c9e4a95e266ff939bed98ceb5ac135`. Intended commit subject/body: `/private/tmp/jg-msg-ch-7-insurer.txt`. Dispatcher commits; RED-lane exact-head CI, independent recorded verdict and separate acceptance remain outstanding. OpenAPI generator/check STOP remains as documented above.
