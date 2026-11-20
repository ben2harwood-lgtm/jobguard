# TOMMY acceptance response-loss recovery — builder receipt

## Exact scope and original base

- Original and locally tested base: `896a701157ef71c81905da93bca4299d105c775a`.
- Branch: `codex/sandbox/tommy-acceptance-recovery-20261119`.
- Worktree: `/workspace/scratch/e06a45857489/jobguard-acceptance-ux-fix`.
- Task: contain quote-acceptance transport/JSON failures, hold conflicting acceptance actions, and recover from authoritative saved facts or an explicit identical-command retry.
- Contracts inspected: `AGENTS.md` §§5.2–5.4, 5.10 and 5.13; `BUILD_PLAN.md` §5.1 and C5; the existing acceptance route, command schema, repository projection and exact-operation replay path.
- RED piece: independent review of the final candidate is required. This is builder evidence, not approval, merge or deployment authority.

The acceptance POST previously escaped on transport/JSON failure, minted a fresh command on every tap, and left its controls available after an unknown result. The correction is confined to the acceptance UI and its client reader/tests. There is no server/API, database, fee, policy, provider or worker change.

## Resulting behavior

The first acceptance tap freezes the complete command and serialized bytes, including its operation ID, exact document identity/hash/version, customer claim, method and timestamp. A synchronous guard prevents a second acceptance or contradictory acceptance action before React rerenders. An unresolved result holds the quote controls and the separately rendered Start control; recovery controls remain usable outside that held fieldset. The uncertainty panel receives focus and gives explicit saved-read and identical-retry actions.

The recovery reader validates the existing version-1 projection and current job before applying it. Only an active acceptance matching the original document and claimed facts releases an unknown write through a GET. Empty, failed, malformed, wrong-job or different-facts reads keep the frozen operation and hold. An explicit retry sends the identical original bytes; there is no automatic acceptance POST. Initial `INVALID_QUOTE` and `STALE_ACCEPTANCE` refusals are recognized only at their existing pre-command boundaries; those responses on a retry cannot erase an earlier unknown outcome. The legacy `DATABASE_UNAVAILABLE`/400 response remains uncertain.

POST/JSON uncertainty ends before the downstream `onCommitted` refresh is called. If that later refresh fails after a validated successful response or saved read, the acceptance remains confirmed and the UI reports only the refresh failure. Job changes, unmounts and stale focus reads cannot apply late acceptance results. A quote becoming read-only continues to permit saved reads while refusing the retry, including an already captured retry handler.

## Executed checks — 19 November 2026

Commands used the pinned pnpm executable at `/workspace/scratch/e06a45857489/jobguard-test-toolchain/node_modules/.bin/pnpm`. Logs are in `/workspace/scratch/e06a45857489/recovery-failure/`.

| Check | Executed result | Log |
|---|---|---|
| `pnpm install --offline --frozen-lockfile` | Exit 0; lockfile unchanged | `acceptance-recovery-install.log` |
| `pnpm exec turbo run build --filter='@jobguard/web^...'` | Exit 0; dependencies built | `acceptance-recovery-dependency-build.log` |
| New double-submission test against the unchanged baseline QuoteEditor | Expected RED: one failed, 16 filtered; observed two acceptance POSTs instead of one, plus admitted contradictory handlers. Candidate source restored in `finally`. | `acceptance-recovery-red.log` |
| Focused recovery tests plus the four existing QuoteEditor suites, `vitest run ... --maxWorkers=1 --reporter=verbose` | 68 passed in five files; includes 22 new recovery cases | `acceptance-recovery-focused.log` |
| `pnpm --filter @jobguard/web typecheck` | Exit 0 | `acceptance-recovery-typecheck.log` |
| `playwright test --list e2e/TOMMY-acceptance-recovery.spec.ts` | Four executions discovered: two cases at 360×800 and 1280×800 | `acceptance-recovery-e2e-discovery.log` |
| Full repository lint against the pinned base | Exit 0: core purity (430 files), six-path lane, money arithmetic, and PL/pgSQL checks (429 migrations); 11 existing computed-import notices | `acceptance-recovery-lint.log` |
| `git diff --check` | Exit 0 | No output |

The focused cases cover lost committed replies, malformed successful POST bodies, an empty saved read followed by byte-identical retry, database-unavailable responses, failed/malformed/wrong-job reads, different saved acceptance facts, same-tick double submission and contradictions, known initial refusals versus unknown retries, post-success refresh failures, job changes, unmount, stale focus reads and a later read-only state.

## Real-server browser regression supplied

`TOMMY-acceptance-recovery.spec.ts` builds the fictional quote through the real UI and commands. In one case, `route.fetch` forwards and commits the real acceptance once, and only its reply is lost. The test requires visible, focused recovery; disabled conflicting controls; a GET-only recovery; no uncaught page error; one acceptance/event/operation; a durable receipt for the original command; and stable facts after reload.

The second case aborts before forwarding, verifies the real database still contains no acceptance/event/operation, performs an authoritative empty read while the UI remains held, then explicitly retries the same original command and requires byte-for-byte equality of the raw POST body plus exactly one effect and receipt. Neither case fulfills a fake success response. External delivery remains the repository's labelled deterministic fake worker.

After the full end-state and reload assertions, each case prints `TOMMY_ACCEPTANCE_RECOVERY_RECEIPT` with its fault mode, viewport project, job, POST count, database counts, original command ID, browser-error count and raw-retry equality. This supplies compact evidence in passing job logs without printing customer claim text; passing Playwright attachments are not uploaded by the current workflow.

These four browser executions were discovered and typechecked, **not executed locally**. Required CI must supply their actual pass/fail evidence.

## Remaining boundaries and integration handoff

- No local browser/PostgreSQL session, full repository test suite, production web build, push, merge or deployment was performed for this candidate.
- The frozen command is kept for the mounted editor. This change does not add persistent recovery across reloads or devices. Reload continues through the existing authoritative saved-read path; the supplied browser test checks reload after a resolved acceptance.
- A nonmatching or unavailable saved view does not prove the original command failed; the hold deliberately remains. No operation-status API was added.
- This isolated delta is based on the original main SHA above. The coordinator intends to apply it to a separately recorded integration base for required CI. The integration base and combined test result must be recorded against that actual assembled tree; earlier per-PR passes do not certify it.
- Independent exact-head review and final required CI remain outstanding. The builder does not approve its own work.
