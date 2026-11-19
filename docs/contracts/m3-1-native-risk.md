# M3-1 native risk slice — NOT FINISHED

Ben, 5 November 2026: “Start native app”; no-PR branches in plan order, made-up data only. This branch is RED for sign-in and offline commands. It is a reviewable partial, not M3-1 acceptance. Device proof, D08 and G3 stay closed. No independent review, approved hosting route, real provider, account, store upload or production distribution is claimed.

## Branch and scope

Based on `origin/main` at `36acf72daddbaa68f09a84c67a8a22842a72928d`. `origin/codex/sandbox/m3-1` is already an ancestor of that main; no duplicate merge was needed. Push destination: `codex/sandbox/m3-1-native`; no PR.

Read alongside `BUILD_PLAN.md` §11.4 / M3-1, `docs/contracts/offline-contract-v1.md`, its existing core/property/PostgreSQL tests, and proposed `docs/decisions/d08-offline-security-conflicts.md`. No contract/test/server permission was weakened. No PostgreSQL migration or grant was added. The API declares mobile as a workspace development dependency because its new compatibility test consumes that interface; this also preserves the existing CI prerequisite-graph assertion without editing the test.

## Dependency and clean-install hold

Exact direct external pins are in `apps/mobile/package.json`; registry publication dates and SHA-512 values are in `apps/mobile/dependency-releases.json`. Every direct pin predates 22 October 2026 (the conservative fourteen-day cutoff):

| Package | Exact version |
| --- | --- |
| Expo | 54.0.20 |
| React Native | 0.81.5 |
| React | 19.1.0 |
| expo-dev-client | 6.0.16 |
| expo-sqlite | 16.0.8 |
| expo-secure-store | 15.0.7 |
| expo-crypto | 15.0.7 |
| Zod | 4.6.6 |
| @types/react | 19.1.8 |
| TypeScript | 5.8.3 |
| Vitest | 4.1.12 |

Runtime observed: Node 24.19.0; use repository-pinned pnpm 10.28.1 (the environment default was 11.25.0). The selected SDK54/RN81 dependency pairing comes from Expo 54.0.20's `bundledNativeModules.json`; current device/OS support is still unproved.

**Supply-chain lint and clean install are NOT passing at the final tree.** An initial exploratory `pnpm install --ignore-scripts` resolved a mobile graph and permitted the source checks below. It preceded the age quarantine. Once `minimumReleaseAge: 20160` was enforced, resolution refused immature transitive releases. A fresh attempt from main's lock stopped at inherited root override `glob@<14.0.2 → 14.0.2`. Registry evidence: glob 14.0.2 was published `2026-10-27T22:07:00.325Z`; it is too young on 5 November. An earlier attempt also refused browserslist 4.29.5 (26 October). No age exclusion, security-override downgrade or unapproved substitute was added.

The exploratory lock was discarded before the age-enforced resolution. `pnpm-lock.yaml` consequently remains main's unchanged lock, without a mobile importer. This is deliberate unresolved dependency work, not a frozen-install success. The mandatory mobile lint refuses the missing registry integrity bindings. Resolve and commit a full age-compliant lock before use; do not install with an age bypass. Do not interpret the installed exploratory dependency tree or exported bundle as a clean pinned build. Waiting until the inherited security pin is mature may unblock that pin, but the whole graph must be resolved and checked again; no future pass is promised.

The mobile React type pin is aligned with main at 19.1.8; the exploratory install originally selected 19.1.10 and its duplicate-type effect is not a clean-tree regression result.

The direct-pin lint checks exact versions, dated publication evidence, integrity bindings to the committed lock, SQLCipher configuration and disabled OTA updates. It does not claim a vulnerability scan, dependency provenance review, complete transitive age audit or native encryption proof. Automatic approval review rejected an attempted removal of the age control because it would weaken the requested requirement; the removal was not applied. The control stays enabled.

## Native flags and encryption boundary

`app.json` defines iOS and Android development-build targets, synthetic `invalid.jobguard.synthetic` identifiers, new architecture enabled, Hermes (generated default), `expo-dev-client` launcher mode, no generated account scheme and OTA updates disabled. There is no EAS configuration, Expo account, PowerSync service or hosted route.

`expo-sqlite` config plugin: `useSQLCipher: true`. Generated Android `gradle.properties`: `expo.sqlite.useSQLCipher=true`, `newArchEnabled=true`, `hermesEnabled=true`. Generated iOS `Podfile.properties.json`: `expo.sqlite.useSQLCipher="true"`, `newArchEnabled="true"`, `expo.jsEngine="hermes"`. Generated Gradle wrapper: 8.14.3; generated iOS deployment default: 15.1. React Native 0.81.5 source defaults additionally pin Android min SDK 24, target/compile SDK 36, build tools 36.0.0, NDK 27.1.12297006, AGP 8.11.0 and Kotlin 2.1.20; none of those toolchains was installed/compiled here. expo-sqlite names Android OpenSSL artifact `io.github.ronickg:openssl:3.3.2` and fbjni 0.3.0. Its CMake arguments include `-DANDROID_STL=c++_shared`, `-DANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON`, `-DUSE_SQLCIPHER=true`, `-DUSE_LIBSQL=false`; actual compiler linkage remains unproved. Native directories are ignored prebuild outputs; their existence is configuration evidence only, not compiled artifacts.

Source-inspected expo-sqlite 16.0.8 vendors SQLCipher 4.7.0 / SQLite 3.49.1. Its Android encryption branch adds `-DSQLITE_HAS_CODEC=1 -DSQLITE_EXTRA_INIT=sqlcipher_extra_init -DSQLITE_EXTRA_SHUTDOWN=sqlcipher_extra_shutdown -DSQLCIPHER_CRYPTO_OPENSSL`. The iOS branch adds `-DSQLITE_HAS_CODEC=1 -DSQLCIPHER_CRYPTO_CC -DSQLITE_EXTRA_INIT=sqlcipher_extra_init -DSQLITE_EXTRA_SHUTDOWN=sqlcipher_extra_shutdown -DNDEBUG`. These are selected source flags, not observed compiler output. Release flags and complete native transitive versions remain owed.

**Stopped native execution:** prebuild succeeded; Android run failed resolving the SDK and spawning `adb` (`ENOENT`). This Linux host has no Xcode. Neither native SQLCipher stack can be compiled/proved here with the available toolchains. No plaintext SQLite or other unencrypted fallback was substituted. No host-only encryption demonstration is presented as native compatibility.

`EncryptedStore` isolates the driver. `openCipherStore` validates a 256-bit hex key, applies it before catalog/application access, requires a nonempty `PRAGMA cipher_version`, forces a catalog read for wrong-key/corruption detection, and refuses unknown `user_version` without reset. Schema 1 creates one synthetic probe record and preserves it on reopen. Payload writes are bound SQL parameters. Native keys use expo-crypto and SecureStore `WHEN_UNLOCKED_THIS_DEVICE_ONLY`; Android backup integration is disabled. Keys/sessions are never queue payloads. Missing keys against an existing database fail on open; no destructive recovery policy is invented. Device key availability/backup/reinstall guarantees remain unproved.

The shell exposes only a manual SQLCipher catalog check and held status. It does not implement sign-in, production capture, real tenant caches, mobile exchange/refresh or a reconciliation UI. The queue and API compatibility runner are interfaces/source plus tests; they are not wired into an authenticated device journey while the native/clean-install gates are blocked.

## Queue and local API compatibility

`NativeProbe` accepts only strict `offline-intent.v1` / note-only `log-site-extra.v1`. It retains the original UUIDv7, captured time/HLC and text. UUIDv7/HLC remain client-controlled identity/order metadata; fixtures use an explicitly fictional fixed v7 ID, not a production identity generator. They grant no permission, determine no business winner and are excluded from the owning command payload/hash. Server transactions, audit and immutable receipts order effects.

The queue persists both original intent and `offline-queue-item.v1` metadata in local schema 1 / `native-probe.v1`, binds command/job/body/hash on every decode, refuses replacement, persists `sending` before networking and recovers interrupted attempts without changing ID/body. It reuses main's attempt budget, backoff, result and review rules. A lost reply is queued/unknown, never recorded; conflicts/revocation/malformed success need review. One probe instance has an exclusive-operation guard; callers must own a single store/probe, not open competing writers. This is one intent only, not a general M3-4 production queue.

`SyncTransport` is the replacement seam for a future approved PowerSync adapter. No PowerSync SDK compatibility, replication/download-rule authorization or service account has been proved. `localApi` permits only loopback/local Android-emulator HTTP addresses and refuses redirects. Authenticated request transport is injected; the adapter never reads credentials or manufactures sessions. HTTP is synthetic loopback testing only; no physical-LAN or production TLS exception is added.

Read: `GET /contractor/site/jobs`, strict minimal `site-assigned-jobs.v1` projection. Upload: the existing owning `POST /contractor/jobs/:id/site-extras`, note body only; strict matching `site-extra-logged.v1` becomes the shared queue's recorded result. Server rejection codes become explicit review/conflict or unknown/retry, never an optimistic acknowledgment. This is the M3-1 contractor adapter, not a change to M3-4 `/offline/uploads`: that route requires a small-builder practice principal as well as the owning command's authority. The first real-HTTP test correctly refused the mismatched principal; the adapter was corrected to use its existing owning route, without changing server permissions.

All data is fictional notes/identifiers. No real PII, amounts, evidence, credentials or approvals are accepted by the probe. The executable non-commercial LWW allowlist is empty. Notes are append-only commands. Financial/state commands are unsupported here; financial approvals and money are **never last-writer-wins** and reconnect never refreshes approval. Local history is not migrated/rebased into a new approval. Logout, revocation lease, deletion, tenant switching and secure recovery remain M3-2/D08 work; this slice makes no immediate-offline-revocation promise.

## Human physical-device checklist — every item NOT DONE

- [ ] NOT DONE: resolve a mature security-compatible dependency graph, commit lock, pass frozen install/supply-chain lint and complete native dependency inventory. Record SDK/build-tool/pod versions, compiler flags and hashes of actual artifacts.
- [ ] NOT DONE: obtain supported macOS/Xcode and Android SDK toolchains; build iOS and Android development binaries locally. Expo Go and JS/Hermes exports do not count. Record actual device model/OS/build ID and supported OS floor.
- [ ] NOT DONE: execute the native SQLCipher check on both devices; record `cipher_version` without keys. Prove an encrypted queue write/read with fictional data, kill/relaunch, device restart and upgrade schema handling. Unknown schema must refuse without destroying pending work.
- [ ] NOT DONE: extract DB, WAL/journal and backup artifacts; verify fictional plaintext absent and stock SQLite/wrong key cannot read; demonstrate right-key reopen. Verify native release encryption flags and key-store behavior across lock/restart/reinstall/backup and missing-key failure.
- [ ] NOT DONE: implement/verify the authorized device session transport under M3-2 without bundled/persisted general-store credentials; prove the actual encrypted native read → airplane-mode queue → termination → reconnect → acknowledgment journey. Node's test store is not evidence for this item.
- [ ] NOT DONE: test lost response/retry, skewed clocks, revoked membership/assignment, expired lease, tenant switch/logout and restoration without cross-user cache inheritance. Verify queued never means sent/paid and conflicts require review.
- [ ] NOT DONE: test low storage, interrupted migration/upload, multi-crew concurrency and duplicate/reordered/delayed commands on supported physical devices.
- [ ] NOT DONE: validate the selected real encrypted PowerSync adapter plus minimal download-rule isolation/revocation and an approved EU/UK processing/storage/log/backup route. No hosted or global fallback.
- [ ] NOT DONE: obtain dated D08 approval and independent RED review against the exact head, then satisfy G3 and all applicable release gates before any real-data distribution. This checklist cannot grant those approvals.

## Executed evidence

Commands and final results are recorded below. All automated encryption/driver tests use explicit doubles. The real HTTP test uses actual Nest controllers, runtime-role PostgreSQL, persisted digest-bound synthetic session and fictional fixture jobs; only its local store is a double. It proves transport/server behavior, not device encryption/durability/authentication UI. No secrets are printed or committed.

The commands below used `/workspace/.npm-cache/_npx/116f317e7afab6e7/node_modules/.bin/pnpm` (10.28.1) either directly or by prefixing `PATH` with its directory. Registry commands used `npm_config_cache=/workspace/.npm-cache` (or `npm --cache /workspace/.npm-cache`). Install additionally set `XDG_DATA_HOME=/workspace/work/xdg PNPM_HOME=/workspace/work/pnpm`; no home-directory files or credentials were written. Native commands set `CI=1 EXPO_OFFLINE=1 EXPO_NO_TELEMETRY=1`. Commands requiring loopback/subprocess/network access used the execution tool's network permission; early sandbox-denied runs are not reported as product failures.

| Exact command after that environment setup | Observed result |
| --- | --- |
| `git fetch origin main` and `git fetch origin codex/sandbox/m3-1:refs/remotes/origin/codex/sandbox/m3-1` | Passed after enabling execution-network access; first attempts could not reach proxy |
| `git switch -c codex/sandbox/m3-1-native origin/main` | Passed |
| `git merge-base --is-ancestor origin/codex/sandbox/m3-1 origin/main` | Exit 0, work already included |
| `pnpm install --ignore-scripts --store-dir /workspace/.pnpm-store` | Initial exploratory install passed before age policy; subsequent age-enforced installs failed with `ERR_PNPM_NO_MATURE_MATCHING_VERSION` (browserslist, then glob) |
| `npm view glob@14.0.2 time --json` | Confirmed publication `2026-10-27T22:07:00.325Z` |
| `node apps/mobile/tools/supply-chain.mjs --refresh` | Recorded direct release dates/integrities. First exploratory-graph check passed 11 direct pins; final check fails `expo: registry integrity missing from lock`. Final supply-chain status is FAIL/HELD |
| `pnpm --filter @jobguard/mobile prebuild` | Passed; generated iOS and Android SQLCipher flags above; no native compile |
| `pnpm --filter @jobguard/mobile exec expo run:android --no-install` | Exit 1: missing Android SDK and `adb ENOENT`; native encryption execution stopped |
| `pnpm --filter @jobguard/mobile exec expo run:ios --no-install` | Exit 1: iOS builds require macOS; no EAS/hosted build attempted |
| `pnpm turbo run build --filter=@jobguard/core --filter=@jobguard/db --filter=@jobguard/config` | Passed (4 tasks including storage). Early invocation inherited environment-default pnpm 11 for child scripts; later root runs used the pinned pnpm PATH |
| `pnpm --filter @jobguard/mobile test` | Passed, 2 files / 8 tests: driver fail-closed/wrong-key/schema rules, retry/restore identity, payload tampering, unsupported money, revocation/conflict review, loopback restriction and exclusive operation |
| `pnpm --filter @jobguard/mobile typecheck` | Passed in exploratory install; does not establish frozen-install compatibility |
| `pnpm --filter @jobguard/api typecheck` | Passed |
| `pnpm --filter @jobguard/core exec vitest run src/offline-contract.test.ts src/offline-contract.properties.test.ts src/offline-client-queue.test.ts` | Passed, 3 files / 75 tests (including generated histories) |
| `pnpm --filter @jobguard/api exec vitest run src/m31-native-roundtrip.integration.test.ts src/offline-client-queue.compat.test.ts src/offline-upload.application.test.ts src/contractor/offline-risk.application.test.ts` | Passed, 4 files / 17 tests; includes real HTTP + PostgreSQL note round trip, committed retry and revocation |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/offline-risk.properties.integration.test.ts test/offline-risk.integration.test.ts test/offline-upload.integration.test.ts` | Passed, 3 files / 18 tests, including multi-crew schedules, authority/conflicts and durable server replay |
| `pnpm typecheck` | Exit 2: 7 of 8 tasks passed; web TS2742 inferred types reference exploratory `@types/react@19.1.10`. Final manifest aligns mobile with main's 19.1.8; clean reinstall verification remains blocked. No web annotations/tests were weakened to hide this |
| `pnpm build` | Exit 1: 7 of 8 tasks passed, including both mobile Hermes exports and API; web TS2742 duplicate exploratory React-type inference errors. A migration-directory bundler warning was also printed. Initial root attempts failed trying to write Expo state under the unavailable home directory; mobile scripts now force offline/no-telemetry export/prebuild |
| `node --test tools/*.test.mjs` | Final run passed, 423 tests, zero failed/skipped. Initial run caught the missing mobile build prerequisite; the workspace development dependency fixed it without changing tests |
| `node --test tools/ci-workflow.test.mjs` | Final run passed, 9 tests, unchanged assertions; API development dependency now includes its mobile test prerequisite |
| `pnpm lint` | Exit 1: repository boundary checks passed, mobile supply-chain lint correctly failed the missing lock binding; downstream type lint was interrupted, not passed |
| `git diff --check` | Passed |
| `node tools/agent-lane-boundary-lint.mjs` | Passed after a real branch commit existed; before first commit it correctly refused self-comparison. Lane lists every changed non-lane file and does not list itself |

Full `pnpm test`, browser journeys, `pnpm test:migrations`, `pnpm eval`, physical-device suite and release checks were not completed. There is no new server migration/model/browser flow; existing PostgreSQL risk tests still exercise current migrations and authority. This is not a claim that all mandatory acceptance suites passed. No independent RED review was performed.

## 5 November follow-up: React type isolation

Mobile now scopes its ambient types with `types: ["react"]` and `typeRoots: ["./node_modules/@types"]`. React runtime resolution is unchanged: no TypeScript path alias points Metro at a declaration file. No web/root compiler strictness, declarations or test assertions were relaxed. `@types/react` remains exactly main's 19.1.8. The earlier exploratory install left both mobile's direct link and pnpm's implicit type lookup pointing at 19.1.10; those local links were repaired to the already-installed, manifest-pinned 19.1.8 for verification. This is an installed-tree repair, not a dependency-age exception or proof of a successful frozen install.

**Age-clear date:** `glob@14.0.2`, published 27 October 2026 at 22:07:00.325 UTC, reaches fourteen days on **10 November 2026 at 22:07:00.325 GMT (Europe/London)**. No clock override, release-age exclusion or security downgrade is permitted. Full graph resolution and supply-chain lint must run again then; other immature packages may still block it.

The 5 November scoped follow-up passed broad `pnpm typecheck` and `pnpm build` (8/8 tasks each). Broad lint remains fail-closed on unresolved mobile lock bindings under the unchanged fourteen-day control. See `docs/contracts/m3-2-native-risk.md` for the same-stack continuation, exact verification commands and additional all-unchecked device steps. Neither aggregate piece is finished.


## 16 November 2026 — NATIVE-MATURE-LOCKFILE resolution receipt (HELD)

This child worktree is on `codex/sandbox/native-mature-lockfile` at the required saved native head `49e3e892bd142d86ea85d8db5ddd4a10b4cb2b2d`. Initial working tree was clean. No fetch, git write, owner-branch mutation, native-composition merge, migration, PR or CI dispatch occurred. The prior 14 November `/tmp` handoff concerned an incorrect base; that base problem is absent in this pass.

**Unresolved prerequisite, do not integrate:** `pnpm-lock.yaml` remains unchanged and lacks the mobile importer/integrity bindings. Exact pins, security overrides, `minimumReleaseAge: 20160`, release evidence, supply-chain checker and native encryption/authority flags remain unchanged. No integrity, snapshot or publication date was invented. Glob's previously evidenced eligibility date remains 10 November 2026 at 22:07:00.325 GMT; it establishes neither graph maturity nor completion today.

Runtime: Node `v24.17.0`; cached pnpm `10.28.1` verified at `/Users/benharwood/.npm/_npx/116f317e7afab6e7/node_modules/pnpm/bin/pnpm.cjs`. Check commands used the existing `/tmp/jg-pnpm-10.28.1-bin` wrapper first in PATH (points to cached Corepack pnpm 10.28.1). The default pnpm wrapper emitted an ignored-overrides warning and stalled on `--version`; it was interrupted and not used for resolution. Vitest reports `4.1.12`; its actual `--help` lists `--maxWorkers <workers>`. The selected test invocation used `--maxWorkers=1`, not inherited Vitest 2 settings.

The final sandbox instruction prohibits package downloads. To attempt resolution without touching an installed tree, copied only workspace manifests, workspace configuration and the current lock into `/tmp/native-mature-lockfile-20261116-58ao0v7_`. No package manifest or control was changed in that copy. From that directory ran the cached pinned CLI:

```sh
node /Users/benharwood/.npm/_npx/116f317e7afab6e7/node_modules/pnpm/bin/pnpm.cjs install --offline --lockfile-only --store-dir /tmp/native-mature-lockfile-20261116-58ao0v7_/store
```

**Exit 1:** `ERR_PNPM_NO_OFFLINE_META Failed to resolve turbo@2.10.12 in package mirror /Users/benharwood/Library/Caches/pnpm/metadata-ff-v1.3/registry.npmjs.org/turbo.json`. pnpm reported `resolved 1, reused 0, downloaded 0, added 0`. Resolution stopped at missing root metadata before mobile graph resolution. This is not evidence of an immature turbo release. Its publication/earliest eligible date is not established here. No online retry, release-evidence refresh, frozen install, age bypass, script-policy bypass or package download was attempted. A clean install cannot be proved without a successfully resolved complete lock.

Local checks (from this worktree unless noted):

| Command | Actual result |
| --- | --- |
| `node --check apps/mobile/tools/supply-chain.mjs` | PASS, syntax only |
| `node apps/mobile/tools/supply-chain.mjs` | Exit 1, unchanged fail-closed assertion `expo: registry integrity missing from lock` |
| Existing Vitest entrypoint, from `apps/mobile`: `node ../../node_modules/.pnpm/vitest@4.1.12_@types+node@24.0.3_vite@7.3.7_@types+node@24.0.3_terser@5.51.2_tsx@4.20.3_yaml@2.9.1_/node_modules/vitest/vitest.mjs run --maxWorkers=1 src/store.test.ts src/sync.test.ts src/lifecycle.test.ts` | Exit 1, 3 suites failed to load, zero tests executed: cannot resolve `expo/tsconfig.base`. `apps/mobile/node_modules` is absent; installed root dependencies do not establish mobile readiness. No remaining mobile batches run after this shared prerequisite failure |
| `PATH=/tmp/jg-pnpm-10.28.1-bin:$PATH pnpm --filter @jobguard/mobile typecheck` | Exit 2, TS2688 missing React type definitions and TS6053 missing `expo/tsconfig.base` |
| `PATH=/tmp/jg-pnpm-10.28.1-bin:$PATH pnpm typecheck --concurrency=1` | Exit 2 at mobile with the same missing dependencies; Turbo reports 4 successful / 6 total tasks and warns mobile workspace is absent from lock. Other remaining tasks are not a full-root pass. Cache writes also emitted sandbox IO warnings |
| `node --test --test-concurrency=1 tools/ci-workflow.test.mjs` | PASS, 9/9 tooling tests; not a GitHub CI run |
| `LANE_BASE_REF=49e3e892bd142d86ea85d8db5ddd4a10b4cb2b2d node tools/agent-lane-boundary-lint.mjs` | Exit 1, correctly refuses self-comparison while HEAD still equals the specified base. No git write to evade refusal |
| Existing exported lane helpers `loadLanePolicy`, `selectLane`, `lanePathAllowed` | Working-tree policy parse, exact child-branch selection and both receipt/lane paths PASS. Not committed-range evidence |

An initial root typecheck command incorrectly used `pnpm typecheck -- --concurrency=1`, forwarding the option to TypeScript and failing TS5023. Corrected to the command above; no source change was made to address the invocation error. Root build/lint/full tests, other tooling suites, database/browser and device suites were not run: the final sandbox order limits local work to relevant unit tests/typecheck, dependencies cannot be downloaded, and the relevant unresolved lock check already fails. Tooling suites that create git fixture repositories were not run under the no-git-writes restriction. No broader pass is claimed.

Only this appended receipt and the child lane file change. The lane grants exactly this receipt, not itself or the owner's lane. Router next step: resume genuine full age-enforced graph resolution in an environment permitting authentic registry metadata and package installation, retaining all pins/overrides/controls; then prove isolated frozen install and rerun mandatory checks. Any newly immature release or required out-of-scope control change remains a named hold. NOPR remains in effect. This slice and aggregate M3-1 remain OPEN; physical-device development builds/encryption/sync proof, approved route, D08, G3, M3-2 extraction/key lifecycle/cleanup and exact-head independent RED review remain outstanding.

Final whitespace check: `git diff --check` PASS. No implementation code changed; no worthwhile implementation simplification was identified for a LATER / SIMPLICITY entry.


## 19 November 2026 — NATIVE-MATURE-LOCKFILE resolution receipt (RESOLVED; supersedes the 16 November HELD receipt above)

Run on Ben's Mac by a Claude Opus 5.5 (medium) builder, because the Codex sandbox has no network (Ben, 19 November 2026: "Yes, start it"). Base: `49e3e892bd142d86ea85d8db5ddd4a10b4cb2b2d` on child branch `codex/sandbox/native-mature-lockfile`; the native owner's worktree/branch and native-composition were not touched. Runtime: Node `v24.17.0`; pnpm `10.28.1` (cached CLI `~/.npm/_npx/116f317e7afab6e7/node_modules/pnpm/bin/pnpm.cjs`, run with `--config.manage-package-manager-versions=false`; `pnpm config get minimumReleaseAge` = `20160`). Every install used `--ignore-scripts`: no lifecycle scripts ran.

Package manifests, `pnpm-workspace.yaml` (`minimumReleaseAge: 20160`), all 26 security overrides, exact pins, `apps/mobile/app.json` native flags (SQLCipher, updates off, new architecture), the supply-chain checker and tests are unchanged. No integrity, snapshot or date was hand-written.

1. Resolution, in this worktree: `pnpm install --lockfile-only --ignore-scripts` exit 0 against registry.npmjs.org with the age quarantine enforced; 1,217 packages resolved; 476 lock package entries added, none removed; lock overrides identical to the old lock. No existing importer changed a resolved version; only peer-context suffixes changed because the mobile graph now supplies optional peers (`babel-plugin-react-compiler@1.0.0` on `next`, `lightningcss@1.33.0` on `vite`/`vitest`/`@nestjs/cli`, `expo-sqlite@16.0.8` on `drizzle-orm`). Pre-existing unmet-peer warnings reported (ajv 8.18.0 vs 8.20.0, webpack 5.104.1 vs 5.106.2, picomatch 4.0.4 vs 4.0.7) come from the existing override set and were left as they are.
2. Clean frozen install, isolated copy (`git archive HEAD` plus the new lock, outside every shared checkout) with its own new store directory: `pnpm install --frozen-lockfile --ignore-scripts --store-dir <isolated>` exit 0, "Lockfile is up to date", 1,094 packages downloaded and integrity-checked from the registry; lock byte-identical afterwards.
3. Release evidence: the existing helper `node apps/mobile/tools/supply-chain.mjs --refresh` was run in the isolated copy against the live registry; every version, publication date and integrity matched the committed `apps/mobile/dependency-releases.json` (only `checkedAt` differed), so that file is not changed.

| Command (isolated copy unless noted) | Result |
| --- | --- |
| `node apps/mobile/tools/supply-chain.mjs` (also in this worktree) | PASS: 11 exact direct pins bound to registry SHA-512 lock integrities |
| `pnpm build --concurrency=2` | PASS, 8/8 tasks (mobile `build` is a Hermes `expo export`, not a device build) |
| `apps/mobile`: `vitest run src --maxWorkers=1` (Vitest 4.1.12) | PASS, 10 files, 44 tests (before the build, 9 files failed to load because `@jobguard/core` had no `dist`; not a defect) |
| `apps/mobile`: `tsc --noEmit` | PASS |
| `pnpm typecheck --concurrency=2` | PASS, 8/8 tasks |
| `turbo run lint --concurrency=2` | PASS, 8/8 tasks |
| core-purity, money-arithmetic, commercial-boundary, ai-provider-boundary, plpgsql-case-in-if lints | PASS each |
| Worktree: `node --test --test-concurrency=1 tools/*.test.mjs` | 422/423; the one failure (CSG-10) was a `spawnSync ETIMEDOUT` while the Mac slept; rerunning that file alone passed 169/169 |
| Lane boundary lint | Needs the committed range; result recorded in the commit message |

Not run: database, browser and device suites (they run later through existing CI). Still open: physical-device development build and encryption/sync adapter proof, approved sync route, D08, G3, M3-2 extraction/key lifecycle/cleanup, and exact-head independent RED review before native integration. NOPR=1: branch pushed, no PR, no merge. This slice's dependency prerequisite is met; aggregate M3-1 is not finished.
