# Contractor parties data flow — synthetic only

Register schema: `docs/contracts/provider-data-flow-v1.md`.

| Required field | Recorded value |
|---|---|
| Provider and feature | JobGuard internal API/PostgreSQL: CH-3b client links, contractor job parties and resident contact. No external provider route. |
| Accountable owner | JobGuard integrator for synthetic build; founder owns any future real-data approval. Contractor controller must nominate its pilot owner before G1. |
| Environment | `synthetic_demo` only; fictional names, `.invalid` email contacts, synthetic telephone examples. |
| Data categories and subjects | Client customer identities/revisions and contact details, site references, resident name and phone/email or closed no-resident reason; contractor members as scoped actors. Only generated/fictional subjects in this build. |
| Purpose and lawful basis | Execute the contractor's job-party instructions and scoped site-contact access. Synthetic development has no real resident processing. Controller must record lawful basis/instructions under its DPA before real processing; no basis is inferred here. |
| Controller/processor roles | Contractor as controller; JobGuard as processor of client/resident data. **D12 v4, proposed**. No JobGuard own-purpose reuse, model training or cross-customer analytics. |
| Origin region | Local synthetic repository/test environment; no real-data origin approved. |
| Processing region | Local synthetic API and PostgreSQL tests; no approved production route/region claimed. |
| Storage region | Local test PostgreSQL and the existing isolated synthetic deployment if deployed by its owner; actual deployment residency remains unverified by this task. No new external destination. |
| Log region | Local test/CI logs; no resident content is intentionally logged. Application errors expose only closed codes; infrastructure logging configuration requires D04 review before real data. |
| Backup region | Ephemeral tests have no backups. Existing synthetic infrastructure backup destination is outside this leaf and unverified here; G1 restore/region evidence remains required. |
| Endpoint/deployment identifiers | Next `/api/contractor/clients/:clientId/customer-link` POST and `/api/contractor/jobs/:id/resident-contact` GET; matching Nest `/contractor/...`; database `jobguard_synthetic_demo`; migration 0102. No external endpoint. |
| Subprocessors | No new external subprocessor. Any existing hosting/database operator remains subject to the future approved D04 register and contractor DPA/subprocessor list; no approval inferred. |
| Retention settings | Resident class `contractor_resident_contact_d07_d12_pending`; client class inherited from CH-3a `job_party_contact_d07_pending`. D07/D12 periods and controller instructions pending. Ephemeral tests remove their generated database directory. |
| Training settings | No resident/client contacts sent to AI; no training or own-purpose use. No provider training setting is applicable to this internal route. |
| Deletion settings | No deletion policy or period established. Contractor instructions, access/export/deletion process and D07 approval remain prerequisites to real data. No Object Lock or legal hold. |
| Encryption | Synthetic local PostgreSQL test connections are loopback, not production encryption evidence. Production transport/storage/backup encryption must be independently verified before G1. No new credential/store. |
| Credentials class | Existing non-owner, non-superuser, non-BYPASSRLS runtime pool; migration credential only for schema/catalog assurance. No provider credentials. |
| Inbound/outbound direction | Authenticated internal HTTP commands/read to tenant PostgreSQL; no external outbound/provider action or outbox send. |
| Fallback behavior | `deny`; missing principal, member, tenant or persisted job scope refuses; no global/external fallback. |
| D04/D12 evidence and review date | D04 proposed; **D12 v4, proposed**. Contract §9.1.12 and issued CH-3b work order, reviewed for implementation 7 October 2026. This entry is not approval evidence. |
| Gate status | Closed for real data: D04, D12 v4, G1 and signed ENT-14 pilot agreement/DPA remain required. DW1 ENT-2 import clause and DW3 team positive cases HELD by Ben. |
| Kill switch | `JOBGUARD_ENV` must be `synthetic_demo`; SQL also requires `current_database()='jobguard_synthetic_demo'`. No production route can initialize; no external dispatch path exists. |
| Verification evidence | Core strict schemas; real PostgreSQL integration tests for types, FKs, privileges, replay, refusals, audit atomicity, scope denial and projection omission; API-side captured zero-spend AI request and transport/privacy tests. Local vs CI execution results are recorded in `docs/verdicts/CH-3b/BUILDER_RECEIPT.md`; no real-data route verified. |
