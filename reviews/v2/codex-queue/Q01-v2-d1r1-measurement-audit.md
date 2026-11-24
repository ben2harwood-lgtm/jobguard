# Packet V2-D1R1: append audit events for measurement saves (d1, repair 1)

> **Rules this piece must meet (read before writing code).** AGENTS.md rev 3.0 and BUILD_PLAN.md on `main`, plus `codex-queue/01-RULES.md`. Ben's build rules checklist `/mnt/project-files/audits/build-rules-checklist.md` (version 1) applies in full, and its rules 1 to 18 go in the PR's "Rules met" list. The rule missed most on 24 Nov is the **audit chain (AGENTS.md §5.7)**: every command that changes data appends exactly one event with `appendAuditBatch` (`packages/db/src/audit.ts`) in the same transaction (`audit.v1`, actor `membership:<id>`, event type `v2.<thing>.<verb>`, no payload key `version`, a replay appends nothing), with a test that a forced failure after the insert leaves neither row nor event. Also: RLS forced and a second-firm test for any new table; exact decimal strings for money; sends only to the local catcher; hidden financial findings never reach a crew, customer or audit payload. The checker rejects the PR if any is missing.

Rework risk: **low**. Tier: RED. Repo: ben2harwood-lgtm/jobguard. Branch `codex/sandbox/v2-d1` (PR #904). **Starts when** R2 has pushed `codex/sandbox/v2-c3` (an audit commit after `2d92684`). Merge the new c3 into d1 first (no rebase). Rules: `01-RULES.md`.

## The gap (verified 24 Nov 21:15 UK)
At d1's head `20d66ad`, `MeasurementRepository.save()` in `packages/db/src/v2-measurement-repository.ts` inserts into `app.v2_measurement` with no `appendAuditBatch` call (AGENTS.md §5.7).

## Scope
- After the insert, inside the same transaction, append one event (`audit.v1`, actor `membership:<id>`, event type like `v2.measurement.saved` or `.confirmed`, subject the scope item, payload references with command ID, value, unit, source and confirmation; never the key `version`). Same pattern as V2-R2 and D3's `885b59c`.
- Replay appends nothing. No other behaviour change.

## Done when
- Same four tests as V2-R2, for a measurement save and a confirmation.
- CI green apart from the known Vercel check. A Claude session checks it. Repairs left on d1 after this: one.

