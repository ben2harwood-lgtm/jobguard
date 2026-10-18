# LATER-B28 — SSO boundary and resource correctness

Branch `codex/sandbox/later-b28`; base / uncommitted HEAD `4c407a6c81bd714a6875b7adf995812381d0fe57`.

FL52, FL63 and FL64 implemented with synthetic tests: canonical UUID refusal routing, database-clock bounded expiry, authentication before the write transaction with authority rechecked on its held client. No migration or grants.

L054 is partial: added an active SSO-linked owner executor control and an explicit expected-failure reproduction using the contractor revocation command. Completing it requires a coordinator-owned change to `packages/db/src/outbox.ts:13`, outside this lane. No existing merged test/pin or executor policy changed.

23 unit tests pass. PostgreSQL proofs and full/browser suites NOT RUN in the restricted sandbox. Root verification and remaining gates are recorded in [the builder receipt](../verdicts/LATER-B28/BUILDER_RECEIPT.md).

RED review and separate acceptance pending. Decision 74 PARK: no merge, enablement, deployment, real data, spending or outward action.
