# TESTS-DASHBOARD-AUTHORITY-1

Issued 17 October 2026; RED; decision 74 **BUILD-DON'T-MERGE / PARK**.

Base: `1bcd8db8e129809e9b6a84d0c8acc9c09e66a3f4`. Branch:
`codex/sandbox/tests-dashboard-authority-1`. Builder changes remain uncommitted;
the dispatcher owns committing and obtaining exact-commit CI/review evidence.

Authority: BUILD_PLAN ENT-9 scope assertion, §2.4 C5, AGENTS §5.1 and §5.13,
`docs/contracts/enterprise-dashboard-v1.md`, and the ENT-9B receipt's explicit
unproved scheduling/session-liveness boundary. The referenced pre-build check
`checks/J6-jobguard-next-orders-night4-check.md` is absent in this checkout;
READY is dispatch-supplied information, not a locally inspected verdict.

| Case | Authored assertion | Execution evidence |
| --- | --- | --- |
| DA1 | Populated successful read, then stored-session expiry; the repository refuses even with the previously verified context | HELD for PostgreSQL CI |
| DA2 × 2 | Real grant/membership revocation acquires the exclusive tenant gate; a different backend waits for its shared gate and refuses after revocation commits | HELD for PostgreSQL CI |
| DA3 × 2 | Dashboard acquires the shared gate; real grant/membership revocation waits; the earlier read succeeds and all later reads refuse | HELD for PostgreSQL CI |
| DA4 | Refused tenant A read and populated tenant B read reuse the same backend; no A identities leak and transaction-local tenant state clears | HELD for PostgreSQL CI |
| DA5 | All tenant-owned app/control-plane/audit-control stored rows remain identical across reads; exact revocation command, audit and head changes are identified separately | HELD for PostgreSQL CI |
| Sensitivity | Omitting only the dashboard gate makes DA2's waiting-lock assertion fail; the real source query still returns actual fixture facts before the paused revocation proceeds | HELD for PostgreSQL CI |

Eight cases collect; collection is not execution. No scheduling proof is claimed
from source inspection, compilation, or existing application tests using mocks.

The test-only pool delegates real queries. Barriers delay delivery after an
actual gate acquisition; PostgreSQL `pg_locks` and `pg_blocking_pids` establish
ordering against the exact tenant key, mode, grant state and distinct backend.
No ordering is inferred from sleep. Polls, barrier waits, connection attempts,
lock waits, statements and tests have bounds. The negative-control pool replaces
only the dashboard gate statement with a harmless SELECT, never authorization,
the source statement, command results or commercial facts.

Fixture setup reuses the existing work-order/import/invitation/capture commands.
The invited supervisor receives a real stored, digest-bound practice-session
row, resolved by the existing session bridge. Expiry alone uses an explicit
owner-only fixture mutation with USER triggers disabled inside one transaction;
it changes both bounded timestamps and re-enables triggers before commit.
This is setup, not a new production expiry mechanism or permission.

The new cluster uses `persistent: true`, closes its pools and stops PostgreSQL
without removing its database directory. It never invokes the shared
`extra-fixtures.cluster()`/`close()` deletion path. The retained parent path is
printed and includes a retention note, with PostgreSQL data in its initially
empty `postgres` child. Startup failures also stop and retain. A 33 GiB free-space
preflight precedes cluster creation. No PostgreSQL cluster was started locally.

No product implementation, permissions, prices, policy, migration, existing
assertion, pin, CI configuration or root regression requirement changes.
Standard F is unchanged; no new GRANT, additive-list row or business capability.
No backwards-compatibility impact or new operational alert. To park/withdraw
the change, leave the tests unmerged; there is no deployed state to roll back.

CI target, after the dispatcher commits/pushes:

```sh
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/enterprise-dashboard.authority-race.integration.test.ts
```

Retain mandatory root CI, existing dashboard/contractor regressions and existing
migration checks. No local full test, database, migration, browser or e2e suite.
No provider/AI output/prompt change; live evaluation is inapplicable. Independent
Sol-high source review is recorded in the builder receipt; Opus, exact-commit
reviews, CI proof and separate technical acceptance remain HOLD. No merge,
enablement, release or deployment without Ben's button.
