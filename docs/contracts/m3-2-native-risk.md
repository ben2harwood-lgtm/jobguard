# M3-2 synthetic native client — NOT FINISHED

5 November 2026. This continues M3-1 on `codex/sandbox/m3-1-native` at Ben's explicit request; no PR. RED: sign-in, sessions and offline commands. M3-1 device/encryption acceptance, D08 and G3 remain held. This is a synthetic client implementation and automated compatibility evidence, not a production auth transport or native/device acceptance.

Read `BUILD_PLAN.md` M3-2, `docs/contracts/mobile-auth-v1.md`, `docs/contracts/m3-1-native-risk.md`, the proposed D08 record and existing core/server/property tests. No contract, test, server authority or release control was weakened. No new external dependency, public endpoint, database migration, provider, account, credential configuration, hosted service or upload is added.

## React repair and dependency hold

The earlier exploratory install hoisted `@types/react@19.1.10` into Next's implicit type lookup while web directly pinned 19.1.8. Mobile's declared pin already matched 19.1.8; its stale direct link also still selected 19.1.10. Mobile now restricts its own ambient types using `types: ["react"]` and `typeRoots: ["./node_modules/@types"]`. No runtime alias points Metro to declaration files. The two stale local pnpm/mobile links were repaired to the already-installed 19.1.8 to verify the declared graph; web/root compiler options, declarations, source and assertions were unchanged. The subsequent broad `pnpm typecheck` and `pnpm build` each passed all 8 tasks. This source fix was pushed first as `74e3d2f64` before M3-2 implementation.

This is not a claim of a clean/frozen native install. The fourteen-day quarantine remains `minimumReleaseAge: 20160`; the mobile lock importer is still blocked. `glob@14.0.2` clears its age on **10 November 2026 at 22:07:00.325 GMT (Europe/London)**. Full graph resolution, lockfile commit and supply-chain checks must run again then. Other immature packages may still block resolution. The mandatory supply-chain lint remains a failure until the lock bindings exist; it was not removed from broad lint. Source/type regressions are fixed; broad lint cannot be called green while this dependency control is held.

Exact direct/native candidate versions and SQLCipher build flags remain those in the M3-1 report. No encryption stack or native binary was built here: Android SDK/adb and macOS/Xcode are unavailable. No plaintext fallback was introduced to make client tests run.

## AuthProvider path and shell

`MobileAuthProvider` in the client is a narrow port to main's existing DARK `SyntheticMobileAuthApplication`. The API integration test supplies the existing `MemoryAuthProvider`, performs the actual entered-code fixture flow, and then drives exchange, refresh/rotation, reconnect, tenant switch and logout through the server application and its unchanged principal/CSRF/origin/membership checks. Source-session credentials stay in the test/injected transport closure, outside local SQLite, files and client state. Mobile access/refresh specimens are not business-command principals.

The existing server permits only the explicitly enabled synthetic MemoryAuthProvider seam. No persisted/live AuthProvider integration or public native HTTP transport was added. Client `MobileAuthProvider` is an interface, not a second credential issuer. The new response parser strictly binds the session and lease to their complete partition, requested tenant and device. Changed refresh partitions, mismatched user/tenant switches and overlong leases deny access. All client/provider/storage/parser failures become closed `MobileClientError` codes without raw credentials/content/provider errors. Client private state is not serialized by JSON.

The Expo shell has injectable synthetic client controls for exchange, restore, reconnect, refresh, switch and logout. The default app has no auth transport/account and disables those controls. `createNativeSyntheticClient` requires an explicit provider, fictional policy, device correlation and enable flag; SecureStore must be available. No embedded secret, sample source session, production duration or default service endpoint is supplied. UI messages expose bounded outcomes and retain the held status; actual device interaction remains unchecked.

## Secure storage, encrypted database and files

`SecureVault` and `PartitionResources` isolate the platform. The concrete native vault uses expo-secure-store with `WHEN_UNLOCKED_THIS_DEVICE_ONLY`; Android backup integration remains disabled by the M3-1 plugin configuration. These are configuration choices, not proof of hardware backing or lost-device security on either OS.

The native resource adapter hashes the strict tuple `[userId, tenantId, membershipId, mobileSessionId, deviceInstanceId]` with SHA-256 into opaque database/key names. Every partition gets an independent random 256-bit database key in SecureStore. Refresh retains the partition/key; a new user/tenant/session/device selects different resources. Missing keys on resume deny access without regeneration. `openCipherStore` remains the only database opening path, requiring the key, actual `cipher_version`, valid catalog and understood schema before application data. There is no generic SQLite, AsyncStorage or plaintext-file path.

`mobile-cache.v1` stores strict partition metadata/schema 1, at most 100 labelled fictional notes, up to 8 small file entries (base64, at most 131072 characters each), and explicit unsynced-work status inside the encrypted SQLite record. Files here are bounded logical attachments whose bytes live **inside SQLCipher**, not independently encrypted arbitrary filesystem/media paths. No temporary/exported plaintext file is created. General streaming media capture/import/export and large-file encryption remain unimplemented and held; this implementation does not label plaintext media as encrypted. Decrypted attachment bytes exist in memory only after the read gate. Tokens, source credentials and encryption keys are absent from this record.

Unknown local schema/version, malformed files, wrong partition, missing/corrupt store and wrong key deny access without reset or destructive migration. Native database/user-version tests use doubles; native key-store/file extraction must still be proved. SQLCipher is not executed by Node tests.

## Lease and cold-start behavior

The explicit fictional policy is validated using main's pure schema; there is no production default. The lease duration must fit that policy, and full partition identity must match. Exchange/reconnect/rotation revalidate source authority at the existing server boundary; no local timestamp can renew a lease or revive a revoked family.

Every client instance starts locked. `resume` restores SecureStore metadata only and opens no database. It cannot serve offline cache after process restart. Reconnect or refresh must succeed against current source authority before the existing encrypted partition opens. Reads enforce main's evaluator before **and after** an asynchronous cache read, refusing exact expiry, time before issue, clock anomalies/unverified time or a locked state. A known reconnect refusal locks subsequent reads. A disconnected client cannot learn a new remote revocation instantly; a previously allowed synthetic fixture read ends at its lease bound. There is no immediate remote-erasure promise.

Native clocks are deliberately `unverified`. The native factory never labels wall/monotonic time `trusted_fixture`, so it currently denies device offline-cache reads. Tests inject the existing fictional `trusted_fixture` clock to exercise exact bounds; this is not approval of a device-clock policy. A real bounded native-clock/read policy remains D08 work. The conservative cold-start denial is implemented now rather than inventing a lease grace period.

Refresh removes the old secure credential record **before** sending the single rotation request, and closes the old data handle on success or failure. It never automatically reuses a possibly consumed refresh after a lost reply. A failed/unknown outcome stays locked and needs explicit recovery; replacement plaintext is not cached for replay. The existing server tests prove reuse revocation and persisted family behavior; the client tests prove it does not undermine those rules.

## Logout, tenant switch and failure ordering

A client instance permits one lifecycle operation at a time. Read/write methods cannot overlap cleanup or rotation. Application composition must own a single client/resource set; this is not a claim of an OS-level multi-process lock.

Logout first locks reads, persists a secure `cleanup_required` marker and removes mobile bearer credentials, then requests the existing server's device logout/tombstone. Handles close even if that request fails. An unknown server outcome never becomes a claimed revocation. When unsynced status is `none` and server logout is confirmed, native database deletion (including its inline attachments) precedes partition-key deletion, then the active marker is removed. Deletion failure retains the cleanup marker and denies resume/new exchange; no new user can inherit stale caches. Native WAL/backup/deletion completeness still needs device proof.

`present` or `unknown` unsynced work never authorizes erasure. Logout removes bearer credentials and requests revocation but keeps encrypted content/keys quarantined, returns `MOBILE_UNSYNCED_POLICY_HOLD`, and cannot resume as active. Switching is refused before server/device mutation when work is pending/unknown. No discard/retention policy or unsynced-work reconciliation UI is invented. Quarantine recovery, including retry after server/deletion failure, remains an explicit recovery task under D08; the shell does not claim successful logout for a hold.

For an empty partition, tenant switching asks the existing server to authorize target membership before revoking the old family. A denied target leaves old data intact and locally locked until reconnect. A successful target response is bound to the same user/device, then the old secure marker/credentials, database and key are cleaned before the target partition activates. Cleanup failure prevents target activation. New users and tenants never inherit the previous partition's notes, files or mobile credentials. Interrupted secure-vault writes and atomic OS crash guarantees remain device/recovery evidence, not something a Map double proves.

Financial/state commands and approvals have no execution path in this cache. Financial approvals and money remain never last-writer-wins; refresh, lease renewal and reconnect do not renew commercial authorization.

## Human device checklist — all NOT DONE

The M3-1 checklist remains fully unchecked. Additional M3-2 steps:

- [ ] NOT DONE: resolve mature graph/commit lock, frozen install and supply-chain lint; verify native builds and release flags on supported physical iOS/Android devices. No Expo Go/JS export substitution.
- [ ] NOT DONE: prove platform SecureStore availability, key protection/hardware behavior, lock/unlock, reboot, OS backup/restore, reinstall and missing-key failure. Verify no bearer/key enters database, logs, backups or sync projections.
- [ ] NOT DONE: extract database, WAL, journals and backup artifacts after storing fictional notes/attachment bytes; prove no plaintext without the partition key and reject stock SQLite/wrong keys. Verify real SQLCipher catalog/version and release linkage.
- [ ] NOT DONE: wire an approved source-auth/native transport and entered-code experience without bundled/provider secrets. Test actual exchange, refresh, access expiry, consumed-refresh/lost-response recovery, source-session expiry, current membership and SSO preservation. The DARK MemoryAuthProvider seam is not that live transport.
- [ ] NOT DONE: approve D08 durations/clock behavior, then prove bounded offline reads across clock rollback, sleep/suspend, reboot and network changes. Until then native offline reads remain denied.
- [ ] NOT DONE: on real devices, switch between two users and two tenants, terminate at each cleanup boundary, and demonstrate no cross-partition notes/files/credentials. Verify DB/WAL/media/key cleanup and disk/storage failure recovery.
- [ ] NOT DONE: demonstrate pending/unknown-work logout/switch holds without loss or accidental new-user access; approve the unsynced-work recovery/disposal policy and supply the reconciliation UI.
- [ ] NOT DONE: implement/prove general encrypted media file capture/import/export (no plaintext temporary files), supported upgrade/recovery, low-storage and interrupted-write behavior. The current bounded inline attachment vault does not prove that media pipeline.
- [ ] NOT DONE: complete independent RED review against the exact head, dated D08 approval, G3 and applicable release gates before real-data distribution. No approval is inferred from tests.

## Commands and results

All commands use repository pnpm 10.28.1 via `PATH=/workspace/.npm-cache/_npx/116f317e7afab6e7/node_modules/.bin:$PATH`, as in the M3-1 report. Registry/loopback/subprocess checks use execution-network permission where required. No new dependency install or native execution was attempted for M3-2; no age bypass or account was used. Result rows below describe tests with doubles, the real in-process AuthProvider/server seam, or real PostgreSQL as explicitly labelled; none proves device encryption.

| Exact command (after pinned PATH setup above) | Result |
| --- | --- |
| `ln -sfn ../../../../node_modules/.pnpm/@types+react@19.1.8/node_modules/@types/react apps/mobile/node_modules/@types/react` | Repaired stale local direct link to the already-installed declared pin; not a repository dependency change |
| `ln -sfn ../../@types+react@19.1.8/node_modules/@types/react node_modules/.pnpm/node_modules/@types/react` | Repaired exploratory implicit lookup; no age/install control changed |
| `pnpm typecheck` | Final run passed, 8/8 tasks (46.129 s); all compiler checks remain enabled |
| `pnpm build` | Passed, 8/8 tasks (57.598 s), including iOS/Android Hermes exports, API and web; these are JS/server builds, not native binaries |
| `pnpm lint` | Exit 1 at mandatory mobile supply-chain check: `expo: registry integrity missing from lock`. Global boundary checks passed; downstream tasks interrupted by Turbo are not claimed passed. No React-type lint failure remains in the successful typecheck |
| `pnpm --filter @jobguard/mobile test` | Passed, 4 files / 26 tests: prior queue/driver checks plus M3-2 lifecycle, native adapter doubles, isolation, expiry/read race, rollback, unknown clock, refresh consumption, cleanup failure, unsynced holds and schema/file refusals |
| `pnpm --filter @jobguard/mobile typecheck` | Passed |
| `pnpm --filter @jobguard/api exec vitest run src/m32-native-auth.integration.test.ts src/auth/mobile-auth.application.test.ts src/auth/auth.test.ts src/auth/context-boundary.test.ts` | Passed, 4 files / 189 tests, including real in-process AuthProvider/mobile server flow; local vault/SQLCipher remain explicit doubles |
| `pnpm --filter @jobguard/core exec vitest run src/mobile-auth.test.ts src/mobile-device-lifecycle.test.ts src/mobile-auth-state.test.ts` | Passed, 3 files / 10 tests |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/mobile-auth-store.integration.test.ts` | Passed, 1 file / 6 tests, real PostgreSQL persistence/rotation/revocation/concurrency and isolation/privileges |
| `node --test tools/*.test.mjs` | Passed, 423 tests, zero failed/skipped; existing assertions unchanged |
| `git diff --check` and `node tools/agent-lane-boundary-lint.mjs` | Passed. `config/lanes/m3-1-native.json` lists every changed non-lane file and does not list itself |

No full `pnpm test`, browser/device journeys, approved live provider, native crypto execution, complete native migration/media pipeline or production release suite was completed. No new schema/model/browser subsystem was introduced. M3-1 and M3-2 both remain incomplete; these automated results cannot grant independent RED review, D08 or G3.
