# LATER-B7 — Authoritative home document summaries

Builder: Codex. Branch: `codex/sandbox/later-b7`. No migration.

Replaced job-title document inference with session-owned job identities from `JobPartiesRepository.list` and persisted quote/invoice, send, delivery-event and outbox records. Latest quote previews keep their own delivery state; issued invoices take precedence. The existing response contract and screens are unchanged.

Tests: 15 focused unit cases passed after an initial 14 failures / 1 pass. PostgreSQL and browser coverage was added but NOT RUN in this sandbox. Forced typecheck and package lint passed, 7/7 tasks each. See the [builder receipt](../verdicts/LATER-B7/BUILDER_RECEIPT.md) for build results, commands and limitations.

Partial evidence only. PARK under decision 74. RED independent checks and separate acceptance are pending. Coordinator actions: register the missing lane and resolve the unchanged merged assertions at `apps/web/e2e/shell.spec.ts:48` and `:51`. No commit, push, merge, deployment or outward action.
