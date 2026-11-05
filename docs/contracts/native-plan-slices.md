# Native stack continuation — every aggregate piece remains held

5 November 2026, branch `codex/sandbox/m3-1-native`, no PR. Synthetic data only. This extends the M3-1/M3-2 reports; it does not approve D08, G3, live authentication, offline reads, encrypted media or distribution.

## Imported groundwork

Merged the requested remote branches in order: `m3-4-reconcile` (94a30eeed), `m3-6-shared`, `m3-7-suite` (6cc9e27a3), `ent-12-operative`. Additive conflicts in `packages/core/src/index.ts` retain both exports. The suite branch includes newer already-merged main ancestry (batch-26 merchant-order and dashboard work), preserved by the merge; it is not native work authored here. Existing tests were not weakened. The merged M3-7 physical-device matrix is an obligation, not executed device evidence.

## M3-3 — native download adapter

Has: `NativeDownloads` behind `NativeDownloadTransport`, partition-bound encrypted `WorkspaceDocument`, existing strict minimal seven-field projection, current-authority check on pull, opaque token in memory only, persisted request sequence/cursor before network, fresh subscription on restart, generation/schema checks, identity-only cleanup/tombstones through the existing core cache reducer, and no offline read method. Revoked authority clears the logical download projection before refusal. A returned assignment view comes only from a fresh authenticated download exchange. Membership/tenant/user/device/session bindings cannot come from a screen's selector or an unverified decoded token.

Lacks: mounted/authenticated native production transport, real PowerSync SDK/account/replication, actual native SQLCipher compilation/durability, approved sync hosting/data route, complete device paging/restore/erasure proof and native offline read approval. The transport interface requires authenticated server context; the client does not authenticate caller-supplied facts. Node tests use a marked SQLCipher double and existing core policy, not a native engine.

M3-3 verification: `pnpm --filter @jobguard/core build` passed after the merges; `pnpm --filter @jobguard/mobile test` passed 28 tests (5 files), including fresh subscription after restart, no token/money in cached projection, wrong-user binding refusal and current-authority loss. `pnpm --filter @jobguard/mobile typecheck` is recorded in the final verification below. The existing download policy/server tests are also retained and run in final regression checks.

## Router decisions needed — no approval is inferred

1. **D08 offline read lease and clock:** approve versioned durations, authoritative clock anchoring, rollback/skew/suspend/reboot handling, cold-start policy and maximum disconnected revocation exposure. Native clock remains `unverified`; all native offline cache reads remain denied.
2. **D08 unsynced work:** decide retention, logout/tenant-switch quarantine, recovery/disposal authorization, reinstall key loss and crash/deletion-failure recovery. Present/unknown work is preserved and held; no silent discard or refreshed commercial approval.
3. **D08 encrypted media:** approve cipher/container, per-file/partition key lifecycle, maximum sizes, encrypted temporary/spool/import/export behavior, OS backups/reinstall, extraction tests, retention and failed-upload deletion. Bounded inline fictional attachments already live inside SQLCipher; general voice/photo/media files remain held without any plaintext substitute.
4. **D04/D08 sync route:** approve EU/UK processing, storage, logs, backups, subprocessors, retention/deletion and authenticated download-token/membership/assignment binding for the selected actual provider. No hosted or global fallback.
5. **Native auth and recovery transport:** approve the persisted source-session/SSO bridge, device enrolment/re-enrolment, refresh-reuse/lost-response recovery and revocation scope. The existing DARK MemoryAuthProvider seam remains synthetic, unmounted and distinct from production sign-in.
6. **G3/RED acceptance:** independently review the exact native head and supply physical iOS/Android encryption, cleanup, migrations, accessibility and chaos evidence. An agent cannot mark these approvals given.

The dependency age hold also remains: glob 14.0.2 reaches fourteen days on **10 November 2026 at 22:07:00.325 GMT**. Re-resolve the whole graph and commit a mature lock then; this date does not promise the rest of the graph will pass. No age control is weakened and no new external dependency is introduced by these slices.
