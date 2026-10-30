# SV-7B accounting evidence — disabled synthetic adapter

Review date: 30 October 2026. Source inspection and local contract tests only; PostgreSQL integration
coverage is supplied for CI and has not run in the sandbox. G1, D04 and D12 evidence for a real accounting route is absent. The server
entrypoint always returns `ACCOUNTING_CONNECTOR_DISABLED`, including when a caller
supplies enablement or approval flags. No route, scheduler or provider is installed.

| Register field | Current boundary / outstanding evidence |
| --- | --- |
| Provider / feature | Fictional accounting document observations; no accounting vendor selected |
| Environment / subjects | Explicit `synthetic_demo` fixtures only; fictional suppliers and jobs, no customer data |
| Purpose / authority | Exercise the SV-7A `observation.v1` contract; fixture validation grants no authentication, commercial or settlement authority |
| Inputs | Versioned strict fixture envelope; supplier-line observations with tenant/job, exact text, citations, immutable evidence ID/version, SHA-256 and receive time |
| Verification | Exact UTF-8 text hash and citations checked; receive time and evidence metadata are fictional fixture assertions, not live server/storage verification |
| Processing / destinations | Synthetic fixtures and PostgreSQL receipt hashes only; no network provider, SDK, logs or external subprocessors |
| Binding / replay | Entire batch fails closed on tenant/job mismatch. The emitter atomically claims tenant/evidence ID/object version in an append-only receipt table; replays across runs emit nothing, conflicting metadata rolls back the batch, and new versions emit again. The pure parser only validates/deduplicates a batch |
| Worker boundary | Fixture output can enter existing worker ports as `observation.v1`. The emitter writes source receipts only through a shadow-role pool; it never writes signals. Existing worker terms/environment checks and controlled shadow sink remain authoritative. No builder response or shadow read is introduced |
| Retention / encryption / backups | Receipts retain tenant/job, evidence ID/version, an observation hash and server claim time, without source text. Builder and infrastructure roles have no access. Production retention/deletion/export, region, encryption and backup settings remain unapproved |
| Controller / processor / lawful basis | No real processing; owner, roles, lawful basis, DPA and provider chain must be evidenced before any real route |
| Approval / fallback / kill switch | No approval evidence supplied. Server entrypoint unconditionally disabled with no fallback or runtime enable flag |

These documents are evidence proposals, never receipts of settled cash, approved
variations, invoice lines, allocations or fee entitlement. No money moves.
Tests exercise the adapter and the existing worker with scripted ports; they do
not prove live provider integration or PostgreSQL privileges. Existing SV-7A
database isolation and worker tests remain required in CI. Branch-owned migration
0399 adds forced tenant RLS, a tenant/job foreign key and shadow SELECT/INSERT only.
The receipt commits before returning observations: a process failure after commit
may lose that emission. This synthetic seam guarantees at-most-once claiming,
not durable downstream delivery; live activation still needs reviewed recovery.

Before real activation, separately install reviewed server configuration, genuine
tenant/job authority, verified immutable originals and downstream crash recovery;
obtain connector-specific G1/D04/D12 and regional data-flow approval evidence;
verify revocation/kill-switch behavior, operational ownership, retention, backups
and failure monitoring. This fixture implementation does not release SV-7B live use.
