# M3-1 native risk slice — NOT FINISHED

Ben, 5 November 2026: “Start native app”; no-PR branches in plan order, made-up data only. This branch is RED for sign-in and offline commands. It is a reviewable partial, not M3-1 acceptance. Device proof, D08 and G3 stay closed. No independent review, approved hosting route, real provider, account, store upload or production distribution is claimed.

## Branch and scope

Based on `origin/main` at `36acf72daddbaa68f09a84c67a8a22842a72928d`. `origin/codex/sandbox/m3-1` is already an ancestor of that main; no duplicate merge was needed. Push destination: `codex/sandbox/m3-1-native`; no PR.

Read alongside `BUILD_PLAN.md` §11.4 / M3-1, `docs/contracts/offline-contract-v1.md`, its existing core/property/PostgreSQL tests, and proposed `docs/decisions/d08-offline-security-conflicts.md`. No contract/test/server permission was weakened. No PostgreSQL migration or grant was added.

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

The direct-pin lint checks exact versions, dated publication evidence, integrity bindings to the committed lock, SQLCipher configuration and disabled OTA updates. It does not claim a vulnerability scan, dependency provenance review, complete transitive age audit or native encryption proof. Automatic approval review rejected an attempted removal of the age control because it would weaken the requested requirement; the removal was not applied. The control stays enabled.

## Native flags and encryption boundary

`app.json` defines iOS and Android development-build targets, synthetic `invalid.jobguard.synthetic` identifiers, new architecture enabled, Hermes (generated default), `expo-dev-client` launcher mode, no generated account scheme and OTA updates disabled. There is no EAS configuration, Expo account, PowerSync service or hosted route.

`expo-sqlite` config plugin: `useSQLCipher: true`. Generated Android `gradle.properties`: `expo.sqlite.useSQLCipher=true`, `newArchEnabled=true`, `hermesEnabled=true`. Generated iOS `Podfile.properties.json`: `expo.sqlite.useSQLCipher="true"`, `newArchEnabled="true"`, `expo.jsEngine="hermes"`. Generated Gradle wrapper: 8.14.3; generated iOS deployment default: 15.1. Native directories are ignored prebuild outputs; their existence is configuration evidence only, not compiled artifacts.

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
