import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";
test("decision checks contain no I/O or effect imports",async()=>{const source=await readFile(new URL("../packages/core/src/decision-checks.ts",import.meta.url),"utf8");assert.doesNotMatch(source,/from ["'](?:node:|pg|@aws|stripe|gocardless|graphile)/u);assert.doesNotMatch(source,/\b(?:fetch|query|send|order|charge|writeFile|readFile)\s*\(/u);});
