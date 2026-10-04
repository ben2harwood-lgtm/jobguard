import { z } from "zod";

const digestV1 = z.string().regex(/^[a-f0-9]{64}$/);
const sourceIdentityV1 = z.object({
  sourceId: z.string().min(1),
  version: z.number().int().positive(),
  hash: digestV1,
}).strict();
const sourceKindV1 = z.enum([
  "accepted_quote", "approval", "proof", "variation", "invoice", "recovery_case",
  "supplier_agreement", "supplier_delivery", "supplier_invoice",
]);
export const evidenceSourceV1 = z.object({
  sourceId: z.string().min(1),
  kind: sourceKindV1,
  version: z.number().int().positive(),
  label: z.string().min(1),
  content: z.string(),
  jobId: z.string().min(1),
  redactedFrom: sourceIdentityV1.optional(),
}).strict();
export type EvidenceSource = z.infer<typeof evidenceSourceV1>;
export const evidenceManifestEntryV1 = z.object({
  sourceId: z.string().min(1),
  kind: sourceKindV1,
  version: z.number().int().positive(),
  label: z.string().min(1),
  contentHash: digestV1,
  redactedFrom: sourceIdentityV1.optional(),
}).strict();
export type EvidenceManifestEntry = z.infer<typeof evidenceManifestEntryV1>;
export const evidenceManifestV1 = z.object({
  version: z.literal("evidence-pack-manifest.v1"),
  claim: z.literal("mapped, inspectable"),
  caseId: z.string().min(1),
  jobId: z.string().min(1),
  omissions: z.array(z.string().min(1)).optional(),
  entries: z.array(evidenceManifestEntryV1).min(1).refine(
    (entries) => new Set(entries.map((entry) => JSON.stringify([entry.sourceId, entry.version]))).size === entries.length,
    "Duplicate source identity/version in manifest",
  ),
  statement: z.object({
    provenance: z.string().min(1),
    trustLimitations: z.array(z.string().min(1)).min(1),
  }).strict(),
}).strict();
export type EvidenceManifest = z.infer<typeof evidenceManifestV1>;

export const EVIDENCE_PACK_SANDBOX_BANNER = "Practice sandbox — synthetic data; nothing is sent or charged";
export const standaloneEvidencePackV1 = z.object({
  version: z.literal("evidence-pack-export.v1"),
  mediaType: z.literal("text/plain"),
  banner: z.literal(EVIDENCE_PACK_SANDBOX_BANNER),
  manifest: evidenceManifestV1,
  sources: z.array(evidenceSourceV1),
}).strict();
export type StandaloneEvidencePack = z.infer<typeof standaloneEvidencePackV1>;

// Dependency-free SHA-256 keeps the domain engine usable in browser and server code.
export function sha256(value:string){const rr=(n:number,x:number)=>(x>>>n)|(x<<(32-n)),k=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2],h=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19],bytes=Array.from(new TextEncoder().encode(value)),bits=bytes.length*8;bytes.push(128);while(bytes.length%64!==56)bytes.push(0);for(let i=7;i>=0;i--)bytes.push(i<4?(bits>>>i*8)&255:0);for(let i=0;i<bytes.length;i+=64){const w=new Array<number>(64);for(let j=0;j<16;j++)w[j]=(bytes[i+j*4]!<<24)|(bytes[i+j*4+1]!<<16)|(bytes[i+j*4+2]!<<8)|bytes[i+j*4+3]!;for(let j=16;j<64;j++){const a=w[j-15]!,b=w[j-2]!,s0=rr(7,a)^rr(18,a)^(a>>>3),s1=rr(17,b)^rr(19,b)^(b>>>10);w[j]=(w[j-16]!+s0+w[j-7]!+s1)|0}let[a,b,c,d,e,f,g,q]=h;for(let j=0;j<64;j++){const s1=rr(6,e!)^rr(11,e!)^rr(25,e!),ch=(e!&f!)^(~e!&g!),t1=(q!+s1+ch+k[j]!+w[j]!)|0,s0=rr(2,a!)^rr(13,a!)^rr(22,a!),maj=(a!&b!)^(a!&c!)^(b!&c!),t2=(s0+maj)|0;q=g;g=f;f=e;e=(d!+t1)|0;d=c;c=b;b=a;a=(t1+t2)|0}for(let j=0;j<8;j++)h[j]=(h[j]!+[a,b,c,d,e,f,g,q][j]!)|0}return h.map(x=>(x>>>0).toString(16).padStart(8,"0")).join("")}

const canonical = (value: unknown): string => Array.isArray(value)
  ? `[${value.map(canonical).join(",")}]`
  : value && typeof value === "object"
    ? `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(",")}}`
    : JSON.stringify(value);

export function buildEvidenceManifest(caseId: string, jobId: string, sources: EvidenceSource[], omissions: string[] = []): EvidenceManifest {
  const entries = sources.filter((source) => source.jobId === jobId).map((source) => ({
    sourceId: source.sourceId, kind: source.kind, version: source.version, label: source.label,
    contentHash: sha256(source.content), ...(source.redactedFrom ? { redactedFrom: source.redactedFrom } : {}),
  })).sort((a, b) => `${a.kind}\0${a.sourceId}\0${String(a.version).padStart(10, "0")}`.localeCompare(`${b.kind}\0${b.sourceId}\0${String(b.version).padStart(10, "0")}`));
  return evidenceManifestV1.parse({
    version: "evidence-pack-manifest.v1", claim: "mapped, inspectable", caseId, jobId, entries,
    ...(omissions.length ? { omissions: [...new Set(omissions)].sort() } : {}),
    statement: {
      provenance: "Assembled from the exact immutable source versions listed in this manifest.",
      trustLimitations: [
        "Content mapping does not establish the truth of a claim.",
        "Checkpoint trust must be assessed independently.",
      ],
    },
  });
}
export const canonicalManifest = (manifest: EvidenceManifest) => canonical(manifest);
export const manifestDigest = (manifest: EvidenceManifest) => sha256(canonicalManifest(manifest));
export type PackFinding = "Missing original source" | "Content hash mismatch" | "Wrong source version" | "Checkpoint not independently trusted";
export type EvidencePackInspection = { findings: PackFinding[]; contentMatches: boolean; complete: boolean };

/** Trust is an explicit caller assertion, never a fact inferred from stored or exported content. */
export function inspectEvidenceManifest(manifest: EvidenceManifest, actual: EvidenceSource[], checkpointTrusted = false): EvidencePackInspection {
  const findings: PackFinding[] = manifest.omissions?.length ? ["Missing original source"] : [];
  const inspectSource = (sourceId: string, version: number, hash: string): EvidenceSource | undefined => {
    const versions = actual.filter((source) => source.sourceId === sourceId);
    const exactVersions = versions.filter((source) => source.version === version);
    const exact = exactVersions[0];
    if (!versions.length) findings.push("Missing original source");
    else if (!exact || exact.jobId !== manifest.jobId) findings.push("Wrong source version");
    else if (exactVersions.length !== 1 || sha256(exact.content) !== hash) findings.push("Content hash mismatch");
    return exact;
  };
  for (const entry of manifest.entries) {
    const exact = inspectSource(entry.sourceId, entry.version, entry.contentHash);
    if (exact && (exact.kind !== entry.kind || exact.label !== entry.label || canonical(exact.redactedFrom ?? null) !== canonical(entry.redactedFrom ?? null))) {
      findings.push("Wrong source version");
    }
    if (entry.redactedFrom) {
      inspectSource(entry.redactedFrom.sourceId, entry.redactedFrom.version, entry.redactedFrom.hash);
    }
  }
  // Every supplied source must be one exact manifested identity/version of the manifest's own job. A source that is
  // listed under another version, or belongs to another job, is unmanifested content and can never be "complete".
  if (actual.some((source) => source.jobId !== manifest.jobId ||
    !manifest.entries.some((entry) => entry.sourceId === source.sourceId && entry.version === source.version))) {
    findings.push("Wrong source version");
  }
  if (!checkpointTrusted) findings.push("Checkpoint not independently trusted");
  const uniqueFindings = [...new Set(findings)];
  return {
    findings: uniqueFindings,
    contentMatches: uniqueFindings.every((finding) => finding === "Checkpoint not independently trusted"),
    complete: uniqueFindings.length === 0,
  };
}

/** A text/plain JSON envelope is deliberately not named or served as an archive. */
export function renderStandalonePack(manifest: EvidenceManifest, sources: EvidenceSource[]): string {
  return JSON.stringify(standaloneEvidencePackV1.parse({
    version: "evidence-pack-export.v1", mediaType: "text/plain", banner: EVIDENCE_PACK_SANDBOX_BANNER,
    manifest, sources,
  }), null, 2);
}

export class EvidencePackVerificationError extends Error {
  readonly code = "EVIDENCE_PACK_INVALID_EXPORT";
  constructor() {
    super("Invalid evidence-pack export: expected the versioned text/plain envelope");
    this.name = "EvidencePackVerificationError";
  }
}
export function parseStandalonePack(text: string): StandaloneEvidencePack {
  try {
    return standaloneEvidencePackV1.parse(JSON.parse(text));
  } catch {
    throw new EvidencePackVerificationError();
  }
}

/** The expected digest must come from an independent trusted channel, never this file itself. */
export function verifyStandalonePack(text: string, options: { trustedManifestDigest?: string } = {}) {
  const pack = parseStandalonePack(text);
  const manifestHash = manifestDigest(pack.manifest);
  const checkpointTrusted = options.trustedManifestDigest !== undefined &&
    digestV1.safeParse(options.trustedManifestDigest).success && options.trustedManifestDigest === manifestHash;
  return { ...inspectEvidenceManifest(pack.manifest, pack.sources, checkpointTrusted), manifestHash, checkpointTrusted };
}
