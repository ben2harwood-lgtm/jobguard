MON-9 / mon-9-guard-live — RED, synthetic preparation only

0609 replaces the latest mon9_pursuit_guard body from 0584 and repeats its
idempotent tenant-by-tenant backfill without the database-name predicate.
Eligibility still requires a synthetic withheld-customer-payment case, synthetic
small-builder track and reference_fee_policy_v3. No grants, RLS, terms, election
routines, fee derivation or public service-offering gates change. The proof's lp0,
upgrade and tenancy sections are empty because catalog posture and the upgrade
baseline's rows do not change; populated backfill behavior is tested separately.

The existing owner-fixture regression requires writes without tenant context to
remain unmarked. The latest private election body already rejects pursuit using
immutable events/messages/approvals/sink rows and legacy/current case state even
when a marker is absent. Preserve that fail-closed fallback. Tenant-context writes
still serialize with elections on the same advisory key. Backfill preserves the
earliest source timestamp and never rewrites an existing marker or source row.

The new PostgreSQL upgrade regression uses jobguard_mon9_guard_test, reproduces
missed starts under the predecessor, checks two-tenant backfill and SQL replay,
and checks new runtime pursuit, late-election refusal, legacy owner inserts and
merchant exclusion. It calls the private election as a test owner with actual
command/approval fixtures because the public session gate remains closed on this
database. Existing recovery suites are unchanged. CI must run the full PostgreSQL
suite and an independent RED reviewer must review the exact head before merge.
Forward-fix with a later migration; never reinstate a database-name bypass.

Still open for people: offering the service, the solicitor view on damages-based
agreements, D01 service-table approval and pilot data. This repair does not offer
MON-9, satisfy those gates or open G0–G5. No human/legal/provider approval is claimed.
