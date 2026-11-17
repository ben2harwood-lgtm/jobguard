import { z } from "zod";
export {
  jobAssignmentsV1, jobSiteVisitsV1, sorVersionImportV1, sorVersionListV1, sorVersionResultV1, workOrderBatchDetailV1, workOrderFailureV1, workOrderImportRequestV1, workOrderImportResultV1, workOrderOverviewV1,
  workOrderRevisionsV1, workOrderSampleCatalogV1,
} from "@jobguard/core";
/** The session is the only authority: tenant, membership and role are never read from the request. */
export const workOrderPrincipalV1 = z.object({ version: z.literal("contractor-principal.v1"), sessionId: z.string().uuid() }).strict();
