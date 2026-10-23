import { describe, expect, it } from "vitest";
import {
  buildEvidenceManifestV3, canonicalManifestV3, evidenceManifestV3,
  manifestDigestV3, renderStandalonePackV3, verifyStandalonePackV3,
  EvidencePackV3Error, type EvidencePackSpecimenInput,
} from "./evidence-pack-v3.js";
import { sha256 } from "./evidence-pack.js";

// Dynamic JSON fixture import keeps filesystem APIs out of core and needs no shared tsconfig edit.
const fixtureModule = new URL("../../../docs/fixtures/evidence-pack-v3.json", import.meta.url).href;
const { default: fixtures } = await import(fixtureModule, { with: { type: "json" } }) as { default: {
  specimens: { name: string; input: EvidencePackSpecimenInput; expected: { manifestHash: string; artifactHash: string } }[];
} };
const input = (name = "settled_catch") => structuredClone(fixtures.specimens.find((f) => f.name === name)!.input);
const exported = () => {
  const supplied = input();
  const manifest = buildEvidenceManifestV3(supplied);
  return { manifest, text: renderStandalonePackV3(manifest, supplied.sources) };
};
const altered = (change: (pack: any) => void) => {
  const { text } = exported();
  const pack = JSON.parse(text);
  change(pack);
  return verifyStandalonePackV3(JSON.stringify(pack));
};

describe("CH8-A unbound preparation specimens only", () => {
  it.each(fixtures.specimens)("EP-A01: $name parses without claiming producer binding", ({ input: supplied, expected }) => {
    const manifest = buildEvidenceManifestV3(supplied);
    expect(evidenceManifestV3.parse(manifest).binding).toBe("unbound-specimen");
    const report = verifyStandalonePackV3(renderStandalonePackV3(manifest, supplied.sources));
    expect(report.contentMatches).toBe(true);
    // Golden digests were produced independently using Python UTF-8 SHA-256/canonical JSON.
    expect(report.manifestHash).toBe(expected.manifestHash);
    expect(report.artifactHash).toBe(expected.artifactHash);
    expect(report.producerBindings).toBe("held");
    expect(report.complete).toBe(false);
  });

  it("EP-A02: permutations preserve canonical bytes, both digests, Unicode and microseconds", () => {
    const a = input("appended_reversal");
    const b = structuredClone(a);
    b.sources.reverse(); b.sections.reverse();
    for (const section of b.sections) if (section.status === "present") section.sourceIds.reverse();
    const ma = buildEvidenceManifestV3(a), mb = buildEvidenceManifestV3(b);
    expect(canonicalManifestV3(ma)).toBe(canonicalManifestV3(mb));
    const ta = renderStandalonePackV3(ma, a.sources), tb = renderStandalonePackV3(mb, b.sources);
    expect(ta).toBe(tb);
    expect(manifestDigestV3(ma)).toBe(manifestDigestV3(mb));
    expect(verifyStandalonePackV3(ta).artifactHash).toBe(sha256(tb));
    expect(ta).toContain("café 日本語");
    expect(ta).toContain(".123456Z"); expect(ta).toContain(".123457Z");
    expect(ta).toContain("exact ratio 1/3");
    expect(ta).not.toMatch(/generatedAt|requestId|packId/);
    expect(a).toEqual(input("appended_reversal"));
  });

  it.each([
    ["missing original", (p: any) => p.sources.pop()],
    ["tampered bytes", (p: any) => { p.sources[0].content += "tampered"; }],
    ["source version", (p: any) => { p.sources[0].sourceVersion = "other"; }],
    ["object version", (p: any) => { p.sources[0].objectVersion = "other"; }],
    ["duplicate", (p: any) => p.sources.push(p.sources[0])],
    ["conflicting duplicate", (p: any) => p.sources.push({ ...p.sources[0], content: "other" })],
    ["tenant", (p: any) => { p.sources[0].tenantId = "other"; }],
    ["job", (p: any) => { p.sources[0].jobId = "other"; }],
    ["case", (p: any) => { p.sources[0].caseId = "other"; }],
    ["unmanifested", (p: any) => p.sources.push({ ...p.sources[0], sourceId: "extra" })],
  ])("EP-A03: rejects %s in supplied bytes", (_name, change) => {
    expect(altered(change)).toMatchObject({ contentMatches: false, complete: false, specimenIntegrityComplete: false });
  });

  it.each(["tenantId", "jobId", "caseId"] as const)("EP-A03: builder rejects foreign %s without filtering", (key) => {
    const supplied = input(); supplied.sources[0]![key] = "foreign";
    expect(() => buildEvidenceManifestV3(supplied)).toThrow(EvidencePackV3Error);
  });

  it("EP-A01/03: rejects unknown versions, fields, bad hashes, links, cutoff and section omissions", () => {
    const { manifest } = exported();
    for (const bad of [
      { ...manifest, version: "evidence-pack-manifest.v4" },
      { ...manifest, binding: "accepted" }, { ...manifest, requestId: "irrelevant" },
      { ...manifest, entries: [{ ...manifest.entries[0], contentHash: "bad" }] },
      { ...manifest, entries: [...manifest.entries, manifest.entries[0]] },
      { ...manifest, lifecycle: { ...manifest.lifecycle, evidenceCutoff: "2026-10-21T00:00:00.000000Z" } },
      { ...manifest, sections: manifest.sections.slice(1) },
    ]) expect(evidenceManifestV3.safeParse(bad).success).toBe(false);
    const supplied = input("appended_reversal");
    supplied.sources.at(-1)!.links[0]!.jobId = "foreign";
    expect(() => buildEvidenceManifestV3(supplied)).toThrow(EvidencePackV3Error);
  });

  it("EP-A04: distinguishes supplied integrity, independent trust and held provenance", () => {
    const { manifest, text } = exported();
    expect(verifyStandalonePackV3(text)).toMatchObject({ contentMatches: true, checkpointTrusted: false, specimenIntegrityComplete: false });
    expect(verifyStandalonePackV3(text).findings).toContain("Checkpoint not independently trusted");
    expect(verifyStandalonePackV3(text, { trustedManifestDigest: "0".repeat(64) })).toMatchObject({ complete: false, checkpointTrusted: false });
    expect(verifyStandalonePackV3(text, { trustedManifestDigest: manifestDigestV3(manifest) })).toMatchObject({ specimenIntegrityComplete: true, complete: false, producerBindings: "held" });
    expect(() => verifyStandalonePackV3(JSON.stringify({ ...JSON.parse(text), checkpointTrusted: true }))).toThrow(EvidencePackV3Error);
  });

  it("EP-A05: pre-lock ordinary shape cannot carry shadow sections or metadata", () => {
    const ordinary = input("pre_lock_ordinary");
    const manifest = buildEvidenceManifestV3(ordinary);
    const text = renderStandalonePackV3(manifest, ordinary.sources);
    expect(manifest.sections).toEqual([]);
    expect(text).not.toMatch(/candidate|classification|placeholder|signalCount|shadow/);
    expect(() => buildEvidenceManifestV3({ ...ordinary, sections: input().sections })).toThrow(EvidencePackV3Error);
    expect(() => buildEvidenceManifestV3({ ...ordinary, sources: input().sources })).toThrow(EvidencePackV3Error);
    expect(() => buildEvidenceManifestV3({ ...ordinary, signalCount: 0 })).toThrow(EvidencePackV3Error);
  });

  it("EP-A06: appended correction retains historical bytes and verifies exact declared links", () => {
    const original = input(), corrected = input("appended_reversal");
    expect(corrected.sources.slice(0, -1)).toEqual(original.sources);
    const previous = renderStandalonePackV3(buildEvidenceManifestV3(original), original.sources);
    const manifest = buildEvidenceManifestV3(corrected);
    expect(verifyStandalonePackV3(renderStandalonePackV3(manifest, corrected.sources)).contentMatches).toBe(true);
    expect(renderStandalonePackV3(buildEvidenceManifestV3(original), original.sources)).toBe(previous);
    corrected.sources.at(-1)!.links[0]!.contentHash = "0".repeat(64);
    expect(() => buildEvidenceManifestV3(corrected)).toThrow(EvidencePackV3Error);
  });

  it("EP-A01/03: strict nested schemas, microsecond boundaries and linked originals fail closed", () => {
    const supplied = input();
    for (const bad of [
      { ...supplied, sources: [{ ...supplied.sources[0], unknown: true }] },
      { ...supplied, sources: [{ ...supplied.sources[0], content: "\ud800" }] },
      { ...supplied, sources: [{ ...supplied.sources[0], sourceId: "\udfff" }] },
      { ...supplied, sources: [{ ...supplied.sources[0], recordedAt: "2026-02-30T00:00:00.123456Z" }] },
      { ...supplied, sources: [{ ...supplied.sources[0], recordedAt: "2026-10-20T00:00:00.123Z" }] },
      { ...supplied, sections: [{ ...supplied.sections[0], unknown: true }] },
      { ...supplied, sources: [...supplied.sources, supplied.sources[0]] },
    ]) expect(() => buildEvidenceManifestV3(bad)).toThrow(EvidencePackV3Error);
    const unicode = input(); unicode.sources[0]!.content = "\ufeff£ 🧱 e\u0301";
    const unicodeManifest = buildEvidenceManifestV3(unicode);
    expect(verifyStandalonePackV3(renderStandalonePackV3(unicodeManifest, unicode.sources)).contentMatches).toBe(true);
    const observation = supplied.sources.find((s) => s.kind === "source_observations")!;
    observation.recordedAt = "2026-10-20T11:00:00.123457Z";
    expect(() => buildEvidenceManifestV3(supplied)).toThrow(EvidencePackV3Error);
    observation.recordedAt = "2026-10-20T11:00:00.123456Z";
    expect(() => buildEvidenceManifestV3(supplied)).not.toThrow();
    const correction = input("appended_reversal");
    correction.sources.at(-1)!.links[0]!.objectVersion = "wrong-object-version";
    expect(() => buildEvidenceManifestV3(correction)).toThrow(EvidencePackV3Error);
  });

  it.each(["null", "not JSON", "{}", '{"version":"evidence-pack-export.v1"}'])("typed invalid export: %s", (text) => {
    expect(() => verifyStandalonePackV3(text)).toThrow(EvidencePackV3Error);
  });
});
