import test from "node:test";
import assert from "node:assert/strict";
import { forbiddenCommercialBoundarySource } from "./commercial-boundary-lint.mjs";
test("commercial adapters are callable only by the approved boundary",()=>{
  assert.equal(forbiddenCommercialBoundarySource('import type { CommercialAdapter } from "./commercial-adapter.port.js";\nadapter.execute();',"apps/api/src/jobs/send.ts"),true);
  assert.equal(forbiddenCommercialBoundarySource('adapter.execute();',"apps/api/src/commercial/approved-boundary.ts"),false);
});

// LATER-B19: the combined fixture above cannot tell an import-only detector from an execution-only one, so the cases
// below isolate each trigger and mutation-check deliberately weakened detectors (fictional substitutes; the production
// detector is not changed).
const importOnlySource='import type { CommercialAdapter } from "./commercial-adapter.port.js";\nexport type A = CommercialAdapter;';
const executionOnlySource='export function send(adapter: { execute(): void }) { adapter.execute(); }';
const harmlessSource='export const x = 1; // no adapter';
const boundaryFile="apps/api/src/commercial/approved-boundary.ts";
const outsideFile="apps/api/src/jobs/send.ts";
const suite=(detector)=>[
  detector(importOnlySource,outsideFile)===true,
  detector(executionOnlySource,outsideFile)===true,
  detector(harmlessSource,outsideFile)===false,
  detector(importOnlySource,boundaryFile)===false,
  detector(executionOnlySource,boundaryFile)===false,
].every(Boolean);
const importOnlyDetector=(source,file)=>!file.endsWith(boundaryFile)&&/commercial-adapter\.port/u.test(source);
const executionOnlyDetector=(source,file)=>!file.endsWith(boundaryFile)&&/\.execute\s*\(\s*\)/u.test(source);
test("LATER-B19 an import-only reference to the adapter port is refused on its own",()=>{
  assert.equal(forbiddenCommercialBoundarySource(importOnlySource,outsideFile),true);
  assert.equal(forbiddenCommercialBoundarySource(importOnlySource,boundaryFile),false);
});
test("LATER-B19 an execution-only adapter call is refused on its own",()=>{
  assert.equal(forbiddenCommercialBoundarySource(executionOnlySource,outsideFile),true);
  assert.equal(forbiddenCommercialBoundarySource(executionOnlySource,boundaryFile),false);
  assert.equal(forbiddenCommercialBoundarySource(harmlessSource,outsideFile),false);
});
test("LATER-B19 mutation: the real detector passes the isolated suite and either weakened detector fails it",()=>{
  assert.equal(suite(forbiddenCommercialBoundarySource),true);
  assert.equal(suite(importOnlyDetector),false,"an import-only detector must be rejected");
  assert.equal(suite(executionOnlyDetector),false,"an execution-only detector must be rejected");
  assert.equal(suite(()=>false),false,"a detector that refuses nothing must be rejected");
});
