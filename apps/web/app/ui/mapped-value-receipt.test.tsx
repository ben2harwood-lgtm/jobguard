import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { mapValueReceipt } from "@jobguard/core";
import { MappedReceipt } from "./mapped-value-receipt";
const id=(n:number)=>`30000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
it("renders counts without money, mapped source details, fee-free captures and honest unavailable categories",()=>{
 const receipt=mapValueReceipt({tenantId:id(1),jobId:id(2),lockId:id(3),lockedRevisionId:id(4),lockedAt:"2026-10-01T00:00:00Z",foundComplete:true,checkId:id(5),checkedAt:"2026-10-02T00:00:00Z",checked:[id(6)],tracked:[{id:id(7),sourceId:id(8),revisionId:id(4),netPence:360000,invoiceId:id(9),checkId:id(13),at:"2026-10-03T00:00:00Z"}],assessments:[]});
 const html=renderToStaticMarkup(<MappedReceipt receipt={receipt}/>);
 expect(html).toContain("mapped, inspectable");expect(html).toContain("£3,600.00");expect(html).toContain('tracked-fee">£0.00');
 expect(html.match(/What we checked<\/h2>(.*?)<\/section>/)?.[1]).not.toContain("£");
 expect(html).toContain("Yours before VAT and tax");expect(html).toContain(receipt.sources.lockId);
 expect(html).not.toMatch(/saved you|would have forgotten|verified|you kept/i);
 expect(html).toContain("Supplier recoveries");expect(html).toContain("Withheld-payment recoveries");expect(html).toContain("No mapped recovery figures are available yet.");
});
