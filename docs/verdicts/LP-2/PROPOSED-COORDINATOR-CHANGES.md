# LP-2 proposed coordinator changes

Prepared 16 October 2026 against `origin/main` `31682762c903d716657c573e1b5deae63588aad7`. **PROPOSED, not applied, not approved.** These are coordinator-owned setup/catalogue changes under decision 51. Every existing assertion must remain byte-identical. No builder test exemption or restored runtime grant is proposed.

## Item 1: packages/db/test/migfix-4.integration.test.ts:24

Before (inside the runtime transaction):

```ts
    await db.$client.query("INSERT INTO app.job(tenant_id,id,title,status) VALUES($1,$2,'Fictional quote','quoting')", [tenant, job]);
```

Proposed after: move **only this setup statement** to a preceding owner-connected tenant transaction; keep the following scope statements in their existing runtime transaction:

```ts
  await withTenant(c.admin, context, async db => {
    await db.$client.query("INSERT INTO app.job(tenant_id,id,title,status) VALUES($1,$2,'Fictional quote','quoting')", [tenant, job]);
  });
  await withTenant(c.runtime, context, async db => {
    // Existing scope setup follows here, unchanged.
```

The matching runtime job INSERT is removed from that original setup block by the coordinator. The owner transaction prepares the identical tenant, ID, title, quoting status and revision zero. Quote operations, rollback/race observations and every assertion stay exactly as merged. This does not change any application credential. All tests using `issued()` in this file depend on this conversion after migration 0195.

## Item 2: packages/db/test/quote-reacceptance-upgrade.integration.test.ts:25

Before (inside the runtime transaction):

```ts
    await db.$client.query("INSERT INTO app.job(tenant_id,id,title,status) VALUES($1,$2,'Fictional quote','quoting')", [tenant, job]);
```

Proposed after: move **only this setup statement** to a preceding owner-connected tenant transaction; keep the following scope statements in their existing runtime transaction:

```ts
  await withTenant(c.admin, context, async db => {
    await db.$client.query("INSERT INTO app.job(tenant_id,id,title,status) VALUES($1,$2,'Fictional quote','quoting')", [tenant, job]);
  });
  await withTenant(c.runtime, context, async db => {
    // Existing scope setup follows here, unchanged.
```

The matching runtime job INSERT is removed from that original setup block by the coordinator. The owner transaction prepares the identical tenant, ID, title, quoting status and revision zero. Quote operations, rollback/race observations and every assertion stay exactly as merged. This does not change any application credential. All tests using `issued()` in this file depend on this conversion after migration 0195.

## Item 3: packages/db/test/small-builder-origin.integration.test.ts:156

Before (already owner-connected):

```ts
    await db.query("INSERT INTO app.job(id,tenant_id,title,status,practice_session_digest,practice_scenario,provenance,accepted_net_value_pence,fee_policy_version,recovery_cap_pence) VALUES($1,$2,'Fictional No charge practice job','live',$3,'capture','imported',10000,'reference_fee_policy_v1',150)",[job,DEMO_TENANT_ID,auth.digest]);
```

Proposed after: retain that exact INSERT, preceded by this owner-only fixture setup in the SAME `asTenant` transaction. This explicitly authorizes its exact initial shape; shared ownership alone is insufficient. It preserves live status, revision zero, capture ownership, imported provenance, v1 net 10000 and cap 150, and the following pilot track binding. It does not create a generic runtime helper.

```ts
    const fixtureCommand = randomUUID(), fixtureDecision = randomUUID();
    const fixtureResolution = randomUUID(), fixtureAuthorization = randomUUID();
    await db.query(`INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,actor_membership_id)
      VALUES($1,$2,'job.adopt_in_flight',$3,$4,'processing',$5)`,
      [DEMO_TENANT_ID,fixtureCommand,`import:${job}`,"a".repeat(64),DEMO_MEMBERSHIP_ID]);
    await db.query(`INSERT INTO app.decision(tenant_id,id,subject_type,subject_ref,action_type)
      VALUES($1,$2,'job',$3,'job.adopt_in_flight')`,[DEMO_TENANT_ID,fixtureDecision,job]);
    await db.query(`INSERT INTO app.decision_resolution(tenant_id,id,decision_id,resolution,actor_membership_id)
      VALUES($1,$2,$3,'approved',$4)`,[DEMO_TENANT_ID,fixtureResolution,fixtureDecision,DEMO_MEMBERSHIP_ID]);
    await db.query(`INSERT INTO app.action_authorization(tenant_id,id,decision_id,resolution_id,actor_membership_id,
      action_type,recipient,content_hash,aggregate_revision,amount_pence,currency,policy_version,expires_at)
      VALUES($1,$2,$3,$4,$5,'job.adopt_in_flight',NULL,$6,0,10000,'GBP','synthetic_import_terms_candidate.v1',clock_timestamp()+interval '5 minutes')`,
      [DEMO_TENANT_ID,fixtureAuthorization,fixtureDecision,fixtureResolution,DEMO_MEMBERSHIP_ID,"a".repeat(64)]);
    await db.query(`INSERT INTO app.lp_job_insert_permit(tenant_id,job_id,backend_pid,transaction_id,operation,
      insert_shape,actor_membership_id,command_id,authorization_id)
      VALUES($1,$2,pg_backend_pid(),pg_current_xact_id(),'adoption',
       app.lp_job_insert_shape(jsonb_populate_record(NULL::app.job,jsonb_build_object(
        'tenant_id',$1::uuid,'id',$2::uuid,'title','Fictional No charge practice job','status','live','revision',0,
        'practice_session_digest',$3::text,'practice_scenario','capture','provenance','imported',
        'accepted_net_value_pence',10000,'fee_policy_version','reference_fee_policy_v1','recovery_cap_pence',150))),$4,$5,$6)`,
      [DEMO_TENANT_ID,job,auth.digest,DEMO_MEMBERSHIP_ID,fixtureCommand,fixtureAuthorization]);
    await db.query("INSERT INTO app.job(id,tenant_id,title,status,practice_session_digest,practice_scenario,provenance,accepted_net_value_pence,fee_policy_version,recovery_cap_pence) VALUES($1,$2,'Fictional No charge practice job','live',$3,'capture','imported',10000,'reference_fee_policy_v1',150)",[job,DEMO_TENANT_ID,auth.digest]);
    await db.query(`UPDATE app.command_receipt SET status='succeeded',result='{}',completed_at=clock_timestamp()
      WHERE tenant_id=$1 AND command_id=$2`,[DEMO_TENANT_ID,fixtureCommand]);
```

This is an explicit synthetic owner fixture, not product adoption and not a new product permission. The original fixture has no imported baseline and this proposal does not invent one or change the original assertions. If the coordinator instead requires full product adoption, its current signature cannot preserve this row's revision-zero/practice ownership shape (it creates an unowned revision-one imported job); that requires a separately reviewed fixture design, never relaxed assertions. The exact test is `the existing application propose action works on a No charge (pilot_no_charge) practice job`.


Exact merged declarations in `migfix-4.integration.test.ts` (unchanged):

```text
89: it("[MIGFIX-4.1] supersession invalidates pending acceptance", async () => {
98: it("[MIGFIX-4.2] superseded document cannot be accepted with a fresh revision", async () => {
104: it("[MIGFIX-4.3] acceptance and supersession serialize on the job", async () => {
142: it("[MIGFIX-4.4] issued unsuperseded control accepts once and original command replays without duplicate effects", async () => {
163: it("[MIGFIX-4.4] supersession original command replays without a second event or revision", async () => {
167: it("[MIGFIX-4.exact] exact document hash, version, total, issue record and live baseline refusals remain", async () => {
194: it("[MIGFIX-4.authority] routine authority is checked before unknown, foreign, quoting, accepted or live job state", async () => {
```


Exact merged declarations in `quote-reacceptance-upgrade.integration.test.ts` (unchanged):

```text
82: it("keeps old acceptance rows byte for byte and then accepts the same document again as sequence 2", async () => {
```


Exact merged declarations in `small-builder-origin.integration.test.ts` (unchanged):

```text
53: it("writes one full command origin, replays unchanged, conflicts on changed payload and races safely",async()=>{
68: it("rejects revoked membership and rolls capture/origin/receipt back if audit append fails",async()=>{
78: it("the existing application propose action issues LogBuilderExtra, with price, and replays",async()=>{
113: it("a runtime capture needs no row lock on app.job, and concurrent captures on one job both commit",async()=>{
124: it("logs an extra on a job started with the default No charge practice scenario (pilot_no_charge)",async()=>{
145: it("the existing application propose action works on a No charge (pilot_no_charge) practice job",async()=>{
168: it("uniformly refuses runtime signal-id probes before any FK lookup",async()=>{
174: it("enforces source only for catches and tenant/job-qualified references without adding future commands",async()=>{
195: it("appends withdrawal while retaining capture identity and denies deletion of both",async()=>{
203: it("upgrades seeded SH-1 backfill with no second backfill and preserves exact labels and counts",async()=>{
```


## Item 4: legacy lane duplicate (registration prerequisite)

`config/agent-lane-assignments.json:85` already registers `lp-2`. Before: its complete one-line entry is unchanged on this branch. Proposed after: coordinator retires that legacy entry when adopting `config/lanes/lp-2.json`, whose exact allow list contains the required old LP-2 paths plus round-3 paths. Do not edit the loader's checks. `tools/agent-lane-boundary-lint.mjs:65` correctly refuses a duplicate (`lane ... is already registered ...; a lane file cannot replace it`). The builder leaves both reviewable and reports lint red; no alternate lane/base is used. No other lane may change.

## Item 5: LP-0 pinned inventory and merged capability demonstrations

Keep the existing tests and inventory untouched until the coordinator supplies their complete reviewed delta. At `docs/contracts/lp-0-effective-privileges-v1.json:517`, before is the thirteen-argument adoption runtime EXECUTE key; proposed after removes that now-withdrawn key. At :553 before is PUBLIC EXECUTE on `guard_imported_job()`; proposed after removes it. At :628 before is runtime EXECUTE on `transition_job(...)`; proposed after removes it. Exact lines are reproduced below. Add ownership/type/RLS/trigger facts for the private permit and four helpers, and the two narrow runtime entry points, with LP-2/LP-6 dispositions. Existing protection records change for the guard, adoption, work-order/home writers and four restricted practice routes. No source digest can be described as reviewed by the builder.

This affects `[LP0-02] installed base matches reviewed capabilities`, `[LP0-17] every reachable authority path has a disposition` and the existing runtime-capability demonstration `reports existing exceptions truthfully: the real runtime login can do these things today` at `packages/db/test/lp-0-authority-paths.integration.test.ts:227`. That demonstration uses the exact capabilities this piece withdraws. The coordinator must retain its backstop assertions under explicitly authorized fixture setup and add runtime refusal coverage, rather than re-grant the routes. No such merged change is applied here.


Before :517:

```json
{"key":"acl|routine|function:app.adopt_in_flight_job(uuid,uuid,uuid,character varying,character varying,character,character varying,bigint,bigint,character varying,character varying,uuid,timestamp with time zone)|jobguard_runtime|EXECUTE|-","group":"a-exec-job-parties-work-orders"},
```

Proposed after: no ACL key for the withdrawn privilege.


Before :553:

```json
{"key":"acl|routine|function:app.guard_imported_job()|PUBLIC|EXECUTE|-","group":"a-public-trigger-and-pure-functions"},
```

Proposed after: no ACL key for the withdrawn privilege.


Before :628:

```json
{"key":"acl|routine|function:app.transition_job(uuid,uuid,integer,character varying,character varying,uuid,bigint,character varying,bigint)|jobguard_runtime|EXECUTE|-","group":"x-exec-transition-job"},
```

Proposed after: no ACL key for the withdrawn privilege.


## Item 6: further compatibility prerequisites, source-inspected only

The three requested sites are not exhaustive. `small-builder-origin.integration.test.ts:90` also inserts an imported owned live row without a permit; coordinator supplies the same exact owner-capability recipe with the SELECT's existing title/scenario, preserving every assertion. Existing positive practice suites targeting `postgres` need the Q4 trusted-database fixture conversion. Broad transition calls require the Q3 owner fixture conversion, including the command/race fixtures that must retain mutations inside their observed transaction (a separate owner transaction would weaken them).

The original issued order's Q3/Q4 list remains required, not silently discharged. The unchanged shared fixture `packages/db/test/evidence-pack-fixture.ts:34` already receives an owner Pool in LP-2's own upgrade proof, so that invocation needs no conversion. `packages/db/src/demo-seed.ts:83` is also explicitly owner-connected; no conversion is needed there. Additional ordinary runtime quoting setup is still present at `packages/db/test/quote.integration.test.ts:4`, and tagged home setup at `packages/db/test/practice-session.integration.test.ts:288` requires an exact owner fixture permit. Do not change any of these merged files under this piece.

Reviewed expand-compatible rollout evidence remains absent. The prepared document is `docs/operations/lp-2-rollout-evidence.md`; it does not approve or execute a rollout. Decision 74 requires PARK after RED review.

Exact additional STOP, `packages/db/test/lp-0-authority-paths.integration.test.ts:247`:

Before:

```ts
      await expect(runtime.query("SELECT app.transition_job(NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL)")).rejects.not.toMatchObject({ code: "42501" });
```

Proposed after (coordinator-owned change reflecting the withdrawn privilege; never applied by this builder):

```ts
      await expect(runtime.query("SELECT app.transition_job(NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL)")).rejects.toMatchObject({ code: "42501" });
```

This existing capability assertion cannot remain true once LP-2 withdraws the privilege. The coordinator owns the changed expectation and its exact decision record. The builder does not restore access to make it pass.
