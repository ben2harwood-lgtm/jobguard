import { z } from 'zod';
export const contractorBundleCheckV1 = z.object({
  version: z.literal('contractor-bundle-query.v1'), jobId: z.string().uuid(), extraId: z.string().uuid(), requestId: z.string().uuid(),
}).strict();
export const bundleCheckReasons = z.enum(['APPROVAL_OR_SCOPE_INVALID', 'MISSING_ORIGINAL', 'WRONG_VERSION', 'ALTERED_FILE', 'SOURCE_LINK_INVALID']);
export type BundleCheckReason = z.infer<typeof bundleCheckReasons>;
const section = z.object({ name: z.string(), state: z.enum(['present', 'absent', 'not_checked']) }).strict();
const report = z.object({
  version: z.literal('evidence-bundle-verification.v1'), manifestHash: z.string(), findings: z.array(z.string()),
  absent: z.array(z.string()), altered: z.array(z.string()), content: z.enum(['intact', 'damaged']),
  checkpoint: z.enum(['missing', 'untrusted', 'trusted']), authorityBound: z.boolean(), sourceComplete: z.boolean(),
  exportIntegrityComplete: z.boolean(), externallyVerified: z.literal(false), externalClaims: z.literal('externally_unverified'), limitations: z.string(),
}).strict();
export const bundleCheckResultV1 = z.object({
  version: z.literal('contractor-bundle-check.v1'), sections: z.array(section), manifestDigest: z.string().nullable(),
  report: report.nullable(), reason: bundleCheckReasons.nullable(),
}).strict();
export type BundleCheckResult = z.infer<typeof bundleCheckResultV1>;
