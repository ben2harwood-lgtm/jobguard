# LP-3 coordinator prerequisites — NOT APPLIED

Source-inspected at HEAD `c22015c5ee0505b871e654091296e1eddb6b35f9`; corresponding Q1/Q2/Q5 source equals observed main `31682762c903d716657c573e1b5deae63588aad7`. This is a proposal, not an exception, authorization, test result or completed fixture conversion. The builder stopped the affected migration/caller group and changed none of these files.

## Q1 — `packages/db/test/tenancy.integration.test.ts:206–207`

Before:

```ts
      { relname: "action_outbox", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "approval_rule_version", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
```

Proposed after, coordinator-only additive row:

```ts
      { relname: "action_outbox", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "activation_acceptance_operation_use", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "approval_rule_version", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
```

## Q1 — `packages/db/test/tenancy.integration.test.ts:465–466`

Before:

```ts
      { relname: "action_outbox", owner: "jobguard_migration" },
      { relname: "approval_rule_version", owner: "jobguard_migration" },
```

Proposed after, coordinator-only additive row:

```ts
      { relname: "action_outbox", owner: "jobguard_migration" },
      { relname: "activation_acceptance_operation_use", owner: "jobguard_migration" },
      { relname: "approval_rule_version", owner: "jobguard_migration" },
```

## Q2 — `packages/db/test/job-activation-terms.integration.test.ts:120`

Before:

```ts
   await new UserCommandDispatcher(upgrade).dispatch(context,{version:"command.v1",commandId:randomUUID(),commandType:"job.switch_live",semanticKey:`historic:${job}`,actorMembershipId:M,subjectType:"job",subjectRef:job,action:{actionType:"job.switch_live",recipient:null,contentHash:row.content_hash,aggregateRevision:row.document_version,amountPence:null,currency:null,policyVersion:"pilot_no_charge.v1",expiresAt:new Date("2099-01-01")}},new SwitchJobLiveMutation(T,"pilot_no_charge",input));
```

Proposed after, owner-connected historical fixture only:

```ts
   await withTenant(upgrade,context,db=>db.$client.query(
     "SELECT app.switch_job_live($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)",
     [T,input.activationId,input.capSnapshotId,input.syntheticObligationId,job,
      input.acceptedDocumentId,input.acceptedDocumentVersion,input.acceptedDocumentHash,
      input.expectedJobRevision,input.acceptedNetValuePence,input.recoveryCapPence,
      input.mode,input.activationTermsVersion,input.feePolicyVersion,M,input.activatedAt]
   ));
```

The `upgrade` pool is owner-connected at line 107. Preserve every subsequent snapshot/control/assertion. No application fallback to the unchecked signature.

## Q5 — `packages/db/test/activation.integration.test.ts:4`, positive simulation at line 7

Exact before fragments on line 4 (the rest of the line remains unchanged):

```ts
await pg.start();admin=new Pool(
```

```ts
await migrate(admin);
```

```ts
database:"postgres",user:"activation_login"
```

Required after: create `jobguard_synthetic_demo` with the privileged bootstrap connection before migration, then connect `admin` to that database and migrate there. Close the bootstrap pool in fixture teardown. Runtime fragment becomes:

```ts
database:"jobguard_synthetic_demo",user:"activation_login"
```

Coordinator must supply the exact setup/teardown patch under separate authorization and preserve **all** line-7 assertions (including pilot refusal and illustrative-only result). This builder does not claim a complete executable fixture patch or permit a `postgres`/caller-flag exemption. New LP-3 fixtures already use the trusted database.

## LP-0 reviewed inventory delta — coordinator-only

The replacement/new table would also require a reviewed capability delta. Current old-runtime entries (exact before; not changed):

`docs/contracts/lp-0-effective-privileges-v1.json:579`

```json
{"key":"acl|routine|function:app.record_builder_attested_acceptance(uuid,uuid,uuid,uuid,uuid,integer,character,bigint,integer,uuid,character varying,character varying,timestamp with time zone,uuid)|jobguard_runtime|EXECUTE|-","group":"x-exec-legacy-activation-acceptance"},
```

`docs/contracts/lp-0-effective-privileges-v1.json:582`

```json
{"key":"acl|routine|function:app.record_quote_disposition(uuid,uuid,uuid,uuid,integer,character,integer,uuid,character varying,timestamp with time zone)|jobguard_runtime|EXECUTE|-","group":"x-exec-legacy-activation-acceptance"},
```

`docs/contracts/lp-0-effective-privileges-v1.json:585`

```json
{"key":"acl|routine|function:app.record_simulated_settlement(uuid,uuid,uuid,character varying,bigint,timestamp with time zone)|jobguard_runtime|EXECUTE|-","group":"x-exec-legacy-activation-acceptance"},
```

`docs/contracts/lp-0-effective-privileges-v1.json:626`

```json
{"key":"acl|routine|function:app.switch_job_live(uuid,uuid,uuid,uuid,uuid,uuid,integer,character,integer,bigint,bigint,character varying,character varying,character varying,uuid,timestamp with time zone)|jobguard_runtime|EXECUTE|-","group":"x-exec-legacy-activation-acceptance"},
```

Proposed after: coordinator withdraws these four old effective EXECUTE entries, records the four corrected fully checked overloads, side-table SELECT, ownership, policies, triggers and any non-public helpers, and reviews the actual capability delta. Final hashes/entries cannot be truthfully supplied before the stopped SQL exists. No scanner/pin change is authorized here.

## Inherited lane STOP — `config/agent-lane-assignments.json:85`

Before:

```json
"lp-2":{"branches":["codex/sandbox/lp-2"],"receipt":"docs/verdicts/LP-2/BUILDER_RECEIPT.md","note":"LP-2 server/database/tests only; UI parked. Catch-up on merged LP-1; insertion/adoption enforcement STOPPED on coordinator-owned LP-0 inventory and unresolved fixture prerequisites; tests-first authorization/catalogue/upgrade preparation only. Q5/Q6 review replacement, broad transition withdrawal and actor-less practice-route changes HELD. Full LP-2 acceptance held. C1: no new web workflow. Merged source/tests/pins unchanged; shared registries/exports additive only.","allow":["config/agent-lane-assignments.json","docs/verdicts/LP-2/BUILDER_RECEIPT.md","docs/contracts/least-privilege-job-doors-v1.md","packages/db/migrations/0168_unchecked_job_doors.sql","packages/db/src/migrate.ts","packages/db/MIGRATIONS.md","packages/db/src/index.ts","packages/db/src/lp-job-doors.ts","packages/db/src/sandbox-repository.ts","packages/db/src/demo-bootstrap.ts","packages/db/test/lp-job-doors-fixtures.ts","packages/db/test/lp-job-doors.integration.test.ts","packages/db/test/lp-adoption-boundary.integration.test.ts","packages/db/test/lp-job-doors-compatibility.integration.test.ts","packages/db/test/lp-job-doors-upgrade.integration.test.ts"]},
```

Proposed after: coordinator retires this duplicate legacy LP-2 entry when adopting predecessor `config/lanes/lp-2.json`. No other lane changes. The current loader rejects the duplicate before checking LP-3; changing the loader or selecting an alternate base is excluded. This inherited predecessor problem is not introduced by LP-3.

## Q4 — missing independently checked C4 matrix

No matrix/checker record appears in the supplied addendum. `BUILD_PLAN.md:3315` retains the complete group and C4 requirement. Before: no supplied independently checked arrangement. Required after: coordinator-supplied concrete preceding-app/new-schema, new-app/predecessor-schema, paired, failure and forward-recovery proof, independently checked and bound to exact artifacts. See `docs/operations/lp3-cutover.md`; it records why the naive atomic group fails mixed-version compatibility and does **not** supply or approve a replacement. LP3-A21/A29 cannot pass on this preparation.
