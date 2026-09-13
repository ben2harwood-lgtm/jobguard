import test from "node:test";
import assert from "node:assert/strict";
import { forbiddenCommercialBoundarySource } from "./commercial-boundary-lint.mjs";
test("commercial adapters are callable only by the approved boundary",()=>{
  assert.equal(forbiddenCommercialBoundarySource('import type { CommercialAdapter } from "./commercial-adapter.port.js";\nadapter.execute();',"apps/api/src/jobs/send.ts"),true);
  assert.equal(forbiddenCommercialBoundarySource('adapter.execute();',"apps/api/src/commercial/approved-boundary.ts"),false);
});
