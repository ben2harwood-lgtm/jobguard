import { z } from "zod";
/** Method catalogue only. Customer commercial writers are separate MON-5 slices. */
export const customerApprovalMethodV1 = z.enum(["builder_attestation", "customer_evidence", "customer_authenticated"]);
export type CustomerApprovalMethod = z.infer<typeof customerApprovalMethodV1>;
