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
