# LP-5A coordinator prerequisites — no edits made to these lines

Source-inspected on HEAD d5ccbb7b08e29071e0a82184cfda1390d3e67fac; main observed at 4c407a6c81bd714a6875b7adf995812381d0fe57. The build-ahead override permits preparation on the incomplete predecessor. It does not authorize changing protected tests, expected-value inventories or predecessor files. The candidate codec does not work around any stopped assertion. These are proposals for the coordinator, not approved patches or independent findings.

## 1. Missing checked audit prerequisite

`packages/db/src/audit.ts:44,53` still implements the application-side writer and calls the old audit-head lock. `docs/verdicts/LP-4/BUILDER_RECEIPT.md` explicitly records no app.append_audit or trusted checked append implementation. LP-3's receipt likewise records no checked v1 replacement. No checked audit signature can be integrated from this base.

Before, audit.ts:53:

```ts
    "SELECT sequence::text, event_hash FROM app.lock_audit_head()",
```

Proposed after: the predecessor delivers its complete reviewed checked append/caller/verifier/withdrawal group and an exact trusted-completion integration seam. LP-5A then uses the actual reviewed signature and checks committed effects. No fabricated SQL signature or generic trusted statement is proposed. This predecessor-owned item is stopped here. No LP-4 file is changed.

## 2. Independent interface review is absent

`docs/contracts/lp-command-binding-design-v1.md:5`, identical on main:

```text
**Review record:** *none yet.* (To be filled by the reviewing actor, bound to the exact commit of this file. A builder cannot fill it in.)
```

Proposed after: the independent reviewing actor records its real exact-commit design verdict; the coordinator incorporates its concrete signatures, per-command completion proofs and authorization-use stages. The user resolves technical leans for reversible preparation; no builder-created verdict or accepted interface is inferred. The complete external founder packet was not found in this tree. Applicable supplied leans govern preparation; no missing product authority was reconstructed.

## 3. Two protected tenancy catalogue lists need additive rows

`packages/db/test/tenancy.integration.test.ts:217` (also main:217). Before:

```ts
      { relname: "command_receipt", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
```

Proposed after (coordinator only):

```ts
      { relname: "command_authorization_use", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "command_lifecycle_binding", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "command_receipt", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
```

The draft omitted the second protected owner list. `packages/db/test/tenancy.integration.test.ts:476` (main:481). Before:

```ts
      { relname: "command_receipt", owner: "jobguard_migration" },
```

Proposed after, subject to actual independently reviewed ownership (coordinator only):

```ts
      { relname: "command_authorization_use", owner: "jobguard_migration" },
      { relname: "command_lifecycle_binding", owner: "jobguard_migration" },
      { relname: "command_receipt", owner: "jobguard_migration" },
```

Keep every old row/assertion unchanged. Main adds MON-1B meter rows later in both lists relative to this inherited base; main wins. Do not overwrite those additions. The builder added neither tables nor any catalogue exception.

## 4. Protected LP-0 capability inventory

`docs/contracts/lp-0-effective-privileges-v1.json:65` (main:66). Before:

```json
"entries":[
```

Proposed after: preserve the line and all existing entries; coordinator supplies an exact reviewed additive capability group/entries and recorded routine/policy/trigger facts for the final SQL delta. The draft candidate entry keys include:

```text
acl|rel|table|app.command_authorization_use|jobguard_runtime|SELECT|-
acl|rel|table|app.command_lifecycle_binding|jobguard_runtime|SELECT|-
acl|routine|function:app.begin_command(uuid,uuid,jsonb,jsonb)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.complete_command(uuid,uuid,uuid,jsonb)|jobguard_runtime|EXECUTE|-
owner|rel:table|app.command_authorization_use|jobguard_migration
owner|rel:table|app.command_lifecycle_binding|jobguard_migration
```

These are unapproved candidates, not a complete serialized amendment: owner/routine/helper/policy/trigger definitions depend on the independently reviewed design. Do not invent their digests from source or learn accepted values from live output. Main's additional MON-1B entries must be preserved. `packages/db/test/lp-0-authority-paths.integration.test.ts:198` requires exact recorded routine identity equality, including private helpers; changing only ACL entries is insufficient. `lp-0-grant-freeze.integration.test.ts:74–83` still rejects stale entries; neither guard is changed.

`docs/contracts/lp-0-effective-privileges-v1.json:1215` (main:1230), before: the `ap-command-receipts` description says the application inserts/updates authority rows. Proposed after: add the exact reviewed checked dispatcher path while retaining `x-command-authority-writes` until LP-5b/5c actually close every remaining direct writer. No baseline or companion markdown is edited here.

## 5. Protected mutation-free command fixture

`packages/db/test/commands.integration.test.ts:41–45`, identical on main. Before:

```ts
  const dispatcher=new UserCommandDispatcher(runtime), locking={mutate:async(d:any)=>{await d.$client.query("SELECT id FROM app.job WHERE tenant_id=$1 AND id=$2",[TENANT,JOB]);await d.$client.query("SELECT pg_sleep(0.05)");return{locked:JOB}}};
  await expect(Promise.all([
   dispatcher.dispatch(context,command("87000000-0000-4000-8000-000000000010",{commandType:"synthetic.lock",semanticKey:"lock:a"}),locking),
   dispatcher.dispatch(context,command("87000000-0000-4000-8000-000000000011",{commandType:"synthetic.lock",semanticKey:"lock:b"}),locking),
  ])).resolves.toEqual([{locked:JOB},{locked:JOB}]);
```

Proposed after: retain the two-connection contention/no-deadlock guarantee, but use a real finite supported command with distinct checked persisted effects and its original atomic-result assertion. The coordinator must supply exact fixture code after review fixes the lifecycle interface. No exact replacement is claimed to be known; registering synthetic.lock or allowing arbitrary mutation-free callbacks is forbidden. This conversion is stopped; the merged test is unchanged.

## 6. Protected SQL doubles

`packages/db/test/purchase-order-audit.test.ts:56–65,71`, identical on main. Before:

```ts
    if (sql.startsWith("INSERT INTO app.command_receipt")) {
      if (state.receipts.some(r => r.command_id === values[0] || r.semantic_key === values[3])) return result();
      state.receipts.push({ command_id: values[0], semantic_key: values[3], request_hash: values[4] }); return result([{}]);
    }
    if (sql.startsWith("SELECT request_hash,status,result")) return result(state.receipts.filter(r => r.command_id === values[1] || r.semantic_key === values[3]));
    if (sql.startsWith("UPDATE app.command_receipt")) {
      Object.assign(state.receipts.find(r => r.command_id === values[1]), { status: "succeeded", result: JSON.parse(values[2]) }); return result();
    }
    if (sql.startsWith("INSERT INTO app.decision")) return result();
    if (sql.startsWith("INSERT INTO app.action_authorization")) { state.authorizations.push(values); return result(); }
```
```ts
    throw new Error(`Unexpected query: ${sql}`);
```

Proposed after: coordinator replaces only the direct-write modeling with the reviewed begin/complete calls and durable receipt/approval semantics. Preserve purchase-order placement, replay, exact effect counts and lock-order assertions. No production direct-write fallback or mock-specific behavior is permissible. Exact adapter code depends on the approved interface and is not invented here.

`packages/db/test/audit-api-capture.test.ts:40–47,146–149`, identical on main. Before:

```ts
    if (sql.includes("INSERT INTO app.command_receipt")) {
      if (this.receipt) return rows([]);
      this.receipt = { request_hash: values[4] as string, status: "processing" };
      return rows([{ command_id: values[0] }]);
    }
    if (sql.includes("SELECT request_hash,status,result")) return rows(this.receipt ? [this.receipt] : []);
    if (sql.includes("UPDATE app.command_receipt")) {
      this.receipt!.status = "succeeded"; this.receipt!.result = JSON.parse(values[2] as string); return rows([]);
```
```ts
    for (const table of ["command_receipt", "action_authorization", "audit_event", "scope_revision"]) {
      // The duplicate receipt INSERT is an attempted claim; only one claim succeeds.
      if (table === "command_receipt") expect(db.receipt?.status).toBe("succeeded");
      else expect(db.inserts(table)).toHaveLength(1);
```

Proposed after: coordinator models checked lifecycle outcomes instead of requiring application authority INSERT text. Preserve first-result/lost-response replay and exactly one scope/business effect, authorization and trusted audit. No altered original assertion or test-only production branch is supplied.

`packages/db/test/audit-dbsrc-01.test.ts:22–28`, identical on main. Before:

```ts
    if (sql.includes("FROM app.membership")) {
      // The synthetic owner has expired since the context was obtained.
      const checksExpiry = /expires_at\s*>\s*clock_timestamp\(\)/u.test(sql);
      return { rows: checksExpiry ? [] : [{ "?column?": 1 }], rowCount: checksExpiry ? 0 : 1 };
    }
    if (sql.includes("FROM app.job_finding")) return { rows: [{ id: decisionId }], rowCount: 1 };
    return { rows: [], rowCount: 1 };
```

Proposed after: coordinator models the checked routine's expired-member refusal, retaining the exact FORBIDDEN, no-resolution, no-audit, rollback/no-commit and release assertions at :37–42. Exact checked-routine adapter shape remains dependent on the real interface.

## 7. Inherited transition fixture conflict

`packages/db/test/commands.integration.test.ts:29,91`, identical on main. Before:

```ts
const transition={mutate:async(d:any)=>{const row=(await d.$client.query(`SELECT * FROM app.transition_job($1,$2,1,'live','switch_live',$3,10000,'pilot-no-charge-v1',0)`,[TENANT,JOB,QUOTE])).rows[0];return{jobId:JOB,revision:row.revision,status:row.status}}};
```
```ts
  const switching={mutate:async(d:any)=>{const row=(await d.$client.query(`SELECT * FROM app.transition_job($1,$2,1,'live','switch_live',$3,10000,'pilot-no-charge-v1',0)`,[TENANT,job,quote])).rows[0];return{jobId:job,revision:row.revision,status:row.status}}};
```

Proposed after: LP-2/coordinator converts setup/execution to its approved checked product operation or separated fixture role, preserving lifecycle/concurrency and the observed job-before-audit lock assertions at :95–100; separately prove runtime refusal of transition_job. Do not reopen EXECUTE. The current LP-2 build-ahead receipt documents a partial implementation; this prerequisite is not presumed resolved by its commit title.

## 8. Inherited lane collision — actual lint refusal

`config/agent-lane-assignments.json:85` holds an lp-2 entry, while `config/lanes/lp-2.json:4` also defines it. Before at the per-piece file:

```json
    "lp-2": {
```

Before at the legacy file (exact complete line):

```json
"lp-2":{"branches":["codex/sandbox/lp-2"],"receipt":"docs/verdicts/LP-2/BUILDER_RECEIPT.md","note":"LP-2 server/database/tests only; UI parked. Catch-up on merged LP-1; insertion/adoption enforcement STOPPED on coordinator-owned LP-0 inventory and unresolved fixture prerequisites; tests-first authorization/catalogue/upgrade preparation only. Q5/Q6 review replacement, broad transition withdrawal and actor-less practice-route changes HELD. Full LP-2 acceptance held. C1: no new web workflow. Merged source/tests/pins unchanged; shared registries/exports additive only.","allow":["config/agent-lane-assignments.json","docs/verdicts/LP-2/BUILDER_RECEIPT.md","docs/contracts/least-privilege-job-doors-v1.md","packages/db/migrations/0168_unchecked_job_doors.sql","packages/db/src/migrate.ts","packages/db/MIGRATIONS.md","packages/db/src/index.ts","packages/db/src/lp-job-doors.ts","packages/db/src/sandbox-repository.ts","packages/db/src/demo-bootstrap.ts","packages/db/test/lp-job-doors-fixtures.ts","packages/db/test/lp-job-doors.integration.test.ts","packages/db/test/lp-adoption-boundary.integration.test.ts","packages/db/test/lp-job-doors-compatibility.integration.test.ts","packages/db/test/lp-job-doors-upgrade.integration.test.ts"]},
```

Proposed after: coordinator reconciles the existing registration into exactly one authorized record, preserving the complete LP-2 allowed paths and receipt. No legacy/shared/predecessor record is modified here, and the loader is not bypassed.

Actual command (exit 1): PATH prefix for pinned cached pnpm followed by `LANE_BASE_REF=origin/main pnpm lint:lanes`.

```text
Lane boundary FAILED: Lane file "config/lanes/lp-2.json" refused: lane "lp-2" is already registered in config/agent-lane-assignments.json; a lane file cannot replace it.
```

MERGE-CHURN-1 machinery now exists; draft Q3's absence claim is obsolete. This registration conflict is the actual observed blocker. No retry through another lane configuration was attempted.

## 9. Execution gate

`df -g /System/Volumes/Data` exited 0 and reported 44 GB available; dispatch requires over 45 GB. `memory_pressure | tail -1` exited 0 with 80% free. No heavy unit/typecheck/lint/build/openapi run started after the disk gate. PostgreSQL/socket/browser work is separately unavailable by dispatch. No packages were installed or downloaded. These are NOT RUN, not passes. No automatic permission review rejection occurred.
