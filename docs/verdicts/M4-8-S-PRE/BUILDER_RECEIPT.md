# M4-8-S-PRE builder receipt

Builder: Codex GPT-6.1 Sol. Issued 12 October 2026; synthetic only. Check lane RED.

Base: latest locally supplied `origin/main` and HEAD are both `17c82ee2822cba9be364297d64e8754b43a57013`, branch `codex/sandbox/m4-8-s-pre`. No fetch, git write, commit, push, branch change, live provider, real data, spending, deployment or release. The stopped M4-8-S branches were not read or reused.

At this base, the repository is 126 lines and SHA-256 `8713658ab74f74f08294551ad8e095fe40935c470a79a7ba4234bf863bd474da`, exactly as issued. The unedited outcome test has SHA-256 `1c3efa3a83583ce2f5ccf501bfc8bde2c418cc84141bb674eb8badf936951dd5`, exactly as issued. Node v24.17.0; cached pnpm 10.28.1; Vitest 4.1.11; installed embedded-postgres 16.10.0-beta.15 (not started).

## Change and contract

One new public entry:

```ts
async commandInTransaction(
  db: TenantTransaction,
  context: VerifiedTenantContext,
  jobId: string,
  raw: unknown,
  reviewer: Readonly<{membershipId:string;identityUserId:string}>
): Promise<RecoveryJoinedCommandResult>
```

`RecoveryJoinedCommandResult = Readonly<{ caseId: string; replayed: boolean }>`; `RecoveryJoinError.code` is `RECOVERY_JOIN_ACTION_FORBIDDEN`, `RECOVERY_JOIN_TRANSACTION_REQUIRED` or `RECOVERY_JOIN_TENANT_MISMATCH`.

The single private body retains the owner recheck, advisory lock, event-row command receipt, canonical and legacy replay hashes, job binding, transition and audit append. Unjoined still calls `withTenant` once for its write and then `committedCase`; joined uses only the supplied client, accepts only `record_landing` / `reverse_landing`, and returns only a receipt. Its three entry SQL statements prove transaction and tenant before any business lock or write. Errors pass through untouched.

The header contract, word for word:

(i) the caller opens the transaction with withTenant (through practiceMaterialPool when it needs the practice setting; the joined call installs no setting of its own) and ends it;
(ii) call it AFTER every other lock and write of your transaction: it takes the membership row FOR SHARE, then the case advisory key, then, through its audit append, the tenant's audit head, and it takes no job-row lock;
(iii) after it returns you may only append your own audit batch (the head is already held by your transaction, so that takes no new lock) and commit;
(iv) at most ONE joined command per caller transaction (a second would take a case lock after the audit head);
(v) if it rejects, roll the whole transaction back: never commit after a rejection;
(vi) use the client for one thing at a time while the call is running.

No migration; rule 9 not applicable. Who may do what is not touched. No role rule, arithmetic, schema, route, screen, allocation feature, eligibility joined form, provider or production capability changed. Existing API and read contracts remain intact; the new API is additive. No new operational alert is introduced. Affected invariants: AGENTS §§5.1, 5.3, 5.4 and 5.7 (tenant binding, current owner authorization, atomic receipt/audit, lock order).

## Stated limits

L1: checks c and d run first and the body follows; the last instant is the caller's own code using the same client during the call, which is outside the contract and cannot be detected. The real controls behind the checks are PostgreSQL's own: forced row-level security on the tenant id and the two unique keys on the event table.

L2: the joined entry cannot re-check the context's stamp (the stamp set is private to `tenant-context.ts`, whose export list is pinned); the tenant that binds every statement is the one `withTenant` installed on the caller's transaction after checking the stamp, and `context` is used only to refuse a mismatch and to supply the same value the body already used.

L3: "one joined command per caller transaction" and "call it last" are contract, not enforced in code.

L4: after the call returns the caller holds the tenant's audit head until it ends its transaction.

L1 evidence inspection: merged `packages/db/test/tenancy.integration.test.ts:197` and `:307` inspect FORCE RLS on `audit_event` and `recovery_case_event`; `:87` exercises foreign-tenant INSERT refusal on **account**, not those two tables. Merged `packages/db/test/recovery-cases.workbench.integration.test.ts:16` checks the recovery-event catalog but its foreign-tenant INSERT is on **recovery_case**. Merged `packages/db/test/audit.integration.test.ts:107` checks append-only grants, not a foreign-tenant INSERT. No merged runtime INSERT refusal proof for both requested tables was found in the inspected tests; therefore [J6d] supplies both real INSERT attempts. This is written coverage, NOT RUN; no PostgreSQL guarantee is claimed as executed here. The unchanged SQL controls are `0034_recovery_cases.sql:12` (both event unique keys), `:15`–`:16` (FORCE RLS and WITH CHECK), and `0001_audit.sql:53`–`:56` (audit FORCE RLS and WITH CHECK).

## Tests written first

Both files were written before the source changed. The first unit run used the merged repository. Its two unjoined tests passed; every joined test failed because the method did not exist. Integration first line records NOT RUN; it has one full-migration PostgreSQL cluster, two tenants and owner memberships, runtime login and test-only caller-fact table. No source-reading test, pinned file/hash assertion, changed existing assertion, added migration or timeout expansion (except the issued beforeAll 40_000 budget).

| ID | File | Status and assertions |
| --- | --- | --- |
| U1 | `packages/db/test/recovery-case-join.test.ts` | PASS before and after: BEGIN, tenant setting, body, COMMIT; one connect/write transaction, one release. |
| U2 | same unit file | PASS before and after: event failure rolls back, no commit, same error. |
| P1 | same unit file | FAIL before (absent method); PASS after: identical body SQL, event parameters except row ID, canonical IDs and stored hash. |
| J-N1 | same unit file | FAIL before; PASS after: receipt only, no read, pool access, transaction control, setting or release. |
| J-N2 | same unit file | 3 FAIL before; 3 PASS after: advisory/event/audit failures stop at the failing statement and preserve the same object. |
| J-A1 | same unit file | FAIL before; PASS after: open/amend/all nine other transitions, missing reviewer IDs and parse errors refuse before SQL. |
| J-T1 | same unit file | 2 FAIL before; 2 PASS after: null/different second xid refuse after exactly two statements. |
| J-T2 | same unit file | 2 FAIL before; 2 PASS after: false/null tenant comparison refuses after exactly three statements. |
| J-R1 | same unit file | FAIL before; PASS after: exact replay, no insert/audit; changed hash/job conflicts. |
| U3 | `packages/db/test/recovery-case-join.integration.test.ts` | NOT RUN (sandbox cannot start PostgreSQL / a browser): autonomous commit visibility, twin state and idle pool. |
| J1 | same integration file | NOT RUN (sandbox cannot start PostgreSQL / a browser): caller commit, exact receipt, consecutive repository/caller audits, verified chain and six-column twin state. |
| J2 | same integration file | NOT RUN (sandbox cannot start PostgreSQL / a browser): no early visibility while open, explicit rollback, unchanged state/head and usable client. |
| J3 | same integration file | NOT RUN (sandbox cannot start PostgreSQL / a browser): caller exception rolls all three rows back; same ID subsequently succeeds. |
| J4 | same integration file | NOT RUN (sandbox cannot start PostgreSQL / a browser): merged stale/excess refusal and caller-row rollback. |
| J5 | same integration file | NOT RUN (sandbox cannot start PostgreSQL / a browser): advisory timeout, identical pg error object/code 55P03, caller rollback and client reuse. |
| J6 | same integration file | NOT RUN (sandbox cannot start PostgreSQL / a browser): both tenant mismatch directions and foreign reviewer; unchanged totals in both tenants. |
| J6d | same integration file | NOT RUN (sandbox cannot start PostgreSQL / a browser): actual runtime foreign-tenant event and audit INSERTs refused by pg. |
| J7 | same integration file | NOT RUN (sandbox cannot start PostgreSQL / a browser): dedicated client without BEGIN, with and without a session setting. |
| J8 | same integration file | NOT RUN (sandbox cannot start PostgreSQL / a browser): non-owner/revoked/expired/wrong identity; actual waiting membership UPDATE through pg_stat_activity until caller ends. |
| J9 | same integration file | NOT RUN (sandbox cannot start PostgreSQL / a browser): both replays and both cross-mode directions, changed-amount/job conflict in both modes, unchanged totals and verified chain. |
| J10 | same integration file | 4 cases NOT RUN (sandbox cannot start PostgreSQL / a browser): observed lock waits for commit/stale, rollback/success, joined/unjoined stale, identical-command replay; one effect and chain. |
| J11 | same integration file | NOT RUN (sandbox cannot start PostgreSQL / a browser): committed reverse matches twin; rolled-back reverse leaves all three kinds unchanged. |

The unedited `recovery-case-outcome.test.ts` is PASS (4 tests). Every other named merged no-database test remains unedited and NOT RUN here under the issued file restriction: `apps/api/src/recovery-case.application.test.ts`, `apps/api/src/recovery-case.command.application.test.ts`, `apps/api/src/recovery-case.controller.test.ts`, `apps/api/src/recovery-eligibility-v3.application.test.ts`, `apps/web/app/lib/recovery-case-routes.test.ts`. The Mac helper and exact-head CI must supply those results.

Each merged database file is **NOT RUN (sandbox cannot start PostgreSQL / a browser)**:

- `packages/db/test/recovery-cases.integration.test.ts`
- `packages/db/test/recovery-cases.workbench.integration.test.ts`
- `packages/db/test/recovery.integration.test.ts`
- `packages/db/test/recovery-eligibility-v3.integration.test.ts`
- `packages/db/test/recovery-timing-pin.integration.test.ts`
- `packages/db/test/recovery-follow-up.integration.test.ts`
- `packages/db/test/recovery-messages.integration.test.ts`

`pnpm test`, `pnpm test:db`, `pnpm test:migrations`, `pnpm test:e2e` were not run under the issued file/resource/socket restriction. No page-load run is owed by this source-only change. `pnpm eval` is inapplicable: no AI/prompt/parser/schema behavior changes.

## Commands actually run

The default pnpm launcher attempted its version switch and exited 1 before executing `pnpm turbo run build --filter=@jobguard/core...`: registry signature verification reported fetch failed. No package was downloaded. A temporary PATH wrapper then invokes the **already installed** exact pnpm 10.28.1 at `/Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`. All following pnpm commands use `PATH=/private/tmp/jg-m4-8-s-pre-bin:$PATH`. No pmOnFail bypass, install, package or lockfile change.

| Command | Exit | Actual result |
| --- | --- | --- |
| `pnpm turbo run build --filter=@jobguard/core...` | 0 | 1 successful task, 1 cache hit; cached tsc output, not a fresh compile. |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/recovery-case-join.test.ts` (before source) | 1 | 1 failed file; 11 failed / 2 passed, 13 total. Missing joined method; expected red. |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/recovery-case-join.test.ts test/recovery-case-outcome.test.ts` (after source) | 0 | 2 passed files; 17 passed tests (13 new, 4 merged). |
| One-off TypeScript compiler API inspection of both new test files and imports (`noEmit`) | 0 | 0 diagnostics; static checking only, no database execution. |
| One-off SQL/prefix/body comparison using TypeScript AST against `git show origin/main:packages/db/src/recovery-case-repository.ts` | 0 | All prior SQL literals preserved, three proofs added, protected prefix unchanged; evidence below. |
One-off source inspection using TypeScript AST; not a standing test and not a PostgreSQL execution.
Base SQL literals: 20; new SQL literals: 23.

1. Base :50 → new :56: IDENTICAL (including spelling/whitespace).

```sql
`SELECT 1 FROM app.membership WHERE tenant_id=$1 AND id=$2 AND identity_user_id=$3 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>transaction_timestamp()) FOR SHARE`
```

2. Base :52 → new :58: IDENTICAL (including spelling/whitespace).

```sql
"SELECT 1 FROM app.job WHERE tenant_id=$1 AND id=$2"
```

3. Base :56 → new :62: IDENTICAL (including spelling/whitespace).

```sql
`SELECT c.*,
   er.revision eligibility_revision,er.case_revision eligibility_case_revision,er.evidence_revision,er.policy_version,er.policy_revision,er.classification,er.eligible_net_pence,er.reason eligibility_reason,er.citations,er.status eligibility_status,er.reviewer_ref eligibility_reviewer,
   (SELECT COALESCE(sum(CASE j.kind WHEN 'fee_obligation' THEN j.amount_pence ELSE -j.amount_pence END),0) FROM app.recovery_fee_journal j WHERE j.tenant_id=c.tenant_id AND j.job_id=c.job_id)::bigint fee_job_liability_pence,
   (SELECT COALESCE(sum(j.amount_pence),0) FROM app.recovery_fee_journal j JOIN app.recovery_fee_derivation d ON(d.tenant_id,d.id)=(j.tenant_id,j.derivation_id) JOIN app.landing_allocation a ON(a.tenant_id,a.id)=(d.tenant_id,d.source_allocation_id) WHERE j.tenant_id=c.tenant_id AND j.kind='fee_obligation' AND a.case_id=c.id)::bigint fee_obligations_posted_pence,
   (SELECT COALESCE(sum(j.amount_pence),0) FROM app.recovery_fee_journal j JOIN app.recovery_fee_derivation d ON(d.tenant_id,d.id)=(j.tenant_id,j.derivation_id) JOIN app.landing_reversal rv ON(rv.tenant_id,rv.id)=(d.tenant_id,d.source_reversal_id) JOIN app.landing_allocation a ON(a.tenant_id,a.id)=(rv.tenant_id,rv.allocation_id) WHERE j.tenant_id=c.tenant_id AND j.kind='compensation' AND a.case_id=c.id)::bigint fee_compensations_posted_pence
   FROM app.recovery_case_current c LEFT JOIN LATERAL(SELECT * FROM app.recovery_eligibility_revision r WHERE r.tenant_id=c.tenant_id AND r.case_id=c.id ORDER BY revision DESC LIMIT 1)er ON true WHERE c.tenant_id=$1 AND c.job_id=$2 AND c.claim_revision IS NOT NULL ORDER BY c.created_at,c.id`
```

4. Base :68 → new :74: IDENTICAL (including spelling/whitespace).

```sql
`SELECT id FROM app.membership
   WHERE tenant_id=$1 AND id=$2 AND identity_user_id=$3 AND role='owner'
   AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())
   FOR SHARE`
```

5. Base :74 → new :80: IDENTICAL (including spelling/whitespace).

```sql
"SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))"
```

6. Base :75 → new :81: IDENTICAL (including spelling/whitespace).

```sql
"SELECT subject_hash,job_id FROM app.recovery_eligibility_revision WHERE tenant_id=$1 AND command_id=$2"
```

7. Base :76 → new :82: IDENTICAL (including spelling/whitespace).

```sql
`SELECT c.case_type,c.source_refs,q.claimed_net_pence,q.revision claim_revision,(SELECT count(*) FROM app.recovery_case_event e WHERE e.tenant_id=c.tenant_id AND e.case_id=c.id) event_count FROM app.recovery_case c JOIN LATERAL(SELECT * FROM app.recovery_claim_revision q WHERE q.tenant_id=c.tenant_id AND q.case_id=c.id ORDER BY revision DESC LIMIT 1)q ON true WHERE c.tenant_id=$1 AND c.job_id=$2 AND c.id=$3`
```

8. Base :78 → new :84: IDENTICAL (including spelling/whitespace).

```sql
"SELECT * FROM app.recovery_eligibility_revision WHERE tenant_id=$1 AND case_id=$2 ORDER BY revision DESC LIMIT 1"
```

9. Base :83 → new :89: IDENTICAL (including spelling/whitespace).

```sql
"INSERT INTO app.recovery_eligibility_revision(id,tenant_id,job_id,case_id,revision,case_revision,evidence_revision,policy_version,policy_revision,scenario,classification,eligible_net_pence,currency,reason,citations,status,reviewer_ref,command_id,subject_hash,previous_hash)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'GBP',$13,$14,$15,$16,$17,$18,$19)"
```

10. Base :92 → new :123: IDENTICAL (including spelling/whitespace).

```sql
`SELECT id FROM app.membership
   WHERE tenant_id=$1 AND id=$2 AND identity_user_id=$3 AND role='owner'
   AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())
   FOR SHARE`
```

11. Base :101 → new :132: IDENTICAL (including spelling/whitespace).

```sql
"SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))"
```

12. Base :102 → new :133: IDENTICAL (including spelling/whitespace).

```sql
"SELECT case_id,payload_hash,job_id,reviewer_ref FROM app.recovery_case_event WHERE tenant_id=$1 AND command_id=$2"
```

13. Base :105 → new :136: IDENTICAL (including spelling/whitespace).

```sql
"SELECT 1 FROM app.job WHERE tenant_id=$1 AND id=$2"
```

14. Base :110 → new :141: IDENTICAL (including spelling/whitespace).

```sql
"INSERT INTO app.recovery_case(id,tenant_id,job_id,claim_pence,currency,state,revision,synthetic,case_type,counterparty,book,source_type,source_refs) VALUES($1,$2,$3,$4,'GBP',CASE WHEN $5='prevention' THEN 'prevented' ELSE 'identified' END,0,true,$5,$6,$7,$8,$9)"
```

15. Base :112 → new :143: IDENTICAL (including spelling/whitespace).

```sql
"INSERT INTO app.recovery_claim_revision(id,tenant_id,job_id,case_id,revision,claimed_net_pence,currency,reviewer_ref,subject_hash) VALUES($1,$2,$3,$4,1,$5,'GBP',$6,$7)"
```

16. Base :114 → new :145: IDENTICAL (including spelling/whitespace).

```sql
"INSERT INTO app.recovery_case_event(id,tenant_id,job_id,case_id,sequence,event_type,from_state,to_state,reviewer_ref,command_id,payload_hash) VALUES($1,$2,$3,$4,1,$5,NULL,$6,$7,$8,$9)"
```

17. Base :116 → new :147: IDENTICAL (including spelling/whitespace).

```sql
`SELECT * FROM app.recovery_case_current WHERE tenant_id=$1 AND job_id=$2 AND id=$3 AND claim_revision IS NOT NULL`
```

18. Base :120 → new :151: IDENTICAL (including spelling/whitespace).

```sql
"INSERT INTO app.recovery_claim_revision(id,tenant_id,job_id,case_id,revision,claimed_net_pence,currency,reviewer_ref,subject_hash,previous_hash) VALUES($1,$2,$3,$4,$5,$6,'GBP',$7,$8,(SELECT subject_hash FROM app.recovery_claim_revision WHERE tenant_id=$2 AND case_id=$4 ORDER BY revision DESC LIMIT 1))"
```

19. Base :121 → new :152: IDENTICAL (including spelling/whitespace).

```sql
"INSERT INTO app.recovery_case_event(id,tenant_id,job_id,case_id,sequence,event_type,from_state,to_state,amount_pence,reviewer_ref,command_id,payload_hash,previous_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)"
```

20. Base :122 → new :153: IDENTICAL (including spelling/whitespace).

```sql
"INSERT INTO app.recovery_case_event(id,tenant_id,job_id,case_id,sequence,event_type,from_state,to_state,reviewer_ref,command_id,payload_hash,previous_hash) VALUES($1,$2,$3,$4,$5,'claim_amended',$6,$7,$8,$9,$10,$11)"
```

Added SQL literals (only joined entry proofs):

New :111:

```sql
"SELECT pg_current_xact_id()::text AS x"
```

New :112:

```sql
"SELECT pg_current_xact_id_if_assigned()::text AS x"
```

New :114:

```sql
"SELECT nullif(current_setting('app.tenant_id', true), '')::uuid = $1::uuid AS same"
```

Protected ranges: base 1–34 = new 1–34; base 35–85 = new 41–91, byte-for-byte. The added result type and error occupy new 35–40.
Base body 90–124 = new 121–155, byte-for-byte after normalizing its replay return from `{caseId,replayed:true}` to the preceding bare `return`. The audit append is identical. Every query argument list and statement order in that body is preserved. Local caseId and the final `{caseId,replayed:false}` return surround the moved body.

## Final checks and self-review

| Command | Exit | Actual result |
| --- | --- | --- |
| `pnpm typecheck` | 0 | 7 successful tasks, 4 cached; db/API/web typechecks executed. Turbo reported cache IO warnings (`Operation not permitted`), without failing these checks. |
| `LANE_BASE_REF=origin/main pnpm lint` | 1 | Core purity passed (129 TypeScript files). Lane guard stopped the command: `Missing branch or self-comparison range; refusing a misleading pass.` Remaining lint stages did not run. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 1 | Same self-comparison refusal. HEAD equals origin/main because this sandbox cannot commit; no linter or comparison base was changed to bypass it. |
| `pnpm build` | 0 | 7 successful tasks, 4 cached; db/API/web builds executed, Next build completed. Turbo cache IO warnings were nonfatal. |
| `pnpm openapi:check` | — | NOT RUN (requires a socket; no API file in this lane). |
| `git diff --check` | 0 | No whitespace errors in tracked diff. |

Self-review (source-inspected and unit-test-executed only):

- Read the whole tracked diff against origin/main and both complete new test files. Only the exact lane line, repository and new tests/receipt changed. The lane was the first mutation; its allow list and placement match the order exactly.
- Protected base 1–85 is unchanged except the additive type/error declaration. Imports, helpers, existing errors, committedCase, read methods and eligibilityCommand remain identical. No additional runtime import from tenant-context. Context is passed whole or its tenantId is read; no copying, wrapping, spreading or storing it was introduced.
- One body serves both modes. Every original SQL literal and every body parameter list/order remains identical; the event/hash/audit work is not duplicated. Three proof literals are the only additional SQL. The replay return and final return carry the new receipt.
- Unjoined still calls withTenant once for the write, then committedCase, including the merged test's nonexecuting withTenant stand-in. Both unjoined unit tests and all four merged outcome tests pass.
- Joined reviewer/parse/action checks precede SQL. Transaction proof precedes tenant proof, then membership FOR SHARE, case advisory key, replay/job/state checks, event and final audit append. Only the two issued landing events are accepted.
- Joined/body have no transaction control, savepoint, setting, release/end, pool access or error catch/wrapper. Unit success and advisory/event/audit failure paths prove these negative assertions, same-error propagation and no statement after failure. Replay appends no audit or event, as merged.
- Call-last, one-command and one-use-at-a-time constraints are documented rather than invented enforcement. Rejection requires whole-transaction rollback. No arithmetic or role rule changed.
- No existing test, security pin/list, migration, tenant-context, practice-session, audit routine, index, package, lockfile, BUILD_PLAN, API or UI changed. Rule 11 values are generated at runtime; no credential-shaped literal was introduced. Rule 12 has no standing source-byte/hash test.
- Cannot verify real transaction visibility/rollback, PostgreSQL RLS/unique keys, membership hold, timeout errors, concurrency, chain persistence or cross-mode database replay here. The 16 new integration cases and all seven named merged database files are NOT RUN. Their static check passed, which is not execution evidence.
- Lint/lanes cannot pass on this uncommitted HEAD-equals-base tree; dispatcher must run them after committing. Mac helper runs and exact-head GitHub CI, fresh Opus plus separate Sol verdicts, separate acceptance and founder merge remain outstanding. This receipt neither supplies nor infers any of them.

## Changed-file evidence

Actual `git diff --stat origin/main` (new files are still untracked because git is read-only):

```text
 config/agent-lane-assignments.json          |  1 +
 packages/db/src/recovery-case-repository.ts | 36 +++++++++++++++++++++++++++--
 2 files changed, 35 insertions(+), 2 deletions(-)
```

The dispatcher also commits these new, untracked files:

- `packages/db/test/recovery-case-join.test.ts` (162 lines, 13 unit cases)
- `packages/db/test/recovery-case-join.integration.test.ts` (347 lines, 16 PostgreSQL cases, NOT RUN)
- `docs/verdicts/M4-8-S-PRE/BUILDER_RECEIPT.md` (this receipt)

Final repository SHA-256: `db847bbc3cd003c56b5df375c53ff1ab6f8fa3b9d17fdc5ad57c4a4eec868522`. The merged outcome test retains its base SHA-256 above. The untouched auth context-boundary test is `7f1914846f763c3534ffafc79701fc6f768e8e1546be2fe98e27bc32a99e0e8d`; no file it pins was modified. Generated build/test/store artifacts are removed from the worktree; command logs are in `/private/tmp/jg-m4-8-s-pre-*.log`.

Intended commit message: `/private/tmp/jg-msg-m4-8-s-pre.txt`.

Builder receipt only — not independently verified, not accepted.

## Mac verification (12 Oct)

Run by the Mac-side helper (Claude Sonnet 5.5) on 12 October 2026, 19:2x–19:5x local, on this Mac with real embedded PostgreSQL (`embedded-postgres` 16.10.0-beta.15, Node v24.17.0, pnpm 10.28.1, Vitest 4.1.11). Not a review, verdict or acceptance: the helper ran the commands and recorded what they printed, and changed no product code.

**Code tested:** merge commit `a07ec0741e79763228883b2d86a824d5ed2bbac1` ("Merge main (18743cb) into M4-8-S-PRE"), parents builder commit `0c9eb069794f2b5de066ba5955069e915c13d111` and `origin/main` `18743cb5aad8578960296ad2fd60c104cb16e90e`. The merge had no conflicts (the lane line merged cleanly; `config/agent-lane-assignments.json` parses). After the merge `git diff origin/main --stat` lists only this piece: the lane line, this receipt, `packages/db/src/recovery-case-repository.ts` and the two new test files. SHA-256 of the repository file (`db847bbc…8522`), the unedited outcome test (`1c3efa3a…51dd5`) and the untouched `context-boundary.test.ts` (`7f191484…a99e0e8d`) match the builder's figures. The commit that adds this section sits on top of `a07ec07`; it changes only this receipt.

**Set-up.** The first attempt at run 1 failed before any test ran: all three files stopped with "Postgres init script exited with code null" (the embedded PostgreSQL dyld `libicudata` short-name links were missing). Fixed by running the package's own `node scripts/hydrate-symlinks.js` inside `@embedded-postgres/darwin-arm64` (it only creates the two missing symlinks, `libicudata.68.dylib` and `libicudata.dylib`, in `node_modules`, which is not tracked). The run was then repeated and passed. `@jobguard/core`, `db`, `storage`, `config`, `ai` were each rebuilt alone with `pnpm --filter @jobguard/<name> build` (all exit 0, 3–13 s each) so no stale `dist` folder was used. Every command below went through `~/.local/bin/heavy-slot`; test files were run with `--maxWorkers=2`, at most three files per run, one run at a time.

| Run | Command (all via heavy-slot) | Exit | Result | Run time |
| --- | --- | --- | --- | --- |
| 1 (first try, before the symlink fix) | `pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/recovery-case-join.integration.test.ts test/recovery-cases.integration.test.ts test/recovery-cases.workbench.integration.test.ts` | 1 | Set-up failure only: 3 suites failed to start PostgreSQL, 69 tests skipped, none executed. Not a test result. | 9 s |
| 1 | same command, repeated after the symlink fix | 0 | 3 files passed; 69 tests passed (join integration 16, `recovery-cases.integration` 12, `recovery-cases.workbench.integration` 41) | 26 s (30 s wall) |
| 2 | `… vitest run --maxWorkers=2 test/recovery.integration.test.ts test/recovery-eligibility-v3.integration.test.ts test/recovery-timing-pin.integration.test.ts` | 0 | 3 files passed; 66 tests passed | 23 s (49 s wall) |
| 3 | `… vitest run --maxWorkers=2 test/recovery-follow-up.integration.test.ts test/recovery-messages.integration.test.ts` | 0 | 2 files passed; 159 tests passed | 50 s (275 s wall, mostly waiting for a free slot) |
| Unit pair | `… vitest run --maxWorkers=2 test/recovery-case-join.test.ts test/recovery-case-outcome.test.ts` | 0 | 2 files passed; 17 tests passed (13 new, 4 merged) | 2 s |
| 4 build | `pnpm turbo run build --filter=@jobguard/api...` | 0 | 6 tasks successful (4 cached, API built fresh) | 39 s |
| 4 | `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/recovery-case.application.test.ts src/recovery-case.command.application.test.ts src/recovery-case.controller.test.ts` | 0 | 3 files passed; 89 tests passed | 6 s (353 s wall, mostly waiting for a free slot) |
| typecheck | `pnpm typecheck` | 0 | 7 of 7 tasks successful (4 cached) | 115 s |
| lint | `LANE_BASE_REF=origin/main pnpm lint` on branch `codex/sandbox/m4-8-s-pre` | 0 | Core purity passed (129 files); lane boundary passed (lane `m4-8-s-pre`, comparison `merge-base`, the five files above); money-arithmetic check passed; 7 of 7 turbo lint tasks successful (4 cached) | 27 s (70 s wall) |
| openapi | `pnpm openapi:check` (in `apps/api`) | 0 | Passed, no output | 7 s |

One further oddity: the first `pnpm lint` invocation through `heavy-slot` exited 2 with an empty log before the command ran (the slot wrapper itself, not lint); the identical command repeated at once passed. Both attempts are listed here for completeness.

The 16 integration cases in `recovery-case-join.integration.test.ts` (U3, J1–J11 including J6d and the four J10 cases) therefore ran for the first time on real PostgreSQL and passed, as did all seven named merged database files and the three named merged `apps/api` files. The unedited `recovery-case-outcome.test.ts` still passes (4 tests).

**Not run here:** the red experiment (the order does not ask for one); `recovery-eligibility-v3.application.test.ts` and `apps/web/app/lib/recovery-case-routes.test.ts` (named as merged no-database tests but not in the order's four Mac runs); `pnpm lint:lanes` on its own (the lane guard ran inside `pnpm lint`); `pnpm build` of the whole repository; `pnpm test`, `pnpm test:db`, `pnpm test:migrations`; the whole API suite; every browser suite (`pnpm test:e2e`); `pnpm eval` (inapplicable). Exact-head GitHub CI, fresh Claude Opus and Codex Sol checks (check lane RED), separate acceptance and the founder's merge all remain outstanding.

Mac verification record only — not independently verified, not accepted.
