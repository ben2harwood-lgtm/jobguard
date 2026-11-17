# SHADOW-LOG-FLAKE-1 builder receipt

Issued 13 October 2026 by dispatcher 4 on the coordinator's approval; check lane RED.
Builder: Codex. Branch: `codex/sandbox/shadow-log-flake-1`.
Inspected base and `origin/main`: `6659fb58791ec22588948f005b2bd4f6b299fa48`.

Status: implemented within the issued scope; HOLD for dispatcher PostgreSQL/CI execution, exact-commit independent verdict and separate acceptance. This is builder evidence, not an independent model review or acceptance. No git write commands were run. The dispatcher owns committing, pushing and merging. Intended commit message: `/private/tmp/jg-msg-shadow-log-flake-1.txt`.

Only the issued test, this receipt and one new lane-registration line change. No migration, dependency, production behavior, provider, prompt, policy, web workflow or operational alert changes. No database rollback is needed; reverting this test-only diff restores the prior capture implementation. The merged test is coordinator-owned; this repair uses the coordinator's specific authorization and introduces no shared production-file overlap. Every earlier expectation remains byte-identical, including original F:53 (now F:55); moving its physical line is solely the approved multiline parser expansion.

The capture joins stderr chunks into one continuous stream, uses two unique logged fence records to bound each replay, frames PostgreSQL records while retaining multiline SQL and attached DETAIL parameters, and throws after 5,000 ms when a fence header is absent. Both fence markers are excluded from comparison. The original nonempty, forbidden-shadow-query, evidence-count, application-output and ordered-statement expectations are preserved. No permissive timeout, retry, skip or expectation edit was introduced in the merged test.

## Changed lines, before and after

F means `packages/db/test/shadow-isolation-query-log.integration.test.ts`. The following JSON string literals encode each physical changed line exactly (including leading spaces and newline); `ABSENT` means no prior or replacement line. Unchanged lines are omitted. Receipt creation itself has no previous content; this entire document is its after content.

```text
Before F:34: "  async function replay(){const start=logs.length,out=[];\n"
After  F:34: "  async function replay(){const start=(await logFence()).end,out=[];\n"
```

```text
Before F:37: "   // Drain socket/log callbacks before comparing the actual PostgreSQL output.\n"
After  F:37: "   const end=(await logFence()).start;\n"
```

```text
Before F:38: "   await new Promise<void>(resolve=>setTimeout(resolve,25));\n"
After  F:38: "   const statements=logs.join(\"\").slice(start,end)\n"
```

```text
Before F:39: "   const statements=logs.slice(start).filter(s=>s.includes(\"SV3:sv3_log_runtime:\") && /(?:statement|execute [^:]+):/u.test(s)).map(s=>s.replace(/^.*?(?:statement|execute [^:]+):/su,\"\"));\n"
After  F:39: "    .split(/(?=^SV3:[^:\\r\\n]+: (?!DETAIL:))/mu)\n"
```

```text
Before ABSENT
After  F:40: "    .filter(s=>/^SV3:sv3_log_runtime: LOG:  (?:statement|execute [^:\\r\\n]+):/u.test(s))\n"
```

```text
Before ABSENT
After  F:41: "    .map(s=>s.replace(/^SV3:sv3_log_runtime: LOG:  (?:statement|execute [^:\\r\\n]+):/u,\"\"));\n"
```

```text
Before ABSENT
After  F:58: "async function logFence(){\n"
```

```text
Before ABSENT
After  F:59: " const sql=`SELECT 1 /* sv3-fence:${randomUUID()} */`;\n"
```

```text
Before ABSENT
After  F:60: " await runtime.query(sql);\n"
```

```text
Before ABSENT
After  F:61: " const header=`SV3:sv3_log_runtime: LOG:  statement: ${sql}\\n`,deadline=Date.now()+5000;\n"
```

```text
Before ABSENT
After  F:62: " for(;;){\n"
```

```text
Before ABSENT
After  F:63: "  const raw=logs.join(\"\"),start=raw.indexOf(header);\n"
```

```text
Before ABSENT
After  F:64: "  if(start>=0)return{start,end:start+header.length};\n"
```

```text
Before ABSENT
After  F:65: "  if(Date.now()>=deadline)throw new Error(\"PostgreSQL log fence timeout\");\n"
```

```text
Before ABSENT
After  F:66: "  await new Promise<void>(resolve=>setTimeout(resolve,5));\n"
```

```text
Before ABSENT
After  F:67: " }\n"
```

```text
Before ABSENT
After  F:68: "}\n"
```

```text
Before config/agent-lane-assignments.json: ABSENT
After  config/agent-lane-assignments.json:155: "\"shadow-log-flake-1\":{\"branches\":[\"codex/sandbox/shadow-log-flake-1\"],\"receipt\":\"docs/verdicts/SHADOW-LOG-FLAKE-1/BUILDER_RECEIPT.md\",\"note\":\"Check lane RED. Coordinator-approved test capture repair only; every expectation stays byte for byte. C1: test-only, no web workflow or e2e spec. No migration.\",\"allow\":[\"config/agent-lane-assignments.json\",\"packages/db/test/shadow-isolation-query-log.integration.test.ts\",\"docs/verdicts/SHADOW-LOG-FLAKE-1/BUILDER_RECEIPT.md\"]},\n"
```

## File identity

Before F SHA-256: `93d897518c5fc3ccd8f064b6adbf4ae20d5575d5457c5866170f9e8ce409212d`.
After F SHA-256: `bb5c80a17a3bc137c6497733047073910287dccd541ab001293c9d579aed3aeb`.
The approved-file snapshot and restored working file compared byte for byte with `cmp` (exit 0).

## Commands actually run and results

Dependencies were already installed; no install command was run. Installed Node was `v24.17.0`, whereas `.nvmrc` says `24.15.0`; this is not a clean pinned-install claim. The global `pnpm --version` wrapper unexpectedly attempted managed-version registry resolution and reported fetch/signature-verification failure. A subsequent `PNPM_MANAGE_PACKAGE_MANAGER_VERSIONS=false pnpm --version` also failed (exit 1). No package download succeeded. All verification then used the existing cached pnpm **10.28.1** through a temporary shim, without downloading anything:

```sh
# /private/tmp/shadow-log-flake-1/bin/pnpm
#!/bin/sh
exec node /Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs "$@"
```

Every `pnpm` command below used `PATH=/private/tmp/shadow-log-flake-1/bin:$PATH`. Logs and temporary controls are under `/private/tmp/shadow-log-flake-1/`, outside the repository. Initial source inspection used read-only git status/branch/rev-parse/diff/ls-files; no add, commit, checkout, switch, fetch, update-ref or other writing git command was issued.

| Command | Exit / result |
| --- | --- |
| `pnpm --version` via the cached shim | 0; 10.28.1 |
| `pnpm typecheck` | 0; 7 tasks successful, 2 cache hits |
| `LANE_BASE_REF=origin/main pnpm lint` | 1; core purity passed, then range lint refused self-comparison |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 1; `Missing branch or self-comparison range; refusing a misleading pass.` HEAD equals origin/main until dispatcher commits |
| `pnpm exec turbo run lint` | 0; all 7 package lint tasks successful, 2 cache hits; does not replace the failed mandatory range lint |
| `node tools/money-arithmetic-lint.mjs` | 0; boundary check passed |
| `node tools/commercial-boundary-lint.mjs` | 0 |
| `pnpm build` | 0; all 7 tasks successful, 2 cache hits; Next production build completed |
| `pnpm openapi:check` | 1; tsx CLI IPC `listen EPERM` before generator execution |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | 0; same source generator/check, avoiding the CLI IPC listener |
| `pnpm exec turbo run test --filter=@jobguard/core --filter=@jobguard/ai --filter=@jobguard/config --filter=@jobguard/storage --filter=@jobguard/web` | 1; core discovers compiled dist tests: 2 fail with ENOENT for dist/recovery-allocation.ts and dist/site-extra-pricing.ts, 4,666 pass. Config: 2 pass. Storage: 4 pass from cache. Turbo stops before completing the remaining packages |
| `pnpm --filter @jobguard/core exec vitest run src` | 0; 79 files, 2,334 tests pass |
| `pnpm --filter @jobguard/ai exec vitest run src` | 0; 5 files, 80 tests pass; fixture only |
| `pnpm --filter @jobguard/web test` | 0; 32 files, 744 tests pass |
| `pnpm --filter @jobguard/storage test` | 0; 2 files, 4 tests pass, freshly executed |
| `pnpm --filter @jobguard/api exec vitest run src --exclude src/shadow-isolation.application.test.ts` | 1; 7 files fail, 61 pass; 108 tests fail, 1,550 pass, 1 skip. HTTP tests hit listen EPERM; the final-account isolation harness also cannot find a bindable port |
| `pnpm --filter @jobguard/api exec vitest run src --exclude src/shadow-isolation.application.test.ts --exclude '**/*.http.test.ts' --exclude src/health.test.ts --exclude src/auth/sso/action-paths.test.ts` | 1; final-account-lock.isolation.test.ts still needs a real database/server and fails before PostgreSQL startup with `no free port in 58400..58650`; 61 files pass, 1,534 tests pass, 1 skip |
| `pnpm --filter @jobguard/api exec vitest run src --exclude src/shadow-isolation.application.test.ts --exclude src/final-account-lock.isolation.test.ts --exclude '**/*.http.test.ts' --exclude src/health.test.ts --exclude src/auth/sso/action-paths.test.ts` | 0; available non-server subset, 61 files / 1,532 tests pass. Exclusions are invocation-only, not changes to any test or CI requirement |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/recovery-case-join.test.ts test/recovery-message-repository.test.ts test/recovery-case-outcome.test.ts test/verify-audit-export-cli.test.ts test/contractor-session-context.test.ts test/verify-evidence-pack-cli.test.ts` | 0; 6 files, 61 unit tests pass; no PostgreSQL claim |
| `node --test tools/core-purity.test.mjs tools/dependency-audit.test.mjs tools/money-arithmetic.test.mjs` | 0; 12 tests pass; the last named path does not exist and Node did not select tests from it, so no separate money-arithmetic test-suite claim |
| `node --test tools/core-purity.test.mjs tools/dependency-audit.test.mjs tools/policy-gate-sites.test.mjs tools/decision-check-purity.test.mjs tools/decision-records.test.mjs tools/shared-money-origin.test.mjs tools/commercial-boundary.test.mjs` | 0; all 19 selected tool tests pass |
| Read-only `selectLane` + `matches` check against working-tree diff and untracked paths | 0; exactly the three issued paths permitted. This is a deterministic scope check, not the mandatory range-lint pass or an independent verdict |
| `git diff --check` | 0; no whitespace errors |
| Exact expectation-line comparison and original F:53 / current F:55 comparison | 0; byte-identical |

Full `pnpm test` was not run: it includes real PostgreSQL tests and two lane-tool suites that themselves issue writing git commands in temporary fixture repositories. Those lane-tool suites were left to the dispatcher to respect the explicit no-writing-git instruction. PostgreSQL, database/migration suites, browser suites and CPU-load repetitions were not run here; this sandbox cannot bind localhost or start PostgreSQL. No PostgreSQL process was started. The initial API run's indirect server/database harness failed while looking for a free port, before database startup. No mandatory suite was disabled or weakened in repository configuration. The changed file is outside packages/db/tsconfig.json's src-only include, so the temporary harness also executes the changed parser and fence code; package typecheck alone is not presented as coverage of that test.

## Capture harness and rolled-back failing controls

The temporary Vitest harness extracts the actual parser, helper and unchanged assertion lines from F, and uses synthetic stderr and a fake query producer. It strips only `Promise<void>` when evaluating the TypeScript helper as JavaScript. This is deterministic in-memory test execution, not a real-provider or PostgreSQL integration test.

```sh
pnpm --filter @jobguard/db exec vitest run --config /private/tmp/shadow-log-flake-1/vitest.config.mjs
```

- First harness attempt: exit 1 before tests (`Unexpected token '>'` from evaluating TypeScript `Promise<void>` directly); the temporary harness was corrected, with no repository change.
- Corrected baseline and both restored runs: exit 0, **5 tests pass**. Separate, coalesced, character-fragmented and every two-chunk split produce identical ordered statements, including multiline SQL and attached DETAIL parameters. A second replay coalescing two SELECT records makes the original equality assertion reject the old parser (2 entries versus 1). Fragmented fence headers delayed 40/75 ms complete capture beyond the old 25 ms delay and exclude both markers. An absent marker rejects with `PostgreSQL log fence timeout` after at least the real 5,000 ms deadline.
- First rolled-back control: temporarily inserted `statements.push("SELECT * FROM app.shadow_commercial_signal;\n");` immediately before the unchanged assertion. Exit 1 at that assertion; restored the approved file using the snapshot and `cmp` returned 0.
- Stronger full-parser control: temporarily replaced approved F:38 with the line below, injecting a PostgreSQL forbidden-query record into the captured string **before record framing**, leaving the assertion unchanged. This is a log fixture, not an executed SQL query:

```ts
   const statements=(logs.join("").slice(start,end)+"SV3:sv3_log_runtime: LOG:  statement: SELECT * FROM app.shadow_commercial_signal;\n")
```

Executed:

```sh
FORBIDDEN_CONTROL=1 pnpm --filter @jobguard/db exec vitest run --config /private/tmp/shadow-log-flake-1/vitest.config.mjs -t 'rolled-back forbidden-statement control'
```

**Exit 1, 1 failed / 5 unselected**, at the unchanged F:40 (now F:42) forbidden-shadow-query assertion:

```text
AssertionError: expected ' SELECT 1;\n\n SELECT * FROM app.shad…' not to match /\b(?:shadow_commercial_signal|shadow…/u
Received:
" SELECT 1;

 SELECT * FROM app.shadow_commercial_signal;
"
```

Restored F from `/private/tmp/shadow-log-flake-1/approved.ts`; `cmp` exit 0. The final restored harness run exits 0, **5 passed**, and all expectation lines remain byte-identical. No control injection, additional persistent test or modified expectation remains. Logs: `forbidden-control.log`, `forbidden-record-control.log`, `capture-final.log`.

## Dispatcher verification still required

On the Mac outside this sandbox, or GitHub CI after committing and pushing, first use the repository-pinned Node/pnpm installation and build. The specific real-PostgreSQL test is:

```sh
pnpm build
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/shadow-isolation-query-log.integration.test.ts
```

Repeat that exact test under CPU load and preserve all expectations. Then run the mandatory suites without the local subset exclusions:

```sh
pnpm typecheck
LANE_BASE_REF=origin/main pnpm lint
LANE_BASE_REF=origin/main pnpm lint:lanes
pnpm test
pnpm build
pnpm openapi:check
pnpm test:db
pnpm test:migrations
pnpm test:e2e
```

If the ordinary unit runner still selects compiled dist tests and fails, report it as separate existing suite behavior; this issued scope does not authorize a runner/config fix. No new prompt/model/schema change requires a live model evaluation; existing AI unit execution above is fixture-only. The dispatcher supplies real PostgreSQL, migration and browser evidence. A different model must then record the RED-lane verdict bound to the dispatcher's exact commit, and a separate actor records acceptance. Green deterministic local checks and this receipt do not supply those verdicts. No security/commercial approvals, production release gates or fee policies changed.

## Temporary harness source (reviewable, outside the final diff)

For reproducibility, the actual temporary harness is copied below. It reads the before/approved snapshots saved under the temporary directory and the working test file. Its config is `export default {test:{root:'/private/tmp/shadow-log-flake-1',include:['capture.test.mjs'],maxWorkers:1}};`.

```js
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {it,expect} from '/Users/benharwood/Claude/Projects/my-new-project/.worktrees/shadow-log-flake-1/packages/db/node_modules/vitest/dist/index.js';
const path='/Users/benharwood/Claude/Projects/my-new-project/.worktrees/shadow-log-flake-1/packages/db/test/shadow-isolation-query-log.integration.test.ts';
const source=readFileSync(path,'utf8'),before=readFileSync('/private/tmp/shadow-log-flake-1/before.ts','utf8');
const parser=source.slice(source.indexOf('   const statements='),source.indexOf('   return{out,statements};'));
const parse=new Function('logs','start','end','expect',parser+'return statements;');
const oldParser=new Function('logs','start',before.slice(before.indexOf('   const statements='),before.indexOf('   expect(statements.length)'))+'return statements;');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const fenceBody=source.slice(source.indexOf('async function logFence(){')+'async function logFence(){'.length,source.lastIndexOf('}')).replace('new Promise<void>', 'new Promise');
const fence=new AsyncFunction('runtime','logs','randomUUID',fenceBody);
const h='SV3:sv3_log_runtime: LOG:  statement: ';
const raw=h+"SELECT set_config('app.tenant_id', 'synthetic', true);\n"+h+'SELECT 2;\n'+'SV3:sv3_log_runtime: LOG:  execute <unnamed>: SELECT\n  $1::text;\n'+'SV3:sv3_log_runtime: DETAIL:  parameters: $1 = \'fictional\'\n'+'SV3:postgres: LOG:  statement: SELECT ignored;\n';
const expected=[" SELECT set_config('app.tenant_id', 'synthetic', true);\n",' SELECT 2;\n'," SELECT\n  $1::text;\nSV3:sv3_log_runtime: DETAIL:  parameters: $1 = 'fictional'\n"];
it('unchanged assertions are byte-identical to the issued baseline',()=>{
 expect(source.split('\n').filter(s=>s.includes('expect('))).toEqual(before.split('\n').filter(s=>s.includes('expect(')));
});
it('separate, coalesced, character-fragmented and every two-chunk split preserve ordered SQL and DETAIL',()=>{
 expect(parse([raw],0,raw.length,expect)).toEqual(expected);
 expect(parse([...raw],0,raw.length,expect)).toEqual(expected);
 expect(parse(raw.split(/(?=^SV3:)/mu),0,raw.length,expect)).toEqual(expected);
 for(let n=0;n<=raw.length;n++)expect(parse([raw.slice(0,n),raw.slice(n)],0,raw.length,expect)).toEqual(expected);
 console.log(`Verified ${raw.length+1} split positions`);
});
it('old parser reproduces one fewer entry when the second replay coalesces adjacent records',()=>{
 const records=[h+'SELECT 1;\n',h+'SELECT 2;\n'];
 const zero={out:[],statements:oldParser(records,0)},many={out:[],statements:oldParser([records.join('')],0)};
 expect(()=>new Function('expect','zero','many',before.split('\n')[52].replace('const many=await replay();',''))(expect,zero,many)).toThrow();
 console.log('Original equality assertion rejects old parser: 2 entries versus 1');
});
it('delayed fragmented fences bound complete capture and exclude markers',async()=>{
 const logs=[];
 const runtime={query:async sql=>{const header=h+sql+'\n';setTimeout(()=>logs.push(header.slice(0,19)),40);setTimeout(()=>logs.push(header.slice(19)),75);}};
 const start=(await fence(runtime,logs,randomUUID)).end;
 logs.push(raw.slice(0,20));setTimeout(()=>logs.push(raw.slice(20)),30);
 const end=(await fence(runtime,logs,randomUUID)).start;
 expect(parse(logs,start,end,expect)).toEqual(expected);
 expect(parse(logs,start,end,expect).join('')).not.toContain('sv3-fence:');
});
it('a never-arriving logged fence rejects with the supplied hard timeout',async()=>{
 const began=Date.now();
 await expect(fence({query:async()=>{}},[],randomUUID)).rejects.toThrow('PostgreSQL log fence timeout');
 expect(Date.now()-began).toBeGreaterThanOrEqual(5000);
},6500);
if(process.env.FORBIDDEN_CONTROL==='1')it('rolled-back forbidden-statement control runs the unchanged assertion',()=>{
 parse([h+'SELECT 1;\n'],0,(h+'SELECT 1;\n').length,expect);
});
```
