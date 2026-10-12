# M4-8-S builder receipt

Date: 12 October 2026. Builder: Codex GPT-6.1 Sol (dispatch attribution).

Status: **HELD — Q1 transaction composition blocker; implementation not built.**

## Base and changed files

- Dispatch HEAD: `262f939514383df28d6811e889650d0571a70145`.
- Branch: `codex/sandbox/m4-8-s-r2`.
- Local `origin/main`: `459ec87c8dff07a920a8e3123200c2ed5812c564`.
- SV-2 at dispatch HEAD is treated as merged, as the addendum requires. Its migration is `0128_shadow_persistence.sql`, registered after 0122.
- First change: one compact `m4-8-s` lane entry after `m4-7-s`, with the exact assigned paths and branch. No previous lane line changed.
- Other working-tree change: this receipt. No feature, test, shared export, route, UI or migration was added or changed.
- Intended commit message: `/private/tmp/jg-msg-m4-8-s-r2.txt`. The dispatcher owns committing; no git write, fetch or GitHub command was run.

## Blocking evidence and required repair

The binding Q1 instruction says: "Move the case's received principal by appending the already-merged `record_landing` and `reverse_landing` case events in the same transaction, through public functions of the merged recovery-case repository; if that cannot be done through them, stop and report."

Source inspection found:

1. `packages/db/src/recovery-case-repository.ts:36` exports `RecoveryCaseRepository`; its constructor accepts a `Pool`. The public write methods are `eligibilityCommand` and `command`; neither accepts an existing `TenantTransaction` or a callback for allocation writes.
2. `command` at line 86 calls `withTenant(this.pool, context, ...)` at line 89. It inserts the landing/reversal case event at line 121 and appends its audit batch at line 124. After the write transaction ends, line 125 calls `committedCase`, which performs a separately authorized read transaction.
3. `packages/db/src/tenant-context.ts:83` acquires a pool connection; lines 85–95 issue BEGIN, install tenant context, execute the callback, COMMIT or ROLLBACK, and release the connection. There is no public transaction-joining mechanism.
4. The existing `practiceMaterialPool` at `packages/db/src/practice-session.ts:63` installs practice context on BEGIN; it forwards the connection's queries, including COMMIT. It does not provide a transaction composition API.
5. `packages/db/src/index.ts:36` re-exports the repository. No other public recovery-case event append function was found.

Calling `command` before or after allocation persistence would commit the case event independently. Calling it inside an outer `withTenant` callback would obtain another connection, not share that callback's transaction. Passing a client as a pool or intercepting BEGIN/COMMIT/release would bypass the established transaction contract. Direct event inserts would bypass the public repository functions required by Q1. All are unsuitable substitutes for the required atomic command/domain/audit write.

The order excludes the recovery-case repository and tenant-context implementation from this lane and directs a stop if the public functions cannot supply the required behavior. Therefore the implementation stopped before adding any allocator code or migration. This is a source-inspected blocker, not a PostgreSQL-executed finding or an independent verdict.

Required prerequisite: an owning repair task must expose a supported public recovery-case write entrypoint that participates in the caller's verified tenant transaction. It must preserve membership verification, replay conflicts, expected revisions, case transitions and audit semantics, with all business locks before the final audit append. Its tests must demonstrate atomic rollback of the allocation facts and case event. The integrator must release that repair or explicitly amend this order's lane before this leaf resumes. No approval is inferred here.

## Build and acceptance disposition

Every HELD entry below is incomplete, with no leaf test or acceptance claim.

| Item | Status | Evidence / missing proof |
| --- | --- | --- |
| B1 case review/approval | HELD | Q1: no transaction-participating case command |
| B2 reversal workbench | HELD | Q1 also blocks atomic `reverse_landing` |
| B3 persisted line allocations | HELD | Entire card stopped under Q1; no table or mapper |
| B4 exact rationals and bound sources | HELD | No allocator rows or schema |
| B5 deposit-before-line rule | HELD | No leaf mapping tests |
| B6 refund/credit reversal hierarchy | HELD | No reversal implementation |
| DW1 linked 384/3000 allocations | HELD | No database or browser acceptance test written |
| DW2 F4/F4b/F5/F6/F7 | HELD | No mapping/kernel cross-check written; saved F5/F7 additionally remain Q2 holds |
| DW3 conservation, job links, reused cash, races | HELD | No database guard, race test or screen |
| DW4 receipt reversal and reopening | HELD | Q1: cannot atomically append case reversal |
| DW5 evidence invalidation projection | HELD | No projection; Q3 held figures not asserted |
| DW6 fixed priority order | HELD | No leaf rule/source tests |
| DW7 deposit exclusion | HELD | No leaf effective-time tests |
| DW8 PostgreSQL rationals, conservation, refunds, split equivalence | HELD | No database acceptance tests written |
| DW9 no deemed-net rounding | HELD | No leaf source architecture test or API |

## Reference figures (requirements only; not results)

| Scenario | Exact requirement in pence |
| --- | --- |
| receipt-384 | gross 38400 = net 32000 + tax 6400 |
| receipt-3000 | gross 300000 = net 250000 + tax 50000 |
| Combined | gross 338400; eligible net 282000; allocated tax 56400 |
| Reverse receipt-3000 | eligible net 32000; tax 6400; invoice balance 2217600; case 2 outstanding 250000 |
| Invalidate only claim 2 evidence | receipts 338400; invoice balance 1917600; only case 2 held |
| F4 | deemed catch net 2000000/43; test-only cumulative fee expectation 4651 |
| F4b | cumulative deemed catch net 80000/1; test-only fee expectation 8000 |
| F5 | deposit catch net 0/1, then 40000/1; test-only fee expectation 4000 |
| F6 | deemed catch net 0/1 with explicit non-catch source; test-only fee expectation 0 |
| F7 | deemed catch net 80000/1 on separate invoice; test-only fee expectation 8000 |

Fixture identities from the order: `recovery-18800`, `shadow-30000`, Test M and Test N. No fixtures were created, altered or exercised. No fee, cumulative fee principal, posting, journal, statement or collection was derived or stored.

## Migration and grants

Migration **0131** is assigned but **not created or registered**. Added objects: none. Added grants, policies, triggers, routines, alerts and data migrations: none. No existing table, column, view, policy, grant, role, trigger or routine is altered. No database was opened, so no existing record was changed by this work. This is not an executed database preservation test.

The planned grant catalogue remains unimplemented: each new tenant/job-qualified table must have ENABLE/FORCE RLS, migration ownership, runtime SELECT/INSERT only, no UPDATE/DELETE/TRUNCATE, append-only enforcement, composite FKs and exact routine EXECUTE grantees. The untouched 0018 v1 landing path must stay untouched.

For resumption, binding rule 9 remains:

> An upgrade proof proves ITS OWN migration only: install everything before N, snapshot, apply N alone, compare; then apply everything after N and require success twice. Compare existing rows by named pre-existing columns after all migrations. Never assert that later migrations add no column or replace no function; the fingerprinted-table guard owns 'may never gain a column'.

Its named-column canonical-text comparison, captured primary keys, full type snapshots, nonempty guards and rolled-back timestamp/retype/add-column/replace-function/later-insert controls are still owed. No migration proof was written or run.

## Commands and evidence

The default pnpm launcher was interrupted with exit 130 after emitting a configuration warning without returning a version. A read-only search found the already installed pinned pnpm 10.28.1 executable in the local store; its direct `--version` returned 10.28.1 with exit 0. All checks below prepend that existing executable's directory to PATH. No installation or package download command was run. Node is v24.17.0 (exit 0).

| Command | Exit / counts / meaning |
| --- | --- |
| `pnpm typecheck` | 0; 7/7 successful tasks, all 7 cache hits; baseline check, no allocator code |
| `LANE_BASE_REF=origin/main pnpm lint` | 1; fails in lane checking before package lint; inherited SV-2 paths outside this leaf |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 1; 18 inherited SV-2 paths outside this leaf |
| `pnpm build` | 0; 7/7 successful tasks, 4 cache hits; emitted an IO permission warning; baseline build |
| `pnpm openapi:check` | 1; `tsx` failed with `listen EPERM` while creating its IPC pipe; sandbox cannot bind sockets; generator check did not execute |
| Leaf Vitest commands | NOT RUN: Q1 stop; no leaf test files added or changed. Zero executed tests. The addendum permits only added/changed test files, so existing kernel/watchdog files were not run. |
| Separate API dependency build | NOT RUN: no code change; root build above includes API and dependencies, and addendum limits build to once |

Check logs are `/private/tmp/jg-m4-8-s-typecheck.log`, `jg-m4-8-s-lint.log`, `jg-m4-8-s-lanes.log`, `jg-m4-8-s-build.log` and `jg-m4-8-s-openapi.log` in the same temporary directory. The cache-replayed paths in task output belong to earlier worktrees; they are not fresh execution claims. No clean install was performed.

Generated `.pnpm-store`, package `dist`/`.turbo`, Next `.next`, build-info and test-results artifacts were removed before handoff. Installed dependencies were retained. No PostgreSQL or browser process was started.

The lane failures compare against local `origin/main`, which lacks the inherited SV-2 branch changes. Those paths include SV-2's variation application, shadow contract/verdicts, migration 0128, shadow repository, demo bootstrap, variation repository and shadow/origin tests. The addendum explicitly anticipates this unmerged base. No lane was widened, check weakened or comparison ref substituted. Only the lane entry and this receipt differ from dispatch HEAD.

NOT RUN (sandbox cannot start PostgreSQL / a browser):

- `pnpm test:db` and `pnpm test:migrations`.
- Planned `recovery-allocation.integration.test.ts`, `recovery-line-allocation.integration.test.ts`, `recovery-allocation-races.integration.test.ts`, `recovery-allocation-upgrade.integration.test.ts`; these files were not created because of Q1.
- `pnpm --filter @jobguard/web test:e2e --project=mobile-360 --project=desktop M4-8-S.spec.ts M4-7-S.spec.ts M4-1-S.spec.ts M4-2-S.spec.ts UIWIRE-12.spec.ts UIWIRE-14.spec.ts`; M4-8-S.spec.ts was not created because of Q1.

## Preservation and self-review

### Self-review

Re-read the full leaf diff and receipt against dispatch HEAD and inspected the inherited path list against `origin/main`. Confirmed the sole tracked change is one appended lane registration; the sole new repository file is this receipt. Every existing assertion and all feature sources remain unchanged. No permanent test freezes another leaf's files or a shared file. No credential-shaped literal was introduced. No BUILD_PLAN change, new dependency, lockfile change, fee implementation, UI polish or held production policy was added.

Re-read the public repository methods, `withTenant`, the practice pool wrapper, application composition and authoritative current-case projection. Confirmed the missing transaction seam affects both allocation and reversal, and that independent commits cannot satisfy Q1. Confirmed no existing supported transaction callback or exported event primitive was overlooked in the inspected repository.

Checked all B/DW statuses are HELD, all reference figures are labelled requirements, and no cache result or source inspection is presented as feature acceptance. Database conservation, tenant isolation, append-only grants, original-row preservation, audit rollback, exact allocation rules and browser behavior could not be verified because no implementation was authorized past the explicit Q1 stop and no database/browser can run here. Independent model review and separate acceptance have not occurred.

The following one-off SHA-256 comparisons matched the files at dispatch HEAD byte for byte (receipt evidence, not standing tests):

| File | SHA-256 |
| --- | --- |
| `packages/db/src/recovery-case-repository.ts` | `8713658ab74f74f08294551ad8e095fe40935c470a79a7ba4234bf863bd474da` |
| `packages/db/src/tenant-context.ts` | `9237013c368deeec3d14098b030264dbd6cc3e57534e4cbc237cad06aa2b4b0f` |
| `packages/db/src/practice-session.ts` | `9b765f410777c28334f9f7d8388e0a3c6e30f52bb6d4b4070c9b69e4ecbf1b14` |
| `packages/db/migrations/0018_recovery_outcomes.sql` | `42d13efe6aa491149300f167f2b3f7e4c66070f72357a4c75a0ca57a6840f3ba` |
| `packages/db/migrations/0097_recovery_case_current.sql` | `84aef359c62455818e4eb66d26ca9d21c13c49ddd06af202fd107be3950d9375` |
| `packages/db/migrations/0106_practice_feed.sql` | `47c469b941a0f8f2f342222ae967e42b8f363cd34f5a99383273c145bf9d44b7` |
| `packages/db/migrations/0128_shadow_persistence.sql` | `d8f7370560595a47f1395dad198abacda1e1351ade096697656c76805e957afe` |
| `apps/api/src/auth/context-boundary.test.ts` | `7f1914846f763c3534ffafc79701fc6f768e8e1546be2fe98e27bc32a99e0e8d` |

## Overlaps, follow-ups and gates

Actual shared overlap: the lane registry only, one new line, serialized by the integrator. Planned shared exports, migration lists, catalogues, workspace composition, OpenAPI, watchdog registry and mount point remain untouched. SV-3/SV-4 owners retain their assigned files; this leaf claims no new file belonging to them.

Owed: the Q1 transaction seam repair and re-dispatch, then the entire implementation and its acceptance suites. Persisted F5 remains held until a separate order adds the required two movements; persisted F7 remains held until SV-4 supplies supplementary invoices. Q3's unspecified held figures, Q6 fractional case splits and Q9 widening beyond owner remain founder holds. Q4 paused-only projection, Q5 merged receipt reversal, Q7 unchanged Practice receipts and Q8 exact API fractions remain the adopted instructions for resumption. SV-6 and M4-9-S remain future consumers, not implemented here.

Remaining release gates: D01, D02 and D03 v3 remain proposed; G4-S remains unmet. No deployment, production enablement, live provider action, spending, real data, independent verdict or acceptance was performed.

Builder receipt only — not independently verified, not accepted.
