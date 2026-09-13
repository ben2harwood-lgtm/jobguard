import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const directory = "docs/decisions";
const files = readdirSync(directory).filter((file) => /^d(?:0[1-9]|1[0-2])-.*\.md$/u.test(file)).sort();
const requiredFields = [
  "Owner / required approver",
  "Policy version",
  "Dated approver evidence",
  "Applicable environment / jurisdiction",
  "Source / supporting review",
  "Executable feature gate",
];

test("D01-D12 exist as proposed records with every governance field", () => {
  assert.equal(files.length, 12);
  files.forEach((file, index) => {
    assert.match(file, new RegExp(`^d${String(index + 1).padStart(2, "0")}-`, "u"));
    const record = readFileSync(`${directory}/${file}`, "utf8");
    assert.match(record, /\*\*Status:\*\* `proposed`/u);
    assert.doesNotMatch(record, /\*\*Status:\*\* `approved`/u);
    for (const field of requiredFields) assert.match(record, new RegExp(`\\*\\*${field}:\\*\\*`, "u"), `${file} lacks ${field}`);
  });
});
