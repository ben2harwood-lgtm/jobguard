Built by Codex (GPT-6.1 Sol) via the full-steam supervisor backlog; order written 16 Oct 2026 by the queue-filler

Status: HOLD — pure contracts built; customer approval execution is blocked by the missing small-builder practice-customer authority binding. This is builder evidence, not an independent verdict or acceptance. The requested model attribution is reproduced from the order; runtime model identity was not independently verified.

Base and unchanged final HEAD: `0bbb5ddbd074b791ece740a1861a6b7cc2fd6577`. `origin/main` has the same SHA. Branch: `codex/sandbox/mon-5a`. Initial working tree was clean. Actual workspace is `/Users/benharwood/Claude/Projects/my-new-project/.worktrees/ch-3a`; the ordered `mon-5a` directory does not exist. No Git write, download/install, socket, PostgreSQL, provider, browser, send, commit, push or release was performed. No migration was added; provisional 0187 remains unused.

## Verified authority and implementation

Read repository AGENTS.md and BUILD_PLAN.md §§2.4, 3, 5.1–5.6, 8 CH-3a, 10.1, relevant §10.2 contracts, and MON-5 at lines 2215–2239. The card matches the dispatch quote. The 13 October finisher draft was read as background; this 16 October order overrides its execution holds where authorized. Existing acceptance and variation implementations, stage_completion, #225 SQL/repository/application and its receipt were source-inspected. Source inspection is not execution evidence.

New versioned pure contracts bind quote identity/revision/hash/GBP total, priced variation identity/revision/hash/signed delta, and immutable stage-completion/proof references. Canonical replay bindings include the command, tenant, customer, party binding, job revision, policy and real/acting practice-actor references. Strict result contracts admit customer_authenticated separately from existing builder_attestation. No existing builder acceptance or final-account path was changed.

The pure link-reference validator checks digest equality, exact tenant/customer/job/party/link/grant references, server clock, expiry and revocation. It returns no principal or authority. It is not cryptographic token verification, a live identity implementation, a transport enumeration/timing proof, a database replay guarantee or an approval. The live-link gate is fixed OFF and always returns LINK_UNAVAILABLE. No link is issued, delivered or activated.

## BLOCKING question / affected stop

Which approved persisted binding connects the switched practice actor to a small-builder job's CH-3a customer? The current merged switch is contractor-specific. Implementing another identity/role/tenant binding would choose who may act beyond the merged seam; that is held by the 16 October order. Approval writes, persistence integration, commercial consumption, transports and their database proofs remain unbuilt pending this answer. The question was sent asynchronously; no answer was received before this receipt was written.

Exact existing lines left unchanged:

- `packages/db/migrations/0165_practice_worker_switch.sql:82`
  - Before (81): ` WHERE m.tenant_id=rule.company AND m.id=p_worker AND m.id<>rule.owner_member`
  - At (82): ` AND m.role IN('operative','supervisor','surveyor','client_approver') AND app.contractor_member_active(m.id)`
  - After (83): ` AND NOT EXISTS(SELECT 1 FROM app.role_grant g WHERE g.tenant_id=rule.company AND g.membership_id=m.id`
- `packages/db/migrations/0138_practice_session_hardening.sql:88`
  - Before (87): ` INSERT INTO control_plane.contractor_practice_session(session_id,tenant_id,membership_id,identity_user_id,session_digest,created_at,expires_at) VALUES(gen_random_uuid(),t,m,u,digest,reading,LEAST(home,reading+interval '7 days'));`
  - At (88): ` PERFORM app.assign_commercial_track(t,assignment,'contractor','synthetic-agreement:'||t,0,'operations:synthetic-generator');`
  - After (89): ` INSERT INTO app.contractor_member VALUES(t,m,NULL,'owner@fictional.invalid');`

No merged test, pinned value, fingerprint, context maker, ENT-5 file, shared command replay harness, migration registry or legacy lane register was changed. No rule-G test change was attempted.

## BUILDER ASSUMPTIONS (for coordinator ruling, decision 51)

1. Use the supplied writable workspace because its actual branch and origin/main base exactly match MON-5A; record the directory-name discrepancy. An optional workspace question was sent before discovering the correct branch. No worktree or branch was created/switched.
2. Stage reference means an existing immutable stage_completion plus its scope and verified proof references only. Pure matching grants no payment, completion, certification or legal effect. Stage execution remains blocked by the same authority prerequisite.
3. Keep approval persistence unbuilt while actor/customer authority is missing, rather than create speculative credentials, bindings or records that no authorized command can write.
4. Use cached Corepack pnpm 10.28.1 with COREPACK_ENABLE_NETWORK=0; the default launcher is pnpm 11 and stalls switching versions. No package was installed.

## ADDITIVE LIST ROWS (pending coordinator ruling)

None. No new database objects or privilege catalogue rows.

## New GRANTs / standard F

None. No migration, direct application DML grant, checked routine, route, registry row or external action was added. Existing database grants and fingerprints are unchanged.

## Acceptance matrix

Every passing claim below is limited to pure tests. No aggregate MON-5 acceptance is claimed.

| IDs | Evidence / remaining hold |
|---|---|
| MP-01, MP-02 | HELD: no approved small-builder customer/practice actor binding; no link administration. |
| MP-03 | Pure quote exactness and money/schema refusals pass. Issued/current quote verification, domestic companion and authoritative acceptance remain HELD. |
| MP-04 | HELD: no acceptance persistence, provenance integration or switch-live execution. Existing builder code unchanged. |
| MP-05 | Pure exact signed-extra terms and non-approvable refusal pass. Database pricing/state/withdrawal checks remain HELD. |
| MP-06 | HELD: final-account consumption unbuilt. |
| MP-07 | Shared variation reference accepts exact priced terms without any origin input. Genuine SV-5 catch approval/fee/attribution integration remains HELD; the pure test does not prove a catch journey. |
| MP-08 | Pure existing-completion/proof reference exactness passes; actual stage/evidence lookup, invalidation, sign-off persistence and authority remain HELD. |
| MP-09 | Pure forged/expired/revoked/stale/future reference and repeated-request refusals pass. Live-token cryptography, committed revocation and database replay remain HELD. |
| MP-10 | Pure canonical binding and changed-payload/actor/customer/job conflicts pass. Persisted first-result/no-op semantics remain HELD. |
| MP-11 | HELD: concurrency and real-PostgreSQL serial outcomes unbuilt. |
| MP-12 | MON-5B message work; not implemented here. |
| MP-13, MP-14 | Pure cross-reference/unknown-reference identical typed refusal passes; FK/RLS/session pooling and transport enumeration proof remain HELD. |
| MP-15–MP-18 | MON-5B message/evidence/source work; not implemented here. |
| MP-19 | Strict stored-result schema excludes personal text/contact/credential fields and distinguishes method. Actual transactional audit, chain verification, rollback and lock order remain HELD. |
| MP-20 | No new database objects, grants or routines. New-object catalog proof inapplicable. |
| MP-21 | MON-5B cancellation kit; not implemented here. |
| MP-22 | HELD: no durable approval service to test across instances. |
| MP-23 | Live link gate unconditionally OFF, including valid/absent/tampered flags. No composed synthetic executor exists; successful synthetic effects/mode-isolation proofs remain HELD. |
| MP-24 | No migration. Upgrade/fresh-install proof inapplicable to this diff; 0187 unused. |
| MP-25 | No new transports/OpenAPI operations. Composition remains HELD. OpenAPI check result below. |

## Test-first evidence and commands

Tests were created before their implementations. First executable run using the installed Vitest binary failed: two suites could not import the not-yet-created modules (exit 1, zero collected tests). After implementation: 2 files / 10 tests passed. A later test-first change for stage/provenance bindings failed 3 tests with 7 passing (exit 1), then implementation made all 10 pass through pinned pnpm.

All pnpm checks after launcher diagnosis use:

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"
export PATH="/usr/local/lib/node_modules/corepack/shims:$PATH"
export COREPACK_ENABLE_NETWORK=0
```

Heavy commands were preceded by `memory_pressure | tail -1` (60–63% free) and `df -g /System/Volumes/Data` (34 GB free). Disk floor is the 16 October override of 30 GB. No parallel test run; own files only; Vitest --maxWorkers=2.

| Command | Exit / result |
|---|---|
| Default-launcher `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/customer-portal-approval.test.ts src/customer-portal-approval-link.test.ts` | Interrupted, exit 130; launcher stalled before Vitest. |
| Same with `npm_config_manage_package_manager_versions=false` | Interrupted, exit 130; pnpm 11 still stalled before Vitest. |
| From packages/core: `./node_modules/.bin/vitest run --maxWorkers=2 src/customer-portal-approval.test.ts src/customer-portal-approval-link.test.ts` | First: exit 1, 2 failed suites / 0 collected tests; subsequent accidental wrong-directory heredoc attempt left implementations absent and repeated this failure. No wrong-directory file was created. After apply_patch: exit 0, 2 files / 10 passed. |
| Pinned `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/customer-portal-approval.test.ts src/customer-portal-approval-link.test.ts` | Test-first expansion: exit 1, 3 failed / 7 passed; after implementation exit 0, 2 files / 10 passed. |
| `COREPACK_ENABLE_NETWORK=0 node /usr/local/lib/node_modules/corepack/dist/pnpm.js --version` | 0; 10.28.1. |
| `pnpm exec turbo run typecheck --force` | Pending at initial receipt creation; final result below. |

Inspection/mutation command record (read-only Git throughout): `pwd`, `git status --short`, `git rev-parse HEAD`, `git branch --show-current`, `git rev-parse origin/main`, `git diff --check`, `git diff --numstat` succeeded. `ls -ld .../.worktrees/mon-5a` reported no such directory; no creation attempted. Repository `rg`, `sed`, `cat`, `nl`, `head`, `tail`, package/launcher/cache listings inspected the files named above and the 13 October finisher draft. A `cat packages/core/src/parties.ts` probe and `.npmrc` probe reported absent files; legacy/new lane search found no MON-5A entry before creation. `ls` probes found no root Vitest shim and no /usr/local/bin/pnpm or /opt/homebrew/bin/pnpm. The combined final `rg` with no lane match exited 1. Shell heredocs created the two own test files; apply_patch created the implementations, lane and additive index exports; a Python edit expanded the own stage/provenance tests. Failed wrong-directory heredoc block exited 1 with 'no such file or directory' for the four proposed targets; no pre-existing file was overwritten. All successful mutation tools returned success. No prohibited delete command was run.

Permission refusal: `ps -axo pid,ppid,etime,command | rg 'pnpm|vitest|corepack' | head -25` produced `zsh:1: operation not permitted: ps`. Process inspection stopped; no alternate process-enumeration route was tried. Turbo shared-cache IO warnings, if any, are recorded with final check results; they are not independent verification.

## NOT RUN / HELD / LATER

- All PostgreSQL integration, privilege, audit, concurrency and upgrade proofs: NOT RUN / unbuilt. This environment cannot start PostgreSQL or bind localhost; this diff adds no database code. The dispatcher/CI owns database suites once the authority-bound implementation exists.
- Browser/Playwright/e2e: NOT RUN by explicit order; UI parked.
- Whole-package/repository tests and earlier regression files: NOT RUN by the own-files-only order; dispatcher/CI owns them.
- Eval/live models: NOT RUN, inapplicable; no prompt/model/AI schema/parser/detector changed.
- HELD: synthetic approval writes until the practice-customer binding is identified; live customer authentication/issuance/expiry policy/revocation/delivery; real customers (G1, D06 v2, D12 v3); UI; independent verdict and separate technical acceptance.
- LATER: compose the approved synthetic authority seam, checked routines, approval/final-account persistence and exact replay/concurrency proofs once the prerequisite is supplied. Preserve the already-written reference tests.

## Self-review (source-inspected, not independent)

Could these pure functions create authority or approval? No; they validate references/terms, compare bindings and return no principal or persisted fact. Who verifies the switched actor/customer association? Nobody in this diff; that missing prerequisite blocks execution. Can a stage target claim money or certification? Its strict schema has no money/effect field; actual completion/proof verification remains unbuilt. Can a catch origin be supplied or rewritten? No origin field exists here. Can a replay reuse a changed amount/job/customer/real actor? The canonical-binding tests refuse changed values, but database uniqueness/atomicity remains unproved. Does link possession authenticate a customer? No, and the live gate always refuses. Do result payloads accept customer text/contact/credential fields? Strict schema refuses them; transactional audit privacy remains unproved. Are earlier security tests or pinned objects weakened? No existing test or protected object changed.

## Scope / compatibility / evidence

Only additive core exports and new own files. No DB/backfill/rollback, environment variable, provider destination, operational alert or external effect added. Existing builder_attestation stays untouched. Shared index exports serialize with MON-5B; ENT-5 files are untouched and no shared link implementation was selected. Forward work needs an additive reviewed execution implementation; do not infer release readiness from these reference tests. Exact file hashes and final diff evidence follow after checks. Receipt itself is excluded from its own content hash.

## Final check results (cache forced OFF for execution)

- `pnpm exec turbo run typecheck --force`: exit 0; 7/7 tasks executed successfully, 0 cached; 27.929s.
- `LANE_BASE_REF=origin/main pnpm exec turbo run lint --force`: exit 0; 7/7 package lint tasks executed successfully, 0 cached; 29.824s. This is package lint, not a passing root lint claim.
- `LANE_BASE_REF=origin/main node tools/lint.mjs`: exit 1. Core purity passed (186 TypeScript files); lane checker then refused `Missing branch or self-comparison range; refusing a misleading pass.` The root check stopped before the subsequent money/commercial checks. No checker or comparison base was modified.
- `LANE_BASE_REF=origin/main pnpm lint:lanes`: exit 1, same self-comparison refusal. HEAD equals the required origin/main base because builders cannot commit here. Dispatcher must run it after committing. This is an unresolved check, not a pass.
- Forced typecheck/lint/build emitted `WARNING IO error: Operation not permitted (os error 1)` while writing the shared worktree cache. No shared-cache write workaround or escalation was attempted. Task execution was forced; typecheck/package-lint exit codes were 0 despite cache-write warnings.

Further read-only checks: `sed` read lane checker lines 250–343 to identify its self-comparison refusal; `cat` read API/web scripts and turbo.json before build/openapi execution. A probe `rg ... tools/turbo.mjs tools/*.cjs` ended with zsh `no matches found: tools/*.cjs`; no file was changed. `git diff --check`, `git diff --stat`, `git diff -- packages/core/src/index.ts`, `git status --short`, `git rev-parse HEAD` all exited 0. `cat > /private/tmp/jg-msg-mon-5a.txt` wrote the requested conventional intended commit message, exit 0. Receipt creation and this append exited 0.

- `pnpm build --concurrency=2 --force`: exit 0; 7/7 tasks successful, 0 cached; 1m17.636s. Next generated 34/34 static pages. Warnings: existing workspace-root selection, practice-receipts CSS autoprefixer `end`, Nest/file-type export resolution, load-esm dynamic dependency, and shared-cache write permissions. No unrelated fixes were made. This is a build, not browser execution.
- `pnpm openapi:check`: exit 1 before generator execution. Exact refusal: `Error: listen EPERM: operation not permitted /var/folders/nh/lx6ycbfd1l937f5qhj0cdvhh0000gn/T/tsx-501/97116.pipe`. Stopped this item without a socket workaround. OpenAPI verification is NOT RUN (tsx IPC forbidden); existing OpenAPI file remains unchanged.
- `node tools/money-arithmetic-lint.mjs`: exit 0, boundary check passed.
- `node tools/commercial-boundary-lint.mjs`: exit 0, no diagnostics.
- Final resource check: memory 56% free; disk 34 GB free, above 30 GB floor.

Final evidence command: a one-off Python script used read-only `git diff --check`, `git diff --stat`, `git status --short --untracked-files=all`, `git diff --name-only HEAD`, `git rev-parse HEAD` and `git show HEAD:<protected path>`; SHA-256 compared protected working files to HEAD, and hashed every changed implementation/test/lane file. The script appended the evidence below; no permanent pin/test or Git write was created. All Git checks exited 0. New files are untracked because the dispatcher commits; the ordinary diff stat therefore shows only the additive index exports. The explicit untracked inventory below is part of the evidence, not omitted from scope.

### Exact final working-tree inventory

```text
 M packages/core/src/index.ts
?? config/lanes/mon-5a.json
?? docs/verdicts/MON-5A/BUILDER_RECEIPT.md
?? packages/core/src/customer-portal-approval-link.test.ts
?? packages/core/src/customer-portal-approval-link.ts
?? packages/core/src/customer-portal-approval.test.ts
?? packages/core/src/customer-portal-approval.ts
```

```text
 packages/core/src/index.ts | 2 ++
 1 file changed, 2 insertions(+)
```

Tracked files differing from HEAD:

```text
packages/core/src/index.ts
```

### Changed file SHA-256 (receipt excluded)

| Path | SHA-256 |
|---|---|
| `config/lanes/mon-5a.json` | `736001c7de72c37de53a915e99db85ba127bf7d3e77136e8371c80b4dcd1c265` |
| `packages/core/src/customer-portal-approval.ts` | `8b3b4b4c92eefc6ba7cdd90f8fb014b2a519000c1482b1f6cd8d31708804eea1` |
| `packages/core/src/customer-portal-approval.test.ts` | `9b98d136bbcd80ae53f811b5e0e0d9238dd383375d64d2b60abee240145ccb33` |
| `packages/core/src/customer-portal-approval-link.ts` | `46bc4823cdff022e2db40f97a85d589b7609ce80e68b4bd2822312c586df26c8` |
| `packages/core/src/customer-portal-approval-link.test.ts` | `b3cea0969152c83b89f8a30ad260e520c84ffb31168f5796ef43652a33b4f314` |
| `packages/core/src/index.ts` | `e3e12fb0eb84ca4c81bfb0e1d046626d385f3cb25a0bf378baab179150bc73af` |

### Protected files: working copy equals HEAD

| Path | SHA-256 (both) |
|---|---|
| `packages/db/src/migrate.ts` | `d9ac38c5bae60a487b2835c1681167ea5bf985f1449469c56eec0403772c8983` |
| `packages/db/MIGRATIONS.md` | `1790932d10a34c8cd0bf2bced5426ebff39717d4c9bafe55f290795ad462356d` |
| `config/agent-lane-assignments.json` | `4657a377bd216dadf4d7faad3deeecef050ecfe96bda5260fbd85a7d738859b2` |
| `docs/contracts/lp-0-effective-privileges-v1.json` | `9f61bee5967270a0c1d433972b122ee9028f6d09b4eefa68e66cd8cea3445003` |
| `packages/db/test/tenancy.integration.test.ts` | `331f53b127339b97869ecfef77f0b217a0599cd82fc26bb3f7ad042b35191de9` |
| `apps/api/src/auth/context-boundary.test.ts` | `a848f5e873ca9cc0811e90adf5a35ae18fe4f1ae1da5f889f00ea29ccd287d35` |
| `packages/db/test/watchdog-command-harness.ts` | `3bad6abf073b44b84575a7421ddaf7b275d9a75d2d93b20bcf744ed4d3fbbbd6` |
| `packages/db/test/command-replay-contract.integration.test.ts` | `db2315937aad7fe0443f020060a2575aa79f509ec344a35dd8387626ba5de62f` |
| `packages/core/src/watchdog.ts` | `a07e5784fd37ee475227caf58705b75c587ee344c39f1001e9df82c944e2c5ca` |
| `packages/db/migrations/0165_practice_worker_switch.sql` | `295b9b644b1b944cb7d626c77e48bf42dee213b78b74ffd26444eb9cb3e113be` |
| `packages/db/migrations/0138_practice_session_hardening.sql` | `af34ad0b9795f124eb8d892f315731917da897223396be8374161ac463d112cb` |
| `apps/api/openapi.json` | `053330c840f55a29c7c6ae5cd81dbfd6224ccaadeccfd97481a991e9d0899dbe` |

Final HEAD (unchanged): `0bbb5ddbd074b791ece740a1861a6b7cc2fd6577`. Intended commit message: `/private/tmp/jg-msg-mon-5a.txt`. No independent verdict or acceptance recorded by this builder.
