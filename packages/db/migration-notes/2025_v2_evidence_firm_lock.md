# 2025 · V2 photo lock (evidence and photo tables follow the firm)

The checked V2 bootstrap applies 2025 after 2001 to 2004, and only to the
dedicated `jobguard_v2_local` database. Anywhere else it stops with
`V2_DATABASE_REQUIRED`.

V2 practice firms share one backing tenant. 2001 limits the job and quote graph
to the signed-in firm, but the evidence and photo tables kept tenant isolation
only, so a second practice firm could read another firm's photo rows and stored
bytes. 2025 adds 2001's restrictive `v2_practice_firm` policy (created only if
missing, safe to run twice) to 15 tables. A row is visible and writable to
`jobguard_runtime` only when its job is visible to the firm. The two tables
without `job_id` reach the job through their evidence object or upload.

No grant, permissive policy, function or main migration changes. Owner routines
(SECURITY DEFINER, `jobguard_migration`) are unaffected. A forward fix is a
later V2 migration. Rolling back means dropping the `v2_practice_firm` policies
on these tables on a rehearsal database only.
