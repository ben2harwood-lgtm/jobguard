Built by Codex; dispatched 13 Oct 2026

# SV-5 repair round r1 — 13 October 2026, dispatcher 4, RED lane

This section is the current repair receipt. The initial construction receipt below is historical and its old head, hashes, line locations, failed checks and factory claims do not describe r1. Built by Codex; no independent model verdict or technical acceptance is asserted.

Starting and final builder HEAD: `3efe521348609751320b62348f97784b8c85abe1`. Branch: `codex/sandbox/sv-5`. Initial worktree clean. Local `origin/main`: `6659fb58791ec22588948f005b2bd4f6b299fa48` (PR #167 merge). Main has advanced from the original issued base; no catch-up, commit, add, checkout, push, merge or other Git mutation performed. The dispatcher must commit the working tree and bind all database evidence and the next independent verdict to that new exact head. No result is claimed for a future rebased/merged head.

Read AGENTS.md, applicable BUILD_PLAN §10.2.6–10.2.8 and SV-5 card, final-check contract, existing worker/test boundary, 0145 and its own fixtures/tests. Dependencies already installed; no install/download, clean-install claim or provider call. Node is v24.17.0 (repository .nvmrc still pins 24.15.0); this pre-existing runtime difference was not changed. Checks use the previously installed pnpm 10.28.1 wrapper, with both PATH exports below. Memory checks before each heavy command showed 70–73% free; free disk stayed 65 GB, above the 45 GB floor. Heavy commands ran sequentially, two workers/concurrency, at most three explicit test files per invocation.

## Repairs and source-inspected limits

- **B1:** removed `createFinalCheckWorker`, concrete detector/shadow imports and factory implementation from `apps/api/src/final-check.worker.ts`. It now exposes only the injected-port handler and type-only database imports. The merged SV-3 scanner/list/assertion was unchanged. Reproduced its failure before editing the worker, then ran it unchanged successfully with the two other merged boundary/registry regressions.
- **Held with Q6:** the factory-dependent `SV5-11 SV5-15 SV5-19` diary/message/photo coalescing/replay scenario in `packages/db/test/final-check-catch.integration.test.ts` is explicitly `it.todo` at line 18. The remaining two executable prohibition/no-money tests stay in that file; it also contains three pre-existing Q2 todos. This is an authorized hold under the repair order, not a passing scenario, deleted file, relocated executing factory or completed coalescing integration. Concrete composition/registration/scheduling remain unbuilt here.
- **B2:** no catalogue edits. The six-table tenancy additions belong to coordinator-approved SV5PRE group C (`jg-runs/sv-5-prereq-patch/`). Catch-up and merge order: **#170, then SV5PRE, then #181**. No catalogue or PostgreSQL installation result is claimed.
- **B3:** 0145's `read_final_check_manifest` now returns signal `evidenceIds` only for non-invalidated links whose `source_received_at <= manifest.evidence_cutoff_at`. PostgreSQL `complete_final_check` independently refuses `reveal` without at least one non-invalidated linked evidence row received at or before the lock cutoff. Exact PostgreSQL timestamps, including microseconds, decide the cutoff. The existing pure reconciliation receives an empty qualifying evidence list for post-lock-only work and proposes `not_enough_evidence`; completing with that exclusion reconciles the signal and leaves it out of main findings. Separate `postLockItems` remain available. Mixed valid pre/post-lock support may still reveal; the pre-existing conservative whole-signal fee ineligibility for later links is unchanged, pending its later policy card.
- Tests were written **before the SQL change** in this piece's unmerged manifest suite: `SV5-14 B3 post-lock-only evidence must NOT become a reveal and is classified as an exclusion` and `SV5-14 SV5-25 B3 valid pre-lock evidence permits reveal while manifest evidenceIds exclude later links`. The negative test first directly calls completion with `reveal` and expects refusal, then checks filtered IDs, pure exclusion, persisted classification/state, empty main items and separate later items. The positive test binds both an earlier and a later link to one signal and proves earlier support permits reveal while later IDs stay out of the qualifying manifest list. **First failing database run: NOT RUN** (cannot bind/start PostgreSQL here). Source inspection shows the old SQL would accept the negative test's `reveal` and expose both IDs in the positive test. That is not an executed failing test or database proof.
- **Upgrade snapshot:** added populated pre-N `recovery_case`, `shadow_signal_classification`, `shadow_signal_disposition` and `shadow_signal_evidence` rows to the own-migration comparison. The evidence link is created through the fixture shadow login; the historical run/classification/disposition and ordinary `merchant_overcharge` case are owner-created historical fixtures before 0145. No SV-5 catch or completion is manufactured. All nine snapshot tables retain the existing nonempty-row guard, canonical named-column text, full types, captured primary-key identities and rolled-back controls. Proof execution remains NOT RUN.
- **OpenAPI:** regenerated the canonical `apps/api/src/generate-openapi.ts` through Node's tsx loader and checked it through the same source with `--check`, without starting a listener. No generator or package script changed. The diff is exactly 45 additive lines for the three final-check endpoints, with no other endpoint change. The initial receipt's generation STOP is superseded by these r1 results.

Only the issued repair and its contract/operations notes changed. No new table/column, grant, catch/fee effect, invoice gate, worker registration, UI, model, prompt or detector policy was introduced. Q2/Q3/Q11, Q4/Q5/Q6 and parked browser acceptance remain as held/stopped in the historical receipt. Current construction does not satisfy any full database acceptance ID or the aggregate SV-5 card.

## Commands actually executed

Successful pnpm commands used:

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"
export PATH="/private/tmp/jg-sv5-bin:$PATH"
```

| Actual validation command | Exit | Evidence |
|---|---:|---|
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/shadow-detection.worker.test.ts` (initial PATH accidentally selected global pnpm; interrupted through its existing session) | 130 | Stalled launcher; no test result. Log `/private/tmp/sv5-r1-b1-before.log`. No permission refusal. |
| Same command, correctly selecting installed pinned pnpm, **before worker change** | 1 | 1 failed / 6 passed. Failure `apps/api/src/final-check.worker.ts: shadow capability import`, at merged assertion :116. Log `/private/tmp/sv5-r1-b1-before-pinned.log`. |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/auth/context-boundary.test.ts src/watchdog-registry.test.ts src/shadow-detection.worker.test.ts` | 0 | 3 files, 273 passed. Log `/private/tmp/sv5-r1-regressions.log`. |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/final-check.test.ts` | 0 | 1 file, 8 passed. Log `/private/tmp/sv5-r1-core.log`. |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/final-check.application.test.ts src/final-check.controller.test.ts src/final-check.http.test.ts` | 0 | 3 files, 7 passed. Log `/private/tmp/sv5-r1-api.log`. |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/final-check.worker.test.ts src/final-check.isolation.test.ts` | 0 | 2 files, 5 passed. Log `/private/tmp/sv5-r1-worker.log`. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts` | 0 | Canonical generator, three additive routes. Log `/private/tmp/sv5-r1-openapi-generate.log`. |
| `pnpm exec turbo run typecheck --force --concurrency=2` | 0 | 7 successful, **0 cached**. Log `/private/tmp/sv5-r1-typecheck.log`. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | Genuine committed branch merge-base diff plus working tree, lane sv-5. Log `/private/tmp/sv5-r1-lanes.log`. |
| `LANE_BASE_REF=origin/main node tools/lint.mjs` | 0 | Core purity (153 files), genuine lane check, money and commercial boundary checks. Log `/private/tmp/sv5-r1-boundary-lint.log`. |
| `LANE_BASE_REF=origin/main pnpm exec turbo run lint --force --concurrency=2` | 0 | 7 successful, **0 cached**. Log `/private/tmp/sv5-r1-lint.log`. |
| `pnpm build --concurrency=2 --force` | 0 | 7 successful, **0 cached**. Log `/private/tmp/sv5-r1-build.log`. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | 0 | Canonical OpenAPI equality check. Log `/private/tmp/sv5-r1-openapi-check.log`. |

After the worker repair: **293 passing targeted tests across nine files** (20 own tests + 273 merged regression tests); this is not the full root suite. Forced typecheck/lint/build really executed. Turbo emitted nonfatal IO/cache warnings (`Operation not permitted`), and Next reported existing workspace-root/CSS warnings; all three processes exited 0. No retry, permission escalation or script weakening was used for those warnings.

Read-only inspection commands (`pwd`, `git status --short`, `git rev-parse HEAD`, `git rev-parse origin/main`, `git branch --show-current`, `git log -1 --format='%H %s' origin/main`, `git show`, `git diff --name-only`, `git diff --numstat`, `git diff --stat`, `git diff --check`, `cat`, `sed`, `rg`, `head`, `tail`, `nl`, `ls`, `command -v node`, `node --version`, `memory_pressure | tail -1`, `df -g /System/Volumes/Data`) exited 0 in their completed inspection batches. All completed test/source/receipt/message edits by task-scoped Python here-docs or `cat >`/`cat >>` exited 0. A read-only Python lane/hash assertion initially exited 1 (`KeyError: 'sv-5'`, policy is nested under `lanes`), without writing; its corrected version exited 0. Final handoff assertions and receipt verification are recorded below. No safety/approval-review rejection occurred in r1.

## Database and full-suite evidence — NOT RUN

**All eight files below are NOT RUN: to run on the Mac by the dispatcher**, against the exact repaired commit, through `~/.local/bin/heavy-slot`, two workers, at most three files per run. This sandbox cannot bind localhost or start PostgreSQL; no attempt to bypass that restriction, install migration 0145 locally, or declare an SQL/catalog/upgrade/race pass was made. The harness requests real PostgreSQL 16 and real runtime/shadow logins; the actual server version, installed migration, privileges and behavior remain unverified.

- `packages/db/test/final-check.integration.test.ts` — to run on the Mac by the dispatcher.
- `packages/db/test/final-check-manifest.integration.test.ts` — to run on the Mac by the dispatcher, including both new B3 tests.
- `packages/db/test/final-check-disposition.integration.test.ts` — to run on the Mac by the dispatcher.
- `packages/db/test/final-check-catch.integration.test.ts` — to run on the Mac by the dispatcher; Q6 coalescing scenario and three Q2 cases are explicit todos, not passes.
- `packages/db/test/final-check-access.integration.test.ts` — to run on the Mac by the dispatcher.
- `packages/db/test/final-check-races.integration.test.ts` — to run on the Mac by the dispatcher.
- `packages/db/test/final-check-invoice.integration.test.ts` — to run on the Mac by the dispatcher; Q4/Q5 integration remains stopped.
- `packages/db/test/final-check-upgrade.integration.test.ts` — to run on the Mac by the dispatcher, including all nine populated snapshot tables.

Sequential Mac batches (not executed here; after exact-head commit and the coordinator-owned catch-up):

```sh
~/.local/bin/heavy-slot sv-5-r1-a pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/final-check.integration.test.ts test/final-check-manifest.integration.test.ts test/final-check-disposition.integration.test.ts
~/.local/bin/heavy-slot sv-5-r1-b pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/final-check-catch.integration.test.ts test/final-check-access.integration.test.ts test/final-check-races.integration.test.ts
~/.local/bin/heavy-slot sv-5-r1-c pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/final-check-invoice.integration.test.ts test/final-check-upgrade.integration.test.ts
```

Dispatcher must also run the unchanged tenancy/fingerprint/DB regressions and full CI gates at that resulting head. `pnpm test`, `pnpm test:db`, `pnpm test:migrations`, complete fixture evaluation and browser/native journeys were NOT RUN here. No UI/browser work is authorized; no live model/provider run was made. Reconciliation cutoff validation changed; model/prompt/extraction/matching/gateway versions did not. Targeted unit checks are not independent review or full-suite/database proof.

## Exact protected boundaries: STOP / held

**B1 / Q6 STOP:** `apps/api/src/shadow-detection.worker.test.ts:89`, enforcing the test at :86 and assertion at :116. The original receipt omitted this STOP; it is now recorded with the failing run. No pinned-list edit is authorized. **Before = After (unchanged)** at :89:

```ts
  const excluded=new Set(["apps/api/src/worker.ts","apps/api/src/shadow-detection.worker.ts","packages/db/src/shadow-repository.ts","packages/db/src/shadow-observation-reader.ts","packages/db/src/shadow-detection-repository.ts"]);
```

Before = After (unchanged) at :116:

```ts
      expect(capabilities.has((binding.propertyName??binding.name).text),`${file}: shadow capability import`).toBe(false);
```

A proposal to add `apps/api/src/final-check.worker.ts` to that list is stopped and was not applied. The coordinator's repair ruling is implemented by removing the concrete factory/imports and holding the dependent test with Q6. Factory before: exported `createFinalCheckWorker` at original worker :13–41. After: absent; only ports and `FinalCheckWorker` remain. Affected unmerged test before: executable `it("SV5-11 SV5-15 SV5-19 finalized synthetic diary/message/photo observations coalesce into one reveal and rerun returns the same result",...)` at old catch :15. After, current catch :18:

```ts
it.todo('SV5-11 SV5-15 SV5-19 Q6 finalized synthetic diary/message/photo observations coalesce into one reveal and rerun returns the same result HELD');
```

**B2 catalogue STOP:** `packages/db/test/tenancy.integration.test.ts`, order references :252/:491. At builder HEAD those exact lines are financial-authorization rows, **Before = After (unchanged)**:

```ts
      { relname: "financial_authorization", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "financial_authorization", owner: "jobguard_migration" },
```

The intended sorted insertion anchor `final_check_terms_acceptance` is actually :251/:490 in this worktree. On current origin/main it is :252/:492 (main wins; the order's second location and the historical receipt's worktree line labels have drifted). **Before = After for this builder (unchanged)** at the actual anchor:

```ts
      { relname: "final_check_terms_acceptance", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "final_check_terms_acceptance", owner: "jobguard_migration" },
```

Required additive after rows are the six `final_check_disposition_binding`, `final_check_manifest`, `final_check_manifest_source`, `final_check_reveal_proof`, `final_check_run_binding`, `final_check_source_attempt` entries in each catalogue (RLS/guard flags true; owner jobguard_migration), preserving existing entries. Already approved for **SV5PRE**, not applied by SV-5. Do not broaden this builder's lane. Merge **#170 → SV5PRE → #181**.

**Inherited Q4 STOP:** `packages/db/test/final-account-lock-invoice.integration.test.ts:88–89`. Before = After (unchanged) legacy test permits issue without lock; its exact source and required coordinator change are retained in the historical STOP 1 below. No invoice routine or merged test changed.

**Inherited Q5 STOP:** same file :11 and `packages/db/migrations/0132_final_account_lock.sql:357`. Before = After (unchanged): the fixture inserts completion labels without a bound run, and the gate is `IF check_row.status IS DISTINCT FROM 'completed' THEN RAISE EXCEPTION 'FINAL_CHECK_NOT_COMPLETE'; END IF;`. Exact prior fixture is retained in historical STOP 2. After required by coordinator prerequisite: authoritative manifest/run-bound completion, not an SV-5 change or claimed pass.

**Inherited Q6 registration STOP:** `apps/api/src/worker.ts:33/:35`, Before = After (unchanged). Existing task is `detect_shadow_evidence`; runner still uses `crontab:"*/1 * * * * discover_outbox"`. Exact lines are retained in historical STOP 3. Required final-check composition, durable registration/discovery and restart proof remain coordinator-owned. No new context constructor or detector capability is moved to another scanned source.

Q2 catch/case/initial claim, Q3 human resolution, Q11 live decisions, and SV5-35 UI/browser acceptance remain HELD/PARKED. No new founder question is decided. No permission request is needed to apply the already issued SV5PRE ruling; this builder simply leaves its protected lines untouched.

## Every migration GRANT — standard F, unchanged in r1

No new GRANT was added or changed in repair. The complete existing 0145 set is still exactly these seven EXECUTE grants; no runtime table SELECT or INSERT/UPDATE/DELETE grant, and no infrastructure/emergency grant. Human writes stay behind routines checking current persisted session/membership/identity/job authority themselves.

- `GRANT EXECUTE ON FUNCTION app.begin_final_check(uuid,uuid,text,text) TO jobguard_shadow;`
- `GRANT EXECUTE ON FUNCTION app.read_final_check_manifest(uuid,uuid,uuid) TO jobguard_shadow;`
- `GRANT EXECUTE ON FUNCTION app.record_final_check_source_result(uuid,uuid,uuid,uuid,uuid,jsonb) TO jobguard_shadow;`
- `GRANT EXECUTE ON FUNCTION app.complete_final_check(uuid,uuid,uuid,jsonb) TO jobguard_shadow;`
- `GRANT EXECUTE ON FUNCTION app.read_final_check_reveal(uuid,uuid,text) TO jobguard_runtime;`
- `GRANT EXECUTE ON FUNCTION app.record_final_check_disposition(uuid,uuid,text,jsonb) TO jobguard_runtime;`
- `GRANT EXECUTE ON FUNCTION app.read_final_check_disputes(uuid,uuid,text) TO jobguard_runtime;`

## Self-review and remaining risks

Source inspection: new cutoff predicates are tenant/job/signal qualified; timestamps and invalidation come from authoritative linked rows, not input metadata. SQL refuses reveal even if a caller proposes it using later evidence; filtered manifest IDs drive the existing pure exclusion. No business lock follows the audit-head acquisition in the repair. Role checks, retries, immutable source accounting, no-money guarantees and exact version/hash links were preserved. Inspection and green unit checks do not establish installed PostgreSQL syntax, upgrade preservation, transaction races, catalogue privileges or independent acceptance. All remain release holds until actual evidence is recorded. Full SV-5 acceptance stays partial, with the affected Q6 integration coverage now expressly held.

OpenAPI/package scripts, protected test bytes and merged migrations were inspected; only generated endpoint additions and this piece's unmerged sources/tests/docs changed. No permanent byte-pinning test was added. The next model's verdict must cover the dispatcher-created repaired head; the Opus input verdict at 3efe521 remains REPAIR and does not carry forward.

LATER preserved: separately issued UI/browser portion and per-evidence fee eligibility policy for mixed earlier/later support. No adjacent implementation added.

## r1 file evidence and handoff

Changed/new non-receipt SHA-256:

- `apps/api/openapi.json` — `cfc89a14c4d9878533418b0d9bee8c1d0e99be13de640228a4ad4f4e4582376b`
- `apps/api/src/final-check.worker.ts` — `5df0326d243757e9675bac5536389ccd51d09a83a695781d90c32ff7f92bbbfe`
- `docs/contracts/final-check-v1.md` — `e47a380302adb0a1361e090d3fb098b086d0dfa6e7c148331c5495444e5dc81e`
- `docs/operations/final-check-recovery.md` — `a3f4c7d0f4ee2db1547a38b062362cb813f9ce6fbe34da3035f04e26c19a3a0b`
- `packages/db/migrations/0145_final_check.sql` — `49e51d11c0ed277fe70130f981edd99b523d6e9eb6626536c6ff2d25cd3b23a2`
- `packages/db/test/final-check-catch.integration.test.ts` — `c2c08212f1d8120faa423b2070ae6cdfce29b9668a780c5fdb435e7ab7a151f0`
- `packages/db/test/final-check-manifest.integration.test.ts` — `d264d20bffea73e9f17984a6dc46950f4bb64fd5e66993fdf9a0e7c1b2130dda`
- `packages/db/test/final-check-upgrade.integration.test.ts` — `c117d15c22fb99001d1a0e705a955b2a2ac693e85793906f2bfebaea4d4942c7`

Protected/merged/reference files byte-equal to starting HEAD (SHA-256):

- `apps/api/src/shadow-detection.worker.test.ts` — `6416236d2558a9ce4c66d4b68091b0f30720385e732439accb760e2f464741fe`
- `apps/api/src/auth/context-boundary.test.ts` — `a848f5e873ca9cc0811e90adf5a35ae18fe4f1ae1da5f889f00ea29ccd287d35`
- `apps/api/src/worker.ts` — `372532c1aa575ad775df66c50a32fecd5881d703fd00d80136608bea4bccbd8f`
- `packages/db/test/tenancy.integration.test.ts` — `41a9b7171e92a718f5f59f5a1879f3f5bc66aff94773ccbed2356516d5ab52ac`
- `packages/db/test/final-account-lock-invoice.integration.test.ts` — `f882f61ae1ee2742d0563133cb67cfd9a79c9dccf667872afc03579000c65730`
- `packages/db/test/fingerprinted-row-shape.integration.test.ts` — `be34095677e52d4e63c771799c99a11e0e52a73fdf2d85808550b17a583ab3a8`
- `packages/db/migrations/0132_final_account_lock.sql` — `543977d99659b724f9f22ca23279c4b9e6210eb053f599ac3d9ffd8df16b7df7`
- `packages/db/src/practice-session.ts` — `9b765f410777c28334f9f7d8388e0a3c6e30f52bb6d4b4070c9b69e4ecbf1b14`
- `packages/db/src/contractor-repository.ts` — `56b95b80360434f0cf58376ef2ec44d0354b194e5080bcfd9414ac283971006c`
- `packages/db/src/contractor-party-repository.ts` — `e5852288e5355b53f7548c4d5741aef54ee55a2b8a66dd56a54b08963cd1fdb0`
- `packages/db/src/work-order-repository.ts` — `4d101604ad160801f1d70b24ee7e3f55287bed2f3d53b9ed83b3d0113d4580a3`
- `packages/db/src/sor-repository.ts` — `45e54b465b2a12747d838ea1cbb7c6a8d859f12894848940be5401ab17e000d5`
- `packages/db/src/job-scheduling-repository.ts` — `ce9b3fee004db9e7e303511f169d55b4a8a2339521927816c9b378b79517e52d`
- `packages/db/src/work-order-fixtures.ts` — `cfcd6d41a3618dd626544b3443e52fdba2c879accacb38637e49e531b4137386`
- `packages/db/src/contractor-session-context.ts` — `a1c76687dc593763d97603cf196c7ef015087359191051d882f6229cac6adf4c`
- `apps/api/src/generate-openapi.ts` — `7a5fbf27ce69b21a9cc3aff9b288db032d1f6d78a069e4bc9df9b519160f8c73`
- `package.json` — `fa4702713c4e2401017a7b4edde569ccaaccb086f5c65bb38c88daa171745da0`
- `pnpm-lock.yaml` — `06b501e413424d77fc5c3a1ac0f481b7230c271e36bfbde2cb953385ccccd349`

Actual `git diff --stat HEAD` before receipt update (exit 0):

```text
 apps/api/openapi.json                              | 45 ++++++++++++++++++++++
 apps/api/src/final-check.worker.ts                 | 37 +-----------------
 docs/contracts/final-check-v1.md                   |  2 +-
 docs/operations/final-check-recovery.md            |  2 +-
 packages/db/migrations/0145_final_check.sql        |  8 +++-
 .../db/test/final-check-catch.integration.test.ts  | 14 ++-----
 .../test/final-check-manifest.integration.test.ts  | 30 +++++++++++++++
 .../test/final-check-upgrade.integration.test.ts   | 16 ++++++--
 8 files changed, 102 insertions(+), 52 deletions(-)
```

The only additional repair path is this receipt. Lane verification covers the genuine committed branch diff plus the working tree. No out-of-lane or merged-test path changed; hashes are evidence in this receipt, not new pinned assertions. Intended conventional commit message written to `/private/tmp/jg-msg-sv-5.txt`; dispatcher owns commit/push/catch-up. Final builder head remains `3efe521348609751320b62348f97784b8c85abe1`.

Final handoff verification: `git diff --check`, `git status --short`, `git diff --stat HEAD`, `git rev-parse HEAD` and the Python final lane/hash/eight-Mac-files/worker-ports/test-ID/message assertions all exited **0**. Nine repair paths are within SV-5; all non-receipt hashes match this r1 section. Final builder head is unchanged at `3efe521348609751320b62348f97784b8c85abe1`. This final receipt insertion itself completed without changing source or tests. No later code edit or Git mutation was performed.

Actual nine-file `git diff --stat HEAD` immediately before this final receipt insertion:

```text
 apps/api/openapi.json                              |  45 +++++
 apps/api/src/final-check.worker.ts                 |  37 +---
 docs/contracts/final-check-v1.md                   |   2 +-
 docs/operations/final-check-recovery.md            |   2 +-
 docs/verdicts/SV-5/BUILDER_RECEIPT.md              | 191 +++++++++++++++++++++
 packages/db/migrations/0145_final_check.sql        |   8 +-
 .../db/test/final-check-catch.integration.test.ts  |  14 +-
 .../test/final-check-manifest.integration.test.ts  |  30 ++++
 .../test/final-check-upgrade.integration.test.ts   |  16 +-
 9 files changed, 293 insertions(+), 52 deletions(-)
```

---

# Initial construction receipt — historical record from before r1


# SV-5 builder receipt — partial server/database construction

The addendum's requested first line names Claude Sonnet 5.5 and says Codex was unavailable. That is not the builder in this session, so it is not recorded as a fact. This is a Codex build receipt, not an independent verdict or acceptance.

## Issued base and source inspection

HEAD and origin/main: `269874640468a6e1dfdfed63edd4ce187d1d9dbb`; branch `codex/sandbox/sv-5`. Initial worktree was clean. No git add, commit, checkout, push, PR, merge or deployment was performed. Migration allocation is `0145_final_check.sql`. Intended commit message: `/private/tmp/jg-msg-sv-5.txt`.

Read repository AGENTS.md, BUILD_PLAN §§2.4, 10.2.1–10.2.11, SV-5 (§10.4, line 1859), graph §12.3 and the existing lock/detection/persistence contracts. At this issued base the quoted contracts/card remain applicable. Main wins over the draft inventory: `0140_site_extra_pricing.sql` is already registered on main, following 0138; the draft's assertion that main ends at 0138 is stale. Existing 0128/0132/0133 and 0097 dependencies are present. No contractor branch was used. Q4/Q5/Q6 prerequisites are not supplied at this base.

Installed node is `v24.17.0`, while `.nvmrc` pins `24.15.0`. Installed dependencies were reused; no install/download or clean pinned-install claim. The default pnpm launcher was a newer global executable and stalled; three invocations were interrupted with exit 130. An already installed `@pnpm/exe` 10.28.1 binary was found in the local pnpm store. A task-local `/private/tmp/jg-sv5-bin/pnpm` wrapper selects that installed binary. All subsequent pnpm commands prepend both the required `$HOME/Library/pnpm/bin` and the task-local wrapper directory to PATH. No package-manager pin or repository script was changed.

## Built scope and material limitations

- Six append-only, migration-owned, FORCE RLS side tables: manifest, manifest source, source attempt, run binding, reveal proof and disposition binding. No runtime table grant. Two additive tenant/job/id candidate keys on the existing shadow classification/disposition tables; no existing column added.
- One frozen lock/cutoff inventory, retaining PostgreSQL microseconds and canonical hash. Includes original objects, pending uploads, unlinked supplier versions/documents, purchase-order revisions and job-linked capture sources. Unsupported entries block completion. Imported source processing remains unsupported; no adoption times or object linkage are invented.
- Separate immutable failed/unsupported/zero/detected attempts. Completeness validates every source, current object identity/invalidation, every signal classification and frozen comparison references. Empty inventory explicitly creates a zero-result run.
- Pure reconciliation reuses the existing builder-favourable matcher. Concrete synthetic worker ports reuse the existing detector/coalescing sink. Late mandatory-surface processing is unsupported; it does not call a pre-lock disclosure path after lock.
- Lock-bound controlled reveal and unresolved dispute projections. Post-lock links record permanent `evidence_after_lock` and are projected separately. Invalidated pre-lock proof makes the projection failed. No builder request runs a detector; pre-lock reads return a fixed result before accessing shadow data. Pre-lock dispositions refuse before hidden proof lookup.
- Checked non-confirming dispositions derive the actor from a persisted session, lock session/membership/job, recheck after waits, validate exact locked references, preserve first-result replay and write receipt/audit atomically. Null included reference creates a dispute; a foreign or non-locked reference is refused. No human resolution is enabled.
- Three Nest endpoints registered; one mutation classified `post_live_billing`. There is no contractor mutation and no shared replay-harness edit. No Next transport/UI/browser implementation is authorized.
- The case category is admitted by an expanded constraint, but a new trigger refuses its creation while Q2 is held. No successful confirmation, catch binding, variation, case, claim, customer approval or financial action is implemented.

`complete_final_check` persists an available reconciliation result only. It DOES NOT publish an invoice-authorizing `final_account_lock_check` fact. Q5's publication seam, Q4's legacy issue closure and Q6's executable worker composition/scheduling remain STOPPED. The new worker class/factory is not a registered background integration. The new endpoints are not yet represented in generated OpenAPI because generation was refused by the sandbox. Aggregate SV-5 acceptance is incomplete.

## Commands and executed evidence

Shell edits were `apply_patch`, task-scoped Python here-doc scripts, and `cat >` / `cat >>` for the new lane files listed in the file evidence below. All completed edits exited 0, except the first lane-generation Python script exited 1 (`KeyError: 'sv-5'`) before writing; the corrected script exited 0 and preserves every other lane entry. Inspection calls using `cat`, `sed`, `rg`, `head`, `tail`, `ls`, `file`, `command -v` and Python `find_spec` were read-only. Mixed inspection commands sometimes exited 1 for absent draft filenames (`shadow-bill.ts`, `shadow-domain/reconcile.ts`, `packages/db/src/practice-access.ts`, absent vitest config files, `/usr/local/bin/pnpm`); subsequent reads used the actual repository paths. No missing file was represented as implemented.

Validation command ledger (pnpm uses the PATH prefix described above):

| Actual command | Exit | Result |
|---|---:|---|
| `pwd; git status --short; git rev-parse HEAD origin/main` (separate shell lines) | 0 | correct worktree, clean, exact issued base |
| `git log origin/main --oneline -80` (output saved to `/private/tmp/sv5-baseline-history.log`) | 0 | source history inspected |
| `node --version; cat .nvmrc` (separate shell lines) | 0 | installed/pinned difference recorded above |
| `memory_pressure \| tail -1; df -g /System/Volumes/Data` (separate shell lines, repeated before heavy checks) | 0 | 66–68% free memory; 79–83 GB disk available, above limits |
| Initial default `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/final-check.test.ts` | 130 | launcher stalled; interrupted; no test result |
| `npm_config_manage_package_manager_versions=false pnpm --version` | 130 | stalled; interrupted |
| `pnpm --manage-package-manager-versions=false --version` | 130 | stalled; interrupted |
| Installed local `@pnpm/exe/10.28.1/.../pnpm --version` | 0 | 10.28.1; selected without downloading |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/final-check.test.ts` | 0 | 1 file, 8 tests passed |
| First `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/final-check.application.test.ts src/final-check.worker.test.ts` | 1 | 2 failed imports, 0 executed tests: missing new worker and unbuilt db package entry |
| `pnpm exec turbo run typecheck --concurrency=2 --force` | 2 | 4 tasks succeeded; own projection optional-property type error in db; corrected before lint |
| `LANE_BASE_REF=origin/main pnpm exec turbo run lint --concurrency=2 --force` | 0 | 7/7 actual package checks; 0 cached tasks; each executes TypeScript with noEmit |
| `node tools/lint.mjs` | 1 | core purity passed (153 TS files); nested lane check refused empty committed range |
| `pnpm build --concurrency=2 --force` | 0 | 7/7 actual builds, 0 cached tasks, including API and Next production build |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/final-check.application.test.ts src/final-check.controller.test.ts src/final-check.http.test.ts` | 0 | 3 files, 7 tests passed |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/final-check.worker.test.ts src/final-check.isolation.test.ts` | 0 | 2 files, 5 tests passed |
| `pnpm --filter @jobguard/api openapi:generate` | 1 | refused: tsx IPC listen EPERM; snapshot not changed |
| `git diff --check` (repeated after final edits) | 0 | no whitespace errors |
| `git diff --stat`, `git diff --numstat`, `git status --short`, `git rev-parse HEAD origin/main` | 0 | read-only working-tree evidence; head unchanged |
| `shasum -a 256 packages/db/migrations/0145_final_check.sql` | 0 | intermediate hash only; final hash below supersedes it |
| Python Git-blob/SHA-256/allow-list comparison | 0 | 1,593 original tracked files unchanged; all changed/new paths in lane; 13 explicitly protected files equal main |

Typecheck, lint and build were each invoked once with `--force`; no cache-hit green is claimed. Typecheck is recorded FAILED, then the own error was fixed and all seven forced package lint checks and builds compiled successfully. Turbo emitted `WARNING IO error: Operation not permitted (os error 1)` for shared cache I/O. That cache item was not repaired or rerouted; tasks themselves ran with zero cache hits. Build also emitted existing Next workspace-root and CSS warnings. No build/test run overlapped; direct Vitest runs were sequential, max two workers, max three explicit files.

Tests-first evidence is limited: core/manifest/API tests were written before their corresponding new implementation. The first core attempt did not execute because its launcher stalled. The first API run failed at imports before the new worker existed. Database files have no executed failing-first evidence, and several were added while SQL construction progressed. Do not claim every acceptance assertion has an executed failing-first proof.

Logs: `/private/tmp/sv5-typecheck.log`, `/private/tmp/sv5-lint.log`, `/private/tmp/sv5-root-lint.log`, `/private/tmp/sv5-build.log`, `/private/tmp/sv5-api-tests.log`, `/private/tmp/sv5-worker-tests.log`, `/private/tmp/sv5-openapi-generate.log`. Core/first API results are in the tool transcript.

## NOT RUN

All eight new real-PostgreSQL files below are NOT RUN (issued sandbox cannot start PostgreSQL/bind sockets). Their harness requests PostgreSQL 16 with separate real runtime/shadow logins, but no actual database version, catalog, grants, upgrade or transaction result is claimed. They must go through the dispatcher's `heavy-slot` gate/CI.

- `packages/db/test/final-check-access.integration.test.ts` — NOT RUN; 8 executable cases, 0 explicit held/stopped todo cases.
- `packages/db/test/final-check-catch.integration.test.ts` — NOT RUN; 3 executable cases, 3 explicit held/stopped todo cases.
- `packages/db/test/final-check-disposition.integration.test.ts` — NOT RUN; 3 executable cases, 0 explicit held/stopped todo cases.
- `packages/db/test/final-check-invoice.integration.test.ts` — NOT RUN; 1 executable cases, 4 explicit held/stopped todo cases.
- `packages/db/test/final-check-manifest.integration.test.ts` — NOT RUN; 6 executable cases, 0 explicit held/stopped todo cases.
- `packages/db/test/final-check-races.integration.test.ts` — NOT RUN; 2 executable cases, 0 explicit held/stopped todo cases.
- `packages/db/test/final-check-upgrade.integration.test.ts` — NOT RUN; 1 executable cases, 0 explicit held/stopped todo cases.
- `packages/db/test/final-check.integration.test.ts` — NOT RUN; 6 executable cases, 0 explicit held/stopped todo cases.

Also NOT RUN: real HTTP listener journey; browser/e2e suites and SV5-35 (UI parked); existing regression suites; `pnpm test`, `pnpm test:db`, `pnpm test:migrations`, applicable complete fixture evaluation (`pnpm eval`), live-model evaluation and the dispatcher's complete sequential batch arrangement. The addendum permits only this piece's targeted files; no dispatcher-owned complete batch runner was supplied. Mandatory CI suites remain unchanged. No live model/provider call is authorized or performed. The new HTTP-named unit file proves schemas only, and controller tests invoke methods without listening on a socket.

`pnpm openapi:check` is NOT RUN after generation was refused; no alternate generator was used. A standalone `pnpm lint:lanes` is NOT RUN after the nested checker refused the empty committed diff; no self-comparison workaround or commit was made.

## Refused items and exact coordinator STOP lines

1. **Q4 — `packages/db/test/final-account-lock-invoice.integration.test.ts:88–89`.** Untouched. Before, exact line 88:

```ts
 it("Q1 legacy issue remains available without lock; an interim side binding requires no lock",async()=>{
```

Exact line 89:

```ts
  const a=await seedAccount(f.admin),invoice=await new PracticeInvoiceRepository(f.runtime).issue(a.context,{jobId:a.jobId,finalAccountRevisionId:a.revisionId,actorMembershipId:LOCK_OWNER,commandId:randomUUID(),recipient:'practice-customer@example.invalid',issuedOn:'2026-10-12'});
```

Required after: new final/supplementary issue without a lock is refused with `FINAL_ACCOUNT_LOCK_REQUIRED`; interim/deposit paths are separately proved. The coordinator must issue the exact changed legacy test/routine contract. No replacement of this line is supplied or guessed here; historical invoices are preserved.

2. **Q5 — same file, line 11**, plus `packages/db/migrations/0132_final_account_lock.sql:357`. Both untouched. Before line 11:

```ts
 const id=randomUUID();await asFixtureTenant(f.shadow,a.tenantId,db=>db.query("INSERT INTO app.final_account_lock_check(tenant_id,job_id,id,lock_id,evidence_cutoff_at,status) VALUES($1,$2,$3,$4,$5::timestamptz,$6)",[a.tenantId,overrides.jobId??a.jobId,id,overrides.lockId??row.id,overrides.cutoff??row.cutoff,status]));return id;
```

Before the existing issue gate, exact source line 357:

```sql
 IF check_row.status IS DISTINCT FROM 'completed' THEN RAISE EXCEPTION 'FINAL_CHECK_NOT_COMPLETE'; END IF;
```

Required after: completion facts must bind an actual evidence-complete manifest/run and available result; a label/null run is insufficient. The exact coordinator-owned publication/gate signature and replacement fixture are **not issued**, so no exact executable after-line can truthfully be supplied. SV-5 does not publish a completion fact or replace this existing routine.

3. **Q6 — `apps/api/src/worker.ts:33–35`.** Untouched. Before line 33:

```ts
 async detect_shadow_evidence(payload){const parsed=z.object({version:z.literal("shadow-detection-task.v1"),tenantId:z.string().uuid(),jobId:z.string().uuid()}).strict().parse(payload);await detectionWorker.execute(queueContext({tenantId:parsed.tenantId}),parsed);},
```

Before line 35:

```ts
const runner=await run({connectionString:environment.GRAPHILE_DATABASE_URL,taskList:tasks,crontab:"*/1 * * * * discover_outbox"});
```

Required after: a reviewed final-check task/composition seam, durable scheduling/discovery and restart execution, preserving the existing queued-context constructor/pinned boundary. The concrete permitted seam is **not issued**. No replacement/addition to this protected file is guessed. Handler/factory tests do not satisfy SV5-32.

4. **Additional catalog prerequisite — `packages/db/test/tenancy.integration.test.ts:252` and `:491`.** Untouched. Exact before lines:

```ts
      { relname: "final_check_terms_acceptance", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "final_check_terms_acceptance", owner: "jobguard_migration" },
```

Exact required after insertion at line 252, preserving the original line last:

```ts
      { relname: "final_check_disposition_binding", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "final_check_manifest", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "final_check_manifest_source", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "final_check_reveal_proof", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "final_check_run_binding", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "final_check_source_attempt", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "final_check_terms_acceptance", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
```

Exact required after insertion at line 491, preserving the original line last:

```ts
      { relname: "final_check_disposition_binding", owner: "jobguard_migration" },
      { relname: "final_check_manifest", owner: "jobguard_migration" },
      { relname: "final_check_manifest_source", owner: "jobguard_migration" },
      { relname: "final_check_reveal_proof", owner: "jobguard_migration" },
      { relname: "final_check_run_binding", owner: "jobguard_migration" },
      { relname: "final_check_source_attempt", owner: "jobguard_migration" },
      { relname: "final_check_terms_acceptance", owner: "jobguard_migration" },
```

Rule G and this lane exclude every merged test edit. The coordinator must insert these rows; the new migration will otherwise make that existing catalog expectation stale.

5. **OpenAPI generation — actual command** `pnpm --filter @jobguard/api openapi:generate`, exit 1. Exact refusal:

```text
Error: listen EPERM: operation not permitted /var/folders/nh/lx6ycbfd1l937f5qhj0cdvhh0000gn/T/tsx-501/83429.pipe
```

Stopped this item. `apps/api/openapi.json` is byte-unchanged and lacks the new endpoint additions. Dispatcher must generate/check it in an environment where the authorized generator starts. No alternate path, permission request or generator workaround was attempted.

6. **Lane check — nested actual command** `/usr/local/bin/node tools/agent-lane-boundary-lint.mjs`, exit 1:

```text
Lane boundary FAILED: Missing branch or self-comparison range; refusing a misleading pass.
```

Stopped this item. HEAD equals the issued base because committing is prohibited. Dispatcher must commit the working-tree diff before running the genuine branch lane check.

7. **Process inspection — actual command** `ps -axo pid,ppid,rss,etime,command | rg 'pnpm|vitest' | head -15`; outer pipeline exited 0, but `ps` was refused:

```text
zsh:4: operation not permitted: ps
```

No alternate process-inspection route was tried. Stalled tool sessions were interrupted through their existing stdin handles, returning 130.

## Acceptance status

No server/database ID with a PostgreSQL assertion is claimed accepted without an executed database suite. Written coverage exists across the eight new files for the separable IDs. The executed core/API unit cases prove portions of SV5-03/04/05/06/07/08/10/11/12/15/16/19/21/24/29/30; they do not replace persistence, catalog, concurrency or HTTP journey evidence.

SV5-17/18 and the Q2-dependent portions of SV5-11/15/16/20/21/22/23/26/29/30/31/33 remain HELD. Q3's human-resolution schema/authority/effects remain HELD; the queue is built but its database tests are NOT RUN. Q11 live activation/legal/safety/retention approvals remain HELD; recorded synthetic early states confer no policy approval. SV5-02/27/28 invoice integration is STOPPED on Q4/Q5. SV5-32 executable background integration is STOPPED on Q6. SV5-35 and all plan B/D/E/I/J/K/L/O browser journeys remain PARKED, NOT SATISFIED. Full-suite/evaluation, OpenAPI and genuine lane evidence are outstanding.

## Every new migration GRANT — standard F

There is **no new runtime INSERT/UPDATE/DELETE grant on any table**, protected or otherwise; no new runtime SELECT table grant either. All writes use checked routines with their own login-role and subject checks. Runtime human actions select identity/membership from the persisted session. Infrastructure/emergency roles receive no new grant. The following are the migration's entire new GRANT set, one line each:

- `GRANT EXECUTE ON FUNCTION app.begin_final_check(uuid,uuid,text,text) TO jobguard_shadow;`
- `GRANT EXECUTE ON FUNCTION app.read_final_check_manifest(uuid,uuid,uuid) TO jobguard_shadow;`
- `GRANT EXECUTE ON FUNCTION app.record_final_check_source_result(uuid,uuid,uuid,uuid,uuid,jsonb) TO jobguard_shadow;`
- `GRANT EXECUTE ON FUNCTION app.complete_final_check(uuid,uuid,uuid,jsonb) TO jobguard_shadow;`
- `GRANT EXECUTE ON FUNCTION app.read_final_check_reveal(uuid,uuid,text) TO jobguard_runtime;`
- `GRANT EXECUTE ON FUNCTION app.record_final_check_disposition(uuid,uuid,text,jsonb) TO jobguard_runtime;`
- `GRANT EXECUTE ON FUNCTION app.read_final_check_disputes(uuid,uuid,text) TO jobguard_runtime;`

## Self-review — source inspection only

Reviewed the new SQL for runtime DML grants, context/role checks, replay before state checks, missing/malformed contexts, tenant/job FKs, exact source hashes/cutoffs, invalidation, immutable facts, held-case refusal and audit lock order. All explicit row/advisory business locks and business inserts precede audit-head acquisition. Deferred manifest/audit validators only read or check references; they do not take additional business row/advisory locks. This is source inspection, not a database concurrency proof. New run/classification/reveal writes are one transaction; source failures commit separately. Positive financial and authorization effects are absent from the implemented actions.

Material risks: SQL has not been parsed/installed/executed against PostgreSQL here; catalog/upgrade/race tests are NOT RUN. Frozen pending/unlinked inputs remain incomplete until their owning task supplies an issued processing/linkage rule; this portion cannot unblock them by changing the inventory. Post-lock evidence projection is built, while durable discovery/detection integration remains Q6-dependent. Newly encountered mandatory-surface processing after lock is explicitly unsupported. The new migration extends one case constraint and adds two shadow candidate keys plus two triggers to pre-existing tables; no prior row is rewritten. Independent review must inspect those interactions.

No business network call, provider route, fee authorization, settlement allocation, invoice/statement/collection action or customer approval is added. No safety threshold, dispute reviewer, live policy, retention decision or approval was invented. Existing provider/prompt/model/matching policies are reused unchanged. RLS assumes a genuinely authenticated context; it does not authenticate a compromised context selector. Audit chains still require trusted heads/checkpoints and do not prove the underlying work.

LATER: separately issue the reveal UI/browser portion after the server, invoice and background prerequisites are accepted.

## File evidence and final head

Final SQL SHA-256: `2fe83516cfd3adc43c3a4ed37a3c94ab4d40eccb54b79cd36852c46066abb4db`.

The Git-blob comparison against main found 1,593 original tracked files byte-unchanged, 7 tracked lane files changed and 25 new lane files before this receipt (26 with it). Every out-of-lane tracked file stayed unchanged; no merged test or SHA-pinned bridge was edited. Every non-SV-5 lane entry was compared semantically to main and remains equal. Protected SHA-256 values equal main:

- `apps/api/src/auth/context-boundary.test.ts` — `a848f5e873ca9cc0811e90adf5a35ae18fe4f1ae1da5f889f00ea29ccd287d35`
- `apps/api/src/worker.ts` — `372532c1aa575ad775df66c50a32fecd5881d703fd00d80136608bea4bccbd8f`
- `packages/db/test/final-account-lock-invoice.integration.test.ts` — `f882f61ae1ee2742d0563133cb67cfd9a79c9dccf667872afc03579000c65730`
- `packages/db/test/tenancy.integration.test.ts` — `41a9b7171e92a718f5f59f5a1879f3f5bc66aff94773ccbed2356516d5ab52ac`
- `packages/db/test/fingerprinted-row-shape.integration.test.ts` — `be34095677e52d4e63c771799c99a11e0e52a73fdf2d85808550b17a583ab3a8`
- `packages/db/src/practice-session.ts` — `9b765f410777c28334f9f7d8388e0a3c6e30f52bb6d4b4070c9b69e4ecbf1b14`
- `packages/db/src/contractor-repository.ts` — `56b95b80360434f0cf58376ef2ec44d0354b194e5080bcfd9414ac283971006c`
- `packages/db/src/contractor-party-repository.ts` — `e5852288e5355b53f7548c4d5741aef54ee55a2b8a66dd56a54b08963cd1fdb0`
- `packages/db/src/work-order-repository.ts` — `4d101604ad160801f1d70b24ee7e3f55287bed2f3d53b9ed83b3d0113d4580a3`
- `packages/db/src/sor-repository.ts` — `45e54b465b2a12747d838ea1cbb7c6a8d859f12894848940be5401ab17e000d5`
- `packages/db/src/job-scheduling-repository.ts` — `ce9b3fee004db9e7e303511f169d55b4a8a2339521927816c9b378b79517e52d`
- `packages/db/src/work-order-fixtures.ts` — `cfcd6d41a3618dd626544b3443e52fdba2c879accacb38637e49e531b4137386`
- `packages/db/src/contractor-session-context.ts` — `a1c76687dc593763d97603cf196c7ef015087359191051d882f6229cac6adf4c`

Actual `git diff --stat` (untracked files are separately listed by hashes below):

```text
 apps/api/src/app.module.ts         | 3 ++-
 config/agent-lane-assignments.json | 1 +
 packages/core/src/index.ts         | 1 +
 packages/core/src/watchdog.ts      | 2 ++
 packages/db/MIGRATIONS.md          | 6 ++++++
 packages/db/src/index.ts           | 2 ++
 packages/db/src/migrate.ts         | 1 +
 7 files changed, 15 insertions(+), 1 deletion(-)
```

Changed/new source SHA-256 (receipt excluded to avoid a circular hash):

- `apps/api/src/app.module.ts` — `da9b8cba585d0ea95721d8748fc49b3e51138cab35665eaa96308d584ca689d7`
- `apps/api/src/final-check.application.test.ts` — `ba2dcba10ab35430971f623581fb45ca8fb0c9b21e45869f54f51922cb344d36`
- `apps/api/src/final-check.application.ts` — `2d727537ce739bcfcf66b13c49e9c0513ed4ed4aff5478d18994f6d887f60d0d`
- `apps/api/src/final-check.contracts.ts` — `9064d17cfe3675d3147a6adb121a60455af2218ff0c0abc6508af092a811bcf9`
- `apps/api/src/final-check.controller.test.ts` — `c51e0a1ca09ae4bb90bdbb326b9e7f5d440d74deaf3692799754d0af746f65cc`
- `apps/api/src/final-check.controller.ts` — `2a95dd50a9a918380adbd91d05f244bc9d5f5368e2ef45d6d3d985c16b859323`
- `apps/api/src/final-check.http.test.ts` — `032cab1493d74b49249e6128ca2526cb1df52773aa10afeb0fe5fa71ccce9abb`
- `apps/api/src/final-check.isolation.test.ts` — `78008e43e05aaa922f5f05ccd8c6895c5fbbc1eb67f7fa32c07d46915b9ed2ce`
- `apps/api/src/final-check.worker.test.ts` — `7515a7f40ead92e8dd05501deb4f504de03b0cb6db6dc8963ac823630a2184d0`
- `apps/api/src/final-check.worker.ts` — `5cd01fd4d505d4dafccb9549ff95508b1002c8b8320716dcb72d8b970590a82d`
- `config/agent-lane-assignments.json` — `7681257f428ab4b321adfc066f5004fe90f1f04fe69c71db97422965b07d4720`
- `docs/contracts/final-check-v1.md` — `c18d54aa7feac2570c0a60d763602a750409beea1710825ef6afc7911a0e1e7e`
- `docs/operations/final-check-recovery.md` — `d12ed44393b9209b0fb917749b11a71eb7b60889ab726aa913bdda2e75154b27`
- `packages/core/src/final-check.test.ts` — `0f90311c4b8df36b230fd8de8e5053f79f4e870ed4850ca9f1289fc705677cbb`
- `packages/core/src/final-check.ts` — `2549f45b17c416860880b37c8d8f33c8d9b401270a2db809079484500b4b468d`
- `packages/core/src/index.ts` — `a2af7ded1cfc8985358aadc541ae01ba0794753fd4dbcb814c0cf0777a8935e2`
- `packages/core/src/watchdog.ts` — `2c9451800cc35bdd80820bca593a6df7f7841ca4736af14c4ba308a056c787d6`
- `packages/db/MIGRATIONS.md` — `c76d8914fc97d58abd593dfcc9c4eae8b13fceeb10c00babaafef02073c9c9a2`
- `packages/db/migrations/0145_final_check.sql` — `2fe83516cfd3adc43c3a4ed37a3c94ab4d40eccb54b79cd36852c46066abb4db`
- `packages/db/src/final-check-repository.ts` — `540685dead851ade0137dda9a4a88739f56250725daaf2c1c861ee198c3ec29e`
- `packages/db/src/final-check-source-reader.ts` — `bd80cb1a73f65b7315910c4a326ea64f5da1e6820b0b5e5eb47c50d3cfdc6382`
- `packages/db/src/index.ts` — `22564468ce9b61e0fb6eb1c741f09111c42518e858cc2ca7cc74279df912d462`
- `packages/db/src/migrate.ts` — `5db81eab37b3c09376d2c2347e22dc94f00b9fdab66b1e4fc3b7030304ad57ec`
- `packages/db/test/final-check-access.integration.test.ts` — `e1d32fe989d9fd6cb4732036c0f57bc1c7c0453d6f2442e88965e0846c51b93b`
- `packages/db/test/final-check-catch.integration.test.ts` — `c5b796ae67d76d5fdf4eddd44429db61fe79898b5311533bc95f07d6bac3579c`
- `packages/db/test/final-check-disposition.integration.test.ts` — `35caed4911d2527d570e0b3b8147cab0193c572d0d627fa4d1669cfa3457f12d`
- `packages/db/test/final-check-fixture.ts` — `1bc9a8c393d005991c4ecd4c3d4221439991df9e65ee979e3a0e6ee89c195911`
- `packages/db/test/final-check-invoice.integration.test.ts` — `eea553a18681a51b99b1d3f75aec6ec0ee93af3bef05ccfb11228ad9b4bc83ea`
- `packages/db/test/final-check-manifest.integration.test.ts` — `f8304b699fe057cea364d352e9bcf5236362e0017ae8dc9d3187eb05c1c1a74c`
- `packages/db/test/final-check-races.integration.test.ts` — `a068c84fc397f3677fd720a32a3dae0b6effda3a0ae46e5cd1dc479d36a8b989`
- `packages/db/test/final-check-upgrade.integration.test.ts` — `50070ca51c1994bad0fe5a56d9b1f2dd449c20903bd580a83c4f8d4dd8122da7`
- `packages/db/test/final-check.integration.test.ts` — `4ff73719daea99d0a2cd61d4a77fe9da47f4175de7fec19d52bfa219d7311e4e`

Final HEAD: `269874640468a6e1dfdfed63edd4ce187d1d9dbb`. No independent verdict recorded; no separate technical acceptance recorded. Dispatcher commits and obtains review of that exact resulting commit.

Final handoff commands: `git branch --show-current`, `git rev-parse HEAD`, `git diff --check` and Python final lane/hash/message-existence assertions each exited 0. Branch is `codex/sandbox/sv-5`; final comparison confirms 7 tracked changes, 26 new files, every non-receipt changed-file SHA-256 present above, no out-of-lane file, and the intended message exists. The final receipt append itself exited 0. No subsequent code edit or git mutation was made.
