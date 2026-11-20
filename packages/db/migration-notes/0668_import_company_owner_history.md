# 0668: company-owner import history

LATER-SAFETY-118 (RED), landing catch-up. Renumbered from 0846 by filename
stem only; migration SQL is unchanged. The recreated `app.ch5_history_actor`
starts from main's latest body in 0535 and retains its tenant, actor, track,
and environment checks. Only company imports cease requiring the original
session digest; shared practice imports remain session-bound.

No table, role, grant or routine signature changes. The migration runs in one
transaction; after installation use a reviewed forward repair for rollback.
The company-owner integration test covers new sessions, current owners,
revoked membership, foreign tenants and practice-session isolation. Existing
upgrade proofs pin the complete replacement body while retaining LP-6b.
