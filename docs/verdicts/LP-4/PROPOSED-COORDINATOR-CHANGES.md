# LP-4 coordinator prerequisites — unchanged source findings

Observed HEAD `d517116bb73000a92e49d6742ceef830f7aafa56`; main `31682762c903d716657c573e1b5deae63588aad7`. Exact current lines below supersede draft offsets. These are proposals, not permission or performed edits. Header requires STOP on coordinator-owned tests, pins and shared prerequisites. No protected file below was changed.

## STOP Q3/Q4/Q5 — protected tests and reviewed inventory

For every entry, “Before” is the exact current source line. “Proposed after” describes the required semantic replacement; its final SQL spelling depends on the checked-operation design below. No fictitious app.append_audit signature is asserted to exist.

### packages/db/test/site-visit.integration.test.ts

Before `packages/db/test/site-visit.integration.test.ts:471`:

```text
  const fragments = ["INSERT INTO app.command_receipt", kind === "start" ? "app.ent3b_start_visit" : "app.ent3b_complete_visit", "INSERT INTO app.audit_event", "COMMIT"];
```

Before `packages/db/test/site-visit.integration.test.ts:599`:

```text
    if (String(sql).includes("INSERT INTO app.audit_event")) { reached++; throw new Error("injected failure"); }
```

Before `packages/db/test/site-visit.integration.test.ts:610`:

```text
  expect(reached, "the refusal audit append must be reached").toBe(1);
```

Proposed after: Replace only the old audit INSERT fault fragment with the actual protected append call, preserving reached-once, identical refusal, full domain/receipt/head rollback checks.

### packages/db/test/site-extra-pricing.integration.test.ts

Before `packages/db/test/site-extra-pricing.integration.test.ts:457`:

```text
    for (const fragment of ["INSERT INTO app.command_receipt", "INSERT INTO app.variation", "INSERT INTO app.extra_origin", "INSERT INTO app.extra_event", "SELECT app.require_watchdog_live", "SELECT app.ent3a_require_extra_authority", "SELECT app.ent3c_record_sor_revision", "INSERT INTO app.audit_event", "COMMIT"]) {
```

Proposed after: Replace only the audit INSERT fragment with the protected append call; preserve every other fault and persistence check.

### packages/db/test/extra-origin.integration.test.ts

Before `packages/db/test/extra-origin.integration.test.ts:65`:

```text
  for (const fragment of ["INSERT INTO app.command_receipt", "INSERT INTO app.variation", "INSERT INTO app.extra_origin", "INSERT INTO app.extra_event", "INSERT INTO app.audit_event", "COMMIT"]) {
```

Proposed after: Replace only the audit fault boundary; preserve the entire failure matrix and rollback assertions.

### packages/db/test/extra-links.integration.test.ts

Before `packages/db/test/extra-links.integration.test.ts:106`:

```text
  for (const kind of ["link", "unlink", "order"]) for (const fragment of ["INSERT INTO app.command_receipt", kind === "order" ? "INSERT INTO app.extra_order_line_link" : "INSERT INTO app.extra_duplicate_link", "INSERT INTO app.audit_event", "COMMIT"]) {
```

Proposed after: Replace only the audit fault boundary for link, unlink and order; preserve all persistence checks.

### packages/db/test/extra-unlink.integration.test.ts

Before `packages/db/test/extra-unlink.integration.test.ts:336`:

```text
  for (const fragment of ["INSERT INTO app.command_receipt", "INSERT INTO app.extra_duplicate_link", "INSERT INTO app.audit_event", "UPDATE app.command_receipt", "COMMIT"]) {
```

Proposed after: Replace only the audit fault boundary; preserve receipt, link, head and commit failures.

### packages/db/test/contractor-practice-session.integration.test.ts

Before `packages/db/test/contractor-practice-session.integration.test.ts:149`:

```text
 for (const fragment of ["revoke_contractor_practice_session", "INSERT INTO app.audit_event", "COMMIT"]) {
```

Proposed after: Replace only the audit fault boundary; preserve session-version and head rollback checks.

### packages/db/test/practice-facts.integration.test.ts

Before `packages/db/test/practice-facts.integration.test.ts:369`:

```text
      if(property==="query")return (sql:string,values?:unknown[])=>sql.includes("INSERT INTO app.audit_event")?connection.query("SELECT 1/0"):connection.query(sql,values);
```

Before `packages/db/test/practice-facts.integration.test.ts:374`:

```text
  // Fail the actual INSERT INTO app.audit_event; the owner has already been registered.
```

Proposed after: Inject the same PostgreSQL division-by-zero at the real protected append call; retain SQLSTATE 22012 and full rollback.

### packages/db/test/recovery-case-join.test.ts

Before `packages/db/test/recovery-case-join.test.ts:63`:

```text
  expect(sql.at(-2)).toBe("SELECT app.advance_audit_head($1, $2)");
```

Before `packages/db/test/recovery-case-join.test.ts:97`:

```text
it.each(["pg_advisory_xact_lock", "INSERT INTO app.recovery_case_event", "INSERT INTO app.audit_event"])(
```

Proposed after: Expect protected append as the final audit operation; move only the audit failure fragment and retain caller ownership, exact error and immediate-stop assertions.

### packages/db/test/site-extra.integration.test.ts

Before `packages/db/test/site-extra.integration.test.ts:151`:

```text
   expect(rows[0]).toMatchObject({ actor_ref: sample.member === foreign.members.supervisor.member ? "security:unverified-member" : `membership:${sample.member.membershipId}`, subject_type: "extra-command", payload: { references: { command: sample.raw.commandId, command_type: "LogSiteExtra", reason: sample.reason, environment: "synthetic_demo", ...(sample.raw.jobId === f.jobId ? { job: f.jobId } : {}) }, classifications: { action: "security" } } });
```

Before `packages/db/test/site-extra.integration.test.ts:152`:

```text
   expect(Object.keys(rows[0]!.payload.references).sort()).toEqual(["command", "command_type", "environment", "reason", ...(sample.raw.jobId === f.jobId ? ["job"] : [])].sort());
```

Before `packages/db/test/site-extra.integration.test.ts:153`:

```text
  }
```

Before `packages/db/test/site-extra.integration.test.ts:154`:

```text
  await smallTrack(c, f); const raw = input(f); for (let i = 0; i < 3; i++) await refused(f, supervisor, raw, "TRACK_FORBIDDEN");
```

Before `packages/db/test/site-extra.integration.test.ts:155`:

```text
  expect((await c.admin.query("SELECT payload FROM app.audit_event WHERE tenant_id=$1 AND subject_ref=$2 AND event_type='contractor.extra.refused'", [f.p.tenantId, raw.commandId])).rows).toEqual([{ payload: { references: { command: raw.commandId, command_type: "LogSiteExtra", reason: "track_not_contractor", environment: "synthetic_demo", job: f.jobId }, classifications: { action: "security" } } }]);
```

Before `packages/db/test/site-extra.integration.test.ts:163`:

```text
  vi.spyOn(c.runtime, "connect").mockImplementation((async () => { const client = await connect(); if (wrapped.has(client)) return client; wrapped.add(client); const original = client.query.bind(client); vi.spyOn(client, "query").mockImplementation((async (sql: any, params?: any) => { if (String(sql).includes("INSERT INTO app.audit_event")) throw new Error(note); return original(sql, params); }) as any); return client; }) as any);
```

Proposed after: Retain exact refusal content as a legacy contract; separately review new version/trust expectations. Rebind only the failure hook at line 163 to protected append.

### packages/db/test/audit-dbsrc-03.test.ts

Before `packages/db/test/audit-dbsrc-03.test.ts:87`:

```text
        if (sql.includes("INSERT INTO app.audit_event")) {
```

Before `packages/db/test/audit-dbsrc-03.test.ts:118`:

```text
        if (sql.includes("lock_audit_head")) return rows([]);
```

Before `packages/db/test/audit-dbsrc-03.test.ts:120`:

```text
        if (/^(BEGIN|SELECT set_config|INSERT INTO app\.|SELECT app.advance_audit_head)/u.test(sql)) return rows([]);
```

Proposed after: Return actual stored fields from the new append double and move its fault point; preserve all business and refusal checks.

### packages/db/test/purchase-order-audit.test.ts

Before `packages/db/test/purchase-order-audit.test.ts:27`:

```text
        sql.includes("require_watchdog_live") || sql.includes("advance_audit_head")) return result();
```

Before `packages/db/test/purchase-order-audit.test.ts:68`:

```text
    if (sql.includes("lock_audit_head")) return result();
```

Before `packages/db/test/purchase-order-audit.test.ts:70`:

```text
    if (sql.startsWith("INSERT INTO app.audit_event")) { state.audits.push(values); return result(); }
```

Before `packages/db/test/purchase-order-audit.test.ts:151`:

```text
    expect(lock).toBeLessThan(at(q => q.sql.includes("lock_audit_head")));
```

Proposed after: Use a protected-append response double and observe the final audit lock at that boundary; preserve positive/refusal/ordering assertions.

### packages/db/test/audit-api-file-final-account.test.ts

Before `packages/db/test/audit-api-file-final-account.test.ts:88`:

```text
    if (sql.includes("lock_audit_head")) return rows([]);
```

Before `packages/db/test/audit-api-file-final-account.test.ts:90`:

```text
    if (/^(BEGIN|COMMIT|ROLLBACK|SELECT set_config|SELECT pg_advisory_xact_lock|INSERT INTO app.audit_event|INSERT INTO app.stage_review_event|SELECT app.advance_audit_head)/u.test(sql)) return rows([]);
```

Proposed after: Use a protected-append response double, preserving all final-account audit assertions.

### packages/db/src/audit-checkpoint-handoff.test.ts

Before `packages/db/src/audit-checkpoint-handoff.test.ts:80`:

```text
  const lock = queries.findIndex(q => q.sql.includes("app.lock_audit_head()"));
```

Before `packages/db/src/audit-checkpoint-handoff.test.ts:81`:

```text
  expect(queries.slice(lock - 2, lock).map(q => q.sql)).toEqual(["SELECT set_config('app.tenant_id', $1, true)", "SET LOCAL ROLE jobguard_runtime"]);
```

Before `packages/db/src/audit-checkpoint-handoff.test.ts:84`:

```text
  const append = queries.findIndex(q => q.sql.startsWith("INSERT INTO app.audit_event"));
```

Before `packages/db/src/audit-checkpoint-handoff.test.ts:87`:

```text
  expect(append).toBeLessThan(checkpoint); expect(checkpoint).toBeLessThan(copy);
```

Before `packages/db/src/audit-checkpoint-handoff.test.ts:104`:

```text
  expect(operatorEvent[8]).toEqual(new Date("2026-10-11T22:30:00.000Z"));
```

Before `packages/db/src/audit-checkpoint-handoff.test.ts:105`:

```text
  expect(JSON.parse(operatorEvent[9] as string).references).toEqual({ environment: "synthetic_demo", priorSequence: "1", operator: "ben.ops-1", sessionUser: "fixture_owner" });
```

Proposed after: Use the operator credential protected path, read the actual returned stored event, and retain serialization, local settings, timestamp/payload and checkpoint ordering assertions. No runtime head privilege restored.

### packages/db/test/audit-checkpoint-handoff.integration.test.ts

Before `packages/db/test/audit-checkpoint-handoff.integration.test.ts:239`:

```text
    await blocker.query("BEGIN"); await blocker.query("SELECT set_config('app.tenant_id',$1,true)", [a.tenantId]); await blocker.query("SELECT * FROM app.lock_audit_head()");
```

Before `packages/db/test/audit-checkpoint-handoff.integration.test.ts:243`:

```text
      waiting = (await admin.query<{ pid: number }>("SELECT pid FROM pg_stat_activity WHERE usename='fixture_owner' AND wait_event_type='Lock' AND query LIKE '%app.lock_audit_head()%'")).rows.map(r => r.pid);
```

Proposed after: Block the actual protected operator path with appropriate fixture credentials; observe a real lock wait on that path, preserving restricted-control denials.

### docs/contracts/lp-0-effective-privileges-v1.json

Before `docs/contracts/lp-0-effective-privileges-v1.json:129`:

```text
{"key":"acl|rel|table|app.audit_event|jobguard_runtime|INSERT|-","group":"x-audit-event-insert"},
```

Before `docs/contracts/lp-0-effective-privileges-v1.json:519`:

```text
{"key":"acl|routine|function:app.advance_audit_head(bigint,character)|jobguard_runtime|EXECUTE|-","group":"x-audit-head-execute"},
```

Before `docs/contracts/lp-0-effective-privileges-v1.json:563`:

```text
{"key":"acl|routine|function:app.lock_audit_head()|jobguard_runtime|EXECUTE|-","group":"x-audit-head-execute"},
```

Proposed after: Remove these three closed runtime capability entries at cutover. Coordinator also reviews and updates exact owner/function-definition/static-call facts for all changed writers and new paths; no builder-generated approval.

### packages/db/test/lp-0-grant-freeze.integration.test.ts

Before `packages/db/test/lp-0-grant-freeze.integration.test.ts:74`:

```text
    // No stale entries: the only inventory keys absent from a live profile are the OTHER profile's role-login key.
```

Before `packages/db/test/lp-0-grant-freeze.integration.test.ts:80`:

```text
    expect(compareInventory(inventory, baselineMigrationOnly).reductions).toEqual(roleKeys(baselineBootstrapLogin));
```

Before `packages/db/test/lp-0-grant-freeze.integration.test.ts:81`:

```text
    expect(compareInventory(inventory, baselineBootstrapLogin).reductions).toEqual(roleKeys(baselineMigrationOnly));
```

Before `packages/db/test/lp-0-grant-freeze.integration.test.ts:82`:

```text
    expect(staleEntries(compareInventory(inventory, baselineMigrationOnly), roleKeys(baselineBootstrapLogin))).toEqual([]);
```

Before `packages/db/test/lp-0-grant-freeze.integration.test.ts:83`:

```text
    expect(staleEntries(compareInventory(inventory, baselineBootstrapLogin), roleKeys(baselineMigrationOnly))).toEqual([]);
```

Proposed after: UNCHANGED. Supply the reviewed inventory delta so these same stale-entry assertions keep passing; never weaken the checks.

### config/agent-lane-assignments.json

Before `config/agent-lane-assignments.json:85`:

```text
"lp-2":{"branches":["codex/sandbox/lp-2"],"receipt":"docs/verdicts/LP-2/BUILDER_RECEIPT.md","note":"LP-2 server/database/tests only; UI parked. Catch-up on merged LP-1; insertion/adoption enforcement STOPPED on coordinator-owned LP-0 inventory and unresolved fixture prerequisites; tests-first authorization/catalogue/upgrade preparation only. Q5/Q6 review replacement, broad transition withdrawal and actor-less practice-route changes HELD. Full LP-2 acceptance held. C1: no new web workflow. Merged source/tests/pins unchanged; shared registries/exports additive only.","allow":["config/agent-lane-assignments.json","docs/verdicts/LP-2/BUILDER_RECEIPT.md","docs/contracts/least-privilege-job-doors-v1.md","packages/db/migrations/0168_unchecked_job_doors.sql","packages/db/src/migrate.ts","packages/db/MIGRATIONS.md","packages/db/src/index.ts","packages/db/src/lp-job-doors.ts","packages/db/src/sandbox-repository.ts","packages/db/src/demo-bootstrap.ts","packages/db/test/lp-job-doors-fixtures.ts","packages/db/test/lp-job-doors.integration.test.ts","packages/db/test/lp-adoption-boundary.integration.test.ts","packages/db/test/lp-job-doors-compatibility.integration.test.ts","packages/db/test/lp-job-doors-upgrade.integration.test.ts"]},
```

Proposed after: Coordinator reconciles this duplicate legacy LP-2 entry with config/lanes/lp-2.json using decision-35 registration. Preserve the lane scope; builder changes neither file.

## STOP Q6 — checked-operation provenance is absent

`packages/db/src/commands.ts:90–95` still directly inserts approved resolutions and authorizations, calls the business handler, generically appends command.succeeded, then completes the receipt. The file is outside this lane. A generic logger cannot independently establish this result by selecting those writable rows. No reviewed exact checked lifecycle interface is supplied; the design note explicitly has no review record. Decision 74 permits synthetic construction but does not manufacture that review or authorize edits outside the exact lane.

Before `packages/db/src/commands.ts:90`:

```text
      await database.$client.query(`INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id) VALUES($1,$2,$3,'approved',$4)`,[resolutionId,context.tenantId,decisionId,command.actorMembershipId]);
```

Before `packages/db/src/commands.ts:91`:

```text
      await database.$client.query(`INSERT INTO app.action_authorization(id,tenant_id,decision_id,resolution_id,actor_membership_id,action_type,recipient,content_hash,aggregate_revision,amount_pence,currency,policy_version,expires_at)
```

Before `packages/db/src/commands.ts:94`:

```text
      await appendAuditBatch(database,[...(handler.auditEvents?.(result,command)??[]),{id:randomUUID(),version:"audit.v1",actorRef:`membership:${command.actorMembershipId}`,eventType:"command.succeeded",subjectType:command.subjectType,subjectRef:command.subjectRef,payload:{references:{commandId:command.commandId,authorizationId},classifications:{action:"commercial"}}}]);
```

Before `packages/db/src/commands.ts:95`:

```text
      await database.$client.query(`UPDATE app.command_receipt SET status='succeeded',result=$3::jsonb,completed_at=clock_timestamp() WHERE tenant_id=$1 AND command_id=$2`,[context.tenantId,command.commandId,JSON.stringify(result)]);
```

Proposed after: coordinator enumerates the smallest checked-operation integration and its allowed source paths, preserving per-operation permissions, exact authorization and same-transaction committed facts. Keep LP-5 ownership unless an explicit dependency/lane amendment moves its work. Neither a source-row lookup nor a trust flag is an authorized replacement.

## STOP Q8 — compatible deployment group

Before `BUILD_PLAN.md:3315`: LP-4 must land writers/verifier/withdrawal together and preserve C4. Before `packages/db/src/audit.ts:62–65,73`: the preceding caller inserts audit directly and advances the head. Before `packages/db/migrations/0001_audit.sql:89,91`: runtime retains old head EXECUTE and audit INSERT.

Proposed after: coordinator supplies an executable independently checked expand-compatible matrix for old/new callers, owner writers, verifier and withdrawal. Installing a revoke first breaks old writers; installing a caller first has no append routine. A maintenance-only exception or generic trusted fallback is not supplied by dispatch. No rollout or withdrawn privilege is claimed here.

## Predecessor and execution holds

LP-3 receipt records no migration/checked activation conversion. Its protected dependencies and C4 matrix remain absent; this piece assumes only its standalone exact-input code exists, not an installed or accepted cutover. LP-2 also remains partial/parked.

Free disk at the first gate: 44 GB (`df -g /System/Volumes/Data`). Required free disk is over 45 GB: no test, compiler, package lint, build or OpenAPI process was started. PostgreSQL/socket/browser execution is separately disallowed here.

`LANE_BASE_REF=origin/main pnpm lint:lanes` exited 1 before LP-4 validation: duplicate LP-2 registration. No retry via a different loader or modified register was attempted.

## Exact rollout source lines (additional before evidence)

Before `BUILD_PLAN.md:3315`:

```text
**Compatible landing groups and reservations.** At most two LP pieces are open at once; migrations, the lane register and later scanner pins serialize, and LP work counts against the five-open-database-PR cap. LP-1 lands grants/locks/seeds together; LP-2/3 land replacements/callers/old-signature withdrawals together; LP-4 lands writers/verifier/grant withdrawal together; LP-5 converts every caller before revoke; LP-6/10/11 coordinate binding/caller/enforcement cutover; LP-8 converts finance/evidence callers and restore tooling before revoke. No partial group is described as secured. Expand-compatible rollout remains C4; a maintenance cutover cannot silently weaken that decided rule. Scanner definition and source-pin edits remain coordinator-only after Ben's typed yes for that piece; this plan adoption is not that later approval. LP migrations take the next free landing numbers under §12.2, never the proposal's already occupied 0132–0138.
```

Before `packages/db/src/audit.ts:62`:

```text
    const event = { ...input, tenantId, sequence: ++sequence, occurredAt, payloadHash, previousHash };
```

Before `packages/db/src/audit.ts:63`:

```text
    const eventHash = canonicalAuditHash(event);
```

Before `packages/db/src/audit.ts:64`:

```text
    await database.$client.query(
```

Before `packages/db/src/audit.ts:65`:

```text
      `INSERT INTO app.audit_event (id, tenant_id, sequence, version, actor_ref, event_type,
```

Before `packages/db/src/audit.ts:73`:

```text
  }
```

Before `packages/db/migrations/0001_audit.sql:89`:

```text
GRANT EXECUTE ON FUNCTION app.lock_audit_head(), app.advance_audit_head(bigint, char(64)) TO jobguard_runtime;
```

Before `packages/db/migrations/0001_audit.sql:91`:

```text
GRANT SELECT, INSERT ON app.audit_event TO jobguard_runtime;
```

Before `docs/contracts/lp-command-binding-design-v1.md:3`:

```text
**Status:** design preparation required by BUILD_PLAN section 11.8 ("Design and inventory before cutover"), written by the LP-0 builder. **It is not an implementation, not a settled mechanism and not yet independently reviewed.** Independent review of this note must be recorded **before LP-5's interface is fixed and before LP-6a is coded** (LP0-20). Passing the LP-0 catalogue guard says nothing about whether this design is right.
```

Before `docs/contracts/lp-command-binding-design-v1.md:5`:

```text
**Review record:** *none yet.* (To be filled by the reviewing actor, bound to the exact commit of this file. A builder cannot fill it in.)
```

Before `docs/contracts/lp-command-binding-design-v1.md:7`:

```text
**What this decides:** nothing. Where a choice is open it is listed under "Unresolved decisions" and stays open. No fee, tax, owner-creation/removal, safety or revocation policy is proposed or changed.
```

Proposed after remains the checked, independently reviewed compatible matrix and enumerated lifecycle integration above. Existing immutable history is never rewritten.
