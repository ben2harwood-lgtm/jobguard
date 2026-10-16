# SERIOUS-B5 #229 — Test Q setup proposal (draft only)

Dispatcher 14, 16 October 2026. Source-inspected HEAD `fbea5f7094ea002f05c97bdac0068d930559c94f`; supplied `origin/main` `d74fd66d684226a5150fe3d3576a853d58abcf31`. This file proposes a repair; it does not apply it, record an independent verdict, or accept the task. Test Q and all implementation/test files remain unchanged.

Ruling 63, `/Users/benharwood/.local/share/full-steam/handoffs/BEN-DECISIONS-2026-10-14.md:85`, says:

> 63. COORDINATOR RULING (16 Oct ~20:35, under 51: test set-up; precedent decision 31): SERIOUS-B5 #229 — shadow-isolation.application.test.ts Test Q creates final-account revision 2 = baseline + the approved 12,000p extra before line 358 and locks/invoices revision 2 (112,000/22,400/134,400p); every existing assertion unchanged; both checkers confirm only set-up moved and no assertion compares old totals. YES.

The r3 STOP correctly identified a false assumption about revision 1: current line 339 already appends a **0p placeholder variation**, so copying every line and then appending the real tap would duplicate its source. The smallest correction consistent with ruling 63 has four edit sites, all inside the mutation Test Q (`apps/api/src/shadow-isolation.application.test.ts:285–408`): remove line 339; insert one local revision-2 fixture block after current line 358; change the lock input at current line 359; change the invoice input at current line 366. Preserve the actual approval, both unpriced captures, and every existing assertion. No shared fixture, schema, guard, production assembler or invoice path changes are proposed.

## Exact current lines

Line numbers below refer to the inspected HEAD, before any hypothetical edits. The following are verbatim source lines (number prefixes are documentary):

```ts
333:    const price={quantity:"1",unit:"item",unitRatePence:12000,direction:"addition"};
334:    const extra={version:"variation-command.v1",action:"propose",proposalId:randomUUID(),scopeItemId:randomUUID(),existingScopeItemId:null,lineageParentScopeItemId:null,description:"Fictional captured tap",captureText:"Fictional captured tap",price};
335:    const proposed=await success("Log an extra: priced",()=>app.variation.command(a.jobId,extra));
336:    await success("Log an extra: retry",()=>app.variation.command(a.jobId,extra));
337:    const revision=proposed.variations.find((v:any)=>v.id===extra.proposalId).currentRevisionId;
338:    await success("approve captured extra",()=>app.variation.command(a.jobId,{version:"variation-command.v1",action:"approve",variationId:extra.proposalId,revisionId:revision,approvalId:randomUUID(),attestation:"Builder-recorded practice acceptance — not an authenticated customer signature"}));
339:    await inspect.query("INSERT INTO app.final_account_line(id,tenant_id,job_id,final_account_revision_id,line_kind,source_id,scope_item_id,commercial_revision_id,approval_id,description,net_pence,ordinal) SELECT gen_random_uuid(),r.tenant_id,r.job_id,$3,'variation',r.id,v.scope_item_id,r.id,ap.id,'Fictional approved extra',0,2 FROM app.variation v JOIN app.variation_revision r ON(r.tenant_id,r.id)=(v.tenant_id,v.current_revision_id) JOIN app.variation_approval ap ON(ap.tenant_id,ap.revision_id)=(r.tenant_id,r.id) WHERE v.tenant_id=$1 AND v.id=$2",[DEMO_TENANT_ID,extra.proposalId,a.revisionId]); // MIGFIX-5: the account must carry the approved variation, or the lock guard refuses it as stale
358:    await success("proof complete",()=>app.proof.command(a.jobId,{version:"practice-proof-command.v1",action:"complete",commandId:randomUUID(),scopeItemId:proofScope,evidenceId:verified.upload.evidenceId}));
359:    await success("final-account lock",()=>app.finalAccountLock.lock(a.jobId,{version:"final-account.lock.v1",commandId:randomUUID(),finalAccountRevisionId:a.revisionId,expectedRevision:1,declarationVersion:"final_account_declaration.v1"}));
366:    await success("issue customer invoice",()=>app.customerInvoice.issue(a.jobId,{version:"practice-customer-invoice.issue.v1",commandId:randomUUID(),finalAccountRevisionId:a.revisionId,expectedSourceHash:"a".repeat(64),recipient:"fixture@example.invalid",issuedOn:"2026-10-13"}));
```

The baseline originates at Test Q line 289, `const initial=pool("postgres","sv3_isolation_zero"),a=await seedAccount(initial,DEMO_TENANT_ID,100000);` (with the source line's leading space). `seedAccount` at `packages/db/test/final-account-lock.integration.test.ts:40–59` inserts revision 1, source hash `"a".repeat(64)`, and one baseline line. Immediately before the current lock, its lines are:

| Ordinal | Kind | Description | Signed net pence | Source / commercial revision | Scope | Approval |
| --- | --- | --- | ---: | --- | --- | --- |
| 1 | baseline | `Fictional baseline` | +100,000 | `a.baselineId` / `a.baselineId` | `a.scopeItemId` | null |
| 2 | variation | `Fictional approved extra` | 0 | `revision` / `revision` | `extra.scopeItemId` | the immutable approval created at line 338 |

Current header: **100,000p net / 20,000p tax / 120,000p total**, GBP, `candidate_m1_standard_v1`. The line sum remains 100,000p only because the inserted variation is zero. The real approved variation is **`Fictional captured tap`, +12,000p** (one item at 12,000p, direction `addition`). Revision 1 therefore fails the new source comparison despite carrying the correct source identities. Replacing only the two literals at line 339 would make its lines total 112,000p while its immutable header still says 100,000p net; it would not produce a consistent locked account/invoice. A successor revision is necessary under ruling 63 and the immutable-history contract.

## Exact proposed lines (unapplied)

**1. Delete current line 339 in full.** No replacement insert into revision 1. The pre-existing revision and its baseline, money, hash and findings remain intact. This removes a test setup statement from the proposed source, not a stored commercial row through a DELETE or an immutability bypass.

**2. Insert the following block immediately after current line 358 and before current line 359.** Use the existing `inspect` pool, verified test tenant context, deterministic UUID mock and fixed clocks. The pure core assembler computes the canonical source hash and exact totals; the local fixture transaction inserts the successor, its lines and existing proof, then advances the draft. It does not call the production database assembler, whose `quote_document_version` / `quote_line` baseline is absent from this legacy `quote_version` fixture.

```ts
   const {assembleDraftFinalAccount}=await import("@jobguard/core");
   const rebuilt=await withTenant(inspect,testTenantContext(DEMO_TENANT_ID),async(db:{$client:PoolClient})=>{
    const lines=(await db.$client.query(`
     SELECT line_kind kind,source_id "sourceId",scope_item_id "scopeItemId",commercial_revision_id "commercialRevisionId",approval_id "approvalId",description,net_pence "netPence"
     FROM app.final_account_line WHERE tenant_id=$1 AND job_id=$2 AND final_account_revision_id=$3 AND line_kind='baseline'
     UNION ALL
     SELECT 'variation',r.id,r.scope_item_id,r.id,ap.id,r.description,r.signed_delta_pence
     FROM app.variation_revision r JOIN app.variation_approval ap ON(ap.tenant_id,ap.job_id,ap.revision_id)=(r.tenant_id,r.job_id,r.id)
     WHERE r.tenant_id=$1 AND r.job_id=$2 AND r.id=$4 AND ap.variation_id=$5`,[DEMO_TENANT_ID,a.jobId,a.revisionId,revision,extra.proposalId])).rows
     .map((line:any)=>({...line,netPence:Number(line.netPence)})) as import("@jobguard/core").FinalAccountSourceLine[];
    const proof=(await db.$client.query(`SELECT evidence_id "evidenceId",object_version_id "objectVersionId",scope_item_id "scopeItemId",evidence_type "evidenceType",sha256,mandatory
     FROM app.final_account_proof WHERE tenant_id=$1 AND job_id=$2 AND final_account_revision_id=$3`,[DEMO_TENANT_ID,a.jobId,a.revisionId])).rows as import("@jobguard/core").FinalAccountProof[];
    const assembled=assembleDraftFinalAccount({baselineLines:lines.filter(line=>line.kind==="baseline"),approvedVariationLines:lines.filter(line=>line.kind==="variation"),proof,mandatoryProofRequirements:[]});
    const revisionId=randomUUID(),sourceHash=createHash("sha256").update(assembled.canonicalSource).digest("hex");
    await db.$client.query(`INSERT INTO app.final_account_revision(id,tenant_id,job_id,final_account_draft_id,revision,previous_revision_id,source_hash,baseline_quote_version_id,currency,tax_policy_version,net_pence,tax_pence,total_pence,issue_blocked,findings)
     SELECT $1,tenant_id,job_id,final_account_draft_id,2,id,$2,baseline_quote_version_id,currency,tax_policy_version,$3,$4,$5,issue_blocked,findings
     FROM app.final_account_revision WHERE tenant_id=$6 AND job_id=$7 AND id=$8`,[revisionId,sourceHash,assembled.totals.net.pence,assembled.totals.tax.pence,assembled.totals.total.pence,DEMO_TENANT_ID,a.jobId,a.revisionId]);
    for(const [index,line] of assembled.lines.entries())await db.$client.query(`INSERT INTO app.final_account_line(id,tenant_id,job_id,final_account_revision_id,line_kind,source_id,scope_item_id,commercial_revision_id,approval_id,description,net_pence,ordinal)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,[randomUUID(),DEMO_TENANT_ID,a.jobId,revisionId,line.kind,line.sourceId,line.scopeItemId,line.commercialRevisionId,line.approvalId,line.description,line.netPence,index+1]);
    for(const item of assembled.proof)await db.$client.query(`INSERT INTO app.final_account_proof(id,tenant_id,job_id,final_account_revision_id,evidence_id,object_version_id,scope_item_id,evidence_type,sha256,mandatory)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[randomUUID(),DEMO_TENANT_ID,a.jobId,revisionId,item.evidenceId,item.objectVersionId,item.scopeItemId,item.evidenceType,item.sha256,item.mandatory]);
    await db.$client.query("UPDATE app.final_account_draft SET current_revision_id=$1,revision=2 WHERE tenant_id=$2 AND job_id=$3 AND id=$4",[revisionId,DEMO_TENANT_ID,a.jobId,a.draftId]);
    return {revisionId,sourceHash};
   });
```

The source query selects the exact approved `revision`, its scope, its stored signed amount and description, and its immutable approval; it does not synthesize replacement wording, take an absolute amount, or copy any old variation placeholder. `seedAccount` currently inserts no `final_account_proof` rows; proof selection/finalization/completion at lines 355–358 creates evidence/progress facts, not those snapshot rows. The proof read/copy thus preserves the existing empty snapshot, without inventing a new proof requirement or weakening a proof gate. Original fixture `issue_blocked=false` and `findings=[]` are preserved. All identities generated in this block use the existing deterministic per-replay UUID stream; exact ID values downstream may move identically in both replays.

**3. Replace current line 359 with exactly:**

```ts
   await success("final-account lock",()=>app.finalAccountLock.lock(a.jobId,{version:"final-account.lock.v1",commandId:randomUUID(),finalAccountRevisionId:rebuilt.revisionId,expectedRevision:2,declarationVersion:"final_account_declaration.v1"}));
```

**4. Replace current line 366 with exactly:**

```ts
   await success("issue customer invoice",()=>app.customerInvoice.issue(a.jobId,{version:"practice-customer-invoice.issue.v1",commandId:randomUUID(),finalAccountRevisionId:rebuilt.revisionId,expectedSourceHash:rebuilt.sourceHash,recipient:"fixture@example.invalid",issuedOn:"2026-10-13"}));
```

Resulting **revision 2** links `previous_revision_id=a.revisionId`, keeps the same draft/job/baseline, and contains exactly these commercial lines (fresh line row IDs, original source identities):

| Ordinal | Kind | Description | Signed net pence | Source / commercial revision | Scope | Approval |
| --- | --- | --- | ---: | --- | --- | --- |
| 1 | baseline | `Fictional baseline` | +100,000 | `a.baselineId` / `a.baselineId` | `a.scopeItemId` | null |
| 2 | variation | `Fictional captured tap` | +12,000 | `revision` / `revision` | `extra.scopeItemId` | the same immutable approval created at line 338 |

**Net 112,000p (£1,120.00), candidate 20% tax 22,400p (£224.00), total 134,400p (£1,344.00), GBP.** These are both the revision-2 header and issued invoice totals; tax uses the existing candidate policy, with no policy/rounding change. The existing 1,000p receipt, its reversal, and 1,000p-net credit inputs remain unchanged. The credit is −1,000p net / −200p tax / −1,200p total; after receipt reversal and that credit the balance is 133,200p. None of these totals is a pinned Test Q expectation.

`0185_final_account_sources_and_pdf.sql:32–47` compares the multiset `(source_id, scope_item_id, commercial_revision_id, approval_id, net_pence, description)` in both directions with `EXCEPT ALL`. Revision 2 has exactly the one effective approved tuple, including **+12,000p and `Fictional captured tap`**. The baseline is outside that variation-only comparison. The two unpriced captures still belong to the lock's capture register but have no approved commercial line. There is no placeholder, duplicate, extra approval, or omitted approved tuple in the proposed locked revision.

## Every assertion in the mutation Test Q

All line numbers are current HEAD. **Every assertion stays byte-for-byte unchanged; no assertion change or separate assertion ruling is proposed.** The four proposed edit sites contain command/setup inputs, not assertions. This inventory covers every `expect` call in lines 285–408 and all twelve assertions invoked through `assertIsolation` at line 407:

| Current line | Exact assertion | Disposition / reason |
| --- | --- | --- |
| 316 | `expect((await manyAdmin.query("SELECT count(*)::int n FROM app.shadow_signal_evidence WHERE job_id=$1",[a.jobId])).rows).toEqual([{n:25}]);` | Unchanged; same 25 private fixture links. |
| 350 | `expect(dismissible).toBeDefined();` | Unchanged; decision evaluation/dismissal precedes the new fixture block. |
| 365 | `expect(trace.notifications).toHaveLength(2);` | Unchanged; same pre-authorized synthetic notification and retry. |
| 365 | `expect(trace.telemetry).toContainEqual(expect.objectContaining({name:"outbox.retry"}));` | Unchanged; same retry telemetry requirement. |
| 368 | `expect(pdf.byteLength).toBeGreaterThan(0);` | Unchanged; revision-2 invoice must still export bytes. |
| 370 | `expect(receipt).toBeDefined();` | Unchanged; same 1,000p receipt against the invoice. |
| 382 | `expect(response.status,path).toBeGreaterThanOrEqual(400);` | Unchanged, on every selected Nest POST; same malformed command. |
| 387 | `expect(webMutations.length).toBeGreaterThan(0);` | Unchanged; route coverage remains non-empty. |
| 390 | `expect(response.status,path).toBeGreaterThanOrEqual(400);` | Unchanged, on every selected Next POST; same malformed command. |
| 403 | `expect(trace.statements.length).toBeGreaterThan(0);` | Unchanged; runtime statement coverage remains non-empty. |
| 403 | Private-query assertion quoted verbatim below. | Unchanged; no private-query exclusion is added. |
| 405 | `expect(crypto.randomUUID).toBe(originalUuid);` | Unchanged; UUID mock must still restore. |

The second assertion at line 403 is exactly:

```ts
expect(trace.statements.join("\n")).not.toMatch(/\b(?:shadow_\w+|surface_shadow_signal_early|record_shadow_disclosure)\b/u);
```

At line 407, `assertIsolation(zero,many)` invokes line 216's exact expression `expect(JSON.stringify(many[channel]),channel).toBe(JSON.stringify(zero[channel]));` separately for every channel:

| Channel | Assertion disposition / retained comparison |
| --- | --- |
| `responses` | Unchanged; complete serialized responses, including new revision IDs, hash and money, must match between replays. |
| `notifications` | Unchanged; complete captured notification actions match. |
| `outbox` | Unchanged; complete outbox and attempt row bytes match. |
| `exports` | Unchanged; complete base64 PDF exports match. |
| `counts` | Unchanged; all count/value/feed/proof projections match. |
| `badges` | Unchanged; all badge/proof counts match. |
| `errors` | Unchanged; all selected malformed-command statuses/body bytes match. |
| `cache` | Unchanged; all retained response headers match. |
| `analytics` | Unchanged; complete relevance projection matches. |
| `telemetry` | Unchanged; every captured telemetry event/field matches. |
| `statements` | Unchanged; all normalized runtime SQL units and bound parameters match under the existing normalizer. |
| `publicRows` | Unchanged; complete compared public row bytes match, including both revisions, new line IDs, draft pointer, hash, invoice, authorization and audit facts. |

These comparisons bind zero-signal versus many-signal replay output, not an old 120,000p invoice or an old revision-1 snapshot. Both replays run the identical successor setup with the same fixed time and deterministic IDs. The existing `claimed_xact` exception at line 397 and every other comparison rule remain unchanged; no new byte masking, sorting, exclusions or error swallowing is proposed. Every existing awaited `success(...)` must still resolve; the 180,000ms timeout remains unchanged. All other tests in this file, including the GET isolation/named-limit assertions, twelve monitor negative controls at lines 219–221, and Q-LOG assertions at lines 225–283, are outside the proposed edit sites and remain unchanged too. Any demonstrated need to alter an assertion would require a separate coordinator ruling; it is not authorized by this draft.

## Was line 339 a MIGFIX-5 workaround for S16?

**Yes — a fixture workaround for the same stale-account omission later labelled S16, not a complete fix for it.** Read-only `git show edee6ed34d50fbb2d41caf771e29808065ce1df7` shows one added setup line, now line 339, with subject `test(shadow): Test Q account carries its approved variation before the lock (Ben decision 31)` and body: “One set-up line only; no assertion changed. The new lock guard refused a baseline-only account after a variation approval.” Decision 31 is recorded at the same BEN-DECISIONS file, line 43, explicitly authorizing the stale-account Test Q setup for #213. The inline comment itself names MIGFIX-5.

MIGFIX-5's migration `0166_customer_billing_integrity.sql:31–37` checks for a variation line bearing the approved revision's `source_id` and `commercial_revision_id`; it does **not** compare its description, amount, scope or approval ID. The placeholder satisfied that guard while retaining the old header totals. SERIOUS-B5's stricter S16 comparison in 0172 also checks description, signed money, scope, approval and multiplicity, so the workaround no longer suffices. The historical S16 report is `docs/review/NIGHT-AUDIT-TRIAGE-SERIOUS-2026-10-16.md:153–158`. This provenance is supported by source/history, not an assertion that the original author called the line “S16” at the time.

## Validation and handoff

Executed on the unchanged implementation, Node **24.17.0** (repository pin 24.15.0), cached pnpm **10.28.1**, with `PATH=/private/tmp/jg-migfix-2-bin:$PATH`, `npm_config_manage_package_manager_versions=false`, `COREPACK_ENABLE_NETWORK=0`. Logs: `/private/tmp/jg-serious-b5-testq-*.log`. These checks validate the current tree, not the hypothetical repair.

| Command actually run | Result |
| --- | --- |
| `pnpm typecheck` | Exit 0; 7 tasks successful, 2 cached. |
| `LANE_BASE_REF=origin/main pnpm lint` | Initial pre-draft exit 0; root checks and 7 package tasks passed, 2 cached. Final draft-inclusive rerun exit 1 at lane lint: the requested draft path is not allowlisted. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | Initial pre-draft exit 0; final draft-inclusive exit 1: `Lane serious-b5 cannot edit: "docs/verdicts/SERIOUS-B5/TESTQ-PROPOSAL.md"`. Same base/HEAD; current lane status is FAILED. |
| `pnpm build` | Exit 0; 7 tasks successful, 2 cached, including Next production build. Shared-cache EPERM and existing dependency/tracing warnings were non-fatal. |
| `pnpm --filter @jobguard/core --filter @jobguard/config --filter @jobguard/storage --filter @jobguard/ai --workspace-concurrency=1 -r exec vitest run src --maxWorkers=1` | Exit 0; core 2,674, config 1, storage 2, AI 85 tests passed. Fixture evaluation only. |
| `pnpm --filter @jobguard/db exec vitest run src test/audit-api-file-final-account.test.ts --exclude 'test/*.integration.test.ts' --maxWorkers=1` | Exit 1; 18 files / 145 tests passed; C-OPS-1 operator-reachability scan timed out at its unchanged 5-second limit. No PostgreSQL execution. |
| `pnpm --filter @jobguard/db exec vitest run src/audit-checkpoint-handoff.test.ts --maxWorkers=1` (isolated after other checks) | Exit 0; 56 tests passed, 2.04 seconds overall. No source/config/timeout change; the initial broad-run failure remains recorded. |
| API source unit subset, exact command below | Exit 0; 81 files / 1,656 tests passed. |
| `pnpm --filter @jobguard/web exec vitest run app --maxWorkers=1` | Exit 0; 40 files / 867 tests passed; no browser. |
| `node --test tools/commercial-boundary.test.mjs tools/core-purity.test.mjs tools/decision-check-purity.test.mjs tools/decision-records.test.mjs tools/dependency-audit.test.mjs tools/policy-gate-sites.test.mjs tools/shared-money-origin.test.mjs` | Exit 0; 19 tests passed. |
| `pnpm openapi:check` | Exit 1; sandbox refused tsx CLI IPC listener (`listen EPERM`). |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | Exit 0; same generator/check without the CLI IPC listener; no snapshot change. |
| Read-only `git diff --check`; Python source-excerpt/assertion/scope check | Exit 0; quoted numbered lines match HEAD; all 12 direct `expect` calls inventoried, plus the 12-channel comparator; no tracked file changed, only this draft new. |

Exact API subset command (same nine listener/PostgreSQL exclusions as the r3 receipt):

```sh
pnpm --filter @jobguard/api exec vitest run src --maxWorkers=1 \
  --exclude src/auth/sso/action-paths.test.ts \
  --exclude src/contractor/contractor-practice-session.http.test.ts \
  --exclude src/contractor/site-extra-pricing.http.test.ts \
  --exclude src/contractor/site-extra.http.test.ts \
  --exclude src/contractor/site-visit.http.test.ts \
  --exclude src/contractor/practice-worker-switch.http.test.ts \
  --exclude src/health.test.ts \
  --exclude src/shadow-isolation.application.test.ts \
  --exclude src/final-account-lock.isolation.test.ts
```

**Draft-path lane hold.** `config/lanes/serious-b5.json` explicitly allows the existing `BUILDER_RECEIPT.md` but not this new `TESTQ-PROPOSAL.md`. The user expressly ordered this draft path and prohibited every other repository edit. Accordingly, the requested draft is retained, no allowlist/configuration change or lint bypass is made, and the dispatcher must separately coordinate the path allowance before CI can pass. The initial pre-draft lint/lane passes do not describe the final tree. Final logs are `/private/tmp/jg-serious-b5-testq-lanes-final.log` and `/private/tmp/jg-serious-b5-testq-lint-final.log`.

The proposal itself has not been applied or exercised. No Test Q, PostgreSQL, migration, browser or localhost suite was run: the dispatcher reserves those for GitHub CI. Full root `pnpm test` includes those suites; the unit subsets below do not substitute for them. Three tool suites that create/write temporary Git repositories were also excluded under the no-Git-write instruction. Dependencies were already installed; no package download, Git write, commit or push was attempted. The dispatcher must reconcile the revision-1 placeholder in ruling 63, then authorize any implementation. Its two required checker confirmations, exact-commit independent verdict and separate acceptance remain outstanding. No migration, operational alert, runtime compatibility or production gate changes arise from this draft file.
