# G1 pilot infrastructure and recovery

Provision the UK-primary hosts, private networks and named accounts through the
inputs in `infra/pilot/topology.v1.json` after D04. Verify peer-validated TLS
between services and to data, monitoring and recovery targets. Require encryption
at rest for every database, object, log, checkpoint and backup volume, private
versioned evidence, and deny-by-default routes. Bind the worker health port to
the private monitoring network through host network policy and a private TLS
listener. Use the approved API host header in the API's `/healthz` probe. Keep
the database owner in the provisioning channel. Runtime, identity, worker and
queue logins have separate secrets. The worker uses runtime and identity
credentials for the predecessor's startup posture checks. Protect the
checkpoint target with a distinct account and narrowly scoped operator access
outside the business runtime and primary database. Backup and restore credentials
stay in their own operator jobs. Inject secrets at runtime and pin the exact
application resource values using `JOBGUARD_PILOT_RESOURCES`.

Run the versioned host unit with the built worker artifact and a protected runtime
environment file. Put the monitor on a separate host or service so worker loss
does not silence its alert. Worker heartbeat comes from a successful queue poll,
a retrieved job or a completed job in the last 60 seconds. The monitor polls
every five seconds and reports state changes. Queue checks use aggregate flags.
A due, unlocked job older than the configured threshold fires backlog. An
unlocked exhausted job fires failure. Both can fire while the worker is healthy.
Configure monitoring delivery, retention, coverage and independent monitor
liveness with the chosen binding. Keep outbound paused throughout the fixture.

| Signal | Responder slot | Response |
| --- | --- | --- |
| `worker.heartbeat_missed`, `worker.queue_unavailable` | QUEUE_OPERATOR | Check supervisor status and queue reachability from the worker. Confirm the credential and queue binding through protected logs. Escalate persistent loss to INCIDENT_COMMANDER. |
| `worker.queue_backlog`, `worker.queue_failed`, `outbox.failure` | QUEUE_OPERATOR | Follow [queue failure](incident-ownership.md#queue-failure). Check paused execution, handler availability and job age using restricted tooling. |
| `outbox.unknown_outcome` | INCIDENT_COMMANDER | Follow [unknown send](incident-ownership.md#unknown-send). Leave the outcome held pending reconciliation. |
| `backup.failed` | BACKUP_OPERATOR | Follow [backup failure](incident-ownership.md#backup-failure). Preserve the last verified archive and rehearse the restore. |
| `route.denied` | SECURITY_OPERATOR | Follow [unauthorized route](incident-ownership.md#unauthorized-route). Keep the route disabled and verify the approved destination. |
| `storage.verification_failed` | STORAGE_OPERATOR | Follow [storage verification error](incident-ownership.md#storage-verification-error). Quarantine the affected version and verify its exact bytes and reference. |

Assign the roles above and INCIDENT_COMMANDER coverage before activation.
Wire backup verification exit status and the existing closed outbox, route and
storage signal ports to the approved sink. The fixture exercises the outbox
unknown signal at its telemetry port, refused routing before transport, and
storage refusal for an invalid version. It also reads the original after
uploading a replacement through a fixture-only S3 responder, observes retained overdue and exhausted queue entries,
and tests both clean restart and automatic supervisor recovery. The fixture
supervisor, monitor and backing services run on the Docker host without a
developer process or workstation tunnel.

For recovery, keep egress and outbound paused and follow the
[restore runbook](restore-runbook.md). The fixture restores a sentinel into a
separately networked database, checks an independent volume holding a fictional
checkpoint, and exercises backup failure with the last archive retained. Record
full backups, exact object versions, audit checkpoints, paused state, restore
verification and reconciliation in the deployed rehearsal required by D07.
The fixture S3 responder checks the presence of its fixture access ID and
serves immutable local versions. Production signing, storage policy and
encryption are verified with the selected provider. Actual provisioning,
alert delivery and named on-call coverage are pending.
