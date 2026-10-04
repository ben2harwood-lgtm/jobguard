VERDICT: PASS
HEAD: db6d5f0f99048c7a9638d0c55eebabc5fb378068

No new P1, P2 or P3 repair findings. PASS applies to this synthetic repair; technical acceptance, merge and release remain separate.

Source-inspected findings and acceptance:

- **Previous C1 P2 fixed:** `apps/web/e2e/M4-2-S.spec.ts:17–32` creates separate browser contexts, copies only `jg_session`, requires a cookie-free request to return 401, and checks persisted case/source identity and eligibility revisions through server responses and rendered UI. It runs at five approved/superseded states.
- **Approval lifecycle fixed:** `packages/db/src/recovery-case-repository.ts:39–44` checks exact revisions, requires `reviewed` status, and rejects backwards evidence/policy revisions. Tests cover evidence/case/policy supersession, repeat approval, exact replay, concurrent approvals and differently cased IDs.
- **Reviewer fix verified:** repository lines 30–35 check the recorded owner membership, identity, tenant, expiry and revocation under lock; lines 45–46 record that membership in the revision and audit. This remains a synthetic principal, not real-user authentication.
- **All three task Done-when lines checked:** £320 eligibility without a landing/fee effect; six exact exclusions; unknown basis/causation held pending; stale/current-revision bypasses refused; forged eligibility fields rejected; production D03 unchanged. The classifier now explicitly says settlement is unverified.
- **C1–C8 inspected within repair scope:** shared Nest/Next service, authoritative persistence, synthetic boundary, existing RLS/grants, transactional audit, authorization/race coverage, browser assertions and CI safeguards. The Jobs-card substitute remains the stated founder decision.

The diff contains 19 task-related files. Only lane `m4-2-s-repair` changes. No founder-reserved capability is enabled, no tests are weakened/skipped, and no timeouts or retries increase. No migration is added; allocated `0044` remains unused.

Local execution:

| Command | Exit | Result |
|---|---:|---|
| `pnpm typecheck --force` | 0 | 7 tasks, uncached |
| `LANE_BASE_REF=origin/main pnpm lint --force` with scratch PR event | 0 | Guards and 7 tasks, uncached |
| `pnpm lint:lanes` with the same event | 0 | All 19 files allowed |
| `pnpm turbo run build --filter=@jobguard/api... --force` | 0 | 6 tasks |
| Core package tests | 0 | 384 tests across 68 files, including source/compiled duplicates |
| Web package tests | 0 | 63 tests |
| Full API tests | 1 | 82 passed; unchanged health test failed because socket binding returns EPERM |
| Eligibility API tests separately | 0 | 8 tests |
| DB unit test `src/demo-seed.test.ts` | 0 | 3 tests |
| OpenAPI generator via `node --import tsx … --check` | 0 | Matches |
| Independent `/tmp/m42-independent.mts` | 0 | 3 tests |

My independent tests exercise combined evidence/policy supersessions, exclusions and forged authority at money boundaries, and session/mode rejection before database access.

Initial lint commands refused the detached HEAD; the scratch event supplied the exact registered branch/base/head without changing Git. Initial unit execution lacked built workspace dependencies. The scratch test’s first launch needed a CommonJS import correction. These failed attempts are not counted as passes.

Database/browser execution relied on [CI run 37168944523](https://github.com/ben2harwood-lgtm/jobguard/actions/runs/37168944523), whose logs show this exact head merged into base `b039abf`: **155 DB tests**, including **12 recovery-case tests** and the migration suites; **164 browser tests**; successful build, OpenAPI, dependency review and secrets scan. Repair-4’s receipt additionally records **6 task browser passes**, with its disclosed local browser override.

I did not locally execute PostgreSQL, browser suites, a clean install or the full web build. No live providers, real data, deployment or release were verified.

OPEN FOR BEN remains unchanged: accept or replace the Jobs-card substitute, correct PR #85’s historical record, and reconcile the `case-fee` assertion when merging #103. No tracked files were edited, committed or pushed.

---

_Provenance (added by the technical-acceptance actor, 4 October 2026): the text above is copied verbatim from `~/.local/share/full-steam/jg-runs/m4-2-s-r-solcheck-20261004T025538.md` on Ben's Mac (GPT-6.1 Sol, high reasoning, via the local Codex CLI check runner `jg-solcheck.sh`, finished 2026-10-04 03:00 local). It binds head `db6d5f0f99048c7a9638d0c55eebabc5fb378068`. Its `/tmp/...` reference points at the checker's scratch file and is not part of this repository._
