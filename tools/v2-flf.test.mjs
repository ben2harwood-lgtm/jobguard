// Local discovery tests only. These do NOT prove PostgreSQL tenancy.
import assert from "node:assert/strict";
import { test } from "node:test";
import { reachableFunctions, reportRow, sourceCandidates } from "./v2/firm-lock/FL-F.inventory.mjs";

const routine = (oid, name, more = {}) => ({ oid, schema: "app", name,
  signature: `app.${name}()`, source: "", dependencies: [], runtime_execute: false, ...more });

test("FL-F discovery follows every overload and nested ungranted helper, and terminates on cycles", () => {
  const rows = [
    routine("1", "entry", { runtime_execute: true, source: "PERFORM app.helper(1);" }),
    routine("2", "helper", { signature: "app.helper(integer)", source: "SELECT app.entry()" }),
    routine("3", "helper", { signature: "app.helper(text)", dependencies: ["4"] }),
    routine("4", "dep_only"), routine("5", "unreachable"),
  ];
  assert.deepEqual(reachableFunctions(rows, new Map([["app.entry", ["caller.ts:1"]]])).map(row => row.oid), ["1", "2", "3", "4"]);
});

test("FL-F discovery retains unqualified body calls but refuses a non-executable root", () => {
  const rows = [routine("1", "entry", { runtime_execute: true, source: "SELECT helper_2()" }),
    routine("2", "helper_2"), routine("3", "closed")];
  const callers = new Map([["app.entry", ["caller.ts:1"]], ["app.closed", ["caller.ts:2"]]]);
  assert.deepEqual(reachableFunctions(rows, callers).map(row => row.oid), ["1", "2"]);
  assert.match(reportRow({ ...rows[1], definer: true, owner: "owner", callers: ["app.entry()"] }), /unclear/u);
});

test("FL-F source scan finds the real workspace SQL callers, including names containing digits", () => {
  const callers = sourceCandidates();
  assert.ok([...callers.get("app.require_current_job_parties")].some(path => path.startsWith("packages/db/src/quote-document-repository.ts:")));
  assert.ok([...callers.get("app.transition_scope_progress")].some(path => path.startsWith("packages/db/src/proof-repository.ts:")));
  assert.ok(callers.has("app.lp11_record_visit_refusal"), "SQL names containing digits must not disappear from grep");
  assert.equal(callers.has("app.quote"), false, "JavaScript application method calls are not SQL functions");
});
