# LATER-B16 — Customer invoice projection and replay

Status: built partially, uncommitted, PARK under decision 74. RED independent model verdicts and separate acceptance are outstanding. Never merge, enable or deploy without Ben's button.

Base inspected: origin/main and HEAD `31682762c903d716657c573e1b5deae63588aad7`; the order's `ca435eeb5791638c787c830d6ba717146f694539` and draft `0bbb5ddb` are earlier references. Current main wins. Migration: `0190_credit_command_replay.sql`, discovered by the installed runner; no inventory or runner change.

- L075: real API/PostgreSQL browser journey added, using persisted issue/credit/receipt/reversal commands, reload and a second authenticated context; NOT RUN locally (CI in both existing projects).
- L076: generic credit service compares persisted target, job, amount and reason before replay under command/semantic locks; unit coverage passes; real database coverage NOT RUN locally.
- L078: list/credit/receipt balances already share SQL projections on main. Preserve those queries; issued/replayed responses now use the same persisted amounts. Unit coverage passes; database/browser coverage NOT RUN locally.
- L079: one issue audit event per invoice under the existing job lock; unit coverage passes; database coverage NOT RUN locally.
- L080: SQL formats calendar dates without conversion to UTC; unit timezone cases pass; database coverage NOT RUN locally.
- L081: HELD. Required credit hash/date/amount fields at `apps/api/src/customer-invoice.contracts.ts:29` cannot express legacy unknowns. A new versioned product contract outside the lane is required. No response or legacy facts changed.
- L082: 0190 serializes credit command before receipt lookup and invoice lock, validates active owner before replay and after waits, preserves prior request digest and all 0166 VAT/artifact arithmetic. Real PostgreSQL concurrency, replay/audit and upgrade/rollback controls added; NOT RUN locally.

No new GRANT statements, direct protected grants, columns, tables, UI changes, provider actions or policy activation. No merged tests, pins, watchdog registry/harness, migration inventory or issuer routine changed. This overlaps existing invoice repository work and must serialize through the dispatcher.

Coordinator prerequisite: `config/lanes/later-b16.json` is absent and no later-b16 legacy registration exists. The builder leaves it unchanged. Lane check also cannot compare the uncommitted HEAD with the identical origin/main. The coordinator must provide registration and a reviewable commit/range.

Evidence and exact STOP lines: `docs/verdicts/LATER-B16/BUILDER_RECEIPT.md`. The dispatcher owns the commit, RED review and acceptance; this ledger is a builder report only.
