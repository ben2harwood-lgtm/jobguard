# Verdict M4-3-S repair — candidate 8116aa6 — FAIL

**Reviewer:** Claude reviewer agent, fresh context; did not build this. Independent re-review of the repair branch
`codex/sandbox/m4-3-s-repair` against the FAIL verdict at `docs/verdicts/M4-3-S/fd56bdd.md` (repairs R1–R6) and
BUILD_PLAN §31 M4-3-S + §13.2 C1–C8. **Bound to candidate `8116aa6aed2542a0644d0c9042c73c9198dc734e`** (five code
commits ed5b899…8116aa6 on base `694e9e1`; HEAD `2769795` adds only the builder receipt, which I read as a builder
claim, not evidence). Reviewed diff: `git diff 694e9e1..8116aa6` — 28 files, +1543/−35, read in full.
**Date:** 2026-09-25. Scratch worktree at 2769795, `pnpm install --frozen-lockfile` clean. Main checkout and the
builder's worktree were not touched; nothing pushed, commented or merged.

**Environment note.** Embedded Postgres 16.10 loads here after sibling symlinks inside `node_modules` only
(`libicu*.68 → .68.2`, `libicui18n → .68.2`, `libzstd.1 → 1.5.7`, `liblz4.1 → 1.10.0`, `libz.1 → 1.3.1`). So, unlike
the builder, I could execute the DB suites and the Playwright bootstrap. That is what turned this from HOLD to FAIL.

## Commands run (exit / result)
| Command | Exit | Result |
|---|---|---|
| `pnpm -r build` | 0 | 7/7 packages, production Next build OK |
| `pnpm typecheck` | 0 | 0 TS errors |
| `pnpm openapi:check` | 0 | spec matches; adds only `POST …/{packId}/attachment-approval`, `GET …/{packId}/inspect` (additive) |
| `pnpm test` | 1 | tools OK; config 2, storage 4, core 366, ai 72, api 84, web 36 passed; **db 160 passed / 2 failed / 2 skipped, 3 files failed** |
| `pnpm test:db` | 1 | same: 33 files passed, **3 failed** — `UIWIRE-12` (1), `demo-bootstrap` (1), `sandbox` (suite load) |
| new suites alone | 0 / 0 | `evidence-packs.integration` **8/8**, `evidence-pack-sources.integration` **6/6** |
| base comparison: `packages/db` at 694e9e1, same three suites | 0 | **26/26 pass** — the three failures are repair-introduced, not pre-existing |
| `pnpm lint` (PR event env) | 0 | core purity 69 files, lane, money, commercial checks pass (plain run only fails because a detached scratch HEAD has no branch) |
| `pnpm lint:lanes` (`pull_request`, head.ref `codex/sandbox/m4-3-s-repair`, base 694e9e1, head 8116aa6) | 0 | lane `m4-3-s-repair`, 28 files all inside allow-list |
| `CI=1 pnpm --filter @jobguard/web test:e2e --project=mobile-360 --project=desktop M4-3-S.spec.ts` | 1 | **0 tests executed in either project**: `global-setup.ts:21` → `bootstrapSyntheticDemo` → `migrate` dies on 0042 (see finding 1) |
| `node packages/db/tools/verify-evidence-pack.mjs` ×6 | 0/1/1/1/2/1 | intact+trusted digest complete; missing / tampered / wrong-version report the one matching finding; malformed → exit 2; intact without digest → `Checkpoint not independently trusted` |
| mutation checks (break, observe, restore) | — | (a) `attachmentApprovalValid = !!approval` → pack test "invalidates previous approvals" **fails**; (b) delete unmapped-`source_refs` throw in `evidence-pack-sources.ts` → "rejects missing/wrong-job references" **fails**; (c) core `checkpointTrusted` default `true` → "does not infer independent checkpoint trust" **fails**. All three restored, `git status` clean |

## Findings (severity, file:line)
1. **HIGH — migration 0042 cannot be applied through the real bootstrap path; it breaks deployment bootstrap and the e2e.**
   `packages/db/migrations/0042_evidence_pack_repair.sql:10-11` adds FK `evidence_pack_revision_exact_case_fk`
   (`evidence_pack_revision → evidence_pack`). Both tables have FORCE RLS with the 0041 policy that calls
   `current_setting('app.tenant_id')` without `missing_ok` (`0041_evidence_packs.sql:17`). `bootstrapSyntheticDemo`
   applies migrations under `SET ROLE jobguard_migration` (`packages/db/src/demo-bootstrap.ts:44`), so FORCE RLS
   applies to the migrator and Postgres's FK validation SELECT fails with 42704
   `unrecognized configuration parameter "app.tenant_id"`. Observed in `demo-bootstrap.integration.test.ts:29`,
   `sandbox.integration.test.ts:3` and `apps/web/e2e/global-setup.ts:21`. Superuser migration (all other DB tests) is
   unaffected, which is why the new suites pass. This violates C4 ("existing Neon bootstrap remain compatible") and
   makes R6 impossible to satisfy on this candidate: the Vercel/Neon synthetic bootstrap would fail on rollout.
2. **MEDIUM — stale migration count.** `packages/db/test/UIWIRE-12.integration.test.ts:61` still expects `42` applied
   migrations; only lines 55–56 were updated. Fails against 43.
3. **LOW — view misreports legacy format.** `packages/db/src/evidence-pack-repository.ts:86` hard-codes
   `format: 'TEXT'` for every row, including 0041 rows stored as `ZIP`/`PDF`. They are held from download/approval, so
   no user harm, but the projection should report the stored column.
4. **LOW — session cookie value written into durable records.** `apps/api/src/evidence-pack.application.ts:29`
   sets `actorRef = membership:<id>:session:<cookie>`; it lands in `evidence_pack_revision.actor_ref`,
   `evidence_pack_attachment_approval.actor_ref` and `audit_event`. In this demo any UUID-shaped cookie is accepted
   (unchanged from `hasSyntheticSession`), so nothing secret leaks today, but the pattern must not reach real sessions.
   Side effect: replaying the same `commandId` from a new session is a 409 CONFLICT, not a replay (undocumented).
5. **LOW — `intact` and `checkpoint` inspect scenarios are identical server-side** (`evidence-pack-repository.ts:154-165`;
   the server never holds an independent digest, so every scenario carries the checkpoint finding). Honest, but the
   "Untrusted checkpoint" option is a no-op — label it or drop it.

## Repairs R1–R6 against the FAIL verdict
- **R1 — PASS.** `packages/db/src/evidence-pack-sources.ts` reads real tenant/job-bound rows: accepted quote document +
  acceptance joined through `job.accepted_quote_version_id`, verified proof objects with stored bytes and hash check,
  approved variation revisions + approvals, claim revisions/events by case, and for `source_refs` the material-rate,
  supplier-document-version or customer-invoice rows; unmapped refs fail closed; absent categories are explicit
  `omissions` bound into the manifest digest. No template literals remain (the old strings survive only as a UI
  fallback in `recovery-cases.tsx:11-13`, which then fails honestly with `SOURCE_NOT_FOUND`).
- **R2 — PASS.** Append-only `evidence_pack_attachment_approval` with FK to the exact `(manifest_hash, content_hash)`
  revision, command replay/conflict, audit append; validity is recomputed against current sources on every read. The
  integration test appends a new claim revision and shows the approval flip to invalid; mutation check (a) confirms.
- **R3 — PASS.** Stored `artifact_text` (versioned JSON envelope) hashed into `content_hash`; Nest and Next serve
  `text/plain; charset=utf-8` with a `.txt` filename; download refuses when integrity fails; UI says "(.txt)".
- **R4 — PASS as a test artefact.** `evidence-packs.integration.test.ts` covers replay, cross-case reuse conflict,
  wrong case/tenant lookup, cross-tenant INSERT 42501, same-tenant wrong-job FK 23503, UPDATE/DELETE/TRUNCATE 42501 on
  all three tables, FORCE RLS + ownership, audit counts and rollback — 8/8 green here.
- **R5 — PASS.** Server `inspect()` verifies the persisted artifact (no hard-coded trust; client no longer imports
  `inspectEvidenceManifest`); standalone `packages/db/tools/verify-evidence-pack.mjs` reproduces findings offline.
  SHA-256 multi-block and non-ASCII vectors verified against node `crypto`.
- **R6 — FAIL.** `pnpm test:db` is red on three repair-caused files, and the M4-3-S spec ran 0/2 cases in mobile-360
  and 0/2 in desktop because the candidate's own migration kills the e2e bootstrap. No browser evidence exists for
  C1/C7 (reload, deep link, second context, banner count, focus, 44px, overflow).

## §13.2 and other checks
C2 thin routes over the shared seam, additive OpenAPI — OK. C3 single global banner (`layout.tsx` only; e2e asserts
count 1), export carries the banner, `SYNTHETIC_MODE_REQUIRED` refusal and forged `actorRef`/`evidenceVersion`/
`tenantId` rejection tested in `evidence-pack.application.test.ts` — OK. C4 — **FAIL** (finding 1); table grants,
FORCE RLS and ownership otherwise correct. C5 membership rechecked server-side, locks ordered command→case,
replay/conflict — OK. C6/C7 — **not met** (no executed browser run). C8 lane `m4-3-s-repair` registered to
`codex/sandbox/m4-3-s-repair` (never "work") — OK. No mail/SMS/AI/bank calls; no statutory-deadline or banned claim
vocabulary in added code; `MIGRATIONS.md` documents 0041 and 0042.

## Why FAIL, and exact repairs
FAIL rather than HOLD because finding 1 is a demonstrated defect in the candidate (reproduced three ways, and shown
absent at base), not missing evidence. Repairs, in order:
1. Make 0042 applicable by `jobguard_migration` under FORCE RLS. Preferred: have the migration (or a preceding
   statement in it) run the constraint additions with `set_config('app.tenant_id', …)` unnecessary — e.g. change the
   0041 policies on `evidence_pack`/`evidence_pack_revision` to `nullif(current_setting('app.tenant_id', true), '')::uuid`
   (as 0042 already does for the new table), or add the FK as `NOT VALID` and validate it in a context where RLS does
   not fire. Keep it expand-compatible; do not touch data.
2. Prove it: `demo-bootstrap.integration`, `sandbox.integration` and the Playwright global setup must pass.
3. Update `UIWIRE-12.integration.test.ts:61` to 43.
4. Run `pnpm test:db` green and the M4-3-S spec in both projects; attach counts and the two screenshots.
5. (Low) report the stored `format` column; stop writing the session cookie into `actor_ref`; label or remove the
   no-op "Untrusted checkpoint" option.
Then request a fresh verdict bound to the new commit.
