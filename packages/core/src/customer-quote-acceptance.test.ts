import { expect, it } from "vitest";
import { customerQuoteAcceptanceV1, customerQuoteReadV1 } from "./customer-quote-acceptance.js";
const id="10000000-0000-4000-8000-000000000001";
const command={version:"customer-quote-acceptance.v1",commandId:id,jobId:id,expectedJobRevision:1,target:{kind:"quote",id,revision:1,hash:"a".repeat(64)}};
it("Zod 4 keeps exact revision/hash customer intent strict without accepting client authority",()=>{
 expect(customerQuoteAcceptanceV1.parse(command)).toEqual(command);
 for(const extra of [{tenantId:id},{customerId:id},{amount:{pence:1,currency:"GBP"}},{acceptedAt:new Date().toISOString()},{method:"builder_attestation"}])expect(customerQuoteAcceptanceV1.safeParse({...command,...extra}).success).toBe(false);
 for(const target of [{...command.target,hash:"a".repeat(63)},{...command.target,revision:0},{...command.target,kind:"variation"},{...command.target,amount:1}])expect(customerQuoteAcceptanceV1.safeParse({...command,target}).success).toBe(false);
 expect(customerQuoteReadV1.safeParse({version:"customer-quote-read.v1",jobId:id,tenantId:id}).success).toBe(false);
});
