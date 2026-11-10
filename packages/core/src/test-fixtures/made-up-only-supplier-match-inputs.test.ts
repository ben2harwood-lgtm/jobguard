import { describe, expect, it } from "vitest";
import { sha256 } from "../evidence-pack.js";
import { supplierLineMatchInputV1 } from "../supplier-line-matching.js";
import { madeUpOnlyManifest } from "./made-up-only-supplier-benchmark.js";
import { madeUpOnlySupplierMatchInputs as corpus, MADE_UP_ONLY_SUPPLIER_MATCH_INPUTS_SHA256 as pin } from "./made-up-only-supplier-match-inputs.js";

describe("M2-8 pinned made-up input corpus", () => {
  it("covers exactly the held-out identities once, with declared source hashes and valid inputs", () => {
    const held = madeUpOnlyManifest.cases.filter(c => c.split === "held-out");
    expect(corpus).toHaveLength(100);
    expect(new Set(corpus.map(c => c.caseId)).size).toBe(100);
    expect(corpus.map(({ caseId, sourceHash }) => ({ caseId, sourceHash })))
      .toEqual(held.map(c => ({ caseId: c.id, sourceHash: c.sourceHash })));
    for (const row of corpus) expect(supplierLineMatchInputV1.safeParse(row.input).success, row.caseId).toBe(true);
    expect(corpus.some(c => c.caseId === "invented-100")).toBe(false);
  });

  it("retains the canonical JSON SHA-256 pin", () => {
    expect(sha256(JSON.stringify(corpus))).toBe(pin);
  });
});
