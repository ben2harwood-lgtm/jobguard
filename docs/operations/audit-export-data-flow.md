# Audit-export data flow — provider-data-flow-v1

- Provider and feature: JobGuard local Node crypto and PostgreSQL; synthetic single-tenant audit export. No external provider.
- Accountable owner: JobGuard founder (live key/residency decisions); operator holding existing restricted assurance credentials for checkpoint handoff.
- Environment: `synthetic_demo` only. All other environments deny creation (`AUDIT_EXPORT_MODE_HELD`).
- Data categories and subjects: generated fictional tenant audit identifiers, actor/subject references, hashes, server timestamps, checkpoint records and ephemeral public verification keys; no private keys, raw media, transcripts or contact directory. References/hashes can be personal data if real data were ever enabled.
- Purpose and lawful basis: synthetic engineering verification; no real-person processing authorized by this leaf. Future lawful basis and authorized recipients HELD pending founder decisions.
- Controller/processor roles: JobGuard synthetic local application operator; PostgreSQL local persistence. No new external processor or subprocessor.
- Origin regions: operator's synthetic test machine/CI; real-data UK/EU route HELD.
- Processing regions: local application process and local database/CI test runner; no provider dispatch.
- Storage regions: local PostgreSQL synthetic environment and explicit download to the requesting admin's device. No remote artifact storage introduced.
- Log regions: existing local/CI logs; new failures expose typed codes only. Artifacts, private key material and raw driver details are not logged.
- Backup regions: existing synthetic database backup boundary; no new backup route. Real-data region/retention approval HELD.
- Endpoint/deployment identifiers: Next `/api/contractor/audit-exports`; Nest `/contractor/audit-exports`; admin page `/admin/contractor/audit-exports`; offline `packages/db/tools/verify-audit-export.mjs`.
- Subprocessors: none added. Existing deployed database/runtime approvals remain outside this leaf.
- Retention settings: append-only artifacts and copied checkpoints; no automatic deletion introduced. Live retention policy HELD. Exported files are controlled by the authorized downloading operator.
- Training settings: no model calls or training; not applicable.
- Deletion settings: no real data enabled; existing audit immutability preserved. Live retention/export/deletion decisions HELD; never erase history as rollback.
- Encryption: Node Ed25519 export signature; this is integrity, not encryption. Local synthetic database/channel uses existing test configuration. Real transport/storage encryption evidence remains a live gate.
- Credentials class: normal non-owner runtime for exports; existing migration/assurance credential for checkpoint production/handoff, never wired into application routes. Private Ed25519 key generated per creation in memory and discarded; public half persisted/downloaded.
- Direction: authenticated inbound request; local DB read/write; explicit response/download to same tenant's owner/admin. No commercial/provider outbound attempts.
- Fallback behavior: `deny`; no missing-checkpoint fallback, global provider route or production signer initialization.
- D04/D12 evidence references: proposed decisions in `docs/decisions/d04-providers-residency.md` and docs/decisions/d12-data-protection-role-third-party-transparency.md founder evidence; neither is claimed approved here. See BUILD_PLAN G5/ENT-10 and audit-export-v1 contract. Actual live evidence HELD.
- Review date: 2026-10-11, builder source inspection only; not founder approval or independent assurance.
- Gate status: synthetic implementation; database/browser execution and fresh Opus/Sol verdicts pending; live keys and G5 HELD.
- Kill switch: server `JOBGUARD_ENV` must equal `synthetic_demo`; disable routes if any export/handoff mismatch is found. Missing trusted handoff refuses creation.
- Verification evidence: `audit-export.application.test.ts` (mode/schema/errors), `audit-export.integration.test.ts` (real PostgreSQL authorization/RLS/append-only/atomicity, NOT RUN in builder sandbox), `verify-audit-export-cli.test.ts` (offline mutation/trust), `ENT-10b.spec.ts` (real browser persistence/tenant/refusal, NOT RUN in builder sandbox). Actual command receipts live in `docs/verdicts/ENT-10b/BUILDER_RECEIPT.md`.

The signature proves export integrity only. Checkpoint trust is the restricted handoff asserted by the export signer; an external timestamp and long-term verification are not provided. The runtime RLS guarantee depends on a correctly authenticated context; it does not protect against a compromised privileged database owner or a false context selected by trusted application code.
