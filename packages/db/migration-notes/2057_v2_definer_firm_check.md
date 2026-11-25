# 2057 · V2 firm check inside two definers (FL-FX)

The checked V2 bootstrap applies 2057 after 2047, and only to the dedicated
`jobguard_v2_local` database, behind 2001's database-name, port and
data-directory fence. It also stops unless 2001's `v2_practice_firm` policy on
`app.job` is present.

FL-F's live catalog run (#978) found two SECURITY DEFINER routines that
`jobguard_runtime` can execute and that check the tenant but not the firm.
V2's two practice firms share one tenant, so firm B could call them on firm A's
job:

- `app.require_current_job_parties(uuid,uuid)` returned firm A's party snapshot.
- `app.require_watchdog_live(uuid)` told firm B that firm A's job is live and
  took a share lock on it.

2057 replaces both with main's latest bodies (0749, 0765) plus one condition on
the job lookup. It is 2001's `app.job` firm rule: `practice_session_digest IS
NULL OR app.current_firm_profile_key() = 'practice:' || practice_session_digest`.
Another firm's job then reads as missing, with the error each routine already
raises (`NOT_FOUND` P0002, `JOB_NOT_FOUND` 42501). `require_watchdog_live`
leaves its delegated customer-message path (NULL actor plus delegated scope)
unchanged.

Signatures, owner (`jobguard_migration`), SECURITY DEFINER, `search_path` and
grants are unchanged, because `CREATE OR REPLACE` keeps them. The file is safe to
run twice. No policy, grant or main migration changes.

Rollback on a rehearsal database only: re-run main's 0749 and 0765 definitions
of the two routines. A forward fix is a later V2 migration.

Tests: `tools/v2/firm-lock/FL-FX.checks.mjs` covers the cross-firm refusal, the
firm A positive control, and catalog stability over two re-applications. Before
2057 was loaded, the two refusal tests failed.
