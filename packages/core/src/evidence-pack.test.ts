import { describe, expect, it } from "vitest";
import {
  buildEvidenceManifest,
  canonicalManifest,
  EvidencePackVerificationError,
  inspectEvidenceManifest,
  manifestDigest,
  parseStandalonePack,
  renderStandalonePack,
  sha256,
  verifyStandalonePack,
  type EvidenceSource,
} from "./evidence-pack.js";

const source = (overrides: Partial<EvidenceSource> = {}): EvidenceSource => ({
  sourceId: "quote", kind: "accepted_quote", version: 1, label: "Accepted quote",
  content: "£320.00", jobId: "job-1", ...overrides,
});
const fixture = () => {
  const sources = [source(), source({ sourceId: "approval", kind: "approval" })];
  return { sources, manifest: buildEvidenceManifest("case", "job-1", sources) };
};

describe("evidence pack domain engine", () => {
  it.each([
    ["abc", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"],
    ["abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq", "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1"],
    ["こんにちは世界", "c6a304536826fb57e1b1896fcd8c91693a746233ae6a286dc85a65c8ae1f416f"],
  ])("uses UTF-8 SHA-256 for %s", (input, expected) => {
    expect(sha256(input)).toBe(expected);
  });

  it("canonicalises valid JSON with deterministic ordering and excludes another job", () => {
    const a = buildEvidenceManifest("case", "job-1", [source({ sourceId: "z" }), source({ sourceId: "a", kind: "approval" }), source({ jobId: "another-job" })]);
    const b = buildEvidenceManifest("case", "job-1", [source({ sourceId: "a", kind: "approval" }), source({ sourceId: "z" })]);
    expect(canonicalManifest(a)).toBe(canonicalManifest(b));
    expect(manifestDigest(a)).toBe(manifestDigest(b));
    expect(JSON.parse(canonicalManifest(a))).toEqual(a);
    expect(a.entries).toHaveLength(2);
  });

  it("reports each failure independently and lineage hashes differ", () => {
    const original = source();
    const redacted = source({ sourceId: "quote-redacted", content: "£[redacted]", redactedFrom: { sourceId: "quote", version: 1, hash: sha256("£320.00") } });
    const m = buildEvidenceManifest("case", "job-1", [original, redacted]);
    expect(m.entries[0]?.contentHash).not.toBe(m.entries[1]?.contentHash);
    expect(inspectEvidenceManifest(m, [source({ content: "changed" }), redacted], false).findings).toEqual(expect.arrayContaining(["Content hash mismatch", "Checkpoint not independently trusted"]));
    expect(inspectEvidenceManifest(m, [redacted], true).findings).toContain("Missing original source");
    expect(inspectEvidenceManifest(m, [source({ version: 2 }), redacted], true).findings).toContain("Wrong source version");
  });

  it("does not infer independent checkpoint trust from intact contents", () => {
    const { manifest, sources } = fixture();
    expect(inspectEvidenceManifest(manifest, sources)).toEqual({ findings: ["Checkpoint not independently trusted"], contentMatches: true, complete: false });
  });

  it.each([
    { jobId: "other-job" }, { kind: "invoice" as const },
    { label: "Changed authoritative source label" },
  ])("fails closed for substituted source identity: %j", (overrides) => {
    const { manifest, sources } = fixture();
    const actual = sources.map((item) => item.sourceId === "quote" ? { ...item, ...overrides } : item);
    expect(inspectEvidenceManifest(manifest, actual, true).complete).toBe(false);
    expect(inspectEvidenceManifest(manifest, actual, true).contentMatches).toBe(false);
  });

  it("does not accept contradictory duplicate source identities", () => {
    const { manifest, sources } = fixture();
    expect(inspectEvidenceManifest(manifest, [...sources, source({ content: "forged" })], true).contentMatches).toBe(false);
  });

  it("verifies the original hash for a redacted derivative", () => {
    const sources = [source(), source({ sourceId: "redacted", content: "hidden", redactedFrom: { sourceId: "quote", version: 1, hash: sha256("different original") } })];
    expect(inspectEvidenceManifest(buildEvidenceManifest("case", "job-1", sources), sources, true).findings).toContain("Content hash mismatch");
  });
});

describe("standalone text evidence pack verification", () => {
  it("round-trips a versioned JSON envelope with the exact banner and limitations", () => {
    const { manifest, sources } = fixture();
    const text = renderStandalonePack(manifest, sources);
    const parsed = parseStandalonePack(text);
    expect(parsed.version).toBe("evidence-pack-export.v1");
    expect(parsed.banner).toBe("Practice sandbox — synthetic data; nothing is sent or charged");
    expect(parsed.mediaType).toBe("text/plain");
    expect(parsed.manifest).toEqual(manifest);
    expect(parsed.sources).toEqual(sources);
    expect(text).toContain("Content mapping does not establish the truth of a claim.");
  });

  it("binds missing source disclosures into the manifest digest and cannot call omissions complete", () => {
    const { sources } = fixture();
    const intact = buildEvidenceManifest("case", "job-1", sources);
    const manifest = buildEvidenceManifest("case", "job-1", sources, ["Accepted invoice source has not been issued"]);
    expect(manifestDigest(manifest)).not.toBe(manifestDigest(intact));
    const report = verifyStandalonePack(renderStandalonePack(manifest, sources), { trustedManifestDigest: manifestDigest(manifest) });
    expect(report.findings).toEqual(["Missing original source"]);
    expect(report.contentMatches).toBe(false);
    expect(report.complete).toBe(false);
  });

  it("requires independently supplied checkpoint trust, never a self-asserted field", () => {
    const { manifest, sources } = fixture();
    const text = renderStandalonePack(manifest, sources);
    expect(verifyStandalonePack(text)).toMatchObject({ findings: ["Checkpoint not independently trusted"], contentMatches: true, complete: false, checkpointTrusted: false });
    expect(verifyStandalonePack(text, { trustedManifestDigest: manifestDigest(manifest) })).toMatchObject({ findings: [], contentMatches: true, complete: true, checkpointTrusted: true });
    expect(verifyStandalonePack(text, { trustedManifestDigest: "0".repeat(64) }).findings).toEqual(["Checkpoint not independently trusted"]);
    const forged = { ...JSON.parse(text), checkpointTrusted: true };
    expect(() => parseStandalonePack(JSON.stringify(forged))).toThrow(EvidencePackVerificationError);
  });

  it.each([
    ["missing", "Missing original source"],
    ["tampered", "Content hash mismatch"],
    ["wrong-version", "Wrong source version"],
  ] as const)("reproduces %s findings from exported bytes without application state", (scenario, finding) => {
    const { manifest, sources } = fixture();
    const actual = scenario === "missing" ? sources.slice(1) : sources.map((item, index) => index === 0 ? { ...item, ...(scenario === "tampered" ? { content: "changed" } : { version: 2 }) } : item);
    const text = renderStandalonePack(manifest, actual);
    const result = verifyStandalonePack(text, { trustedManifestDigest: manifestDigest(manifest) });
    expect(result.findings).toEqual([finding]);
    expect(result.complete).toBe(false);
    expect(result.contentMatches).toBe(false);
    expect(result.findings).toEqual(inspectEvidenceManifest(manifest, actual, true).findings);
  });

  it.each([
    ["another version of a manifested source with changed content", { version: 2, content: "unmanifested changed content" }],
    ["an unmanifested version with identical content", { version: 2 }],
    ["another job's content at an unmanifested version", { version: 2, jobId: "other-job", content: "other job content" }],
  ] as const)("does not call a pack complete when it carries %s", (_name, extra) => {
    const { manifest, sources } = fixture();
    const actual = [...sources, source(extra)];
    const trusted = { trustedManifestDigest: manifestDigest(manifest) };
    const result = verifyStandalonePack(renderStandalonePack(manifest, actual), trusted);
    expect(result.findings).toEqual(["Wrong source version"]);
    expect(result.contentMatches).toBe(false);
    expect(result.complete).toBe(false);
    expect(inspectEvidenceManifest(manifest, actual, true).findings).toEqual(["Wrong source version"]);
  });

  it("does not call a pack complete when a supplied source belongs to another job, even at a manifested version", () => {
    const { manifest, sources } = fixture();
    const actual = [...sources, source({ jobId: "other-job", content: "other job content" })];
    const result = verifyStandalonePack(renderStandalonePack(manifest, actual), { trustedManifestDigest: manifestDigest(manifest) });
    expect(result.complete).toBe(false);
    expect(result.contentMatches).toBe(false);
    expect(result.findings).toContain("Wrong source version");
  });

  it.each(["not JSON", "null", "{}", JSON.stringify({ version: "evidence-pack-export.v2" })])("returns a typed parse error for malformed input %s", (input) => {
    expect(() => parseStandalonePack(input)).toThrow(EvidencePackVerificationError);
  });

  it("rejects unknown nested schema versions, invalid hashes and duplicate manifest entries", () => {
    const { manifest, sources } = fixture();
    const parsed = JSON.parse(renderStandalonePack(manifest, sources));
    for (const broken of [
      { ...parsed, manifest: { ...manifest, version: "evidence-pack-manifest.v2" } },
      { ...parsed, manifest: { ...manifest, entries: [{ ...manifest.entries[0], contentHash: "not-a-hash" }] } },
      { ...parsed, manifest: { ...manifest, entries: [...manifest.entries, manifest.entries[0]] } },
    ]) expect(() => parseStandalonePack(JSON.stringify(broken))).toThrow(EvidencePackVerificationError);
  });
});
