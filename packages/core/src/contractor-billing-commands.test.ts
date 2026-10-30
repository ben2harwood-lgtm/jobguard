import {expect,it} from "vitest";
import {billingFinaliseCommandV1,billingImportCommandV1,billingApproveDeliveryCommandV1,billingAdvanceDeliveryCommandV1} from "./contractor-billing-commands.js";
const id="11111111-1111-4111-8111-111111111111";
it("E6-01 E6-04 boundary refuses authority fields",()=>{expect(billingFinaliseCommandV1.safeParse({version:"billing-finalise.v1",commandId:id,clientContractId:id,role:"finance"}).success).toBe(false);});
it("E6-01 export command carries only contract and command identities",()=>{expect(billingFinaliseCommandV1.parse({version:"billing-finalise.v1",commandId:id,clientContractId:id})).toHaveProperty("commandId",id);});
it("E6-16 import refuses caller supplied allocations and completeness",()=>{expect(billingImportCommandV1.safeParse({version:"billing-import-command.v1",commandId:id,events:[],transport:"api",sourceHash:"a".repeat(64),complete:true}).success).toBe(false);});
it("E6-23 exact delivery approval requires explicit expiry and fictional destination",()=>{expect(billingApproveDeliveryCommandV1.safeParse({version:"billing-approve-delivery.v1",commandId:id,batchId:id,channel:"fake_api",destination:"example.com",contentHash:"a".repeat(64)}).success).toBe(false);});
it("E6-24 client cannot supply a provider outcome",()=>{expect(billingAdvanceDeliveryCommandV1.safeParse({version:"billing-advance-delivery.v1",outboxActionId:id,action:"execute",outcome:"succeeded"}).success).toBe(false);});
