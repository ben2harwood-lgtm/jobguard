# LATER-B17 — historical v1 recovery integrity

Status: **PARTIAL / RED / PARK** under decision 74. Builder: Codex. Base and unchanged HEAD: `31682762c903d716657c573e1b5deae63588aad7`.

Built L104 (strict full approval parsing) and L119 (stored posting delta in the fee view). Added 17 passing unit cases and two PostgreSQL cases awaiting CI. Direct package TypeScript and integration-source compilation pass; root forced commands cannot start with installed pnpm 11.8.0 versus pinned 10.28.1. Database/browser/full suites NOT RUN.

STOP: missing `config/lanes/later-b17.json:1`; session propagation outside lane at `apps/api/src/workspace/recovery.application.ts:3`; merged legacy routine fixtures at `packages/db/test/recovery.integration.test.ts:23,68,70`; L105 fixture at the same file's line 340. L099/L100/L105/L106/L107/L108 remain incomplete. No migration 0191 or new production grant.

Evidence and exact before/after STOP records: [BUILDER_RECEIPT.md](../verdicts/LATER-B17/BUILDER_RECEIPT.md). No independent verdict or acceptance. Never merge, enable or deploy without Ben's button.
