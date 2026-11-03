import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { mapValueReceipt } from "@jobguard/core";
import { MappedReceipt, mappedFeeShare } from "./mapped-value-receipt";
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

it.each([
 [{numerator:"101",denominator:"10"},"£0.101"],
 [{numerator:"21",denominator:"2"},"£0.105"],
 [{numerator:"-101",denominator:"10"},"−£0.101"],
 [{numerator:"8000",denominator:"1"},"£80.00"],
])("renders the exact catch fee share without rounding: %j",(share,expected)=>{
 expect(mappedFeeShare(share)).toBe(expected);
});

it("renders v2 recovery money, sources and one explicit reversal with qualified copy",async()=>{
 const {mapValueReceiptV2}=await import("@jobguard/core");
 const money=(pence:number)=>({pence,currency:"GBP" as const});
 const receipt=mapValueReceiptV2({base:{tenantId:id(1),jobId:id(2),lockId:id(3),lockedRevisionId:id(4),lockedAt:"2026-10-01T00:00:00Z",foundComplete:true,checkId:id(5),checkedAt:"2026-10-02T00:00:00Z",checked:[],tracked:[],assessments:[]},supplier:{reason:"No supplier derivation",balances:[]},withheld:{reason:null,balances:[
  {tenantId:id(1),jobId:id(2),derivationId:id(6),revision:1,at:"2026-10-03T00:00:00Z",recovered:money(282000),fee:money(28200),allocationIds:[id(8)],statementHash:"a".repeat(64)},
  {tenantId:id(1),jobId:id(2),derivationId:id(7),revision:2,at:"2026-10-04T00:00:00Z",recovered:money(32000),fee:money(3200),allocationIds:[id(8)],statementHash:"b".repeat(64)},
 ]}});
 const html=renderToStaticMarkup(<MappedReceipt receipt={receipt}/>);
 expect(html).toContain('withheld-recovered">£320.00');expect(html).toContain('withheld-fee">£32.00');expect(html).toContain('withheld-yours-before-tax">£288.00');
 expect(html.match(/reversal ·/gu)).toHaveLength(1);expect(html).toContain(id(7));
 expect(html).toContain("No supplier derivation");expect(html).not.toMatch(/saved you|would have forgotten|you kept/i);
});
