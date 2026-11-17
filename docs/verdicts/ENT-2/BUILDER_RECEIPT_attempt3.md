# ENT-2 builder receipt, attempt 3 (repair of the Opus REPAIR verdict at `de29e5c`)

**Builder receipt only — not independently verified, not accepted.** Builder: Claude Sonnet 5.5 (repair builder). A fresh reviewer and the integrator decide acceptance; the builder never reviews, accepts, pushes or merges. Synthetic data only; no live provider, connector, send, spend, production mode, decision approval, deployment or release. Nothing was pushed, rebased, reset or force-changed; the one file I removed is my own new helper from this attempt (see "Deviations").

## Identity

| | |
|---|---|
| Branch | `codex/sandbox/ent-2` (local only) |
| Verdict repaired | PR #125 comment, "VERDICT: REPAIR — bound to head de29e5ca938858fa44f3fdd9e7513a0129b673ea" |
| Code head verified | `441fd8adb12f1da6252f1b5a2ac84baf79c36406` (this receipt and its evidence files are the only changes after it) |
| Commits since `de29e5c` | `51b678d` tests (red on `de29e5c`) → `4d7ab9d` fix → `1bc0902` contract doc → `441fd8a` fixture moved into the lane's file → this receipt |
| `origin/main` | still `c283d4e` at the last `git fetch` (16:33 BST, 9 Oct). CH-1 (#123, migration 0109) has **not** landed, so there was nothing to merge and no merge commit was made. The merge step is still to do if it lands. |

## Repairs

### Repair 1 — P1-1, per-order authority in migration 0110 (`packages/db/migrations/0110_work_orders.sql`)

- New `app.work_order_client_permitted(actor, client)` (`:269`, owner/revoke/grant `:279–282`): `contractor_member_active` AND (`contractor_allowed(actor,'organisation.manage',<client>)` OR `contractor_allowed(actor,'data.import',<tenant>)`) — the same predicate as 0102:117.
- `app.work_order_commit`: `revise` branch checks it on `wo.client_id` (`:380`, together with "order not found"; before the stale-revision check, so a wrong revision number cannot reveal the order); `create` branch checks it on `binding.client_id` as defence in depth (`:370`).
- `app.work_order_parties_unchanged` (`:493`): looks up the order's own client first and raises the ENT-1 not-found for an unknown order **or** an out-of-scope one **before any comparison**, so it is no yes/no oracle on another branch's parties or resident contact.
- `work_order_import_permitted` is unchanged and is now documented as the coarse gate only (`:260`).

### Repair 2 — `packages/db/src/work-order-repository.ts`

- `revisions` (`:345`): import roles only through `work_order_client_permitted($member, w.client_id)` (or the existing job-read-through-assignment route). An order of another branch is the same `NOT_FOUND` as an unknown id (identical error object and message, asserted).
- `overview` (`:300`): orders joined to the clients the member covers (evaluated once per client, not per row); batches listed only if they hold a receipt for such an order or were recorded by the member (tenant-wide import authority sees all), and counted from the receipts the member may see.
- `batch` / `batchResult` (`:174`): same visibility; a batch with nothing the member may see is `NOT_FOUND`, identical to an unknown id. The same filtered view is used for the import's own result and for a replay, so a replay cannot show another branch's rows.
- `applyRow` (`:200`): an existing order is looked up only if the member covers its client, so a row naming another branch's order is answered exactly like a row naming no order (no existence signal through the row shape). The database refuses it again independently (repair 1).

### Repair 3 — tests (two clients in two branches), failed first on `de29e5c`

New fixture `addBranchClient` in `packages/db/src/work-order-fixtures.ts` (second branch, team, client, contract, customer link; built only through ENT-1/CH-3b commands). Tests in `packages/db/test/work-order-import.integration.test.ts` (describe at `:488`) and `packages/db/test/contractor.integration.test.ts` (ENT-2 conformance, `:362`).

| Test | What it proves | On `de29e5c` (tests `51b678d` against the old source) |
|---|---|---|
| `shows a branch-scoped admin only the orders, batches and revisions of clients in that branch: the other branch's are the same not-found as an unknown id` | register, batch list, batch view (counts recomputed), revisions, per branch; owner, tenant-wide admin, finance see both | FAIL: register returned `[WO-DEMO-0010, 0011, 0012]` where only the branch's own order was expected |
| `refuses a branch-A admin's revision and cancellation of a branch-B order through the import, as it would for an order that does not exist, and commits nothing of it` | revise and cancel via the import: rejected like a non-existent order; B orders stay revision 1; exact table-count delta (only the admin's own revise and the batch/audit) ; reverse direction too | FAIL: outcomes `revised, revised, rejected, rejected, revised` — both cross-branch writes **committed** |
| `answers a branch-A admin's party check on a branch-B order with the not-found whatever is guessed…` | right guess, wrong guess, unknown order are all `P0002 NOT_FOUND`; the tenant-wide admin still gets `true` / `false` | FAIL: branch-A admin got `{ same: true }` |
| `refuses at work_order_commit a branch-A admin's revision and cancellation of a branch-B order, while the tenant-wide admin's and finance's identical commands are accepted` | routine called directly, a complete priced revise payload and a cancel payload; positive controls prove the payloads are valid | FAIL: branch-A admin's revise returned `revision: 2` (committed inside the always-rolled-back savepoint) |
| `refuses at work_order_commit a create whose parties were bound to a branch-B client when branch A's admin commits it (defence in depth)…` | create branch | FAIL: both actors `{ ok: true }` |
| `lets a tenant-wide admin and finance revise and cancel the orders of both branches through the import, and each branch admin revise their own` | the allowed side | PASS on both (unchanged behaviour, as it should be) |
| `ENT-2 conformance: … per client in two branches` (extended) | every role × scope, with a second client in a second branch: import of a new order for each client, revision of an existing order of each client through the import, register contents, batch contents, revisions, all against the pure core rule per client | FAIL: `admin@branch: revision of the clientB order (client B) through the import: expected true to be false` |
| `pins search_path on every ENT-2 routine…` (name list extended with `work_order_client_permitted`) | the new routine is catalogued, owned by the migration role, not executable by infrastructure | FAIL (routine absent) |

Logs kept in this folder: `attempt3-evidence/failed-first-work-order-import-on-de29e5c.log`, `attempt3-evidence/failed-first-conformance-on-de29e5c.log`. To reproduce: check out `51b678d`'s tests over `de29e5c`'s source (commit `51b678d` is the red state; its parent is `de29e5c`; the fixture then lived in a test-utils file, moved in `441fd8a`). After the fix (`4d7ab9d`): all pass (below).

### Repair 4 — P2-1, replay after later revisions (fixed, not recorded as a decision)

`work-order-repository.ts:122–132`. A stored batch with the same file hash is a replay only if it was clean **and every order it touched is still at the revision that batch left it at** (receipt `revision_id` = `work_order_current.revision_id`), and it is the member's own batch or the member has tenant-wide import authority. Once a later batch has revised one of those orders, the file is processed row by row. The same command is still always a replay; the same file twice in a row is still a no-op (DW1 test unchanged and passing).

Test `answers the same file twice in a row as a replay, but processes an earlier file again as rows once later revisions have moved on (A, B, A; verdict P2-1)`: A creates 12 orders; A again → replay; B revises 3 (revision 2); **A again → `replayed: false`, new batch, `unchanged: 9, rejected: 3`**; B's content is not overwritten (exactly 3 revision-2 rows); a batch with refused rows is never a replay source; B again is still a replay (nothing has moved since). **Failed first** on `de29e5c`: `expected true to be false` at the second `A` (it was answered as a replay).

**Please check my reading of "new revisions where content differs".** The file itself carries `expectedRevision` (design §9.1.3 optimistic concurrency, unchanged). File A says revision 0 for the three orders B has since revised, so re-importing A's exact bytes gives those three rows `STALE_REVISION` (recorded in the receipt of the new batch) rather than a new revision that would silently overwrite B. Rows whose content already equals the current revision are recorded `unchanged`. A re-import writes a new revision only for a file whose `expectedRevision` is current — which is a different file (different hash), as before. I did not weaken the stale-revision guard to make byte-identical old files revert later work; if the integrator wants that, it is a design change, not a repair.

### Repair 5 — this receipt.

### P3 items

| Item | Status |
|---|---|
| P3-3 (test comment "seven contractor kinds" vs four checked) | **Done**, one line (`work-order-import.integration.test.ts:399`). |
| P3-1 (`prepareWorkOrderDemo` runs before the import gate in `apps/api/.../work-order.application.ts:34`) | Not done: not a one-line fix; it needs a reorder plus a changed order of effects in the API application and its tests. Still synthetic-only. |
| P3-2 (per-test budgets 600 s / 300 s / 240 s) | Not done, deliberately: they match main's conventions and the verdict records no existing timeout changed. I added **no** new or longer timeout. |

## Commands

Node v24.17.0, pnpm 10.28.1, embedded PostgreSQL 16, all on the worktree at `441fd8a`. Heavy suites each ran inside `~/.local/bin/heavy-slot ent-2`, one at a time. Disk free 115 GB at the end (floor 45 GB).

| Command | Exit | Counts / notes |
|---|---|---|
| `pnpm typecheck` | 0 | 7 tasks |
| `LANE_BASE_REF=origin/main pnpm lint` | 0 | 7 tasks; includes the lane check |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | lane `ent-2`, merge-base comparison, base `c283d4e` |
| `pnpm --filter @jobguard/core test` | 0 | 120 files, 3,474 tests (60 sources counted twice: the local `dist/` also holds compiled copies of the tests; CI's figure is 60 / 1,737) |
| `pnpm --filter @jobguard/api test` | 0 | 32 files, 744 tests |
| `pnpm --filter @jobguard/web test` | 0 | 21 files, 448 tests |
| `pnpm openapi:check` | 0 | |
| `pnpm turbo run build --filter='./packages/*'` | 0 | package `dist/` rebuilt (db `dist` verified to contain `work_order_client_permitted` and `addBranchClient`) |
| `pnpm --filter @jobguard/web build` (heavy-slot) | 0 | needed for `next start` |
| Heavy: `work-order-import.integration.test.ts` | 0 | 49 tests (42 before; +7 new); the 2,000-order import measured 11.1 s |
| Heavy: `job-scheduling.integration.test.ts` | 0 | 9 |
| Heavy: `contractor.integration.test.ts` | 0 | 19 (includes the extended ENT-2 conformance) |
| Heavy: `contractor-parties.integration.test.ts` (CH-3b) | 0 | 19 |
| Heavy: `tenancy.integration.test.ts` | 0 | 9 |
| Heavy: `UIWIRE-12.integration.test.ts` | 0 | 22 |
| Heavy: `demo-bootstrap.integration.test.ts` | 0 | 4 |
| Heavy (extra, ENT-2's own): `work-order-concurrency.integration.test.ts` | 0 | 6 |
| Heavy (extra, ENT-2's own): `sor-pricing.integration.test.ts` | 0 | 9 |
| Heavy: `CI=1 playwright test -c playwright.local.config.ts --project=mobile-360 --project=desktop ENT-2.spec.ts` | 0 | **4 passed (7.3 s)** |

Per-suite summary: `attempt3-evidence/db-suites-summary-at-441fd8a.txt`.

## Deviations, environment, and things to know

- **Helper moved, one file removed.** The lane allow-list is exact files. My first version of the second-branch fixture was a new test-utils file (`51b678d`), which the lane check refused. I moved `addBranchClient` into the allowed `packages/db/src/work-order-fixtures.ts` (`441fd8a`) and removed my own new file with `git rm` in that commit. It had existed only in my own unpushed commit, and git history keeps it. No pre-existing file was deleted.
- **Beyond the brief's letter (same files, same intent):** the order lookup in `applyRow` is scoped (no existence signal through the row shape); a replay is limited to the member's own or tenant-wide-visible batches and is shown through the same filtered view (a replay cannot show another branch's rows); the doc `docs/contracts/work-order-import-v1.md` states both rules.
- **Playwright:** the pinned `chromium_headless_shell-1193` is not installed. I used the existing **uncommitted** `apps/web/playwright.local.config.ts` (excluded by `.git/info/exclude`), which only points the same configuration at the installed headless shell. Port 3000 was free before the run; I killed no process.
- Nothing under `.pnpm-store`, build output, `test-results` or the local Playwright config is committed.

## Not run, and why

- The merge of `origin/main` (CH-1 #123): `origin/main` had not moved past `c283d4e`. After it lands: merge with a merge commit keeping both sides (`migrate.ts` order …0107, 0109, 0110; `BUILD_PLAN.md` both ledger lines; lane registry via `lane-union.py`), rebuild `dist/`, re-run typecheck, `lint:lanes`, unit tests and the ENT-2 DB suites.
- The rest of the Playwright suites, `pnpm test:regression`, `test:restore`, `test:deploy`, root `pnpm test` as one command; no CI, no push, no PR.

## Open items for the reviewer and integrator

- The reading of repair 4 above (stale rows are refused, not silently reverted).
- P3-1 remains (synthetic-only, recorded).
- Remaining gates unchanged: D12 v4, D16, G1, G5 for connectors, ENT-14.
