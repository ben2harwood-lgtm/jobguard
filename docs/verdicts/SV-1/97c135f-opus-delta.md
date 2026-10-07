VERDICT: PASS — bound to head 97c135faa5e52333df6b571e8d04fe48acb7b716
Reviewer: fresh Claude Opus 5.5 review agent spawned by the JobGuard integrator session (7 Oct 2026); did not build, repair or order any commit in this PR.

**Delta re-check.** The earlier Opus PASS (bound to 77769fc, [comment](https://github.com/ben2harwood-lgtm/jobguard/pull/111#issuecomment-6039677639)) still holds. The only new commit is merge 97c135f, which brings in main at c6deb4f (ENT-4a #110, SEC-DEPS #113, TEST-STAB-3 #114, OUTBOX-ADAPTER-1 #112). Outside the two conflicted files, the PR's change is byte-for-byte what was reviewed before. Both conflicts were resolved as exact unions. ENT-4a's enterprise domain and SV-1's shadow domain share no exported name, and nothing SV-1 relies on has changed. CI on this head is fully green.

## Findings

**P1:** none. **P2:** none.

**P3 (carried forward unchanged, not new):** the three non-blocking residuals in the 77769fc verdict still apply as written: cross-route line identity still includes category and case, the pre-lock duplicate marker, and SH-1's comparator being private. They sit in `success-fee.ts` and `signal.ts`, which are byte-identical to 77769fc, so their status has not moved. They stay with CH-7 / M4-8-S / SV-2–SV-3 as that verdict said.

**Note (pre-existing, not SV-1):** four exported names in core differ only by letter case: `money`/`Money`, `exactPence`/`ExactPence`, `feeStatementInputV1`/`FeeStatementInputV1` and `feeWhatIfInputV1`/`FeeWhatIfInputV1`. Each is a schema value paired with a type of the same name. That is legal and none of them come from the shadow domain.

## 1. Head and merge identity
- PR head is `97c135faa5e52333df6b571e8d04fe48acb7b716`. I checked it at the start and again before posting. Its parents are `77769fc` (the reviewed PR head) and `c6deb4f` (= origin/main now). The merge base of 77769fc and c6deb4f is `a5ed99a`.

## 2. The merge changed nothing except the two resolved files
- I compared `git diff c6deb4f...77769fc` (the reviewed PR change, measured from its merge base) with `git diff c6deb4f 97c135f` (the PR change at the new head), leaving out `config/agent-lane-assignments.json` and `packages/core/src/index.ts`. They are **byte-identical**: both 176,170 bytes, SHA-256 `6a93493becafc761a3a8df835690231310fcadfb3e8ec3f4161094f6d46db22f` for each, and `cmp` agrees.
- **Same changed-file set:** 23 paths in both ranges, name lists SHA-256 `d61ca010f62393b983b423efc855de359f9cf9450b54bbadd448823585a7dcce` for each. There are 21 additions (the shadow-domain module, its tests and the two SV-1 receipts) and 2 modified files, the two conflicted ones. Because `c6deb4f..97c135f` touches only PR paths, every file main changed is carried into the head untouched.
- **Lane registry at 97c135f:** it parses, and its top-level keys are `version` and `lanes`, the same as main (`version` equal). Its lanes are exactly main's 84 lanes in main's order, followed by `sv-1`. That `sv-1` entry is deep-equal to the one at 77769fc (branch `codex/sandbox/sv-1`, 22 allow entries). The order-sensitive check `JSON.stringify(head) === JSON.stringify({...main, lanes: {...main.lanes, "sv-1": pr.lanes["sv-1"]}})` is true. The file text equals that serialisation plus the trailing newline that main also has. There are no duplicate lane keys, and neither side altered or removed a lane that existed at the merge base.
- **`packages/core/src/index.ts`:** `git diff c6deb4f 97c135f` is one added line after main's `export * from "./enterprise-domain/index.js";`, namely `export * from "./shadow-domain/index.js";`. That is the same single line SV-1 added at 77769fc.

## 3. How ENT-4a and SV-1 interact now that core re-exports both
- **Type-level collision probe** (TypeScript compiler API over core's own tsconfig): 0 diagnostics and 0 TS2308. Across the 39 `export *` modules, **no name is exported by more than one module**. Shadow exports 57 names, enterprise 48, and they share none. The union is 407 names, and the index exposes 408 (the union plus core's own `CORE_PACKAGE`). Nothing is dropped.
- **Sensitivity control for that probe:** I overlaid, in memory only, an extra `export *` module exporting `deriveShadowSuccessFee`, `ShadowSignal` (type) and `transitionExtra`. The compiler reported exactly 3 TS2308 errors naming the shadow and enterprise modules. So a clean typecheck does prove there is no collision.
- **Runtime probe on the built `dist`:** the index has 290 value exports, which is the 289-name union plus `CORE_PACKAGE`. No name is ambiguous, so the module system silently drops nothing. All 48 shadow values and all 33 enterprise values reached through `@jobguard/core` are the very same objects as in their own modules.
- **Nothing SV-1 depends on has changed:** the transitive local import closure of `shadow-domain/` is 25 files. Six are outside it: `cumulative-fee`, `evidence-pack`, `extra-origin`, `money`, `rational` and `receipt-allocation`. All 25 have the same git blob at 77769fc and 97c135f. Main changed none of those files; its core changes are confined to the new `enterprise-domain/` and the index line. In the lockfile the `zod`, `vitest` and `typescript` entries are identical at both commits. SEC-DEPS touched only the `sharp`, `proxy-addr` and `source-map-js` overrides.
- **Cross-tests:** ENT-4a's core-API test requires that `refuse`, `covers`, `readEnterprise` and `compareServerInstants` are **not** exported from core, and shadow exports none of them. The shadow architecture test scans only `shadow-domain/` and its declared SH-1 imports. ENT-4a's boundary test scans only `enterprise-domain/`.

## 4. What I executed (worktree `/private/tmp/opus-sv-1-97c135f-0710`, detached at 97c135f)
- `pnpm install --frozen-lockfile --ignore-scripts`: exit 0.
- `turbo run typecheck --force` (uncached; the plain `pnpm typecheck` first replayed a cache from another worktree, so I discarded that): exit 0, 7/7, 0 `error TS`.
- `turbo run build --force` (uncached): exit 0, 7/7.
- `vitest run` in `packages/core`: exit 0, 102 files / 1,392 tests. That is 51 src files plus their 51 built `dist` copies, i.e. 696 × 2. A verbose run of shadow, enterprise, extra-origin and receipt-allocation was exit 0, 16 files / 423 tests: shadow 105/105, enterprise 278/278. Both SH-1 tests that can time out under load **passed** despite a load average of about 43: "accepts exactly the offsets…" took 1.2 s and "the working size is bounded…" took 0.9 s.
- **Lane lint with a simulated PR event** (`GITHUB_EVENT_NAME=pull_request`, event file with base `c6deb4f…`, head `97c135f…`, ref `codex/sandbox/sv-1`, and `GITHUB_HEAD_REF` set): exit 0, lane `sv-1`, merge-base comparison, the 23 files above.
  - Negative control: the same range claimed as `codex/sandbox/ent-4a` fails, "Lane ent-4a cannot edit" the SV-1 receipts and shadow files. So the lint is not vacuous.
- **Full `pnpm lint` under the same simulated event:** exit 0. Core purity passed (103 TS files), the lane boundary passed, the money-arithmetic boundary passed, and turbo lint was 7/7. Turbo served 2 of those 7 from cache.

## 5. What I relied on CI for
- I relied on [run 37657950423](https://github.com/ben2harwood-lgtm/jobguard/actions/runs/37657950423) on 97c135f: `checks` pass (10m17s), `dependency-review` pass (now green, since #113 is merged) and `secrets` pass. The two Vercel checks were skipped by the ignored-build step.
- CI checked out GitHub's merge ref `e7ce3b6`, and **its tree `4b33e01a` is identical to the head's tree**, so CI tested exactly this code.
- Inside `checks`, typecheck, lint, test, build and the end-to-end step all succeeded. CI logged "Lane boundary passed" for `sv-1` with base c6deb4f and head 97c135f. Core ran 51 files / 696 tests, including all 10 shadow and 4 enterprise test files. The end-to-end run passed 166, and 0 were skipped in the tooling tests.
- I relied on CI for the `@jobguard/db` PostgreSQL suites and the browser end-to-end suite, which I did not run locally. SV-1 is pure core and touches neither.

## 6. What I did not re-verify
- I did not redo the full content review of the shadow domain itself (C1–C8, the done-when lines, the property tests). The diff-identity proof in section 2 shows that code is byte-identical to what the 77769fc PASS reviewed, so that verdict carries over.
- There is no migration, no web change, no live provider, no data or spending, and no CI or test weakening in the delta.

