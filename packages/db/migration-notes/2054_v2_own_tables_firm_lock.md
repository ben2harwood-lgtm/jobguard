# 2054 · V2-owned job table firm lock (Q44 / V2-FL-6, RED)

The checked V2 bootstrap loads 2054 last, after every piece's table creation.
Later pieces add their migration lines above it (packet rule 30). It copies
2001's dedicated database/port/data-directory fence and requires 2001's job
firm policy. The shared migration runner does not discover this file, so no
purchase-order-audit deferral entry is needed.

The catalog loop finds ordinary and partitioned `app.v2_*` tables with both
`tenant_id` and `job_id`, including tables from later-integrated branches.
Only tables missing `v2_practice_firm` receive 2001's restrictive `FOR ALL TO
jobguard_runtime` EXISTS policy joining the firm's visible `app.job` on
`(tenant_id, job_id)`. Existing policies, grants, ownership and RLS settings
are unchanged. Main's tables remain with FL-1 to FL-5. Reapplying is a no-op.

No business command, business row, audit writer, provider or route changes.
SECURITY DEFINER execution remains outside this RLS proof, as in FL-1.
No new runtime privileges or tables are introduced. A forward fix uses a later
reserved V2 migration; rollback on a disposable rehearsal database removes
only policies newly installed by 2054, never pre-existing policies.

`tools/v2/firm-lock/FL-6.checks.mjs` is automatically registered by the full
V2 seed suite. It checks every V2-owned job table without pending exemptions,
restores a deliberately removed task policy, applies 2054 twice, compares
all app policies/grants/RLS settings, and requires persisted firm A task rows
before the shared firm A/B read check. The policy-removal test rolls back its
transaction. Catalog diagnostics list each locked V2 table, including crew
brief tables when run after integration with #954.

PostgreSQL/full V2 seed, guard output on the #954 scratch merge, CI1 and the
exact-head independent Claude check remain pending outside this sandbox.
No database test result is claimed here. Astra's plan check remains pending.
