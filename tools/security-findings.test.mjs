import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseReleaseInventory, parseReleaseWithSecurityFindings, securityFindingsV1Schema } from "../packages/config/src/release-inventory.ts";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const rows = source => source.split("\n").filter(line => line.startsWith("| ")).map(line => line.split("|").slice(1, -1).map(cell => cell.trim()));

test("M5-12: actual security findings are validated and gate every recorded release", () => {
  const register = securityFindingsV1Schema.parse(JSON.parse(read("config/security-findings.v1.json")));
  const inventory = parseReleaseInventory(JSON.parse(read("config/release-inventory.v1.json")));
  for (const release of inventory.releaseRecords) parseReleaseWithSecurityFindings(release, register);
});

test("M5-12: unachieved certification and assurance remain visibly pending", () => {
  const roadmap = read("docs/security/certification-roadmap.md");
  const register = read("docs/security/not-claimed-register.md");
  const roadmapRows = rows(roadmap);
  for (const scheme of ["Cyber Essentials", "Cyber Essentials Plus", "ISO 27001", "SOC 2"]) {
    const row = roadmapRows.find(cells => cells[0] === scheme);
    assert.deepEqual(row, [scheme, "not started", "none", "none", "none"]);
  }
  for (let step = 0; step <= 6; step++) {
    assert.equal(roadmapRows.find(cells => cells[0] === String(step))?.at(-1), "not started");
  }
  const pendingLabels = new Set(["HELD", "NOT BUILT", "NOT DETERMINED", "NOT EVIDENCED", "NOT PRODUCED", "NOT COMMISSIONED", "NOT STARTED"]);
  const registerRows = rows(register);
  for (const id of [...Array.from({ length: 24 }, (_, i) => `E-${i + 50}`), "E-67a", "E-68a"]) {
    const row = registerRows.find(cells => cells[0] === id);
    assert.ok(row && pendingLabels.has(row[2]), `${id} must retain an explicit pending label until separately evidenced`);
  }
  for (const source of [roadmap, register]) {
    assert.ok(source.includes("Nothing here has been assessed or certified by anyone outside the project."));
    assert.ok(source.includes("Not to be sent to any buyer until Ben approves it."));
  }
  assert.ok(roadmap.includes("No checklist is a certificate or assessment result."));
});
