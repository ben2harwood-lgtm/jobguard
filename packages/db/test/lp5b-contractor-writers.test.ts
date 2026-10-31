import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const sql = read("../migrations/0536_lp5b_writers.sql");
it("LP-5b contractor callers have no direct receipt write or caller-JSON completion", () => {
  for (const file of ["extra-repository", "extra-approval-chain-repository", "site-visit-repository"]) {
    const source = read(`../src/${file}.ts`);
    expect(source).not.toMatch(/(?:INSERT INTO|UPDATE) app\.command_receipt/);
    expect(source).toContain("beginRepositoryCommand");
    expect(source).toContain("completeRepositoryCommand");
  }
});
it("LP-5b checked contractor routines preserve their latest bodies except the private effect handoff", () => {
  for (const [file, names] of [
    ["0158_extra_approval_chain.sql", ["xa_submit", "xa_price", "xa_approve", "xa_withdraw", "xa_mark_duplicate", "xa_revoke_link", "xa_client_decide"]],
    ["0139_site_visit_closeout.sql", ["ent3b_start_visit", "ent3b_complete_visit"]],
  ] as const) {
    const source = read(`../migrations/${file}`);
    for (const name of names) {
      const pattern = new RegExp(`CREATE (?:OR REPLACE )?FUNCTION app\\.${name}\\([\\s\\S]*?END \\$\\$;`);
      const before = source.match(pattern)![0].replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION");
      const after = sql.match(pattern)![0]
        .replace("DECLARE lp5_result jsonb; ", "DECLARE ")
        .replace(/lp5_result:=([^;]+); PERFORM app\.lp5_bind_effect\([^;]+; RETURN lp5_result;/g, "RETURN $1;")
        .replace(/PERFORM app\.lp5_bind_effect\([^;]+; /g, "");
      expect(after, name).toBe(before);
    }
  }
});
