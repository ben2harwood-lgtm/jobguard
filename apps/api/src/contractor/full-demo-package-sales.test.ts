// Practice sandbox — synthetic data; nothing is sent or charged
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { expect, it } from "vitest";
const root = fileURLToPath(new URL("../../../../", import.meta.url));
const registerPath = root + "sales/JobGuard Contractor Sales Bible.claims.v1.json";
const guidePath = root + "sales/JobGuard Contractor Sales Bible.md";
const label = "Practice sandbox — synthetic data; nothing is sent or charged";
// Closed editorial assertions: new commercial wording needs an explicit reviewed test change.
const texts = {
  northside: "The merged Northside generator creates fictional clients, operatives and work orders through commands; this is source evidence, not a new executed demonstration.",
  dashboard: "The merged dashboard reads scoped capture and approval contributions. Billing and paid totals remain null pending ENT-6B.",
  baseline: "The merged baseline method prepares synthetic history with explicit cohorts, source hashes and drill-downs; it grants no historical-read authority and persists nothing.",
  billing: "Billing export, invoice composition and settlement persistence remain pending ENT-6B for this package.",
  statements: "Persisted statements, posting and reconciliation remain pending ENT-7-P; reference preparation is not execution.",
  prompts: "Persisted prompt confirmation remains pending; recorded-provider fictional fixtures do not establish a confirmation command.",
  terms: "The 10% rate and no platform charge are proposed terms under D16, not approved pricing or a customer offer.",
} as const;
const claimSchema = z.object({ id: z.enum(["northside", "dashboard", "baseline", "billing", "statements", "prompts", "terms"]),
  text: z.string(), classification: z.enum(["source_inspected", "held", "proposed"]), proof: z.literal("source_only"), limit: z.string().min(20),
  evidence: z.array(z.object({ commit: z.string().regex(/^[a-f0-9]{40}$/u), path: z.string().regex(/^(?:apps|packages|docs)\/[a-zA-Z0-9_./-]+$/u), needle: z.string().min(8), kind: z.enum(["source", "test_source", "decision", "builder_receipt"]) }).strict()).min(1),
}).strict();
const schema = z.object({ version: z.literal("contractor-sales-claims.v1"), label: z.literal(label), claims: z.array(claimSchema).length(7) }).strict();
const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
function validate(raw: unknown) {
  const parsed = schema.parse(raw);
  expect(new Set(parsed.claims.map(c => c.id)).size).toBe(7);
  for (const claim of parsed.claims) {
    expect(claim.text).toBe(texts[claim.id]);
    expect(claim.limit).toBe("Source inspected only; no new executed PostgreSQL, browser, provider or independent-review evidence is claimed. Practice-only scope; no release gate is opened.");
    expect(claim.classification).toBe(claim.id === "terms" ? "proposed" : ["billing", "statements", "prompts"].includes(claim.id) ? "held" : "source_inspected");
  }
  // Reject unsupported wording before spawning Git processes for source evidence.
  for (const claim of parsed.claims) {
    for (const evidence of claim.evidence) {
      git("merge-base", "--is-ancestor", evidence.commit, "HEAD");
      git("merge-base", "--is-ancestor", evidence.commit, "origin/main");
      expect(git("show", `${evidence.commit}:${evidence.path}`)).toContain(evidence.needle);
    }
  }
  return parsed;
}
const register = (): z.infer<typeof schema> => JSON.parse(readFileSync(registerPath, "utf8"));
function validateGuide(raw: unknown, guide: string) {
  // Check the public artifact too: an extra paragraph must not bypass the register.
  expect(guide).not.toMatch(/\bverified\b/iu);
  const claims = validate(raw);
  expect(guide).toBe(`# JobGuard Contractor Sales Bible\n\n${label}\n\n` + claims.claims.map(c => `${c.text} [${c.id}]\n\nLimit: ${c.limit}\n\nEvidence: ${c.evidence.map(e => `[${e.path}](../${e.path}) @ \`${e.commit}\` (${e.kind})`).join("; ")}\n`).join("\n"));
}
it("A09 every public claim resolves to merged evidence and proposed terms stay proposed", () => {
  expect(existsSync(registerPath)).toBe(true); expect(existsSync(guidePath)).toBe(true);
  validateGuide(register(), readFileSync(guidePath, "utf8"));
});
it("A10 rejects unmerged capability and unrun-test proof", () => {
  expect(existsSync(registerPath)).toBe(true);
  const unmerged = register(); unmerged.claims[0]!.evidence[0]!.commit = "f".repeat(40);
  expect(() => validate(unmerged)).toThrow();
  const unrun = register(); Object.assign(unrun.claims[0]!, { proof: "test_executed" });
  expect(() => validate(unrun)).toThrow();
  const missing = register(); missing.claims[0]!.evidence[0]!.needle = "a capability that does not exist";
  expect(() => validate(missing)).toThrow();
});
it("A11 rejects approved-price certification savings and live-settlement claims", () => {
  expect(existsSync(registerPath)).toBe(true);
  for (const text of ["10% is approved pricing", "ISO 27001 certified", "Guaranteed 20% savings", "Live settlement and statements are available"]) {
    const input = register(); input.claims[6]!.text = text;
    expect(() => validate(input)).toThrow();
    const hidden = register(); hidden.claims[6]!.limit = text;
    expect(() => validate(hidden)).toThrow();
  }
});

it("A17 rejects duplicate/missing claims, forged paths and unsupported public additions", () => {
  const duplicate = register(); duplicate.claims[1] = duplicate.claims[0]!;
  expect(() => validate(duplicate)).toThrow();
  const missing = register(); missing.claims.pop();
  expect(() => validate(missing)).toThrow();
  const path = register(); path.claims[0]!.evidence[0]!.path = "../outside.md";
  expect(() => validate(path)).toThrow();
  const terms = register(); terms.claims[6]!.classification = "source_inspected";
  expect(() => validate(terms)).toThrow();
  const guide = readFileSync(guidePath, "utf8");
  for (const addition of ["Verified", "VERIFIED", "ISO 27001 certified", "10% with no platform charge", "Guaranteed savings"]) {
    expect(() => validateGuide(register(), `${guide}\n${addition}\n`)).toThrow();
  }
});
