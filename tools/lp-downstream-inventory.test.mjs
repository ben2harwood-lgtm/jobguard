import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const recordedInput = "docs/contracts/lp-downstream-lp-0-recorded-input-v1.json";
const generated = execFileSync("python3", ["tools/lp-downstream-inventory.py", "--stdout"], { encoding: "utf8" });
const rows = new Map(generated.split("\n").filter((line) => /^\| `(?:app|identity)\./.test(line)).map((line) => {
  const [, object, assignment] = line.split("|");
  const [effects, cards] = assignment.trim().split(" / ");
  return [object.trim().replaceAll("`", ""), { effects: effects.split(", "), cards: cards.split(", ") }];
}));

function includes(name, family, cards) {
  assert.ok(rows.has(name), `missing ${name}`);
  assert.ok(rows.get(name).effects.includes(family), `${name} missing ${family}`);
  for (const card of cards) assert.ok(rows.get(name).cards.includes(card), `${name} missing ${card}`);
}

test("downstream document is reproducible from checked-in generator", () => {
  assert.equal(generated, readFileSync("docs/contracts/lp-downstream-effects-v1.md", "utf8"));
});

test("newer migrations and live LP-0 edits leave --check exact against the recorded input", () => {
  const cwd = mkdtempSync(join(tmpdir(), "lp-downstream-inventory-"));
  for (const path of ["tools/lp-downstream-inventory.py", recordedInput, "docs/contracts/lp-0-effective-privileges-v1.json",
    "docs/contracts/lp-downstream-effects-v1.md", "packages/db/migrations"]) {
    cpSync(path, join(cwd, path), { recursive: true });
  }
  const run = (flag) => execFileSync("python3", ["tools/lp-downstream-inventory.py", flag], { cwd, encoding: "utf8", stdio: "pipe" });
  const before = run("--check");
  writeFileSync(join(cwd, "packages/db/migrations/9999_newer_inventory_fixture.sql"),
    "CREATE TABLE app.newer_inventory_fixture (amount_pence bigint);\n");
  const liveInput = join(cwd, "docs/contracts/lp-0-effective-privileges-v1.json");
  const live = JSON.parse(readFileSync(liveInput, "utf8"));
  live.entries = [];
  live.recorded.routines = [];
  writeFileSync(liveInput, JSON.stringify(live));
  assert.equal(run("--check"), before);
  assert.equal(run("--stdout"), generated);
  // New migrations and live LP-0 edits are excluded, but the comparison must still reject document drift.
  writeFileSync(join(cwd, "docs/contracts/lp-downstream-effects-v1.md"), `${generated}\nDrift\n`);
  assert.throws(() => run("--check"), /Downstream inventory differs/);
});

test("financial declarations and every checked billing routine retain money assignments", () => {
  const tables = ["ledger_account", "cap_snapshot", "synthetic_obligation", "platform_statement", "platform_statement_line",
    "billing_allocation_run", "billing_application_event", "billing_export_batch", "billing_export_delivery",
    "billing_export_line", "billing_fact", "billing_line_match", "billing_quarantine", "billing_status_import"];
  for (const name of tables) includes(`app.${name}`, "money", ["LP-6c", "LP-8a", "LP-8b"]);
  assert.ok(!rows.get("app.ledger_account").effects.includes("identity"));
  assert.deepEqual(rows.get("app.account").effects, ["identity"]);
  const lp0 = JSON.parse(readFileSync(recordedInput, "utf8"));
  const entries = lp0.entries.filter((entry) => entry.group === "a-exec-checked-billing-money");
  assert.ok(entries.length > 0);
  for (const entry of entries) {
    const name = entry.key.split("function:")[1]?.split("(")[0];
    assert.ok(name, `expected routine: ${entry.key}`);
    includes(name, "money", ["LP-6c", "LP-8a"]);
  }
  // Explicit witnesses prevent an inventory edit from silently removing coverage.
  for (const name of ["cb_authority", "cb_begin", "cb_candidates", "cb_complete", "cb_delivery", "cb_delivery_step",
    "cb_derive", "cb_export", "cb_ingest", "cb_inputs", "ef_read", "ef_read_postings", "ef_read_statement"]) {
    includes(`app.${name}`, "money", ["LP-6c", "LP-8a"]);
  }
});

test("final-check attempts and their writers retain queue and hidden assignments", () => {
  for (const name of ["final_check_source_attempt", "shadow_final_check_source_attempt", "record_final_check_source_result"]) {
    includes(`app.${name}`, "queue", ["LP-10", "LP-8b"]);
    includes(`app.${name}`, "hidden", ["LP-4", "LP-6d"]);
  }
  assert.deepEqual(rows.get("app.action_attempt").effects, ["queue"]);
});

test("classification uses groups and schema even with uninformative or misleading names", () => {
  execFileSync("python3", ["-c", `
import contextlib,io,runpy,sys
sys.argv=['tools/lp-downstream-inventory.py','--check']
with contextlib.redirect_stdout(io.StringIO()):
    module=runpy.run_path(sys.argv[0])
objects=module['obj']; classify=module['classify']
objects['routine','app.neutral']={'groups':{'a-exec-checked-billing-money'}}
assert classify('routine','app.neutral')=={'money'}
objects['relation','app.neutral_account']={'definitions':{'(currency char(3),amount_pence bigint)'}}
assert classify('relation','app.neutral_account')=={'money'}
objects['relation','app.neutral_attempt']={'definitions':{'(signal_ids jsonb)'}}
assert classify('relation','app.neutral_attempt')=={'hidden','queue'}
objects['relation','app.neutral_import']={'sources':{'packages/db/migrations/0243_contractor_billing.sql:27'}}
assert classify('relation','app.neutral_import')=={'money'}
objects['routine','app.neutral_private']={'groups':{'a-shadow-role-grants'}}
assert classify('routine','app.neutral_private')=={'hidden'}
`], { stdio: "pipe" });
});
