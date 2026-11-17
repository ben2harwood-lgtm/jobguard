Built by Codex; dispatched 13 Oct 2026; worked 15 Oct 2026.

# PRACTICE-WORKER-SWITCH — partial builder receipt

Builder receipt only — not independently verified, not accepted.

The addendum's requested Sonnet attribution does not describe this run. Codex was available and built this partial change. No model review or acceptance was performed.

Base and final HEAD: `6671538c8d69936c162368c760dd6ce0f7f10493`. `origin/main` is the same commit. Branch: `codex/sandbox/practice-worker-switch`. The initial worktree was clean. No git write, commit, push, PR, merge or deployment occurred. Intended commit text is `/private/tmp/jg-msg-practice-worker-switch.txt`.

**PARTIAL, NOT READY FOR ACCEPTANCE:** the independent public schemas and tests are built. No switch migration, persistence, application, controller, route, four-role demo flow or CI browser journey is built. No callable switch endpoint exists. The issued base-check-6 STOP and exact lane scope prevent proceeding with the affected implementation. The header explicitly permits independent work, which is why the core boundary was completed.

## STOP items and main differences

**S1 — base check 6:** the draft says any identity table or writer absent from its attach-path list is a new path and requires STOP. The issued main contains the following absent from that list:

| Exact file:line | Draft before | Main now; source left unchanged |
|---|---|---|
| `packages/db/migrations/0143_sso_emergency_owner_window.sql:8` | P9 and the table list describe only the 0129 emergency path; no window table | `CREATE TABLE identity.sso_emergency_window (` |
| `packages/db/migrations/0143_sso_emergency_owner_window.sql:3` | P9 says an approval needs a rule that `CHECK(false)` forbids | `ALTER TABLE identity.sso_emergency_approver_rule DROP CONSTRAINT sso_emergency_approver_rule_held;` |
| `packages/db/migrations/0143_sso_emergency_owner_window.sql:126` | P9 names the old 0129 implementation | `CREATE OR REPLACE FUNCTION identity.sso_emergency_use(u uuid,p jsonb) RETURNS jsonb` |
| `packages/db/migrations/0150_membership_authority_fix.sql:51` | P1/P3 locate address creation at 0111:85 | `INSERT INTO identity.user_email(email,user_id) VALUES(c.email,u);` |
| `packages/db/migrations/0150_membership_authority_fix.sql:58` | P1 locates locator insertion at 0111:92 | `INSERT INTO identity.membership_locator VALUES(u,t,m);` |
| `packages/db/migrations/0150_membership_authority_fix.sql:75` | P3 locates locator repointing at 0111:107 | `UPDATE identity.membership_locator SET membership_id=m WHERE user_id=u AND tenant_id=i.tenant_id;` |
| `packages/db/migrations/0150_membership_authority_fix.sql:78` | P3 locates locator insertion at 0111:110 | `INSERT INTO identity.membership_locator VALUES(u,i.tenant_id,m);` |
| `packages/db/migrations/0150_membership_authority_fix.sql:80` | Invitation acceptance writer listed only at 0111:112 | `UPDATE identity.invitation SET accepted_at=clock_timestamp() WHERE id=i.id;` |
| `packages/db/migrations/0150_membership_authority_fix.sql:117` | P2 locates invitation creation at 0111:156 | `INSERT INTO identity.invitation(id,email,tenant_id,account_id,role,expires_at,issuer_user_id)` |

These are source findings, not evidence of an exploitable route. The new window has a foreign key onto emergency use at 0143:13, and the current emergency routine resolves membership via `identity.current_memberships` at 0143:146. Those observations do not waive the explicit STOP. The coordinator must reconcile the path list and associated proof requirements before the database/route build resumes. No alteration of any listed source line is proposed or made by this piece. **Main wins over the draft.** The old P9 impossibility claim is not repeated as a guarantee.

Base migrations reach `0158_extra_approval_chain.sql` (`packages/db/src/migrate.ts:92`), as the header says. Migration `0165_practice_worker_switch.sql` is reserved but not created or registered. ENT-3b, ENT-3c, ENT-3d, ENT-10e, ENT-5 and ENT-5b are already on this base; claims in the draft that they are in flight are stale. Not every old citation was revalidated after the mandatory STOP; none is offered as verification of the held implementation.

**S2 — latest header versus exact lane:** decision 39 authorizes operative, surveyor, supervisor and client, and writing a CI browser journey. It supersedes the old two-role restriction and the old browser-spec hold. The supplied 29-path lane has no page, component or e2e path. Its exact new row is `config/agent-lane-assignments.json:145`, immediately before `sbox-1`; the existing hardening row is now at 144. Before: no practice-worker-switch row. After: the issued row, with the migration path resolved to `0165_practice_worker_switch.sql`, and no additional allow entry. No existing lane line was edited. The coordinator must supply exact Northside demo and browser-spec paths before those parts can be built. No lane widening was attempted. The granted four-role direction is not being reopened for permission.

**S3 — merged lane check:** `tools/agent-lane-boundary-lint.mjs:212` refuses the prescribed base because HEAD equals the base and the builder may not commit. Before and after, unchanged:

```js
if (!branch || (base && base === target)) throw new Error("Missing branch or self-comparison range; refusing a misleading pass.");
```

Line 211 before it ends the event dispatch; line 213 after it starts parsing `--lane=` arguments. The actual output was `Lane boundary FAILED: Missing branch or self-comparison range; refusing a misleading pass.` No checker edit, alternate base or synthetic commit was used. Dispatcher can commit the working tree and rerun against the issued base; no weaker assertion is requested.

**S4 — permission refusal:** command:

```sh
ps -axo pid,ppid,etime,command | rg 'practice-worker-switch|vitest|pnpm' | head -30; ls -d /Users/benharwood/Library/pnpm/.tools/pnpm/10.28.1* /Users/benharwood/Library/pnpm/.tools/@pnpm* 2>/dev/null
```

Output: `zsh:1: operation not permitted: ps` and `zsh:1: no matches found: /Users/benharwood/Library/pnpm/.tools/pnpm/10.28.1*`. Shell exit 1. Process inspection stopped; no other process-enumeration method or escalation was attempted. This was a sandbox refusal, not an automatic approval-review rejection.

## Six base checks

1. PASS, source-inspected: `git grep -n 'FUNCTION app.contractor_practice_session_live' -- packages/db/migrations` finds only 0138 (CREATE at 38, OWNER at 43, REVOKE at 44).
2. PASS, source-inspected: 0138 is registered at `packages/db/src/migrate.ts:79`; the list continues through 0158 at 92. No new migration registration was made after S1.
3. PASS before edits: `git grep -n -e practice_worker_switch -e practice_company_marker -- packages/db/migrations` returns no matches (exit 1 is the expected grep result).
4. PASS: the context bridge, practice-session repository and merged fixtures exist. The fixtures export the named starter and migration helpers. They remain unchanged.
5. PASS, source-inspected: the live helper and lookup match the relied-on names and body on the issued base. Exact helper, 0138:38–42:

```sql
CREATE FUNCTION app.contractor_practice_session_live(s uuid)
 RETURNS TABLE(session_ref uuid,tenant_id uuid,membership_id uuid,identity_user_id uuid)
 LANGUAGE sql SET search_path=pg_catalog AS $$
 SELECT x.session_id, x.tenant_id, x.membership_id, x.identity_user_id FROM control_plane.contractor_practice_session x CROSS JOIN (SELECT clock_timestamp() AS reading) c WHERE x.session_digest=app.contractor_practice_session_digest(s) AND x.revoked_at IS NULL AND x.expires_at>c.reading AND app.contractor_practice_home_deadline(x.session_digest,c.reading)>c.reading AND current_database()='jobguard_synthetic_demo'
$$;
```

Exact old **and still-current** lookup, 0138:46 (no new lookup was built):

```sql
CREATE OR REPLACE FUNCTION app.contractor_session(s uuid) RETURNS TABLE(tenant_id uuid,membership_id uuid,identity_user_id uuid) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT l.tenant_id,l.membership_id,l.identity_user_id FROM app.contractor_practice_session_live(s) l $$;
```

6. STOP: table and writer searches completed; differences are S1. All 24 identity-table declarations were found: `identity_user`; `user_email`, `membership_locator`, `invitation`, `challenge`, `request_window`, `session`, `security_event`; `sso_connection`, `verified_domain`, `idp_group_role_mapping`, `sso_request`, `sso_assertion_use`, `sso_subject`, `sso_session_binding`, `sso_grant`, `sso_refusal_event`; `sso_required_event`, `sso_emergency_approver_rule`, `sso_emergency_approval`, `sso_emergency_use`, `sso_emergency_event`; `scim_event`; `sso_emergency_window`. The current writer search found 20 lines, including the auth-provider INSERT, one merged test string, the 0111/0120/0137 writers and the six new 0150 lines. P13's operator-source search finds only `demo-bootstrap.ts:91` writing `identity.identity_user`; no operator source was changed or pinned by a test.

## Built scope and tests

`packages/core/src/practice-worker-switch.ts` implements only the two strict commands, strict public state, strict closed failure, typed error, HTTP mapping and documentation window constant. It has no network, database or platform import. The appended export in `packages/core/src/index.ts` is the only existing application-source edit. The test was written before the module. `docs/contracts/practice-worker-switch-v1.md` explicitly distinguishes built shape validation from the unbuilt security design, lists the planned routes and the sixteen design limits, and honors decision 39.

The first actual Vitest run failed with exit 1: one failed suite, zero executed tests, missing `./practice-worker-switch.js`. After implementation 69 tests passed. A later direct typecheck caught my test's `node:crypto` import, which is not typed in core; I replaced it with the existing global-crypto pattern and reran the affected test and typecheck successfully. No merged test was edited.

| Acceptance | Status and evidence |
|---|---|
| PW1 | HELD S1: no persistence/success-path test built |
| PW2 | HELD S1: no authority-switch test built |
| PW3 | HELD S1: session/cookie invariants not exercised by a new route |
| PW4 | HELD S1; old target/caller rules also require decision-39 revision |
| PW5 | HELD S1; do not retain draft refusal of the now-authorized surveyor/client |
| PW6 | HELD S1: no tenant integration tests built |
| PW7 | HELD S1: no replay implementation or tests built |
| PW8 | HELD S1: constant is built; no database-clock proof |
| PW9 | HELD S1: no ended-session route proofs built |
| PW10 | HELD S1: no audit/rollback integration tests built |
| PW11 | HELD S1: no race tests built |
| PW12 | HELD S1: no differential proof built |
| PW13 | HELD S1: no same-company switch proof built |
| PW14 | HELD S1: no lookup replacement built |
| PW15 | HELD S1: no marker company rule built |
| PW16 | HELD S1: no sign-in triggers built |
| PW17 | HELD S1: no database constraint proof built |
| PW18 | HELD S1: no second-database proof built |
| PW19 | HELD S1: no transport/mode application built |
| PW20 | HELD S1: no full negative-control group built |
| PW21 | PARTIAL: P `accepts only the minimal versioned command` (2 tests), `refuses authority field %s` (54 tests). Application/web portions HELD S1 |
| PW22 | HELD S1: no refusal-record implementation built |
| PW23 | PARTIAL: P `the public state accepts the three states with nullable facts`, `no public state carries %s` (9), `state fields reject invalid identities, times, versions and environment`, `failures expose only the version and the closed code`. Storage/transport portions HELD S1 |
| PW24 | PARTIAL: P `every closed failure has exactly its specified HTTP status`. Nest/web/origin portions HELD S1 |
| PW25 | HELD S1: no new database objects or grants to inspect |
| PW26 | HELD S1: no migration or upgrade proof built |
| PW27 | HELD S1: no rollback constants or rollback proof built |
| PW28 | PASS, deterministic test only: unchanged boundary scanner, 145 tests, exit 0; hashes equal base |
| PW29 | NOT RUN: dispatcher/CI suites, cannot start PostgreSQL here; no whole-suite attempt |
| PW30 | HELD S1: no fresh-read proof built |
| PW31 | HELD S1: path reconciliation prerequisite is unresolved |
| PW32 | HELD S1: draft grant rule must reflect all four approved roles |
| PW33 | HELD S1: no hand-built-company proof built; QI no is retained |
| PW34 | HELD S1: no composed-lookup proof built |
| PW-F1 | HELD as separate follow-up, QL no; this is not the now-authorized CI role-switch browser specification |

Coordinator lookup conditions (a) through (f) are all HELD S1, not satisfied by the core tests. No placeholder tests were added to suggest coverage of unbuilt security behavior.

## Seven RED questions — scope-limited builder answers

These are not independent verdicts. No new acting session can be produced by this partial tree, because there is no migration or service.

1. Can a path make the switch work for a company that is not made-up or change its company? **No new switch path exists.** Core schemas select no tenant (`packages/core/src/practice-worker-switch.ts:6`); full database proof HELD. Current lookup remains 0138:46.
2. Can a worker session hold more grants? **Not evaluated for a new switch:** no switch/grant write exists. Eventual decision-39 role/grant tests HELD. The only new production module imports only Zod (`packages/core/src/practice-worker-switch.ts:1`); the complete source diff is the evidence for its absence of grant writes.
3. Can a wrongly authenticated caller discover a target? **No new target route exists.** HTTP and authority-order proofs HELD; strict command shapes at `packages/core/src/practice-worker-switch.ts:6` and `:11` refuse membership/actor authority fields.
4. Can the session be extended or an ended session act? **This change writes no session and cannot enable acting.** Merged helper remains 0138:38–42, unchanged; new session-ending proofs HELD. Switching must neither extend nor revive a session when it is eventually built.
5. Can the new trigger change an unmarked company? **There is no new trigger.** The full trigger noninterference proof is HELD.
6. Can an already-running switch survive a new sign-in row, by any path? **No new switch can run here; the future answer is not verified.** S1 names why the old P1–P15 claim cannot be assumed complete on this base.
7. Can a session act with wider grants, and can the grant trigger affect an unacted-as member? **No new acting session or grant trigger is built.** The four-role rule and its proof remain HELD.

## Database changes, privileges and rollback

New GRANT statements: **none**. Standard F is preserved: no new runtime table privilege, direct write grant, or routine EXECUTE grant. No business network calls or money reads/writes are added. No table, routine, trigger, column, constraint, index, policy, owner, ACL, session record, audit event or existing object is changed or dropped. There is no migration/backfill to run and no new operational alert.

The requested ten routine definitions and two table definitions are unbuilt, rather than represented here as existing objects. No advisory keys were chosen. The base advisory-lock search produced 146 matching lines; its actual output was captured at `/private/tmp/jg-pws-advisory-locks.txt`. Choosing keys and the lock-order proof belong to the held database implementation.

Rollback note for this partial build: there is no lookup change to undo and no switch-on EXECUTE grant to revoke. **Do not run** the draft's feature-off statement against this tree: `app.practice_worker_switch_on` does not exist. No rollback statement or DROP TRIGGER statement is claimed tested. The old hardened body quoted above remains in force. Planned two-statement rollback and full rule-9 upgrade controls remain HELD until a migration exists.

## Runs and limits

All test runs were serial, one file per run, `--maxWorkers=2`; no browser, database server, dev server or socket was started. Observed memory was 57–59% free and available disk was 62–64 GB, above the issued limits. No dependency install or download command was issued. Runtime observed: Node `v24.17.0`; `.nvmrc` is `24.15.0`. No runtime pin was edited. The configured package manager is `pnpm@10.28.1`.

The global pnpm entrypoint printed a warning about ignored `pnpm.overrides` and did not reach a test result. I interrupted it (exit 130), then used the installed local Vitest/TypeScript binaries. A separate pnpm version probe also did not return and was interrupted (130). No full pnpm or Turbo check is claimed green, cached or otherwise. The required `--force` root typecheck/lint/build commands were **NOT RUN**; no cache-hit result substitutes for them. Root lane lint was attempted directly and failed S3.

| Actual validation command | Exit | Result |
|---|---|---|
| `export PATH="$HOME/Library/pnpm/bin:$PATH"; memory_pressure \| tail -1; df -g /System/Volumes/Data; pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/practice-worker-switch.test.ts` | 130 | interrupted before Vitest output |
| `export PATH="$HOME/Library/pnpm/bin:$PATH"; pnpm --manage-package-manager-versions=false --version` | 130 | interrupted; no version returned |
| `./node_modules/.bin/vitest run --maxWorkers=2 src/practice-worker-switch.test.ts` in `packages/core` | 1 | first failing run: 1 suite failed, 0 tests; module absent |
| same local core command, after implementation | 0 | 1 file, 69 tests passed |
| `./node_modules/.bin/vitest run --maxWorkers=2 src/auth/context-boundary.test.ts` in `apps/api` | 0 | 1 file, 145 tests passed |
| `./node_modules/.bin/tsc -p packages/core/tsconfig.json --noEmit` | 2 | new test's Node import not typed; fixed |
| `LANE_BASE_REF=6671538c8d69936c162368c760dd6ce0f7f10493 node tools/lint.mjs` | 1 | purity passed for 169 TypeScript files; lane lint stopped S3 |
| local core Vitest command, after fixing test import | 0 | 1 file, 69 tests passed |
| `./node_modules/.bin/tsc -p packages/core/tsconfig.json --noEmit` | 0 | no diagnostics |
| `./node_modules/.bin/tsc -p packages/core/tsconfig.json --outDir /private/tmp/jg-pws-core-dist` | 0 | direct core compilation, output outside worktree; not a root build |
| `node tools/core-purity-lint.mjs` | 0 | 169 TypeScript source files |

Each local test/typecheck/build shell command included `memory_pressure | tail -1; df -g /System/Volumes/Data` before its final executable. The exact command strings and captured outputs available from those runs are in `RUNS.json`; the first-failure and asynchronous completion outputs are included there. Read-only inspection command inventory is in `INSPECTIONS.md`. No check was retried by weakening an assertion.

NOT RUN / NOT BUILT: D1 `practice-worker-switch.integration.test.ts`, D2 `practice-worker-switch-proof.integration.test.ts`, D3 `practice-worker-switch-upgrade.integration.test.ts`, D4 `practice-company-marker.integration.test.ts`; HTTP, application and three web-handler test files. These files are not written after S1, not silently passing. Their required PostgreSQL runs cannot start here under the dispatch environment. Browser journey not written after S1/S2 and cannot be run here; CI only. All PW29 merged database suites and all migration-driving files remain for dispatcher/CI; no acceptance is claimed. Full root forced typecheck, forced lint, forced build, `lint:lanes`, and OpenAPI checks remain NOT RUN (pnpm launcher stalled, lane check additionally S3; API composition unchanged).

## Held items and design limits

The sixteen numbered limits are recorded in the partial contract as **pending design limits**, not tested guarantees. In particular, the original wider-grant restriction and attribution design cannot be called complete for the four roles from decision 39. Its whole-path proof must use the current 0143/0150 identity behavior.

Still held: cosmetic UI work; direct worker-to-worker switch; window renewal; new seeded people; automatic switch closure on session revocation or an identity row; marker removal or real sign-in for a marked company; HARDEN-1 session changes; a protected origin record (QI no); indexes on existing identity tables; per-action switch attribution beyond the approved requirement as needed by the completed design; all real-user/provider/pilot/production/deployment activity. PW-F1 remains the separate tests-only follow-up (QL no), though ENT-3a and ENT-3b are merged now. The four-role controls, real-actor attribution and CI browser specification are authorized by the header and **blocked**, not rejected or treated as old Ben-level holds. No browser may run locally.

ENT-11a handoff: the intended start contract is `POST /api/contractor/practice/workers/[workerId]/acting-as` with `{ version: "practice-worker-switch-on.v1", commandId }`; end is `POST /api/contractor/practice/acting-as/end`, and read is `GET /api/contractor/practice/acting-as`. **These routes and `createPracticeWorkerSwitchApplication` do not exist in this partial build.** ENT-11a cannot use them until the held implementation lands; it must not substitute a fabricated membership. No exact function is falsely advertised as callable.

## Self-review

I reread the source diff, checked the schemas against the issued public shapes, verified each new test title starts with its acceptance ID, and corrected the only compiler failure in my test. I checked that no role-selection policy, context constructor, database/session write, cookie operation, vendor call or credential-shaped literal was introduced. I did not claim full coverage for an acceptance line satisfied only in part.

The scanner and its eight pinned files are byte-identical to base; SHA-256 values and comparisons are in `SOURCE_EVIDENCE.json`. No merged test, list, pinned value, migration, security source, shared harness, watchdog registry or plan file changed. `config/agent-lane-assignments.json` adds exactly one issued row; `packages/core/src/index.ts` appends exactly `export * from "./practice-worker-switch.js";`. The other six shared registration files are untouched. The contract and this receipt explicitly avoid presenting the unbuilt lookup/trigger design as verified. Source evidence and `git diff --stat` are receipts only, never permanent test pins.

`DIFF_EVIDENCE.txt` records the exact registration diff, tracked diff stat, all untracked task files and their SHA-256 values. Tracked `git diff --stat` is two files with two insertions, because new files are untracked until the dispatcher stages them; that stat alone is not a claim that the new files are absent. `git diff --check` passed, exit 0. No `.pnpm-store`, build-output or test-results path is in the changed/untracked path list; emitted compilation output is under `/private/tmp`.

Remaining gates: coordinator path-list reconciliation; exact demo/e2e lane paths; complete four-role database and route implementation with real-actor attribution; every held acceptance proof; dispatcher commit and forced checks; CI PostgreSQL/browser runs; independent RED Opus + Sol verdicts bound to the final committed head; separate acceptance. No acceptance or release gate is satisfied by this receipt alone.
