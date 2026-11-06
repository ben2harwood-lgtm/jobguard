import { z } from "zod";
import { accountingScopeV1, accountingSourceV1, accountingTargetV1 } from "./accounting-export.contracts.js";

export const exportArtifactV1 = z.object({ version: z.literal(1), direction: z.literal("push"),
  route: z.enum(["codat", "xero"]), connectionRevision: z.number().int().positive(),
  scope: accountingScopeV1, source: accountingSourceV1, consentRevision: z.number().int().positive(),
  target: accountingTargetV1,
}).strict();
export const exportPreviewV1 = z.object({ version: z.literal(1), artifact: exportArtifactV1,
  previewHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export const exportApprovalV1 = z.object({ version: z.literal(1), decisionId: z.string().uuid(),
  previewHash: z.string().regex(/^[a-f0-9]{64}$/), expiresAt: z.iso.datetime(), humanConfirmed: z.literal(true),
}).strict();
export const exportStatusV1 = exportPreviewV1.extend({ sourceId: z.string().regex(/^demo-[a-z0-9-]{1,80}$/),
  reference: z.string().regex(/^[a-f0-9]{64}$/),
  status: z.enum(["pending", "outcome_unknown", "pushed", "confirmed_absent", "external_edit", "duplicate_import", "reference_conflict"]),
  attemptId: z.string().uuid().nullable(), attempts: z.number().int().nonnegative(), externalId: z.string().nullable(),
  qualifyingRecoveryProof: z.literal(false),
}).strict();
export type ExportPreview = z.infer<typeof exportPreviewV1>;
export type ExportStatus = z.infer<typeof exportStatusV1>;

// Browser-safe stored route projection. No database module enters the client bundle.
const routeName = z.enum(["codat", "xero", "quickbooks"]);
export const routeRequestV1 = z.object({ version: z.literal(1), scope: accountingScopeV1,
  from: routeName, to: routeName, connectionRevision: z.number().int().positive().safe(),
  consentRevision: z.number().int().positive().safe(),
}).strict();
export const routePreviewV1 = z.object({ version: z.literal(1), artifact: routeRequestV1.extend({
  entries: z.array(z.object({ sourceId: z.string().regex(/^demo-[a-z0-9-]{1,80}$/),
    artifact: z.record(z.string(), z.unknown()), reference: z.string().regex(/^[a-f0-9]{64}$/),
    externalId: z.string().regex(/^demo-[a-z0-9-]{1,80}$/), status: z.literal("pushed"),
    attemptId: z.string().uuid().nullable(), attempts: z.number().int().nonnegative(),
  }).strict()),
}).strict(), previewHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export const routeChangeV1 = routePreviewV1.extend({ commandId: z.string().uuid(), decisionId: z.string().uuid(),
  actorId: z.string().uuid(), revision: z.number().int().positive().safe() }).strict();
export const routeReadV1 = z.object({ version: z.literal(1), proposal: routePreviewV1.nullable(),
  confirmed: routeChangeV1.nullable(), history: z.array(routeChangeV1) }).strict();
// The browser submits approval identity/hash only. Scope, tenant and actor are server-derived.
export const routeApprovalV1 = exportApprovalV1.extend({ commandId: z.string().uuid() }).strict();
export type RouteRead = z.infer<typeof routeReadV1>;
