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
