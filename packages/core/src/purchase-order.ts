import { z } from "zod";
import { materialNetPence, materialQuantityV1 } from "./materials.js";

export const purchaseOrderDraftV1=z.object({version:z.literal("purchase-order-draft.v1"),requirementId:z.string().uuid(),quantity:materialQuantityV1,unitPricePence:z.number().int().nonnegative().max(1_000_000_000_000),recipient:z.string().min(1).max(320).endsWith(".invalid"),requiredDate:z.string().date(),expectedRevision:z.number().int().nonnegative()}).strict();
export type PurchaseOrderDraft=z.infer<typeof purchaseOrderDraftV1>;
export const purchaseOrderNet=(quantity:string,unitPricePence:number)=>materialNetPence(quantity,unitPricePence);
export const purchaseOrderAuthorityContent=(value:{quantity:string;unitPricePence:number;recipient:string;requiredDate:string;revision:number})=>JSON.stringify([value.quantity,value.unitPricePence,value.recipient,value.requiredDate,value.revision]);
