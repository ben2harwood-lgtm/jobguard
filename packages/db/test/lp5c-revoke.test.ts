import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
describe("LP-5c cutover source guard", () => {
  it("withdraws both table and column ACLs without introducing new authority", () => {
    const sql = read("../migrations/0508_lp5c_revoke_command_writes.sql");
    expect(sql).toContain("REVOKE INSERT ON app.command_receipt, app.decision_resolution, app.action_authorization FROM jobguard_runtime, PUBLIC");
    expect(sql).toContain("REVOKE UPDATE ON app.command_receipt FROM jobguard_runtime, PUBLIC");
    expect(sql).toContain("REVOKE UPDATE (status, result, completed_at) ON app.command_receipt FROM jobguard_runtime, PUBLIC");
    expect(sql).not.toMatch(/\bGRANT\b|CREATE.*FUNCTION/i);
  });
  it("leaves no direct production TypeScript receipt or approval writer", () => {
    for (const name of readdirSync(new URL("../src/", import.meta.url))) {
      if (!name.endsWith(".ts") || name.endsWith(".test.ts")) continue;
      expect(read(`../src/${name}`), name).not.toMatch(/(?:INSERT\s+INTO\s+app\.(?:command_receipt|decision_resolution|action_authorization)|UPDATE\s+app\.command_receipt)\b/i);
    }
  });
  it("removes the six withdrawn ACL expectations and assigns remaining authority to later closure", () => {
    const inventory = JSON.parse(read("../../../docs/contracts/lp-0-effective-privileges-v1.json"));
    for (const entry of inventory.entries) {
      expect(entry.key).not.toMatch(/^acl\|rel\|table\|app\.(command_receipt|decision_resolution|action_authorization)\|jobguard_runtime\|INSERT\|/);
      expect(entry.key).not.toMatch(/^acl\|col\|app\.command_receipt\..*\|jobguard_runtime\|UPDATE\|/);
    }
    expect(inventory.groups.find((g: { id: string }) => g.id === "x-command-authority-writes").cards).toContain("LP-6d");
  });
});
