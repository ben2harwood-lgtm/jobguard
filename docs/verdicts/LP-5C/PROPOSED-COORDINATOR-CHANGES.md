# LP-5C coordinator-owned changes — STOPPED, not applied

Prepared 16 October 2026 against inherited LP-5b 2eb4d98024f92e98cc538ab9279f8984be834502 and observed origin/main 7ff452eeec1c523345d34715adfa3f8310062013. Main wins. All quoted source lines below were compared with main; main line numbers are supplied where they differ. Proposed after text is a requested coordinator disposition, not invented SQL against missing interfaces. No protected line is changed.

Q1: MERGE-CHURN-1 is present (760fe6f52cb1364540c72092c3c882532d9b9d27): per-piece lane, ledger, packages/db/migration-notes and runner discovery. The adopted loader implicitly permits its own lane file and forbids listing that register in allow; the new lane follows that schema. Reservation 0200 is unused; actual placeholder SQL/note cannot be authored before dependencies. Dispatcher handles executable numeric naming at landing.

Q2/Q6: LP-5A/5B are partial preparations, not converted implementations. No reviewed design, checked lifecycle signatures, trusted audit completion or checked revocation path is supplied. STOP the withdrawal; return to LP-5a/5b. Decision 74 authorizes synthetic construction only, not inventing missing authority guarantees.

## `docs/contracts/lp-command-binding-design-v1.md:5`

Main identical line(s): 5.

Before (unchanged):

```text
**Review record:** *none yet.* (To be filled by the reviewing actor, bound to the exact commit of this file. A builder cannot fill it in.)
```

Proposed after: Independent actor records the actual exact-commit design verdict before interface fixation. Builder cannot replace this with a claimed approval.

## `docs/verdicts/LP-5A/BUILDER_RECEIPT.md:21`

Main identical line(s): none; inherited-only or divergent.

Before (unchanged):

```text
`packages/db/src/lp-command-contract.ts` supplies a strict versioned candidate envelope, deterministic code-unit key ordering, safe-integer-only decoded JSON, preserved decimal/time strings, invalid-value/Unicode/serialization checks, resource bounds and a SHA-256 digest. No ID is excluded. No operation interface or SQL signature is fixed. No production source imports this module; no index export was added. The existing hash algorithm, stored hashes/results and dispatcher behavior are unchanged. Detailed limits, domain limitations and source-inspected caller map are in `docs/contracts/lp-5a-command-lifecycle-v1.md`.
```

Proposed after: LP-5a supplies the reviewed checked lifecycle plus dispatcher conversion, business-effect completion validation, current authority/replay and cancellation/error semantics. No interface is available to substitute here.

## `docs/verdicts/LP-5B/BUILDER_RECEIPT.md:21`

Main identical line(s): none; inherited-only or divergent.

Before (unchanged):

```text
`docs/contracts/lp-5b-command-writers-v1.md` records 31 source dispositions: the 12 LP-5B direct-source families plus dispatcher, controlled contractor/billing paths, reads/delegation, embedded test doubles and owner-connected restore setup, including an API adoption replay path. It names current digest material, exact completion anchors still needed, per-family lock order, original first-result/no-op/retry semantics, recovery stages, receipt-only feedback/checkpoints, helper chains and the source-indexed routine definitions. Direct means unconverted, not approved. No fixed original-nine cutoff.
```

Proposed after: LP-5b supplies conversion for every inventoried caller, including later approval-chain writer and checked revocation, plus real-role persistence/replay evidence. The current inventory is not conversion.

## `packages/db/src/commands.ts:67`

Main identical line(s): 67.

Before (unchanged):

```text
      const claimed=await database.$client.query(`INSERT INTO app.command_receipt
```

Proposed after: LP-5a replaces direct claim with the reviewed checked begin interface while preserving semantic conflict, membership locking and first-result replay; exact replacement depends on its absent signature.

## `packages/db/src/commands.ts:95`

Main identical line(s): 95.

Before (unchanged):

```text
      await database.$client.query(`UPDATE app.command_receipt SET status='succeeded',result=$3::jsonb,completed_at=clock_timestamp() WHERE tenant_id=$1 AND command_id=$2`,[context.tenantId,command.commandId,JSON.stringify(result)]);
```

Proposed after: LP-5a replaces direct completion with its reviewed checked completion interface; no generic saved-result bypass.

## `packages/db/src/recovery-message-repository.ts:223`

Main identical line(s): 223.

Before (unchanged):

```text
      await db.$client.query("UPDATE app.action_authorization SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2 AND revoked_at IS NULL", [ctx.tenantId, m.authorization_id]);
```

Proposed after: LP-5b uses the reviewed checked authorization-revocation route, with the same case/message/current-authority and queued-action cancellation rules. LP-5c supplies no new business routine.

## `packages/db/src/extra-approval-chain-repository.ts:81`

Main identical line(s): 81.

Before (unchanged):

```text
        const inserted = await db.$client.query(`INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,actor_membership_id)
```

Proposed after: LP-5b converts this later receipt writer and completion/replay paths through the checked lifecycle; preserve non-owner role matrix and contractor guards.

## `docs/contracts/lp-0-effective-privileges-v1.json:71`

Main identical line(s): 72.

Before (unchanged):

```text
{"key":"acl|col|app.action_authorization.revoked_at|jobguard_runtime|UPDATE|-","group":"x-command-authority-writes"},
```

Proposed after: Coordinator removes this capability entry only when the corresponding actual migration withdraws it and its legitimate checked route is proven. Keep unrelated keys and historical Markdown. Then run unchanged LP-0 stale-entry and deliberate re-grant controls; no generated replacement baseline.

## `docs/contracts/lp-0-effective-privileges-v1.json:77`

Main identical line(s): 78.

Before (unchanged):

```text
{"key":"acl|col|app.command_receipt.completed_at|jobguard_runtime|UPDATE|-","group":"x-command-authority-writes"},
```

Proposed after: Coordinator removes this capability entry only when the corresponding actual migration withdraws it and its legitimate checked route is proven. Keep unrelated keys and historical Markdown. Then run unchanged LP-0 stale-entry and deliberate re-grant controls; no generated replacement baseline.

## `docs/contracts/lp-0-effective-privileges-v1.json:78`

Main identical line(s): 79.

Before (unchanged):

```text
{"key":"acl|col|app.command_receipt.result|jobguard_runtime|UPDATE|-","group":"x-command-authority-writes"},
```

Proposed after: Coordinator removes this capability entry only when the corresponding actual migration withdraws it and its legitimate checked route is proven. Keep unrelated keys and historical Markdown. Then run unchanged LP-0 stale-entry and deliberate re-grant controls; no generated replacement baseline.

## `docs/contracts/lp-0-effective-privileges-v1.json:79`

Main identical line(s): 80.

Before (unchanged):

```text
{"key":"acl|col|app.command_receipt.status|jobguard_runtime|UPDATE|-","group":"x-command-authority-writes"},
```

Proposed after: Coordinator removes this capability entry only when the corresponding actual migration withdraws it and its legitimate checked route is proven. Keep unrelated keys and historical Markdown. Then run unchanged LP-0 stale-entry and deliberate re-grant controls; no generated replacement baseline.

## `docs/contracts/lp-0-effective-privileges-v1.json:124`

Main identical line(s): 125.

Before (unchanged):

```text
{"key":"acl|rel|table|app.action_authorization|jobguard_runtime|INSERT|-","group":"x-command-authority-writes"},
```

Proposed after: Coordinator removes this capability entry only when the corresponding actual migration withdraws it and its legitimate checked route is proven. Keep unrelated keys and historical Markdown. Then run unchanged LP-0 stale-entry and deliberate re-grant controls; no generated replacement baseline.

## `docs/contracts/lp-0-effective-privileges-v1.json:141`

Main identical line(s): 142.

Before (unchanged):

```text
{"key":"acl|rel|table|app.command_receipt|jobguard_runtime|INSERT|-","group":"x-command-authority-writes"},
```

Proposed after: Coordinator removes this capability entry only when the corresponding actual migration withdraws it and its legitimate checked route is proven. Keep unrelated keys and historical Markdown. Then run unchanged LP-0 stale-entry and deliberate re-grant controls; no generated replacement baseline.

## `docs/contracts/lp-0-effective-privileges-v1.json:173`

Main identical line(s): 174.

Before (unchanged):

```text
{"key":"acl|rel|table|app.decision_resolution|jobguard_runtime|INSERT|-","group":"x-command-authority-writes"},
```

Proposed after: Coordinator removes this capability entry only when the corresponding actual migration withdraws it and its legitimate checked route is proven. Keep unrelated keys and historical Markdown. Then run unchanged LP-0 stale-entry and deliberate re-grant controls; no generated replacement baseline.

## `packages/db/test/lp-0-grant-freeze.integration.test.ts:80`

Main identical line(s): 80.

Before (unchanged):

```text
    expect(compareInventory(inventory, baselineMigrationOnly).reductions).toEqual(roleKeys(baselineBootstrapLogin));
```

Proposed after: Keep this assertion unchanged. Coordinator closes exactly the withdrawn inventory entries so stale reductions are empty; LP-5c cannot modify the pinned JSON or suppress reductions.

## `packages/db/test/commands.integration.test.ts:58`

Main identical line(s): 58.

Before (unchanged):

```text
   await d.$client.query("UPDATE app.action_authorization SET revoked_at=clock_timestamp() WHERE id=$1",[auth]);
```

Proposed after: Coordinator changes this invocation to the reviewed checked revocation route once supplied; preserve following AUTHORIZATION_INVALID refusal and calls===1 assertion.

## `packages/db/test/commands.integration.test.ts:61`

Main identical line(s): 61.

Before (unchanged):

```text
    const decision=x.rows[0].id,resolution="89000000-0000-4000-8000-000000000001";await d.$client.query("INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id) VALUES($1,$2,$3,'dismissed',$4)",[resolution,TENANT,decision,MEMBER]);
```

Proposed after: Coordinator uses owner fixture setup or the authorized checked resolution route for the dismissed resolution; preserve its meaning and all assertions.

## `packages/db/test/commands.integration.test.ts:62`

Main identical line(s): 62.

Before (unchanged):

```text
    await expect(d.$client.query(`INSERT INTO app.action_authorization(id,tenant_id,decision_id,resolution_id,actor_membership_id,action_type,content_hash,aggregate_revision,policy_version,expires_at) VALUES(gen_random_uuid(),$1,$2,$3,$4,'send',$5,1,'v1',clock_timestamp()+interval '1 hour')`,[TENANT,decision,resolution,MEMBER,HASH])).rejects.toMatchObject({code:"23514"});
```

Proposed after: Coordinator retains this 23514 trigger backstop under owner setup and adds actual-runtime 42501 refusal; do not simply weaken or replace the existing expected code.

## `packages/db/test/commands.integration.test.ts:29`

Main identical line(s): 29.

Before (unchanged):

```text
const transition={mutate:async(d:any)=>{const row=(await d.$client.query(`SELECT * FROM app.transition_job($1,$2,1,'live','switch_live',$3,10000,'pilot-no-charge-v1',0)`,[TENANT,JOB,QUOTE])).rows[0];return{jobId:JOB,revision:row.revision,status:row.status}}};
```

Proposed after: Coordinator uses the supplied checked transition path for the product handler while preserving result, race and lock-order assertions. Do not re-enable legacy runtime EXECUTE.

## `packages/db/test/commands.integration.test.ts:91`

Main identical line(s): 91.

Before (unchanged):

```text
  const switching={mutate:async(d:any)=>{const row=(await d.$client.query(`SELECT * FROM app.transition_job($1,$2,1,'live','switch_live',$3,10000,'pilot-no-charge-v1',0)`,[TENANT,job,quote])).rows[0];return{jobId:job,revision:row.revision,status:row.status}}};
```

Proposed after: Coordinator uses the supplied checked transition path for the product handler while preserving result, race and lock-order assertions. Do not re-enable legacy runtime EXECUTE.

## `packages/db/test/lp-0-authority-paths.integration.test.ts:247`

Main identical line(s): 247.

Before (unchanged):

```text
      await expect(runtime.query("SELECT app.transition_job(NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL)")).rejects.not.toMatchObject({ code: "42501" });
```

Proposed after: After LP-2 withdrawal, preserve the historical routine behavior at its earlier migration boundary and assert 42501 against the fully migrated database. Existing membership refusal at :242 already matches main; draft :236–237 described an obsolete positive test and needs no change now.

## `packages/db/test/site-extra.integration.test.ts:170`

Main identical line(s): 170.

Before (unchanged):

```text
 await withTenant(c.runtime, f.ctx, db => db.$client.query("SELECT app.transition_job($1,$2,(SELECT revision FROM app.job WHERE tenant_id=$1 AND id=$2),'invoiced','issue_invoice',NULL,NULL,NULL,NULL)", [f.p.tenantId, f.jobId]));
```

Proposed after: Coordinator uses owner-only fixture setup or the supplied permitted checked transition, preserving the between-precheck-and-mutation live-job refusal assertion.

## `config/agent-lane-assignments.json:85`

Main identical line(s): none; inherited-only or divergent.

Before (unchanged):

```text
"lp-2":{"branches":["codex/sandbox/lp-2"],"receipt":"docs/verdicts/LP-2/BUILDER_RECEIPT.md","note":"LP-2 server/database/tests only; UI parked. Catch-up on merged LP-1; insertion/adoption enforcement STOPPED on coordinator-owned LP-0 inventory and unresolved fixture prerequisites; tests-first authorization/catalogue/upgrade preparation only. Q5/Q6 review replacement, broad transition withdrawal and actor-less practice-route changes HELD. Full LP-2 acceptance held. C1: no new web workflow. Merged source/tests/pins unchanged; shared registries/exports additive only.","allow":["config/agent-lane-assignments.json","docs/verdicts/LP-2/BUILDER_RECEIPT.md","docs/contracts/least-privilege-job-doors-v1.md","packages/db/migrations/0168_unchecked_job_doors.sql","packages/db/src/migrate.ts","packages/db/MIGRATIONS.md","packages/db/src/index.ts","packages/db/src/lp-job-doors.ts","packages/db/src/sandbox-repository.ts","packages/db/src/demo-bootstrap.ts","packages/db/test/lp-job-doors-fixtures.ts","packages/db/test/lp-job-doors.integration.test.ts","packages/db/test/lp-adoption-boundary.integration.test.ts","packages/db/test/lp-job-doors-compatibility.integration.test.ts","packages/db/test/lp-job-doors-upgrade.integration.test.ts"]},
```

Proposed after: Coordinator reconciles inherited LP-2 into one complete registration with config/lanes/lp-2.json. Preserve every applicable LP-2 allow entry; LP-5c cannot remove either predecessor/shared registration.

## `config/lanes/lp-2.json:4`

Main identical line(s): none; inherited-only or divergent.

Before (unchanged):

```text
    "lp-2": {
```

Proposed after: Same registration consolidation as preceding item; this inherited per-piece duplicate is not on current main. Do not change predecessor files from LP-5c.

