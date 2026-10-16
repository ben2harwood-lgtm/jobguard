# LATER-B18 — Illustration replay and typed validation

Built on `codex/sandbox/later-b18` from actual `origin/main` / HEAD `31682762c903d716657c573e1b5deae63588aad7`, which supersedes the issued base. Uncommitted. Decision 74: PARK; RED independent checks, separate acceptance and Ben's button remain required. No merge, enablement, deployment, real data, spending or outward action.

L101: migration `0192_fee_illustration_replay.sql` serializes the existing fixed synthetic v1 source by command and job, returns identical replays without regenerating IDs, and refuses changed bindings. The routine checks the retained fixed DEMO owner's current role and restricts writes to synthetic small-builder jobs. Existing RLS, ownership, constraints, immutable history and v1 calculations remain intact. No new grants or financial writes.

L112: the controller checks practice-job authority before validating versioned requests, returns `400 / VALIDATION_ERROR` for invalid money/content and `409 / IDEMPOTENCY_CONFLICT` for the routine's specific replay conflict. Unexpected internal errors retain default 500 handling.

Evidence and exact limitations: [builder receipt](../verdicts/LATER-B18/BUILDER_RECEIPT.md). API boundary tests execute locally; real-PostgreSQL replay, financial-effect and upgrade proofs await dispatcher/GitHub CI. No acceptance is claimed. Missing coordinator-owned lane registration is a STOP; shared lists, pins, test files and migration inventory are unchanged.
