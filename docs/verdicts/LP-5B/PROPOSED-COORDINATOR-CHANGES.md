# LP-5B coordinator handoff — stopped lines remain untouched

Inherited HEAD `01c7a16a098a919aa989d6bbda006e977600774e`; observed main `4c407a6c81bd714a6875b7adf995812381d0fe57`. No item below is an applied patch, accepted design or independent verdict. Main wins where newer; no predecessor, merged test, capability list or pin is edited. Technical leans permit preparation; they do not supply absent SQL interfaces or coordinator-owned amendments.

## 1. Missing inherited lifecycle and audit implementation

`docs/verdicts/LP-5A/BUILDER_RECEIPT.md:21,23` states no operation interface/SQL signature is fixed and no migration is produced. `packages/db/src/commands.ts:67,90–95,100` still directly writes receipts/resolutions/authorizations; no CREATE for begin_command or complete_command exists in inherited migration sources.

Before, commands.ts:95:

```ts
      await database.$client.query(`UPDATE app.command_receipt SET status='succeeded',result=$3::jsonb,completed_at=clock_timestamp() WHERE tenant_id=$1 AND command_id=$2`,[context.tenantId,command.commandId,JSON.stringify(result)]);
```

Proposed after: LP-5a delivers its reviewed checked begin/completion, operational resolution, exact authorization/revocation and per-command committed-effect mechanisms with tests and an exact adapter API. LP-5B then reuses those exact signatures. No invented replacement call can be specified before that delivery. All dependent caller conversion is STOPPED.

Before, `packages/db/src/audit.ts:53`:

```ts
    "SELECT sequence::text, event_hash FROM app.lock_audit_head()",
```

Proposed after: LP-4 delivers its trusted checked append/caller/verifier/withdrawal group, with an explicit lock-free completion seam after final audit. No alternate generic attestation or caller-asserted success witness is introduced here.

Before, `docs/contracts/lp-command-binding-design-v1.md:5` (same on main):

```text
**Review record:** *none yet.* (To be filled by the reviewing actor, bound to the exact commit of this file. A builder cannot fill it in.)
```

Proposed after: the actual independent reviewing actor records its exact-commit response; the coordinator supplies the settled interface. The builder never supplies that verdict. Q01 remains missing implementation/review, rather than a repeated request to choose a technical lean.

## 2. Receipt-only facts need the predecessor's narrow contract (Q03)

Before, `packages/db/src/commercial-integrity-application-repository.ts:101–104`:

```ts
      const inserted = await db.$client.query(`INSERT INTO app.command_receipt
        (command_id,tenant_id,command_type,semantic_key,request_hash,status,result,actor_membership_id,completed_at)
        VALUES($1,$2,$3,$4,$5,'succeeded',$6::jsonb,$7,clock_timestamp()) ON CONFLICT DO NOTHING RETURNING command_id`,
      [input.commandId, context.tenantId, commandType, `${jobId}:${input.commandId}`, requestHash, JSON.stringify(result), membershipId]);
```

Before, `packages/db/src/demo-bootstrap.ts:114–116`:

```ts
        `INSERT INTO app.command_receipt(command_id,tenant_id,command_type,semantic_key,request_hash,status,result,actor_membership_id,completed_at)
         VALUES($1,$2,'synthetic_demo.seed',$3,$4,'succeeded',$5::jsonb,$6,transaction_timestamp())
         ON CONFLICT(tenant_id,command_type,semantic_key) DO NOTHING RETURNING command_id`,
```

Proposed after: the authoritative LP-5a implementation supports these exact existing typed facts through checked validation/atomic persistence, or the coordinator issues the exact side-table/schema/role/capability amendment. Preserve feedback ownership/first result and target-restricted seed created/replayed behavior. This is the dispatch's own lean, not a request for a new policy. No generic success JSON or agent-selected side table is supplied.

## 3. Additional replay callers excluded from the draft lane

`packages/db/src/site-extra-repository.ts:234–238`, before:

```ts
   const replay = await withTenant(this.pool, context, db => readReplay(db, tenant, input.commandId));
   if (replay.revision) {
    const same = replay.revision.jobId.toLowerCase() === input.jobId.toLowerCase() && replay.revision.raisingMembershipId.toLowerCase() === actor.membershipId.toLowerCase() && replay.revision.requestHash === requestHash;
    if (!same) throw new SorSiteExtraError("IDEMPOTENCY_CONFLICT");
    return this.storedSor(context, replay.revision.variationId);
```

The earlier receipt/origin replay query is :109–114. Current authority prechecks exist; they are not a checked LP-5a replay transaction. Proposed after: add this exact source path to the conversion lane, then use the actual inherited checked replay interface while retaining authority-first refusals, unchanged pricing/order behavior, immutable first result and all BP properties. No production edit or guessed call is supplied here. The current source is unchanged.

`apps/api/src/job-parties.application.ts:29–30`, before:

```ts
    const previous=await withTenant(this.pool,context,async db=>(await db.$client.query(`SELECT status,result FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2`,[context.tenantId,parsed.data.commandId])).rows[0]);
    if(previous){if(previous.status!=="succeeded"||previous.result.sourceJobId!==sourceJobId||previous.result.sourceBindingId!==parsed.data.expectedBindingId)throw new JobPartiesError("COMMAND_CONFLICT");return jobPartiesImportResultV1.parse(previous.result);}
```

A second replay shortcut is :44–45:

```ts
          const prior=await withTenant(this.pool,context,async db=>(await db.$client.query(`SELECT status,result FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2`,[context.tenantId,parsed.data.commandId])).rows[0]);
          if(prior?.status==="succeeded"&&prior.result.sourceJobId===sourceJobId&&prior.result.sourceBindingId===parsed.data.expectedBindingId)return jobPartiesImportResultV1.parse(prior.result);
```

Proposed after: coordinator grants this exact API path to the conversion lane and provides reviewed checked replay compatibility (including generated expiry handling), preserving current practice/source access and public result/error contracts. Do not add a production bypass or alter existing tests. The API source remains untouched.

## 4. Protected SQL double (Q04, source-inspected; regression NOT RUN)

`apps/api/src/watchdog-registry.test.ts:696–697`, before:

```ts
      if (sql.startsWith("INSERT INTO app.command_receipt")) return [];
      if (sql.startsWith("SELECT request_hash,status,result FROM app.command_receipt")) return [{ request_hash: "different", status: "succeeded", result: { privateOriginal: true } }];
```

Proposed after: coordinator replaces only this SQL modeling with the actual checked-begin conflicting-identity result once LP-5a exists. Preserve typed 409/WatchdogError, identical refusal body, rollback/no commit/no effects. The exact SQL shape is unavailable; this is a conditional hold, not a reproduced failing regression. LP-5B changes no line in this file.

## 5. Existing catalogue and capability prerequisites (Q05)

`packages/db/test/tenancy.integration.test.ts:217`, before:

```ts
      { relname: "command_receipt", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
```

`docs/contracts/lp-0-effective-privileges-v1.json:65` (main:66), before:

```json
"entries":[
```

Proposed after: **no change for this partial piece**, which introduces no table/signature/grant. If actual LP-5a/5b requires a new capability/table, the coordinator alone supplies exact reviewed additions, including both tenancy lists, complete routine/protection facts and inventory disposition, preserving newer main rows. Do not add guessed entries or weaken strict comparisons. `lp-0-grant-freeze.integration.test.ts:80–83` still refuses stale entries and is unchanged. LP-5A's detailed proposals remain precursor work, not an LP-5B license to implement them.

## 6. Inherited duplicate lane blocks shared lint

`config/agent-lane-assignments.json:85` already defines lp-2. `config/lanes/lp-2.json:4`, before:

```json
    "lp-2": {
```

Proposed after: coordinator reconciles those two records into one authorized registration preserving every LP-2 allowed path/receipt. No exact replacement JSON is selected here; neither file belongs to LP-5B. No alternate policy is used to bypass the shared loader. Actual lint refusal and exit are recorded in the receipt.

## 7. Sandbox diagnostic refuses shared wrapper introspection

Exact attempted command (with installed pinned pnpm on PATH):

```sh
~/.local/bin/heavy-slot lp-5b pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/lp-5b-writers.integration.test.ts
```

The required wrapper emitted:

```text
sysctl: sysctl fmt -1 1024 1: Operation not permitted
sysmon request failed with error: sysmond service not found
pgrep: Cannot get process list
```

The wrapper nevertheless launched Vitest; the first tests-first run actually completed with 2 failures (missing inventory) and 3 passes, exit 1. No PostgreSQL was started. The refused introspection command is not retried or worked around; the final test rerun is NOT RUN and belongs to dispatcher/CI. No tool automatic-approval rejection is claimed; these are sandbox/OS diagnostics. Other independently runnable checks are recorded truthfully.

## 8. OpenAPI check cannot open the tsx IPC socket

Command: `pnpm openapi:check` (installed pinned pnpm PATH prefix as recorded in receipt). Exit 1 before document comparison. Exact refusal:

```text
Error: listen EPERM: operation not permitted /var/folders/nh/lx6ycbfd1l937f5qhj0cdvhh0000gn/T/tsx-501/54164.pipe
code: EPERM; errno: -1; syscall: listen
```

No alternate tsx/Node launch, socket location, permission escalation or generated-file edit is attempted. Dispatcher/CI owns the unexecuted comparison. This is a sandbox refusal, not an observed OpenAPI mismatch.
