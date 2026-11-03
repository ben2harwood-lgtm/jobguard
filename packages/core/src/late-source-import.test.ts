const randomUUID=()=>"11111111-1111-4111-8111-111111111111";
import {expect,it} from "vitest";
import {lateSourceImportV1} from "./job-sources.js";
const input=()=>({version:"late-source-import.v1",commandId:randomUUID(),fictionalCustomer:{kind:"named_fictional_customer",name:"Fictional Alex"},text:"Fitted outside tap.",statedSentAt:"2020-01-01T00:00:00Z"});
it("accepts the stated historical date but never a supplied receive time, tenant, hash or object version",()=>{
 expect(lateSourceImportV1.parse(input()).text).toBe("Fitted outside tap.");
 for(const extra of [{tenantId:randomUUID()},{serverReceivedAt:"2020-01-01T00:00:00Z"},{sha256:"a".repeat(64)},{objectVersionId:randomUUID()},{onSite:false}])
  expect(lateSourceImportV1.safeParse({...input(),...extra}).success).toBe(false);
 for(const text of ["", "  ","x".repeat(8001),"\0"])expect(lateSourceImportV1.safeParse({...input(),text}).success).toBe(false);
 expect(lateSourceImportV1.safeParse({...input(),statedSentAt:"yesterday"}).success).toBe(false);
});
