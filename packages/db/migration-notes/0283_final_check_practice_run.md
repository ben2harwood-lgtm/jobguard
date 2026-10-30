# 0256 — SV-5 practice final-check run request

Ben, 28 Oct (SV-5 Q6): `app.request_final_check_run(uuid,uuid,text)` lets the practice job's owner (same authority
as the builder reads, lock required) ask for a Final Check run. It inserts only identifiers into
`infrastructure.final_check_request`, readable and markable only by `jobguard_infrastructure` (the worker's queue
login), mirroring `infrastructure.outbox_signal`. The worker discovers requests once a minute, then freezes the
manifest, examines each source and completes the check; no request path gains shadow capability.
Rollback/forward-fix: revoke runtime EXECUTE; request rows are disposable queue state.
