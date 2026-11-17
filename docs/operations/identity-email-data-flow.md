# M0-6L identity email route register

Status: fixture transport only; D04 `provider_residency_policy_v1` remains proposed.
Owner: data/security owner must assign the operator before a pilot. Review date: 2026-10-03
(builder source inspection, no provider verification or professional approval).

| Field | Current boundary |
| --- | --- |
| Provider / feature | In-process fixture identity challenge transport; no SMTP/HTTP SDK |
| Environment / subjects | `synthetic_demo`; generated fictional `.invalid` identities only |
| Categories / purpose | Normalized fictional email, eight-digit code, challenge UUID; explicitly requested authentication only |
| Message category | `identity_challenge`; strict schema accepts no arbitrary body or commercial content |
| Controller / processor / basis | No real personal data permitted; live controller/processor and lawful basis await D04/D12 |
| Origin / processing | Application process and its configured sandbox PostgreSQL identity store |
| Storage / logs / backup destinations | No external email storage/log/backup service; raw code/token absent from application logs and PostgreSQL records; DB deployment/backup destinations require their own approved route before real data |
| Endpoint / deployment | No email endpoint exists; future exact EU/UK deployment must be enumerated and verified by D04 |
| Subprocessors / training | No email provider or subprocessors; no training use; future live settings unverified and blocked |
| Retention / deletion | Disposable synthetic fixtures; real-data policy and deletion implementation require D12/pilot gate |
| Encryption / credential | TLS required for non-local DB deployment; keyed SHA-256 digests, opaque random session tokens; separate identity DB credential and secret parsed through config |
| Direction / fallback | Local fixture acknowledgement only; real recipients and non-synthetic mode throw `IDENTITY_ROUTE_BLOCKED`; no fallback |
| Authorization / execution | Request-origin check plus persistent IP throttle and email cooldown; persisted challenge/security event commits before fixture delivery; delivery state persists afterwards |
| Idempotency / retries | Challenge UUID is delivery identity; code consumed once; repeat requests obey cooldown; pending/unknown is never claimed delivered; no automatic network retries |
| Kill switch / gate | Missing identity configuration disables initialization; adapter refuses all live routes regardless of credentials/mode supplied |
| Approval / verification | No D04 approval, no live route evidence, no sends or spending; fixture contract and authored PG/browser tests only |
