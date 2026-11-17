Built by Codex (GPT-6.1 Sol) via the full-steam supervisor backlog; order written 16 Oct 2026 by the queue-filler

# ENT-9A builder receipt — AMBER, synthetic baseline preparation

Exact starting and final HEAD: `0a6f9dec09d52f626feb81a00998d2a776bd6679`. Branch `codex/sandbox/ent-9a`; initial working tree clean. Authorized build-ahead base is ENT-7, not main. ENT-7's receipt was the first file read. All changes remain uncommitted; no git-writing operation, explicit package download/install command, remote/GitHub operation, PR, browser, database process, business network action or independent-review claim. The pnpm launcher attempted registry verification and refused, as recorded below. Intended message is `/private/tmp/jg-msg-ent-9a.txt`, overwritten as ordered. No PR until the parent merges.

## Built

Strict `baseline-history.v1` JSON and CSV decoding, 6–12 calendar-month coverage, explicit job/extra/work/team identities, zero-extra jobs, known/unknown GBP snapshots, source identity conflict checks, canonical ordering, hash binding, immutable pure batch replay transitions, exact reference metrics, explicit pilot/rest cohort comparison, complete job/extra drill-downs and JSON/CSV serialization carrying method text/version/hash. Internal application preparation refuses all non-synthetic deployment modes before request/batch inspection. No application route or access right was introduced.

The method uses unchanged merged `moneyFromBigInt`, `MAX_MONEY_PENCE`, `exactPence`, `serializeExactPence` and `sha256`. No parent fee-engine, billing, allocation, auth or session file was changed. `packages/core/src/index.ts` gains one export, appended after all parent exports. No schema/migration, table, grant, routine, business persistence, authoritative job/extra/fact, receipt, audit, fee, statement, signal, dashboard, UI or external action was added.

This is executable source awaiting test execution, not completed aggregate ENT-9. The pure batch collection is an explicit caller-owned input/output; it is not an in-memory replacement for authoritative persistence or a claim of concurrency, durability or session authorization. No fake successful authenticated route is composed around it.

## Worktree contracts and differences from draft

Verified worktree AGENTS rev 3.0, BUILD_PLAN §§2.4 C1–C8, §5, §9.1.2 and contractor product contracts, ENT-9 at lines 1030–1052, §9.1.12–13 gates, and the ENT-7 receipt. The ENT-9 baseline, drill-down, scope and reproducibility clauses match the supplied card. The plan's old task-status and migration ledger are not evidence of implementation; the issued 0182 allocation supersedes its old 0089 reservation for this piece and remains unused.

The 13 October draft describes ENT-9A as a much wider dashboard/server piece, holds all instantiated baseline methods and import execution, uses a literal migration placeholder and starts from main after ENT-7. The 16 October order wins: baseline-only build-ahead, reference method/output and pure import preparation built; dashboard/signals excluded; new per-file lane used; no legacy-register/migration-runner/MIGRATIONS edits. The order permits pure/application preparation where persistence needs a held answer; historical-write/live-job applicability (draft Q3) and current persisted access enforcement remain held. No prior guard is bypassed. Draft acceptance IDs and applicable edge cases were reused without claiming their database conjuncts passed.

## Tests first and actual checks

The core test file was created before the implementation; its first targeted command was started while the module was absent. The application test file was created before its application implementation. Later fixture/immutability cases were added during source review. There is **no observed failing assertion and no red/green claim**: pnpm refused before Vitest started. **Zero authored test cases executed, zero passed.** Exact authored case count is in the source inventory below.

Actual attempted test command:

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"; pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/enterprise-baseline.test.ts
```

Exit **1**, before Vitest. Exact refusal:

> [ERROR] Refusing to run pnpm@10.28.1: its npm registry signature could not be verified (@pnpm/exe@10.28.1: fetch failed; @pnpm/macos-arm64@10.28.1: fetch failed; pnpm@10.28.1: fetch failed). The bytes selected by this project's lockfile/registry do not match a published, signed pnpm release.

The launcher also warned that `pnpm.overrides` was ignored. No retry, alternate runner, version switch, setting override, package install/download or signature-check bypass followed. The observed failure does not establish that repository bytes were invalid; registry/signature verification was unavailable in this sandbox. This was a package safety refusal, not automatic approval-review rejection.

| Check or file | Actual evidence |
|---|---|
| `packages/core/src/enterprise-baseline.test.ts` | NOT RUN: pinned pnpm refusal before Vitest; no assertions executed |
| `apps/api/src/contractor/enterprise-baseline.application.test.ts` | NOT RUN: same pinned-runner refusal; no alternate runner attempted |
| `pnpm exec turbo run typecheck --force` | NOT RUN: pinned runner refused; no cache-off green claim |
| `LANE_BASE_REF=origin/main pnpm exec turbo run lint --force` and root `pnpm lint` | NOT RUN: pinned runner refused; no cache-off green claim |
| `pnpm build --concurrency=2 --force` | NOT RUN: pinned runner refused; no cache-off green claim |
| `pnpm lint:lanes` | NOT RUN through pnpm; independent direct repository lane entrypoint result below |
| `pnpm openapi:check` | NOT RUN: pinned runner refused; no transport/controller/OpenAPI edits |
| `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` | Executed, exit **1**: the stacked base includes 18 inherited ENT-6/7 paths outside ENT-9A; exact output below; no wider lane or different comparison used to obtain green |
| `git diff --check` | Executed, exit **0**; whitespace evidence only |
| Source path/hash inventory | Executed, exit **0**; one-time source equality evidence, no implementation test |
| Database, migration and inherited regression suites | NOT RUN: sandbox cannot start PostgreSQL, own-file-only rule; no DB test/migration introduced in this pure preparation scope |
| Browser/e2e/Playwright suites | NOT RUN: CI only; no web workflow and UI parked (C1/C7) |
| `pnpm test`, `pnpm test:db`, `pnpm test:migrations`, `pnpm eval` | NOT RUN: whole-suite runs belong to dispatcher/CI; no AI/model/prompt/gateway change |

The cache-off commands listed above were not executed. These checks and all mandatory CI remain owed before acceptance. Direct lane checking uses only the repository's existing dependency-free source-check entrypoint and is not an alternate Vitest/package runner.

Resource checks: initial **35 GB free / 63% memory free**; before targeted test **34 GB / 62%**; later **34 GB / 60%**. All above the issued 30 GB / 35% floors. Node `v24.17.0`; pnpm launcher path `/Users/benharwood/Library/pnpm/bin/pnpm`. No heavy build/test fan-out. A database/browser gate was not needed because neither was started.

## Acceptance mapping — source-authored, not passed

- E9-16: strict version/type/unknown-field rejection, 6/intermediate/12-month coverage, money bounds, JSON/CSV equivalence, fixture equivalence, conflicting identities/work, invalid team/month bindings, malformed/mixed CSV records. Persisted current dimension mappings and atomic database execution remain unbuilt.
- E9-17 / E9-01 baseline subset: zero-extra denominator and exact sums of job/extra drill-downs. Historical source objects remain separate from live facts; database separation acceptance remains owed when persistence is introduced.
- E9-18: pure first-result replay and content conflict, detached immutable data, invalid input leaves caller state unchanged. Durable/concurrent uniqueness, audit/receipt atomicity and rollback are NOT BUILT.
- E9-19: same canonical input gives identical hash, complete report and JSON/CSV bytes despite property/row order; cohort/source revision/identity/window changes change the binding. No random clock/process locale dependency. Fresh-process execution NOT RUN; unsupported method versions refuse, so no unapproved second method is invented.
- E9-20: all report/export outputs carry exact method/version/text/hash; no-data, exact thirds, known zero/unknown distinction and aggregate overflow cases authored. No floating money/fee arithmetic or price invention.
- E9-21: detached reference artifacts remain unchanged under later source changes. Stored-run persistence, restart and current access recheck NOT BUILT.
- E9-22: explicit disjoint/unique declared cohorts; unknown teams and caller authority fields refuse. No implicit tenant-wide rest population or operative-level data. Persisted tenant/grant/session scope NOT BUILT.
- E9-29 / E9-30 internal seam subset: strict versioned preparation/error schemas, caller authority fields refused, all non-synthetic modes refused before input/batch reads. No HTTP authority/replay claims.
- E9-02–15 dashboard/access/SQL assertions, E9-23–28 advisory/privacy SQL assertions, E9-31–34 catalog/upgrade/audit/shared-check assertions remain outside this baseline-only implementation or unverified. No ID with an unbuilt/unrun conjunct is marked complete.

## BUILDER ASSUMPTIONS (for coordinator ruling, decision 51)

1. The reversible synthetic method counts all declared jobs and unique source-work identities, assigning the supplied Europe/London job-month label to its attached extras. Duplicate source work within a job refuses pending reconciliation; no duplicate heuristic or mutable live-source inference.
2. Value is explicitly the supplied `reportedNet` snapshot, not a selected approved/billed/paid stage or credit policy. Nonnegative known GBP values and unknown are separate. This reference cannot determine a real-pilot monetary basis, tax, settlement or entitlement. Those money rules remain held for approval.
3. Pilot/rest are explicit nonempty disjoint declared team sets, shown side by side without causal/statistical claims; no hidden rest expansion, operative fields or new access right. Historical teams are source identifiers only; no current authority is inferred.
4. Whole calendar-month source labels (2000–2199), bounded ASCII source identities, 8,000,000 input characters / 1,000 teams / 10,000 jobs / 20,000 extras and aggregate Money-limit refusal are reversible technical bounds. No data completeness is asserted from the declared coverage alone.
5. Source batch identity is `(sourceNamespace, sourceBatchId)` within caller-owned state. A changed revision conflicts under that identity. A separately named corrected batch does not mutate prior reports. Combining overlapping batches or live/history cohorts is not implemented.
6. Persistence is separable and held; no migration 0182 or alternative writer. The internal seam is uncomposed until persisted checked authority/scoped reads are supplied. No sign-in, role, tenant or live-job exception was chosen.

## ADDITIVE LIST ROWS (pending coordinator ruling)

NONE. No catalog, privilege list, merged test, pinned source/value or fingerprint was changed.

## Grants and migration

Every new GRANT: **NONE**. Standard F preserved: no new direct INSERT/UPDATE/DELETE grant to `jobguard_runtime` on any table, no new EXECUTE/SELECT grant, role membership, privileged credential, routine or ownership. Provisional migration **0182 unused**, no migration note required for absent SQL. No data migration/backfill or rollback is needed for pure source preparation. Future persistence requires its own checked writer, catalogs, Rule-9 upgrade proof and scope review; this piece does not pre-approve any of them.

## HELD / STOP / LATER

HELD: historical persistence and the live-guard applicability ruling; authenticated current tenant/role/team bindings and scoped transport/downloads; real history until G1 and DPA/D12/D16/ENT-14 approval; real-pilot monetary interpretation, credits/stages and method approval; real customer data, spending, providers, keys, outward actions and production activation; dashboard/read-model/advisory implementation belongs to ENT-9B; all UI/screens/browser work parked; ENT-7 parent merge, exact-diff independent verdict and separate acceptance outstanding.

STOP (verification): exact pnpm command/refusal above. Do not bypass the pinned runner. STOP (lane check): direct `origin/main` comparison fails on inherited parent paths, exact output below. No existing assertion, reviewed list or fingerprint required changing; no rule-G line was edited or worked around. There is no new BLOCKING policy question that prevents the separable pure preparation from being reviewable.

LATER: bounded parser fuzz/property coverage, richer historical dimensions and multi-batch/live comparison integration after their contracts/access path exist; screens and wording remain parked. No task queue or external message was created from this narrowly scoped build order.

## Source self-review — not an independent verdict

Inspected boundary strictness, unknown money, bigint limits, duplicate source-work refusal, row/property normalization, stable method/source/cohort binding, exact denominators and contributions, CSV empty/job/extra records and metadata consistency, complete method-bearing serialization, deep detachment/freeze, no new context construction, no operative/contact data, and synthetic mode refusal before inspecting batch state. Core test fixture reads follow the existing dynamic test-only filesystem import pattern; runtime core has no added platform dependency.

Limitations: no executed type/test/build result; no authoritative persistence, concurrency guarantee, current access enforcement or stored run; source-reported values are observations, not verified commercial facts. A synthetically labelled input cannot prove that a caller did not put real data into its allowed identifiers; absent transport/real-data activation and the existing release gates remain the operational boundary. Declared calendar coverage does not establish complete historical records. Pure deterministic code and self-inspection are not independent verification or acceptance.

Shared ownership: only additive `packages/core/src/index.ts` export, serialized at dispatcher landing; all parent exports remain. New files contain `baseline` where implementation/fixtures could otherwise overlap ENT-9B; lane, ledger and receipt use their required task names. Parent and main differences are not this builder's modifications.


## Final source inventory and unchanged-source hashes

This one-time inventory is relative to the issued HEAD. It does not pin these files in any permanent test. Receipt excludes its own digest. **25 authored test cases (21 core, 4 application), 0 executed.**

```text
Own-file source inventory (not executable checks):
apps/api/src/contractor/enterprise-baseline.application.test.ts	39 lines	5fce05ab72e5d751a056f13ca7bf2fe7f8cc38fd768501ff692452a9b210b8f4
apps/api/src/contractor/enterprise-baseline.application.ts	33 lines	78775febadc92e08be7b9aaa72a3699dcb6a6011da43ed9d73b96018cac753ac
config/lanes/ent-9a.json	22 lines	dd32f320e3b66c53273cbc85cc1663e536c2d3db4661f1d0dfbdf6851c42f533
docs/contracts/enterprise-baseline-v1.md	43 lines	09a645a8ff46140d226b0b60ddffad396d2a633135950b4ebf05cbc8ba513b5e
docs/fixtures/enterprise-baseline-synthetic.v1.csv	9 lines	c9bdfab3ba06077900c4c9bb11a481449c1350627f296bfa9736ad1e8a195ecf
docs/fixtures/enterprise-baseline-synthetic.v1.json	24 lines	d79262447b3549449fd691a885456c3f82a11797851da7e2eef08f3588052a14
docs/ledger/ENT-9A.md	1 lines	e7c40ab45b7e5f7a636e89d7aa2b76d29f70d7b5ff4289ba42a75c9ae790e5bd
packages/core/src/enterprise-baseline.test.ts	196 lines	76492e66c780d6ffd24b9f92cdbe000f851e4ae4de3e1a8e413f67beff58fc13
packages/core/src/enterprise-baseline.ts	220 lines	61814835a7b186cd58da311ade073eb6bba27e9996ef63d9f35b808967dcd5d4
packages/core/src/index.ts	81 lines	68861112dfee77b10752e2a7d4fbbe1efcecbeb72f17e216163e474c18e56492
packages/core/src/enterprise-baseline.test.ts: 14 plain cases; two parameterized lists of 3 and 4 cases
apps/api/src/contractor/enterprise-baseline.application.test.ts: 4 plain cases; no parameterized lists
Protected source equality to issued base:
AGENTS.md	ae66c7ba5465ec9cd34d69af2085ab3f4c2a882f7580c7cae4a1ed68061ffba1
BUILD_PLAN.md	384fdb07869e780e44e9761a7aaa355ddb4dc0b7fb03b5370d65c47c2891fcdd
apps/api/src/auth/context-boundary.test.ts	a848f5e873ca9cc0811e90adf5a35ae18fe4f1ae1da5f889f00ea29ccd287d35
packages/db/src/migrate.ts	d9ac38c5bae60a487b2835c1681167ea5bf985f1449469c56eec0403772c8983
packages/db/MIGRATIONS.md	b987893b642c2e6ac90404b3fa5c1fb3c0bea354f079f038d7679c036e563ce2
config/agent-lane-assignments.json	36f5f467b5a51feba6a7d31d13ef36750a279b912c969b141ef4b1537320240c
docs/contracts/lp-0-effective-privileges-v1.json	31855d85ee9df886836481d200045734d0186114a3846a9b2811dbe54854b534
packages/db/test/tenancy.integration.test.ts	331f53b127339b97869ecfef77f0b217a0599cd82fc26bb3f7ad042b35191de9
packages/core/src/watchdog.ts	a07e5784fd37ee475227caf58705b75c587ee344c39f1001e9df82c944e2c5ca
packages/db/test/watchdog-command-harness.ts	3bad6abf073b44b84575a7421ddaf7b275d9a75d2d93b20bcf744ed4d3fbbbd6
packages/db/test/command-replay-contract.integration.test.ts	db2315937aad7fe0443f020060a2575aa79f509ec344a35dd8387626ba5de62f
packages/core/src/money.ts	b87e83d291fd5db09ef776737afa3f759629a44ef8af23bc14e6903ecadcc242
packages/core/src/rational.ts	05ee2bde1350ba00f1d9a33adc6ce6834103e2191fd3aa221071d86ff0f3b6a7
packages/core/src/cumulative-fee.ts	120171992a63d75758cbd22c0bf0226288f23306cadfac8afc044a67a4a061c6
packages/core/src/evidence-pack.ts	adbb43936b717ab2da8af62bdc4dfeb3404d27fea74b5fe1d6ea0e8e926cacb8
packages/core/src/enterprise-fee-statement.ts	47d1e0469dcc4a9052103e271ffc920a498e882701d2aca0eeebda095a5b9fd3
docs/verdicts/ENT-7/BUILDER_RECEIPT.md	1c81cbf4cbee29324aaa7dbbfb98da47b7c90749fb9228517da8c48a955245f1
Final HEAD: 0a6f9dec09d52f626feb81a00998d2a776bd6679
 packages/core/src/index.ts | 1 +
 1 file changed, 1 insertion(+)
```

## Lane-check refusal, exact output

```text
Lane boundary FAILED: Lane ent-9a cannot edit:
"apps/api/src/contractor/billing.adapters.test.ts"
"apps/api/src/contractor/billing.adapters.ts"
"apps/api/src/contractor/billing.contracts.ts"
"apps/api/src/contractor/enterprise-fee.application.test.ts"
"apps/api/src/contractor/enterprise-fee.application.ts"
"apps/api/src/contractor/enterprise-fee.executor.test.ts"
"apps/api/src/contractor/enterprise-fee.executor.ts"
"config/agent-lane-assignments.json"
"docs/contracts/contractor-billing-v1.md"
"docs/contracts/enterprise-fee-statement-v1.md"
"docs/operations/contractor-billing-synthetic.md"
"docs/verdicts/ENT-6/BUILDER_RECEIPT.md"
"docs/verdicts/ENT-7/BUILDER_RECEIPT.md"
"packages/core/src/contractor-billing-ordering.test.ts"
"packages/core/src/contractor-billing.test.ts"
"packages/core/src/contractor-billing.ts"
"packages/core/src/enterprise-fee-statement.test.ts"
"packages/core/src/enterprise-fee-statement.ts"
```

## Command inventory

Read commands establish source evidence only; no implementation test follows from them. Every apply_patch operation succeeded and changed only files in the source inventory/receipt. New fixture/contract/lane/ledger files were created here. The initial discovery command with exit 1 found no baseline/Vitest filename before this piece was authored. The source inventory script first exited 1 due to a Python f-string syntax error; the corrected source-only inventory exited 0. No package/test command was rerun.

1. Exit 0:

```sh
cat docs/verdicts/ENT-7/BUILDER_RECEIPT.md
```

2. Exit 0:

```sh
git rev-parse HEAD
```

3. Exit 0:

```sh
git status --short
```

4. Exit 0:

```sh
df -g /System/Volumes/Data
```

5. Exit 0:

```sh
memory_pressure | tail -1
```

6. Exit 0:

```sh
pwd && rg --files -g AGENTS.md -g BUILD_PLAN.md -g package.json -g '*baseline*' -g '*ent-7*' -g '*merge-churn-1*'
```

7. Exit 0:

```sh
cat AGENTS.md
```

8. Exit 0:

```sh
rg -n '^## |^### |ENT-9|9\.1\.2|C[1-8]|baseline' BUILD_PLAN.md
```

9. Exit 0:

```sh
cat /Users/benharwood/.local/share/full-steam/jg-runs/draft-finish-ent-9-20261013T173436.md
```

10. Exit 0:

```sh
cat package.json config/lanes/merge-churn-1.json packages/core/package.json packages/core/tsconfig.json && cat packages/core/src/money.ts packages/core/src/rational.ts
```

11. Exit 0:

```sh
cat /Users/benharwood/.local/share/full-steam/handoffs/FAST-MODE-2026-10-15.md && cat /Users/benharwood/.local/share/full-steam/handoffs/jobguard-task.md
```

12. Exit 0:

```sh
rg -n '^##|^###|E9-|baseline|CSV|JSON|6–12|6-12|scope|method|import' /Users/benharwood/.local/share/full-steam/jg-runs/draft-finish-ent-9-20261013T173436.md
```

13. Exit 0:

```sh
sed -n '190,300p' BUILD_PLAN.md && sed -n '390,700p' BUILD_PLAN.md
```

14. Exit 0:

```sh
sed -n '915,1035p' BUILD_PLAN.md && rg -n 'ENT-9' BUILD_PLAN.md && cat config/lanes/merge-churn-1.json && cat package.json
```

15. Exit 0:

```sh
sed -n '180,218p' /Users/benharwood/.local/share/full-steam/jg-runs/draft-finish-ent-9-20261013T173436.md && sed -n '562,586p' /Users/benharwood/.local/share/full-steam/jg-runs/draft-finish-ent-9-20261013T173436.md && sed -n '745,793p' /Users/benharwood/.local/share/full-steam/jg-runs/draft-finish-ent-9-20261013T173436.md
```

16. Exit 0:

```sh
sed -n '65,170p' BUILD_PLAN.md && sed -n '323,445p' BUILD_PLAN.md && sed -n '742,795p' BUILD_PLAN.md && sed -n '1030,1055p' BUILD_PLAN.md
```

17. Exit 0:

```sh
rg --files packages/core/src apps/api/src/contractor packages/db/src | rg 'canonical|hash|csv|baseline|rational|session|scop|billing|money' && cat packages/core/src/contractor-billing.ts | head -100 && cat tools/core-purity-lint.mjs && cat tools/money-arithmetic-lint.mjs | head -100
```

18. Exit 0:

```sh
sed -n '131,159p' BUILD_PLAN.md
```

19. Exit 0:

```sh
sed -n '381,421p' BUILD_PLAN.md
```

20. Exit 0:

```sh
sed -n '452,547p' BUILD_PLAN.md
```

21. Exit 0:

```sh
sed -n '555,605p' BUILD_PLAN.md
```

22. Exit 0:

```sh
sed -n '587,602p' /Users/benharwood/.local/share/full-steam/jg-runs/draft-finish-ent-9-20261013T173436.md
```

23. Exit 0:

```sh
cat packages/core/src/cumulative-fee.ts | head -135 && cat packages/core/src/evidence-pack.ts | head -32
```

24. Exit 0:

```sh
rg -n '^### 2.4|^## 5|^### 5|^#### 9.1.2' BUILD_PLAN.md && sed -n '114,130p' BUILD_PLAN.md && sed -n '235,320p' BUILD_PLAN.md && sed -n '548,558p' BUILD_PLAN.md
```

25. Exit 0:

```sh
rg -n 'sha256|canonical|export function|export async' packages/core/src/evidence-pack.ts packages/core/src/enterprise-fee-statement.ts packages/core/src/cumulative-fee.ts && sed -n '107,114p' BUILD_PLAN.md && sed -n '198,235p' BUILD_PLAN.md && sed -n '515,548p' /Users/benharwood/.local/share/full-steam/jg-runs/draft-finish-ent-9-20261013T173436.md && cat packages/core/package.json && cat tsconfig.json && cat apps/api/tsconfig.json && cat packages/core/src/index.ts | tail -8
```

26. Exit 1:

```sh
cat tools/agent-lane-boundary-lint.mjs | head -130 && cat tools/lint.mjs | head -100 && node --version && command -v pnpm && rg --files packages/core | rg 'vitest|baseline'
```

27. Exit 0:

```sh
memory_pressure | tail -1
```

28. Exit 0:

```sh
df -g /System/Volumes/Data
```

29. Exit running; final targeted test exited 1:

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"; pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/enterprise-baseline.test.ts
```

30. Exit running; final targeted test exited 1:

```sh
write_stdin session 68439 (first targeted test)
```

31. Exit running; final targeted test exited 1:

```sh
write_stdin session 68439 (first targeted test completion)
```

32. Exit 1:

```sh
write_stdin session 68439 (first targeted test completion)
```

33. Exit 0:

```sh
git diff --check
```

34. Exit 0:

```sh
git diff --stat
```

35. Exit 0:

```sh
git status --short
```

36. Exit 0:

```sh
rg -n 'node:fs|node:crypto|node:child_process' packages/core/src --glob '*.test.ts' | head -12
```

37. Exit 0:

```sh
cat turbo.json
```

38. Exit 0:

```sh
git diff -- packages/core/src/index.ts
```

39. Exit 1:

```sh
rg -n 'ent-9a' config/agent-lane-assignments.json
```

40. Exit 0:

```sh
memory_pressure | tail -1
```

41. Exit 0:

```sh
df -g /System/Volumes/Data
```

42. Exit 0:

```sh
sed -n '360,500p' tools/agent-lane-boundary-lint.mjs && cat packages/core/src/site-extra-pricing.test.ts | head -16
```

43. Exit 0:

```sh
sed -n '1,135p' apps/api/src/auth/context-boundary.test.ts && tail -80 tools/agent-lane-boundary-lint.mjs
```

44. Exit 1:

```sh
LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs
```

45. Exit 1:

```sh
python3 - <<'PY'
import hashlib, json, pathlib, re, subprocess
root = pathlib.Path.cwd()
tracked = subprocess.check_output(['git','diff','--name-only','HEAD'], text=True).splitlines()
new = subprocess.check_output(['git','ls-files','--others','--exclude-standard'], text=True).splitlines()
lane = json.loads((root/'config/lanes/ent-9a.json').read_text())['lanes']['ent-9a']
allowed = set(lane['allow']) | {'config/lanes/ent-9a.json'}
assert set(tracked+new) <= allowed
assert tracked == ['packages/core/src/index.ts']
original = subprocess.check_output(['git','show','HEAD:packages/core/src/index.ts'])
assert (root/'packages/core/src/index.ts').read_bytes() == original + b'export * from "./enterprise-baseline.js";\n'
print('Own-file source inventory (not executable checks):')
for name in sorted(tracked+new):
    if name.endswith('BUILDER_RECEIPT.md'): continue
    data=(root/name).read_bytes()
    print(f'{name}\t{len(data.splitlines())} lines\t{hashlib.sha256(data).hexdigest()}')
for name in ['packages/core/src/enterprise-baseline.test.ts','apps/api/src/contractor/enterprise-baseline.application.test.ts']:
    source=(root/name).read_text()
    print(f'{name}: {len(re.findall(r"\bit\(", source))} plain cases; '+('two parameterized lists of 3 and 4 cases' if '/core/' in name else 'no parameterized lists'))
print('Protected source equality to issued base:')
for name in ['AGENTS.md','BUILD_PLAN.md','apps/api/src/auth/context-boundary.test.ts','packages/db/src/migrate.ts','packages/db/MIGRATIONS.md','config/agent-lane-assignments.json','docs/contracts/lp-0-effective-privileges-v1.json','packages/db/test/tenancy.integration.test.ts','packages/core/src/watchdog.ts','packages/db/test/watchdog-command-harness.ts','packages/db/test/command-replay-contract.integration.test.ts','packages/core/src/money.ts','packages/core/src/rational.ts','packages/core/src/cumulative-fee.ts','packages/core/src/evidence-pack.ts','packages/core/src/enterprise-fee-statement.ts','docs/verdicts/ENT-7/BUILDER_RECEIPT.md']:
    data=(root/name).read_bytes()
    assert data==subprocess.check_output(['git','show','HEAD:'+name])
    print(name+'\t'+hashlib.sha256(data).hexdigest())
print('Final HEAD: '+subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip())
print(subprocess.check_output(['git','diff','--stat'],text=True),end='')
PY
```

46. Exit 0:

```sh
python3 - <<'PY'
import hashlib, json, pathlib, re, subprocess
root = pathlib.Path.cwd()
tracked = subprocess.check_output(['git','diff','--name-only','HEAD'], text=True).splitlines()
new = subprocess.check_output(['git','ls-files','--others','--exclude-standard'], text=True).splitlines()
lane = json.loads((root/'config/lanes/ent-9a.json').read_text())['lanes']['ent-9a']
allowed = set(lane['allow']) | {'config/lanes/ent-9a.json'}
assert set(tracked+new) <= allowed
assert tracked == ['packages/core/src/index.ts']
original = subprocess.check_output(['git','show','HEAD:packages/core/src/index.ts'])
assert (root/'packages/core/src/index.ts').read_bytes() == original + b'export * from "./enterprise-baseline.js";\n'
print('Own-file source inventory (not executable checks):')
for name in sorted(tracked+new):
    if name.endswith('BUILDER_RECEIPT.md'): continue
    data=(root/name).read_bytes()
    print(f'{name}\t{len(data.splitlines())} lines\t{hashlib.sha256(data).hexdigest()}')
for name in ['packages/core/src/enterprise-baseline.test.ts','apps/api/src/contractor/enterprise-baseline.application.test.ts']:
    source=(root/name).read_text()
    count = len(re.findall(r"\bit\(", source))
    print(f'{name}: {count} plain cases; '+('two parameterized lists of 3 and 4 cases' if '/core/' in name else 'no parameterized lists'))
print('Protected source equality to issued base:')
for name in ['AGENTS.md','BUILD_PLAN.md','apps/api/src/auth/context-boundary.test.ts','packages/db/src/migrate.ts','packages/db/MIGRATIONS.md','config/agent-lane-assignments.json','docs/contracts/lp-0-effective-privileges-v1.json','packages/db/test/tenancy.integration.test.ts','packages/core/src/watchdog.ts','packages/db/test/watchdog-command-harness.ts','packages/db/test/command-replay-contract.integration.test.ts','packages/core/src/money.ts','packages/core/src/rational.ts','packages/core/src/cumulative-fee.ts','packages/core/src/evidence-pack.ts','packages/core/src/enterprise-fee-statement.ts','docs/verdicts/ENT-7/BUILDER_RECEIPT.md']:
    data=(root/name).read_bytes()
    assert data==subprocess.check_output(['git','show','HEAD:'+name])
    print(name+'\t'+hashlib.sha256(data).hexdigest())
print('Final HEAD: '+subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip())
print(subprocess.check_output(['git','diff','--stat'],text=True),end='')
PY
```

Final receipt append uses apply_patch successfully; intended-message write uses a Python heredoc. Final source/whitespace/HEAD/resource read results are recorded in the closing note. No independent verdict, acceptance or commit created.


## Closing verification

Final source checks: `git diff --check` exit **0**; `git rev-parse HEAD` exit **0**, unchanged `0a6f9dec09d52f626feb81a00998d2a776bd6679`; `git diff --stat` exit **0**, one additive export; `git status --short` exit **0**, only the 11 inventoried paths including receipt. Final `memory_pressure | tail -1` exit **0**, **59% free**; `df -g /System/Volumes/Data` exit **0**, **34 GB free**.

The intended-message Python heredoc exited **0** and overwrote `/private/tmp/jg-msg-ent-9a.txt` as instructed. It used `pathlib.Path.write_text` with the conventional commit subject/body reproduced below. This final receipt patch succeeded. No executable check was rerun after the runner/lane refusals; the closing changes affect only this receipt.

```text
feat(contractor): add synthetic baseline import and reference method

Add strict baseline-history.v1 CSV/JSON preparation, source-batch replay and
conflict handling, exact versioned pilot/rest metrics and complete drill-downs.
Bind canonical inputs and exports to immutable method text, versions and hashes.

Keep historical persistence, authenticated transport and real pilot activation
held. No migration, grants, dashboard, advisory signals or money writes.

Build-ahead base: 0a6f9dec09d52f626feb81a00998d2a776bd6679 (ENT-7).
Verification: git diff --check and source inventory pass. Pnpm refused its
pinned registry-signature verification before Vitest; all package checks remain
unrun. The origin/main lane check fails on 18 inherited ENT-6/7 paths.
See docs/verdicts/ENT-9A/BUILDER_RECEIPT.md for evidence and remaining gates.
```


