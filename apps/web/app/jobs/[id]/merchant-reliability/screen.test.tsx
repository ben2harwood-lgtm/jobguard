import React from "react";
import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MerchantDeliverySummary } from "./screen";
it("shows sparse uncertainty and descriptive counts without controls",()=>{
 const row={supplierContext:"Merchant <A>",ordersReceived:2,ordersMissing:1,ordersRejected:0,ordersAddedLater:1,sample:"not enough to say" as const};
 const render=(sample:"not enough to say"|"counts")=>renderToStaticMarkup(<MerchantDeliverySummary view={{version:"merchant-delivery-record.v1",suppliers:[{...row,sample}]}}/>);
 expect(render("not enough to say")).toContain("not enough to say");
 expect(render("not enough to say")).not.toContain("Orders with anything missing");
 expect(render("counts")).toContain("Orders with anything missing: 1");
 expect(render("counts")).toContain("Merchant &lt;A&gt;");
 expect(render("counts")).not.toMatch(/<button|<form|<input/);
});
