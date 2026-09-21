import{z}from"zod";import{purchaseOrderDraftV1}from"@jobguard/core";
export{purchaseOrderDraftV1};export const purchaseOrderPlacementV1=z.object({version:z.literal("purchase-order-placement.v1"),command:z.unknown()}).strict();
