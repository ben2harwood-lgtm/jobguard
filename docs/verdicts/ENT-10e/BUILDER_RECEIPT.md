# ENT-10e round r5 — current builder receipt, 13 October 2026

Current evidence: [R5_RECEIPT.md](R5_RECEIPT.md), [R5_COMMANDS.md](R5_COMMANDS.md), [every protected test line](R5_PROTECTED_TEST_LINES.md), and [unchanged assertion comparison](R5_ASSERTION_CHECK.json). These supersede all earlier status statements below. Builder evidence only; RED lane remains pending real PostgreSQL/CI, historical secrets finding resolution and new exact-commit independent verdict/acceptance.

Resolved main 45125a4 conflicts keeping 0142 then 0143. Repaired same-mailbox cooldown fixture inputs and E1's missing client_type; all 197 existing assertions preserved. Local build, typecheck, package lint, generator snapshot comparison and 5,056 selected source/tool tests passed. Root lane checks fail on 31 byte-identical inherited main paths while the merge is unfinished; exact openapi launcher is sandbox-blocked, same generator comparison passed. PostgreSQL/browser/full suite not run. No git write. Intended message: /private/tmp/jg-msg-ent-10e.txt.

---

# ENT-10e round r4 — builder receipt, 13 October 2026

Actual builder: Codex; dispatcher 4; RED lane; draft PR #180. Builder receipt only — not independently verified, not accepted. This section supersedes the r3 status below; historical evidence is retained.

Current existing HEAD: `749e693364e00f23f0026aa4c677b773e9c5400f`, branch `codex/sandbox/ent-10e`. The dispatcher started `git merge origin/main`; MERGE_HEAD and origin/main both name `e4cb8437d044746300c377647f6061d06cd960cc`. The r4 review target is the uncommitted tree on that HEAD during this merge. No git write was performed. The two conflict files now contain no markers, but their index entries remain unmerged until the dispatcher stages them and commits. No resulting commit exists to bind a new independent verdict to yet.

Opus's verdict at `/Users/benharwood/.local/share/full-steam/jg-runs/ent-10e-opus-749e693.md` and Sol's at `/Users/benharwood/.local/share/full-steam/jg-runs/ent-10e-solcheck-20261013T222257.md` both record REPAIR against HEAD 749e693. They are source reviews of the prior commit, not independent verification of this repair. LATER items remain deferred; database/browser CI and new exact-commit verdicts still precede technical acceptance.

| r4 item | Repair / evidence | Result |
| --- | --- | --- |
| CATCH-UP: migration notes and runner | Main's bytes preserved exactly; its 0141 ENT-3d entry comes before this piece's 0143. No 0142 registration: CH-7-INSURER remains an open PR. Read-only comparison against origin/main and HEAD passed. | Both working-tree conflicts resolved; dispatcher must stage/finish merge. |
| Sol security blocker: current owner under lock | 0143 is edited in place. Pre-lock membership discovery retains identity only. After taking the company advisory lock, the SECURITY DEFINER routine re-reads the same membership through `identity.current_memberships`, which excludes revoked/expired memberships; restores the requested company context; then checks the merged permission and current owner role before any window/approval/use write. | SOURCE-INSPECTED; PostgreSQL NOT RUN. |
| Regression for permission changes while waiting | New `[E10]` cases in `sso-emergency-window.integration.test.ts` consume real fixture mailbox proof, observe the identity backend blocked by the company lock, then commit downgrade to admin, revocation or expiry before releasing the lock. Exact refusals, unchanged switch/approval/use/window rows, prior audit preservation and only the permitted refusal log/audit are asserted. The downgrade retains organisation.manage and would open a window with the old cached role, failing these assertions. | AUTHORED and test-file typechecked; NOT database-reproduced, including unfixed control. CI required. |
| Opus/Sol OpenAPI blocker | Repository generator regenerated apps/api/openapi.json: GET `/auth/sso-required/detail`, required commandId, `sso-emergency.v2` body and 201 `sso-emergency-response.v2` description. Generator comparison passed, then the exact `pnpm openapi:check` passed with narrowly approved tsx IPC socket access. No schema hand-edit or manifest change. | PASS (generator/check execution). |
| Existing expectation preservation | Both protected emergency test files remain byte-identical to 749e693. The own window-test edit adds only E10; no existing expectation changed. Main's merged tests and all pinned values remain untouched. | SOURCE-INSPECTED / SHA-256 verified. |
| Local checks | Full typecheck, full build, all package lint tasks, database-test compilation, money/commercial boundary checks and OpenAPI comparison/check pass. Unit results and command details are recorded below. | RUN; database/browser evidence still pending. |
| Root lint and lane checks | Both were run with LANE_BASE_REF=origin/main. The unfinished merge makes the lane scanner reject 52 staged paths inherited from main. All 52 are byte-identical to origin/main; no lane policy widened or scanner changed. | FAIL in unfinished merge; rerun after dispatcher commits catch-up. |

No new grant, table, dependency, role policy, migration number, provider, external action, charge, alert or release enablement. Affected invariants: current membership/authorization under the company lock (AGENTS §§5.1/5.3), atomic approved effects and audit (§§5.4/5.7), preserved prior guarantees (§1). 0143 remains an unmerged migration, with its existing forward-fix-only strategy. No applied migration is edited; 0129 remains byte-identical. Backwards compatibility is unchanged from r3: retired emergency v1 remains refused; administrative switch/view behavior is preserved. Synthetic-only and all D04/G5/security/commercial release gates remain held.

Protected SHA-256 values, verified both against HEAD and against the start of r4:

| File | SHA-256 | r4 state |
| --- | --- | --- |
| packages/db/test/sso-emergency.integration.test.ts | 5c637b625854ac11b4b1a13b2a161a737c1eb47cb62a0dcd70b9e29f773f76c1 | UNCHANGED |
| packages/db/test/sso-emergency-concurrency.integration.test.ts | 6457c251d2117b3b77f9e9cdff16f1be85eef37df87681fdfdbbe5d635c5f741 | UNCHANGED |
| packages/db/migrations/0129_sso_required.sql | 4bbeb8d9e88a8f65dc4c47ac369717b95c62e68b113793f5a0c0ad62a7446c50 | UNCHANGED |

## r4 executed checks

R4_COMMANDS.md records exact commands, results and limitations. No clean reinstall or download was attempted: installed dependencies and cached pinned pnpm 10.28.1 were used, via the pre-existing temporary pnpm shim. Node v24.17.0. Ordinary global pnpm --version stalled and was interrupted (130); no override of the package-manager pin was applied.

| Executed check | Result |
| --- | --- |
| `pnpm typecheck --force`; `pnpm build --concurrency=2 --force`; separate `turbo run lint --force --concurrency=2` | PASS: seven tasks each, zero cached. |
| Five database-test-file TypeScript compile; money and commercial boundary scans | PASS; compilation is not PostgreSQL execution. |
| Exact `pnpm openapi:check` with approved tsx IPC access | PASS; initial sandbox IPC refusal and identical node-loader comparison retained in journal. |
| Focused SSO/owner/unlinked/disclosure/required/path/context units | PASS: seven files, 216 tests. |
| Core source units; AI fixtures; web units; seven non-git-writing tool suites | PASS: 2415 core, 80 AI, 784 web, 19 tool tests. |
| Initial selected Turbo unit run | FAIL: four core failures (two five-second timeouts and two emitted copies looking for source .ts files); 4826 core tests passed. Config/storage passed; AI not reached. Source-only core rerun passed without changing tests/timeouts. |
| Broad API source run with explicit HTTP exclusions | FAIL: 64 files / 1563 tests passed, one skipped; existing final-account database fixture failed port allocation before PostgreSQL startup. |
| Database-package non-integration units | FAIL: source-only run has 152 passed, one unchanged C-OPS-1 reachability test timed out (five-second bound). Initial run also found its emitted duplicate: 236 passed, two timeouts. No assertion or timeout relaxed. |
| Root lint and lint:lanes, both with origin/main base | FAIL: 52 unchanged main paths exposed by unfinished merge; dispatcher must rerun after commit. |


PostgreSQL acceptance/concurrency/RLS/upgrade tests, `pnpm test:db`, `pnpm test:migrations`, `pnpm test:e2e` and ENT-10d.spec.ts: NOT RUN here, as instructed; GitHub CI after dispatcher push is required. The initial broad API unit invocation encountered an existing database-backed suite hidden behind an ordinary source-test filename; it failed freePort before starting PostgreSQL. No database guarantee is inferred from source tests or compile checks. Full `pnpm test` is not claimed: it includes PostgreSQL and the lane-tool tests that issue git writes in temporary fixture repositories, contrary to this round's no-git-write scope. AI fixture tests do not establish any live-model/provider approval.

Self-review: main-only rejected paths and exact conflict preservation checked by read-only git-show comparisons; under-lock role/active-member read and tenant-context reset inspected; E10 waiter/blocker synchronization and unchanged-effects assertions inspected; OpenAPI diff restricted to the requested SSO contract additions; protected tests and 0129 hashes rechecked. The downgrade control is logically regression-sensitive but not executed against PostgreSQL. No builder verdict/acceptance, sub-agent, commit, add, checkout, push or merge command. Intended conventional commit message overwritten at `/private/tmp/jg-msg-ent-10e.txt` for the dispatcher. Current HEAD remains 749e693; resulting commit/verdict binding remains the dispatcher's/reviewers' work.

## Historical r3 receipt (superseded by r4)

Built by Codex (actual builder); dispatched 13 Oct 2026.

# ENT-10e continuation r3 — builder receipt

Builder receipt only — not independently verified, not accepted.

This section supersedes the STOP status of the historical rounds below. The r3 coordinator ruling authorized all named setup re-points and the exact equality enrichment at concurrency line 152. No assertion STOP remains. The working tree contains migration 0143, code, strict schemas, both transports, new tests, contracts and evidence. **OpenAPI regeneration is the outstanding build item:** the repository generator was refused by the sandbox's IPC socket restriction. The checked-in OpenAPI file was not rewritten through another route. PostgreSQL/browser execution and both RED verdicts remain pending; this is not a completed technical acceptance.

The requested Claude Sonnet attribution would name a different builder. Actual attribution is Codex; no Claude review or co-author contribution is claimed. No agent was spawned and no builder accepted its own work.

## Head, catch-up and scope

Initial and final existing HEAD: `a390b739095a4250c8f36dacb74ef3e0bfaaa672`, branch `codex/sandbox/ent-10e`, PR #180 retained. Initial tree was clean. Initial local origin/main: `6659fb58791ec22588948f005b2bd4f6b299fa48`; divergence 9 branch / 17 main commits. Legacy read-only merge-tree inspection showed no actual initial merge conflict. Per r3 the dispatcher does the catch-up; this builder built on the current head and performed no git write. The local origin/main moved externally during work to `e4cb8437d044746300c377647f6061d06cd960cc` (divergence then 9 / 39). No fetch or merge by this builder. The receipt binds to the reviewable uncommitted working tree; the dispatcher must bind subsequent independent verdicts to its exact resulting commit and catch-up.

ENT-10d draft reference was `baf5cdae62118556474d099ce993a32a6f85bcc0`; it was already merged before this issued branch. Migration 0129 on this head is byte-identical, SHA-256 `4bbeb8d9e88a8f65dc4c47ac369717b95c62e68b113793f5a0c0ad62a7446c50`. The issued lane line was already present from the original round, after ent-10d and before ent-2; it was not widened or rewritten in r3. BUILD_PLAN.md/AGENTS.md untouched. All working-tree paths are within that lane; file/stat/hash evidence is appended below and in R3_UNCHANGED_SHA256.txt.

The coordinator commits remain applied:

- `e77ef5c8ee9ab26c47e0558308a7791637cfa07a`: five held-state retirements, 35 removed lines, two files.
- `8ad002aa4e597f86ea506e4851db431061406ab7`: expired approval re-pointed to complete expired window and fresh owner use; all its assertions retained.
- `a942cdc0cfa9cc85bc5b817e18bbdb6382600b7a`: existing rows matched by primary key, exactly one added approval/use/window; those checks retained.

No further check was retired. R3_ASSERTION_TABLES.md contains one row for every individual pre-existing `expect` (100 across the two database and two unit files), and one before/after row for every touched line in the two emergency database files, including additions. Statuses are KEPT / STRENGTHENED / RE-POINTED only. In particular, original integration line 168 remains `expect(result.used).toBe(true);` against a valid v2 owner use. Original concurrency line 152 retains `toEqual`, all four original fields, and gains eventId/windowMinutes/closesAt, each compared to the stored window selected by the winning **command id**. No result projection or partial matcher substitutes for exact equality. The v1 schema remains exported and byte-identical; U4 E9 and D2 E9, plus D4 T2 direct SQL input checks, refuse the retired shape.

## Five coordinator retirements and their replacements

| Coordinator-retired check | Replacement test id and file:line (full titles in acceptance map) | Proof / execution |
| --- | --- | --- |
| S10a, original integration 90–103 | E9: packages/db/test/sso-emergency.integration.test.ts:290; E1: packages/db/test/sso-emergency.integration.test.ts:207; E2: packages/db/test/sso-emergency.integration.test.ts:234; E7: packages/db/test/sso-emergency.integration.test.ts:273 | Non-owners/outsiders still refused, v1 refused for shape, exactly one immutable rule. PostgreSQL NOT RUN; both reviewers pending. |
| S10b, original integration 104–115 | E1: packages/db/test/sso-emergency.integration.test.ts:207; E2: packages/db/test/sso-emergency.integration.test.ts:234; E3: packages/db/test/sso-emergency.integration.test.ts:247; E4: packages/db/test/sso-emergency.integration.test.ts:256 | Admin/non-member refusals and successful owner uses recorded; failed audit rolls all effects back. PostgreSQL NOT RUN; both reviewers pending. |
| S10c, original integration 116–121 | E7: packages/db/test/sso-emergency.integration.test.ts:273 | Single fixed rule, different insert/update/delete refused, no application approval writer. PostgreSQL NOT RUN; both reviewers pending. |
| S10d, original integration 143–144 | E7: packages/db/test/sso-emergency.integration.test.ts:273 | Old held/rule assertions replaced; added approval/use zero after rollback at integration line 140. PostgreSQL NOT RUN; both reviewers pending. |
| Concurrency original line 115 latch assertion | E6: packages/db/test/sso-emergency-concurrency.integration.test.ts:105; E7: packages/db/test/sso-emergency.integration.test.ts:273 | Two checked execution connections, two consumed real mailbox proofs, both command-id variants, five rounds, one new approval/use/window and strict audit/history assertions. PostgreSQL NOT RUN; both reviewers pending. |


Both fresh reviewers (Opus and Sol) must confirm this mapping and every assertion/touched-line table row. Their execution evidence and verdicts are NOT supplied by the builder. A weakened row remains BLOCKING; none is claimed as authorized by this receipt.

## Built definitions, implementation and acceptance

The complete definitions are in docs/contracts/sso-required-v1.md, ENT-10e section. Every criterion E1–E9, T1–T8, L1–L7, K1 and U1 has a named test; R3_ACCEPTANCE_MAP.md lists current titles and file:line, with unit PASS and database NOT RUN distinguished. BUILT means authored, not independently verified or acceptance satisfied.

| Definition | Implementation / named evidence | State |
| --- | --- | --- |
| Owner | Only the current_memberships role owner plus merged contractor_allowed organisation.manage; any current owner, no group mapping promotion. E1/E2/E7. | BUILT; database NOT RUN |
| One-step approval | The owner's mailbox-proven command records named approval and consumes it in the same transaction. E3/E4. | BUILT; database NOT RUN |
| Emergency window | One immutable exact-duration row per use, tenant-qualified keys/references and unique command id. T2/T5/K1. | BUILT; database NOT RUN |
| Effective required state | One private clock-based state routine, six existing gate/view reads replaced, missing window fails closed. T3/T4/T6. | BUILT; database NOT RUN |
| Automatic switch-back | No clock process, new row or expiry audit; deadline governs each check. T4/T7. | BUILT; database NOT RUN |
| Sessions | Ordinary sessions retain lifetime/other companies and lose this company at the first closed-window check. T4/T8. | BUILT; database NOT RUN |
| People joining during a window | Invitations work while open; strict ON can refuse new unlinked member, automatic close cannot. T3/T7. | BUILT; database NOT RUN |
| Not yet linked | Same guard population, never_linked/earlier-membership distinction, own addresses and separate pending invitations, 200 row cap/order. L1/L2/L4/L5. | BUILT; database NOT RUN |
| Replay | Latest mailbox code, one consumed approval and forever company-unique commandId. E5/E6. | BUILT; unit PASS; database NOT RUN |

Default 60 minutes; allowed 15 to 240; chosen by the order drafter and confirmed by the integrator's answer to Q3. Unset or empty setting defaults to 60; invalid settings refuse rather than clamp/round/default. Only the service-composition line reads JOBGUARD_SSO_EMERGENCY_WINDOW_MINUTES; its required function import is the only companion import edit. No request setting key is accepted. An absent fifth service argument or invalid configuration reaches SQL as null. The routine independently checks JSON numeric integer 15–240 and the table checks bounds and exact deadline.

Fixed rule row: `14300000-0000-4000-8000-000000000001`, `company-owner-only.v1`, `{"approver":"company_owner"}`. Its id/version/definition CHECK permits only that row; the merged immutable trigger prevents update/delete. No new rule privilege. Existing approval SELECT for the restricted identity role remains as established by 0129; approval writes remain denied to application roles. E7 tests write denial rather than claiming the unchanged existing SELECT grant disappeared.

New objects: identity.sso_emergency_window (migration owned, FORCE RLS, immutable), identity.sso_required_state(uuid) (private SECURITY DEFINER, search_path pg_catalog), identity.sso_required_detail(character,uuid) (checked administrator SECURITY DEFINER, same search_path). Seven CREATE OR REPLACE routines keep their signatures/owners/ACL: sso_session_memberships, sso_code_signin_allowed, sso_invitation_accept_allowed, sso_invite_member, sso_required_refusal_target, sso_required_view, sso_emergency_use. **No object from 0111 or 0120 altered or restated. 0129 changed only as the order names.** Its file remains unchanged. sso_required_command and sso_required_append are not replaced. Six gate/view bodies were compared to 0129 and differ only in the single read, documented before/after in R3_GATE_READS.md; aggregate reads fail closed while preserving the original typed view record and other statements.

The seventh replacement accepts only strict v2 SQL fields, derives actor/role from the merged active membership routine, retains the company lock and permission check, checks owner/rule/minutes/replay in order, records approval with SHA-256 of UTF-8 reason bytes and one clock time, appends OFF through the unchanged private helper, then inserts use/window/log. The repository's unchanged audit append shares that transaction. New causes EMERGENCY_NOT_OWNER / EMERGENCY_WINDOW_INVALID / EMERGENCY_COMMAND_REPLAYED remain server-only. The existing public code/status list is unchanged. All emergency refusals are code-only 403 and issue no session; successful v2 response returns requiredAgainAt and configured minutes.

The new detail projection is parsed through strict ssoRequiredDetailV1 and is accepted per verified context call, never stored. Nest GET /auth/sso-required/detail and thin Next GET /api/auth/sso-required/detail are no-store. The strict ON refusal enriches its one 409 with this company's unlinked object only after rollback and the existing refusal audit; it rechecks the same credentials/current authority and fails to code-only if the read fails, with no second refusal audit. Every other body stays code-only. C1/C2 source slice is built; checked-in generated OpenAPI remains HELD on the generator permission refusal. No screens or browser specification added (C7 not claimed).

### Every new GRANT, standard F

- `GRANT SELECT ON identity.sso_emergency_window TO jobguard_identity;`
- `GRANT EXECUTE ON FUNCTION identity.sso_required_detail(character,uuid) TO jobguard_identity;`

Exactly two new grants. No INSERT/UPDATE/DELETE grant to jobguard_runtime or any application login on authorization, membership, receipt, audit or money tables. Only the checked owner routine writes approval/window facts; it has its own authority check. PUBLIC/jobguard_runtime/jobguard_infrastructure get nothing; private state gets no application EXECUTE. No replaced routine appears in a new GRANT/REVOKE. Standard F job-route registry/own-live/replay requirements are inapplicable to these identity/control-plane routes: no contractor job write route is added; watchdog registries/harness/replay suite remain untouched.

### E8 history and U1 upgrade

E8/S11 compare nonempty journal, journal_line, evidence_object, earlier audit, sso_connection, verified_domain, idp_group_role_mapping, sso_subject, sso_session_binding, sso_grant, session, app.membership and app.role_grant. New E8 uses canonical PostgreSQL row text, preserving microseconds; inherited S11 exact comparisons and true successful-use assertion remain. E6 keeps every earlier authority/history row by primary key and requires exactly one new approval/use/window for each race, with both real backend ids observed waiting on the third connection's lock. Both same/different command ids run five rounds; two actual latest mailbox challenges are consumed before competing checked execution calls. No latch lift or fixture rule seed remains.

U1 installs every migration before 0143, creates ON and no-row companies through the as-built administrative/SAML services and records a pre-N legacy v1 refused use through the as-built routine plus real repository audit primitive. At least one row in each compared table is required: identity.sso_required_event, sso_emergency_event, sso_subject, session, membership_locator, app.membership. Snapshots capture actual primary keys, each pre-existing name and full format_type, and row_to_json(t)::text over exactly named pre-existing columns. It applies N alone, compares rows/functions (all other pre-existing routines unchanged at this step; seven retain signature/owner/prosecdef/config/ACL), proves fixed rule/constraint and old effective states, then applies later migrations successfully twice and compares only captured identities. Rolled-back controls use the same comparator: one microsecond and retype FAIL; nullable later column and replaced function PASS; later inserted row PASS. A stored row missing or changed fails. Approval/use/window cannot have pre-N rows under the held rule/FK and are not compared. Upgrade proof is authored and compiled, NOT RUN against PostgreSQL.

Migration registered in numeric order, MIGRATIONS.md appended. Forward fix only; no history deletion/rollback of consumed windows. Deploy v2 service/repository/transport with 0143; v1 emergency requests are refused, the admin command/state contract stays compatible. No external action, charge, vendor dependency or live data route is added.

## Executed checks and limitations

Full command/result journal: R3_COMMANDS.md. Tests were written before the implementation they cover. The first unit attempt failed to resolve unbuilt @jobguard/db (two failed suites, zero tests collected); no pre-implementation business-assertion failure is claimed. The initial pnpm 11 launcher was stopped when it stalled; pinned 10.28.1 was found already cached and used without changing pins/lockfile. No intentional package download/install command was issued. One pnpm 11 diagnostic spawned its own internal install check, which engines refused before a build; that result is recorded rather than hidden.

Observed passing checks:

- 47 unit tests, four permitted files: new owner/unlinked files, emergency's v2 input-only edit and disclosure's v2 SQL shape/config edit. All other pre-existing expectations unchanged, mapped individually.
- API dependency build: --force, 6 successful tasks, 0 cached.
- Full typecheck: pnpm exec turbo run typecheck --force, 7 successful tasks, 0 cached.
- Package lint: pnpm exec turbo run lint --force, 7 successful tasks, 0 cached.
- Full build: pnpm build --concurrency=2 --force, 7 successful tasks, 0 cached, including Next detail route. Existing CSS/root-inference and shared-cache IO warnings recorded, not a cache-hit green.
- Own five database files compile with temporary targeted tsc configuration (two runs after test repairs); this does not prove PostgreSQL behavior.
- Origin/main lane check passed with its actual later ref. Mandated 4db7381 root lint/lint:lanes **failed**, because their comparison includes 42 inherited merged files outside the lane. Core purity passed, 151 TS files. No unrelated file changed and no lane widened. Root lint is not reported as passed.
- Repeated whitespace/source-preservation/hash checks pass. No git write, independent review or acceptance.

### STOP item and NOT RUN list

**OpenAPI generation:** `pnpm --filter @jobguard/api openapi:generate`, exit 1, `listen EPERM: operation not permitted /var/folders/nh/lx6ycbfd1l937f5qhj0cdvhh0000gn/T/tsx-501/54459.pipe`, raised by tsx's IPC listener. Stopped this item; no generator fallback/manual rewrite. apps/api/openapi.json remains byte-identical to HEAD and must be regenerated by the dispatcher before technical acceptance. `pnpm openapi:check`: NOT RUN after the same runner's permission refusal. The incidental `ps -axo pid,ppid,etime,command` inspection was refused (`zsh:1: operation not permitted: ps`) and was not retried. No automatic approval review rejection occurred.

All the following files are NOT RUN (sandbox cannot start PostgreSQL / a browser); no skipped or loosened assertion is used to represent them as passing. Dispatcher/CI should run them through heavy-slot, maxWorkers=2, at most three files, one run at a time:

```sh
~/.local/bin/heavy-slot ent-10e-db1 pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/sso-emergency.integration.test.ts test/sso-emergency-concurrency.integration.test.ts test/sso-emergency-window.integration.test.ts
~/.local/bin/heavy-slot ent-10e-db2 pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/sso-required-unlinked.integration.test.ts test/sso-emergency-owner-upgrade.integration.test.ts test/sso-required.integration.test.ts
~/.local/bin/heavy-slot ent-10e-db3 pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/enterprise-identity.integration.test.ts test/identity.integration.test.ts
~/.local/bin/heavy-slot ent-10e-unedited pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/auth/sso/sso-required.test.ts src/auth/sso/sso-required-paths.test.ts src/auth/context-boundary.test.ts
~/.local/bin/heavy-slot ent-10e-browser pnpm --filter @jobguard/web test:e2e --project=mobile-360 --project=desktop ENT-10d.spec.ts
```

The unedited unit regression trio is NOT RUN by the builder under the own-file-only instruction (not claimed unable to execute Vitest). Whole-package/repository suites, test:db/test:migrations/test:regression, CI, live model/eval/native/device/restore/deployment/real IdP tests: NOT RUN. No AI behavior change, native subsystem or live provider in this lane. Synthetic-only, D04/G5, both independent RED verdicts, row-by-row confirmation and separate actor acceptance remain gates.

## Stated limits and HELD / LATER

A request past its check before closes_at may finish after it; first check starting at/after closing time requires SSO. No row or audit event is written at expiry. The route signs nobody in and does not repair the identity provider; a new code/command after closure may open a new recorded use. Joiners and re-invited people remain unlinked until linked, and auto-close never waits for them. RLS/context boundary retains its stated limit against compromised privileged/identity credentials; hash chaining is not independent proof of underlying facts.

- Second-person post-use sign-off: HELD; not authorized by naming the company owner as approver.
- JobGuard support approval: ruled out by Ben, not built.
- Written switch-back event or a credential clock process: not built by Q4; clock checks supply effective state.
- FIX-LATER: all parked screens (owner form, member/window display and the stale identity-page held-rule text); no page/browser spec edited.
- Per-company limits and two-step request/approve: not in this order.
- Re-invited-member re-link path (ENT-10a LATER 13), domain capture and OFF session-scoped grants: LATER.
- OIDC, SCIM/native paths for this route, D04/G5 founder evidence, real identity provider/person/data: HELD or later as in ENT-10a/10d, not built or enabled.

## Self-review (builder source inspection only)

Re-read the diff/order and named tests; compared all six gate/view bodies against 0129 with only their ordered reads transformed; checked command/append and 0111/0120 untouched, explicit grant list, fixed immutable rule, owner plus permission before successful append, both minute bounds, one clock time/no caller clock, canonical UTC deadlines, private state/RLS controls and correct tenant-qualified keys. Verified v1 input/schema distinction and exact old expectation preservation. The stored race window lookup was strengthened to use the winning command id, independent of the returned event id. Added invalid/scalar direct SQL boundary checks before separating the scalar refusal branch. Repaired test fixtures so linkable people have the merged contractor-member active prerequisite, reduced repeated role setup, held one client for state-context reads, and kept direct invalid-window refusal log/audit together. No clock override, latch seed, new dependency, fingerprinted column, broad privilege, context construction/cast/storage or commercial action added.

New database tests remain unexecuted and may reveal SQL/provider fixture defects in CI; this is a material limitation, not a database pass. No old assertion changed except the explicitly approved equality gaining three persisted checks; no expected refusal/count/cause/true was flipped, removed or loosened. No standing file hash/whole-file pin test was added. Protected source/test hashes are receipt evidence only. OpenAPI generator permission STOP was not worked around. Main catch-up and exact-commit independent checks remain the dispatcher's/reviewers' work.

Intended commit message is overwritten at `/private/tmp/jg-msg-ent-10e.txt`, as expressly authorized in r3. No commit/push/merge/PR action by this builder. Final existing HEAD remains a390b739095a4250c8f36dacb74ef3e0bfaaa672.

Builder receipt only — not independently verified, not accepted.

## Artifact preservation and final scope

Own generated dist/Next/TypeScript/Turbo outputs (15 paths, created in this r3 run as confirmed by directory birth times) were moved intact to `/private/tmp/jg-ent10e-r3-build-artifacts-ukyu_jqb` after checks, with no deletion. No build output or test-results addition remains in the working tree. The pre-existing `.pnpm-store/v11` existed at 13:36 before r3; it is retained under the prohibition on deleting existing files. No new store directory was intentionally created; the pnpm 11 launcher diagnosis may have used that existing index. This exception is reported rather than erasing a pre-existing uncommitted directory. Protected SHA-256 inventory covers 91 byte-identical files including the scanner, all its construction/pinned paths, hard-limit sources, both sign-in pages, merged identity/SSO regressions, manifests/lockfile and config. R3_FINAL_SCOPE.md records git diff --stat, untracked additions, final hashes and HEAD. OpenAPI remains unchanged on the stated STOP.

## Historical receipts (previous rounds; superseded by r3 above)

Built by Codex; dispatched 13 Oct 2026.

## Continuation r2 — STOP, 13 October 2026

Actual builder: Codex. Builder receipt only — not independently verified, not accepted.

The r2 authorization resolves the fixture/setup prohibitions recorded in r1: the old constraint drops, fixture rule, old approval seeding and old request inputs may now be re-pointed in the two named files. No further retirement is requested. No fixture or assertion was edited in this round, because the required base catch-up is pending and a separate assertion STOP remains.

### Base catch-up required first

Initial worktree clean; no unmerged paths. Branch `codex/sandbox/ent-10e`; HEAD `642e9873ed024c86a64344b410f0d89f97b18ffb`; local `origin/main` `6659fb58791ec22588948f005b2bd4f6b299fa48`. `git rev-list --left-right --count HEAD...origin/main` returned `8 17`: main has 17 commits not incorporated in this branch. The dispatcher must incorporate main before implementation resumes. This builder ran no git write and did not attempt a filesystem substitute for a merge.

Coordinator commits remain applied: `e77ef5c8ee9ab26c47e0558308a7791637cfa07a`, `8ad002aa4e597f86ea506e4851db431061406ab7`, `a942cdc0cfa9cc85bc5b817e18bbdb6382600b7a`. The five retired-check mapping rows in the historical r1 section remain pending implementation and both reviewers' confirmation. None of those coordinator changes was edited.

### Exact assertion STOP — outside the newly allowed setup edits

File `packages/db/test/sso-emergency-concurrency.integration.test.ts`, line 152, before (unchanged):

```ts
expect(results.find(r => r.used)).toEqual({ used: true, cause: "EMERGENCY_USED", connectionId: f.connectionId, actorMembershipId: f.principal.membershipId });
```

The ordered repository returns three additional fields on success. Vitest `toEqual` checks the complete object's keys, so this line cannot pass against that v2 result merely by changing setup and request inputs. Returning fewer fields, projecting the result in the fixture, or switching to a partial matcher would avoid the ordered check and was not done.

Proposed after, NOT APPLIED (the coordinator must decide; `storedWindow` would be selected for the winning command with `closes_at` formatted as canonical UTC text with microseconds):

```ts
expect(results.find(r => r.used)).toEqual({ used: true, cause: "EMERGENCY_USED", connectionId: f.connectionId, actorMembershipId: f.principal.membershipId, eventId: storedWindow.event_id, windowMinutes: storedWindow.window_minutes, closesAt: storedWindow.closes_at });
```

This retains exact equality and the four original expected values, adding verification of all three new values against persisted facts. It still changes an assertion, whereas r2 authorizes setup and input edits only and explicitly requires stopping if an assertion needs changing. It is therefore a BLOCKING coordinator question, not a builder-applied re-point. Integration line 168 remains `expect(result.used).toBe(true);` unchanged.

### r2 evidence and checks

All five inspection/verification shell invocations exited 0. Commands were read-only: repository/AGENTS inspection; status, conflict paths, branch divergence and existing receipt; numbered test/source reads and coordinator ancestry; status, whitespace check, coordinator SHAs and hashes; final whitespace/scope/hash verification. Exact invocation text is in `R2_COMMANDS.md`. Counts: 0 tests executed; 0 tests passed; 0 git writes; 0 grants; 0 source/test/migration changes. No first-failing unit run exists because the mandated STOP precedes implementation.

Final verification: `git diff --check` exited 0; protected hashes identical; HEAD unchanged. `git diff --stat` before this evidence paragraph reported only `docs/verdicts/ENT-10e/BUILDER_RECEIPT.md`, 50 inserted lines. Status also listed the two new receipt files `R2_COMMANDS.md` and `R2_COMMIT_MESSAGE.txt`. Every changed path is inside the receipt folder; no source changes outside the lane.

Typecheck, lint, lint:lanes, build, unit tests and OpenAPI checks: NOT RUN, stopped before implementation. All ordered database suites and `ENT-10d.spec.ts`: NOT RUN (sandbox cannot start PostgreSQL / a browser). The complete ordered file list remains in the historical receipt. E1–E9, T1–T8, L1–L7, K1, U1 and R1 remain incomplete. Migration 0143 remains unbuilt. No acceptance or independent verdict is claimed.

Protected files' SHA-256 before and after receipt edits:

| File | SHA-256 | State |
|---|---|---|
| packages/db/test/sso-emergency.integration.test.ts | 83776a990284c70ca27b789590588f28559a2669c93f55783c19fe7c41be07c9 | KEPT, no touched lines |
| packages/db/test/sso-emergency-concurrency.integration.test.ts | 7f078396e77da39b6a35a933c1bdd0bbf713df497dc4327296d4ff5c2850e8aa | KEPT, no touched lines |
| packages/db/migrations/0129_sso_required.sql | 4bbeb8d9e88a8f65dc4c47ac369717b95c62e68b113793f5a0c0ad62a7446c50 | KEPT |

There are zero touched lines in either emergency test, so the r2 before/after line table is empty. No object from 0111 or 0120 altered or restated; no 0129 object altered. No new GRANT; standard F preserved. Default 60 minutes; allowed 15 to 240; chosen by the order drafter and confirmed by the integrator's answer to Q3; still unimplemented. No rule UUID selected. Historical limits and HELD/LATER items remain in force.

Self-review: verified clean/conflict-free state and divergence, retained coordinator ancestry, checked the actual line 152 against the required enriched success schema and the r2 edit boundary, and confirmed integration line 168 remains true. No setup-only workaround, result projection or assertion relaxation was applied. Only receipt evidence was changed.

The requested `/private/tmp/jg-msg-ent-10e.txt` already contains the r1 intended message. It was not overwritten under the instruction forbidding overwriting an uncommitted file this round did not create. The r2 intended message is preserved in `R2_COMMIT_MESSAGE.txt` for the dispatcher to copy to its chosen message path.

## Continuation r1 — current result, 13 October 2026

STOP under the continuation's prohibition on editing merged tests and dispatch rule G. This is a source-inspected conflict; no test-executed failure is claimed. The original two STOPs below are RESOLVED by the coordinator commits, not raised again. Everything after the heading "Original round — historical receipt" is retained historical evidence.

Current HEAD: `338f545a6579ff57bb4e1713073784c1e8682f6e`. Main incorporated by that merge: `269874640468a6e1dfdfed63edd4ce187d1d9dbb`. Initial r1 working tree was clean; the lane line and prior receipt already exist in this HEAD. No git writes, downloads, test changes, feature implementation or migration authored in r1.

Coordinator changes verified by reading their diffs:

- `e77ef5c8ee9ab26c47e0558308a7791637cfa07a`: the five held-state retirements, 35 removed lines, two files.
- `8ad002aa4e597f86ea506e4851db431061406ab7`: expired-approval check re-pointed to a complete expired window and new owner use. Original STOP 1 resolved.
- `a942cdc0cfa9cc85bc5b817e18bbdb6382600b7a`: concurrency snapshot preserves existing rows by primary key and requires one added approval/use/window. Original STOP 2 resolved.

### New STOP — remaining fixture setup in protected merged files

The continuation says not to edit either database file again or any other merged test. Rule G expressly requires stopping when another piece's merged setup needs changing. These are NOT requests to retire further assertions. No edit or workaround was applied.

`packages/db/test/sso-emergency-concurrency.integration.test.ts:115`, before:

```ts
await owner.query("ALTER TABLE identity.sso_emergency_approver_rule DROP CONSTRAINT sso_emergency_approver_rule_held");
```

Required after: no constraint-drop statement in the fixture; use the migration's owner rule and let the checked v2 emergency command create and consume its own approval. Migration 0143 must already have dropped that constraint, so this statement will fail. Line 116 also inserts `fixture.v1`, which the required new owner-only constraint refuses. Lines 109–121 still create a prior approval for the old flow. A coordinator fixture re-point is required; the builder cannot change these lines.

`packages/db/test/sso-emergency.integration.test.ts:164`, before:

```ts
await client.query("BEGIN");await client.query("ALTER TABLE identity.sso_emergency_approver_rule DROP CONSTRAINT sso_emergency_approver_rule_held");const rule=randomUUID();
```

Required after:

```ts
await client.query("BEGIN");
```

The fixture's subsequent rule/approval seed at lines 165–166 must also be re-pointed by the coordinator to the real owner-command flow. Otherwise line 165 attempts a forbidden second rule. No removal was made by the builder.

### Further exact conflicts in those unchanged fixtures

`packages/db/test/sso-emergency.integration.test.ts:167` submits `sso-emergency.v1` with email/code directly to SQL. Line 168, before:

```ts
expect(result.used).toBe(true);
```

For THAT unchanged v1 input the required after result is:

```ts
expect(result.used).toBe(false);
```

Changing that expectation would abandon its successful-use history check, so it was NOT changed. The coordinator should preserve the true assertion and re-point its setup/input to a valid v2 owner use instead (new commandId, configured windowMinutes, no email/code in SQL).

`packages/db/test/sso-emergency-concurrency.integration.test.ts:136`, before:

```ts
const input = { version: "sso-emergency.v1", requested_tenant_id: f.principal.tenantId, reason: "Synthetic concurrent emergency fixture reason" };
```

Required after: v2 input with commandId and the configured window forwarded by the repository. Calls at line 143 must forward that setting. This is another forbidden setup edit; as written the v2-only routine returns before waiting on the company lock.

`packages/db/test/sso-emergency-concurrency.integration.test.ts:152`, before:

```ts
expect(results.find(r => r.used)).toEqual({ used: true, cause: "EMERGENCY_USED", connectionId: f.connectionId, actorMembershipId: f.principal.membershipId });
```

Required after: retain exact equality and include the successful result's eventId, windowMinutes and canonical closesAt, matched to the stored window. The required v2 success result contains those fields, so the existing exact equality cannot pass. No change to a partial matcher, expected keys, assertion or result parser was applied. Coordinator review is required for all these re-points.

### Five coordinator retirements — replacement status in r1

| Retired check | Ordered replacement | r1 status |
|---|---|---|
| S10a, original integration lines 90–103 | E9, E1, E2, E7 | NOT BUILT; new rule-G STOP |
| S10b, original integration lines 104–115 | E1, E2, E3, E4 | NOT BUILT; new rule-G STOP |
| S10c, original integration lines 116–121 | E7 | NOT BUILT; new rule-G STOP |
| S10d, original integration lines 143–144 | E7 and approval/use zero after rollback | NOT BUILT; new rule-G STOP |
| concurrency original line 115, latch assertion | E6, E7 | NOT BUILT; new rule-G STOP |

The retired concurrency latch ASSERTION is distinct from the surviving constraint-drop SETUP now at line 115. Both independent reviewers still need to confirm replacements one for one. No additional retirement is claimed. The previous RETAINED_ASSERTIONS.md and UNCHANGED_SHA256.txt describe the original round; coordinator commits changed their source baseline. Current protected-test hashes are in R1_COMMANDS.md and prove zero builder test edits in this continuation.

### r1 verification, scope and limits

All r1 inspection shell commands exited 0; 0 tests executed, 0 passed. Typecheck, lint, lint:lanes, build and openapi checks: NOT RUN, stopped on the mandated source-preservation conflict. The original round's pnpm launcher refusal is historical; it was not retried or bypassed. Database and browser suites: NOT RUN (sandbox cannot start PostgreSQL / a browser). New unit/database files: NOT BUILT / NOT RUN. No first-failing unit run exists. Every acceptance criterion E1–E9, T1–T8, L1–L7, K1, U1 and R1 remains incomplete.

Migration number 0143 remains reserved and unused by this builder. Default 60 minutes; allowed 15 to 240; chosen by the order drafter and confirmed by the integrator's answer to Q3. No rule UUID selected and no new GRANT. Standard F: no direct application write grant added. No object from 0111 or 0120 altered or restated. No 0129 object, sso_required_command, sso_required_append, protected source, existing test or pinned value was changed in r1. Migration 0129 SHA-256 remains `4bbeb8d9e88a8f65dc4c47ac369717b95c62e68b113793f5a0c0ad62a7446c50`.

Self-review: read the actual coordinator patches, confirmed they resolve the two original STOPs, then checked the surviving fixtures against the mandated v2-only routine, immutable single owner rule and enriched success result. Stopped at the additional forbidden setup edits; did not preserve v1 success in the implementation or tolerate a fixture rule to work around the order. This receipt update is the only changed existing repository file; the new R1_COMMANDS.md is receipt evidence. No implementation or acceptance is claimed. Held/later items and limits in the original receipt remain unchanged.

Builder receipt only — not independently verified, not accepted.

## Original round — historical receipt

# ENT-10e — blocked builder receipt

Builder receipt only — not independently verified, not accepted.

Actual builder: Codex. The addendum's requested Claude attribution would describe a different builder, so it is not claimed. No independent review or acceptance was performed. No sub-agent was started.

## Base and scope

- Branch: codex/sandbox/ent-10e; final existing HEAD: `e77ef5c8ee9ab26c47e0558308a7791637cfa07a`. No git writes.
- Issued base: 1f54750 plus coordinator retirement commit e77ef5c (35 lines removed from two test files, no added lines). Initial working tree was clean.
- At inspection the local origin/main reference was `ec6ad4d2a411bf058cb1f107419d68da9fdffc05`; it has moved since the issued base. It was not merged or rebased by this builder.
- Migration 0129 SHA-256: 4bbeb8d9e88a8f65dc4c47ac369717b95c62e68b113793f5a0c0ad62a7446c50, matching the issued draft reference on the inspected branch.
- First change: exactly the issued ent-10e lane line, after ent-10d and before ent-2. The issued line's historical stacked-base note is copied verbatim; this receipt records the actual issued base.
- Other changes: this receipt, unchanged-file hash inventory, surviving-assertion inventory, and command journal. Intended message is outside the repository at /private/tmp/jg-msg-ent-10e.txt.
- No feature implementation, migration, schema, transport, contract or test edit has been made. No rule UUID selected. No new GRANT statements. Standard F: no direct application write grant added; no new routine or route introduced.

## STOP 1 — existing expired-approval refusal

File: `packages/db/test/sso-emergency.integration.test.ts:98` (line 130 at 1f54750).

Before (unchanged):

```ts
expect((await use(f.principal.identityUserId)).rows[0].result.used).toBe(false);
```

The previous line inserts an approval that expired one minute ago and was approved 31 minutes ago. The existing routine at 0129 lines 220–225 selects only a recent, unexpired, unused approval; this expectation proves refusal without one. ENT-10e step h instead creates and immediately consumes a NEW approval after the owner's command passes the role, rule, setting and command checks. For a valid v2 request, allowed setting and new command id in the same company state, an unrelated expired approval cannot make that call fail.

Behavior required after implementation (NOT applied):

```ts
expect((await use(f.principal.identityUserId)).rows[0].result.used).toBe(true);
```

Changing the request to an invalid setting, retired v1 input or a replayed command would keep a false result while changing the assertion's meaning. That is not the permitted meaning-preserving RE-POINTED edit. Keeping a requirement for a pre-existing approval would contradict the issued one-step owner approval and step h. This assertion is not among the five retired checks. BLOCKING: coordinator amendment required; unchanged.

## STOP 2 — all approval rows frozen across the race

File: `packages/db/test/sso-emergency-concurrency.integration.test.ts:150` (line 151 at 1f54750); population at lines 71–81, including approval table at line 74.

Before (unchanged):

```ts
expect(await snapshot()).toEqual(before);
```

`snapshot()` includes EVERY row of identity.sso_emergency_approval. The old fixture commits the approval BEFORE taking the snapshot, then consumes it without changing that table. ENT-10e E6 and step h require the winning call to insert a new approval AFTER the before-snapshot. Thus equality of all approval rows cannot hold.

Required after behavior (NOT applied): keep every captured approval unchanged and assert exactly one new approval belonging to the successful use, while retaining complete equality for the other tables. This would permit an insertion the original assertion forbids. There is intentionally no replacement line or snapshot-population edit: those are forbidden pending a coordinator amendment. BLOCKING: unchanged.

## Check launcher refusal — no bypass

Command: `/Users/benharwood/Library/pnpm/bin/pnpm --version`.

Exact observed refusal:

```text
[ERROR] Refusing to run pnpm@10.28.1: its npm registry signature could not be verified (@pnpm/exe@10.28.1: fetch failed; @pnpm/macos-arm64@10.28.1: fetch failed; pnpm@10.28.1: fetch failed). The bytes selected by this project's lockfile/registry do not match a published, signed pnpm release.
This can indicate a tampered lockfile or a malicious/unreachable registry. Set `pmOnFail` to `ignore` to skip the version switch if this is unexpected.
```

The enclosing inspection command exited 0 because its last command was df. The pnpm subcommand's exit code was not separately captured; it did not print a version. No switch override, alternate launcher, package download command or manual execution of the refused checks was attempted. Node reported v24.17.0. Observed memory free 69%; data volume available 90 GB.

## Retired checks and replacements — not implemented

| Coordinator-retired check | Ordered replacement | Status |
|---|---|---|
| S10a, original lines 90–103 | E9 + E1 + E2; rule count E7 | NOT BUILT; STOP above |
| S10b, original lines 104–115 | E1 + E2 + E3 + E4 | NOT BUILT; STOP above |
| S10c, original lines 116–121 | E7 | NOT BUILT; STOP above |
| S10d, original lines 143–144 | E7 plus zero approval/use rows after rollback | NOT BUILT; STOP above |
| concurrency, original line 115 | E6 + E7 | NOT BUILT; STOP above |

Coordinator removals were source-inspected. No replacement exists yet and none is claimed to pass. Both independent reviewers must still confirm all five rows one for one. Every other surviving assertion line is listed in RETAINED_ASSERTIONS.md as KEPT, source unchanged and NOT RUN; none is marked retired by the builder. The two permitted unit cases remain entirely unchanged.

## Acceptance and configuration

E1–E9, T1–T8, L1–L7, K1 and U1: NOT BUILT, blocked by the order's preservation conflict; no test-executed claim. R1: surviving assertions inventoried, replacements not built, reviewers not run; incomplete. No first-failing unit run was taken because no implementation/test alteration was authorized past the STOP and the check launcher also refused.

Default 60 minutes; allowed 15 to 240; chosen by the order drafter and confirmed by the integrator's answer to Q3. These are the confirmed design, not implemented configuration.

No object from 0111 or 0120 altered or restated. 0129 changed only as the order names: in this stopped run no 0129 object or file was changed. sso_required_command and sso_required_append unchanged. No caller-supplied time, request setting, retained context, grant, clock process or external action added. No migration 0143 registered or authored. No upgrade proof was executed. Approval/use/window cannot be compared before the proposed migration as specified in U1; no snapshots were taken for that proof. E8's planned identity/history comparisons have not been implemented; existing S11 source comparison remains unchanged.

## NOT RUN

- Force typecheck, root lint, force lint, lint:lanes with the issued base, force build, API prerequisite build and openapi:check: NOT RUN, task stopped before code and pinned pnpm launcher refused. No cached result is reported as a run or green.
- New unit files sso-emergency-owner.test.ts and sso-required-unlinked.test.ts: NOT BUILT / NOT RUN, STOP conflict.
- Existing piece unit files sso-emergency.test.ts and sso-required-disclosure.test.ts: NOT RUN, same STOP and launcher refusal.
- Database files sso-emergency.integration.test.ts, sso-emergency-concurrency.integration.test.ts, sso-required.integration.test.ts, enterprise-identity.integration.test.ts and identity.integration.test.ts: NOT RUN (sandbox cannot start PostgreSQL / a browser); no heavy-slot or PostgreSQL start attempted.
- Proposed database files sso-emergency-window.integration.test.ts, sso-required-unlinked.integration.test.ts and sso-emergency-owner-upgrade.integration.test.ts: NOT BUILT / NOT RUN (STOP; sandbox cannot start PostgreSQL / a browser).
- Unedited unit regressions sso-required.test.ts, sso-required-paths.test.ts and context-boundary.test.ts: NOT RUN, dispatcher/helper runs still required.
- ENT-10d.spec.ts: NOT RUN (sandbox cannot start PostgreSQL / a browser).
- Repository/package test suites: NOT RUN, prohibited by the issued memory/test scope. No AI change or evaluation.

## Held and later

Second-person sign-off stays HELD; support approval is excluded by Ben. Clock process and restoration audit row are excluded by Q4. All screens remain parked, including the now-stale emergency-availability line: FIX-LATER for the integrator, no UI edits. Per-company windows, two-step approval, re-linking a re-invited member, domain capture, grants while OFF, OIDC, SCIM/native additions, D04/G5 evidence, real providers/people/data remain out of scope or held as issued. The proposed limits (a gate begun before close may finish afterwards; no row at closure; no emergency session; new command/code/use after close; joined/re-invited people await linking) remain design limits, not implemented claims.

## Self-review

Source-inspected the issued base, exact coordinator diff, surviving S10d and race expectations, merged membership/admin/permission mechanisms, current emergency routine, application and repository, scanner header and applicable plan sections. Verified that expired-approval refusal and approval-table equality are not among the five retired checks and would need behavior changes under step h. Chose no workaround and left every existing test, security list, pinned value, migration, gate and runtime source byte-identical. Hash inventory records unchanged protected files; git diff evidence records the lane/receipt-only scope. No new code means no before/after routine replacement, grant list or acceptance evidence exists yet. No commit, push, merge, pull request, data mutation or independent verdict.

## Final scope evidence

89 hashes in UNCHANGED_SHA256.txt; 39 surviving assertion-line entries in RETAINED_ASSERTIONS.md. These are receipt evidence, not permanent tests. Every tracked source/test/migration change since the issued coordinator head was checked by git diff --name-only: exactly the lane registry. Receipt files are untracked pending dispatcher staging.

Diff against e77ef5c (builder tracked edits only):

```text
 config/agent-lane-assignments.json | 1 +
 1 file changed, 1 insertion(+)
```

Diff against 1f54750 (includes ONLY the coordinator's 35 removed test lines plus builder lane entry):

```text
 config/agent-lane-assignments.json                 |  1 +
 .../sso-emergency-concurrency.integration.test.ts  |  1 -
 packages/db/test/sso-emergency.integration.test.ts | 34 ----------------------
 3 files changed, 1 insertion(+), 35 deletions(-)
```

Status:

```text
 M config/agent-lane-assignments.json
?? docs/verdicts/ENT-10e/
```

`git diff --check`: exit 0. This is a whitespace check only; no implementation check or independent review is claimed. Commands and counts are in COMMANDS.md. The final HEAD is unchanged at e77ef5c8ee9ab26c47e0558308a7791637cfa07a.
