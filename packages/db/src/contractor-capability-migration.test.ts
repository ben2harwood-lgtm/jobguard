import { readFile, readdir } from "node:fs/promises";
import { expect, it } from "vitest";
const directory = new URL("../migrations/", import.meta.url);
const migration = await readFile(new URL("0403_contractor_capabilities.sql", directory), "utf8");
const bodies = new Map<string, string>();
for (const name of (await readdir(directory)).filter(n => n.endsWith(".sql") && n < "0403").sort()) {
 const source = await readFile(new URL(name, directory), "utf8");
 for (const match of source.matchAll(/CREATE (?:OR REPLACE )?FUNCTION ([a-z0-9_.]+)\([\s\S]*?\bAS (\$\w*\$)([\s\S]*?)\2;/gu)) bodies.set(match[1]!, match[3]!);
}
const literal = (value: string) => value.replace(/^E?'/u, "").slice(0, -1).replaceAll("''", "'").replaceAll("\\n", "\n");
const patches = [...migration.matchAll(/\('([^']+)',\s*(E?'(?:[^']|'')*'),\s*(E?'(?:[^']|'')*')\)/gu)]
 .filter(match => match[1]!.startsWith("app.") || match[1]!.startsWith("identity."));
it("MON-8 slice 2: controlled-writer patches match their exact predecessor anchors", () => {
 expect(patches).toHaveLength(14);
 for (const patch of patches) {
  const signature = patch[1]!, name = signature.split("(")[0]!, body = bodies.get(name);
  expect(body, signature).toBeDefined();
  const anchor = literal(patch[2]!);
  expect(body!.split(anchor).length - 1, signature).toBe(signature === "identity.sso_required_command(character,jsonb)" ? 2 : 1);
  if (name !== "app.mon8_contractor_agreement_context") expect(body!.replaceAll(anchor, literal(patch[3]!)), signature).toContain("app.mon8_require_capability(");
 }
});
it("MON-8 slice 2: replay checks precede conflicts and cleanup remains possible", () => {
 expect(migration).toContain("BEFORE INSERT ON app.command_receipt");
 for (const command of ["SubmitExtra", "PriceExtra", "ReviseExtra", "ApproveExtraStep", "RejectExtra", "IssueClientApproval", "ClientDecideExtra"]) expect(migration).toContain(`'${command}'`);
 expect(migration).toContain("ARRAY[''WithdrawExtra'',''MarkDuplicate'',''RevokeClientApproval'']");
 expect(migration).toContain("IF p_step=''claim'' THEN");
});
it("MON-8 slice 2: shared authority never selects plans, shadow data or money", () => {
 const body = migration.split("CREATE FUNCTION app.mon8_effective_agreement()")[1]!.split("END $$;")[0]!;
 expect(body).toContain("pg_advisory_xact_lock_shared");
 expect(body).toContain("assignment_id=assignment.id ORDER BY revision DESC");
 expect(body).not.toMatch(/subscription|shadow|final_account|pence/iu);
 for (const name of ["mon8_effective_agreement()", "mon8_approval_receipt_gate()", "mon8_require_capability(text,text)"]) {
  expect(migration).toContain(`ALTER FUNCTION app.${name} OWNER TO jobguard_migration`);
  expect(migration).toContain(`REVOKE ALL ON FUNCTION app.${name} FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure`);
 }
});
