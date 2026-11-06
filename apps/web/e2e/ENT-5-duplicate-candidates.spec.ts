import { test, expect } from "@playwright/test";
// Rendering/transport journey. Real command, grant, export and race guarantees are
// covered by extra-duplicate-candidates.integration.test.ts against PostgreSQL.
const id = (n: number) => `40000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
test("possible duplicates can be linked and un-linked, with server refusals and accessible controls", async ({ page, context }) => {
 let linked = false, refuse = true;
 const members = [1, 2].map(n => ({ extraId: id(n), canonicalId: id(n), description: `Fictional gutter ${n}` }));
 await page.route("**/api/northside/extras", route => route.fulfill({ json: { role: "supervisor", extras: members.map(m => ({ ...m, jobId: id(3), orderReference: "Fictional order", state: "logged", steps: [], requestId: null, quotedPence: 338, netPence: 338, note: "Fictional capture" })) } }));
 await page.route(`**/api/contractor/jobs/${id(3)}/duplicate-candidates`, async route => {
  if (route.request().method() === "POST") {
   const body = route.request().postDataJSON(); expect(body.canonicalId).toBe(id(2)); expect(body.duplicateId).toBe(id(1));
   if (refuse) { refuse = false; return route.fulfill({ status: 409, json: { code: "EXTRA_EXPORTED" } }); }
   linked = true; return route.fulfill({ json: { linkId: id(4) } });
  }
  return route.fulfill({ json: { version: "extra-duplicate-candidates.v1", jobId: id(3), revision: linked ? 1 : 0,
   groups: linked ? [] : [{ id: id(1), fingerprint: "a".repeat(64), extras: members }], activeLinks: linked ? [{ linkId: id(4), duplicateId: id(1), canonicalId: id(2), duplicateLabel: members[0]!.description, canonicalLabel: members[1]!.description }] : [] } });
 });
 await page.route(`**/api/contractor/jobs/${id(3)}/duplicate-unlinks`, async route => {
  expect(route.request().postDataJSON()).toMatchObject({ reasonCode: "linked_in_error", expectedRevision: 1 });
  linked = false; return route.fulfill({ json: { unlinkId: id(5) } });
 });
 await page.goto("/approvals/extras");
 const main = page.getByRole("main"), section = main.getByRole("region", { name: `Possible duplicates on job ${id(3)}` });
 await expect(section.getByText("These extras stop the billing export until they are linked or reviewed as not duplicates.")).toBeVisible();
 await section.getByLabel("Canonical extra to bill").selectOption(id(2));
 for (const control of await section.locator("button, select").all()) {
  const box = await control.boundingBox(); expect(box!.height).toBeGreaterThanOrEqual(44); expect(box!.width).toBeGreaterThanOrEqual(44);
 }
 // Chromium's own accessibility and contrast audits; no external script/provider.
 const cdp = await context.newCDPSession(page);
 await cdp.send("Accessibility.enable");
 const tree = await cdp.send("Accessibility.getFullAXTree");
 expect(tree.nodes.filter(node => !node.ignored && ["button", "combobox"].includes(String(node.role?.value)) && !String(node.name?.value ?? "").trim())).toEqual([]);
 const issues: unknown[] = [];
 cdp.on("Audits.issueAdded", event => { if (event.issue.code === "LowTextContrastIssue") issues.push(event.issue); });
 await cdp.send("Audits.enable"); await cdp.send("Audits.checkContrast", { reportAAA: false });
 for (const issue of issues as Array<{ details: { lowTextContrastIssueDetails: { violatingNodeId: number } } }>) {
  const { node } = await cdp.send("DOM.describeNode", { backendNodeId: issue.details.lowTextContrastIssueDetails.violatingNodeId });
  await test.info().attach(`contrast-node-${node.backendNodeId}`, { body: JSON.stringify({ issue, node }), contentType: "application/json" });
 }
 expect(issues).toEqual([]);
 await section.getByRole("button", { name: "Link duplicate" }).click();
 await expect(main.getByRole("alert")).toContainText("EXTRA_EXPORTED");
 await section.getByRole("button", { name: "Link duplicate" }).click();
 await expect(section.getByText("No unresolved candidate groups.")).toBeVisible();
 await expect(section.getByRole("button", { name: "Un-link extras" })).toBeDisabled();
 await section.getByLabel("Reason for un-linking (required)").selectOption("linked_in_error");
 await section.getByRole("button", { name: "Un-link extras" }).click();
 await expect(section.getByText("These extras stop the billing export until they are linked or reviewed as not duplicates.")).toBeVisible();
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("not duplicates requires a reason and binds the exact group; self-dismissal and stale snapshots are surfaced",async({page})=>{
 let dismissed=false, refusal="SELF_DISMISSAL";
 const members=[1,2].map(n=>({extraId:id(n),canonicalId:id(n),description:`Fictional separate work ${n}`}));
 await page.route("**/api/northside/extras",route=>route.fulfill({json:{role:"supervisor",extras:members.map(m=>({...m,jobId:id(3),orderReference:"Fictional order",state:"logged",steps:[],requestId:null,quotedPence:338,netPence:338,note:"Fictional capture"}))}}));
 await page.route(`**/api/contractor/jobs/${id(3)}/duplicate-candidates`,route=>route.fulfill({json:{version:"extra-duplicate-candidates.v1",jobId:id(3),revision:0,groups:dismissed?[]:[{id:id(1),fingerprint:"a".repeat(64),extras:members}],activeLinks:[]}}));
 await page.route(`**/api/contractor/jobs/${id(3)}/duplicate-dispositions`,route=>{
  expect(route.request().postDataJSON()).toMatchObject({version:"duplicate-disposition.v1",groupId:id(1),fingerprint:"a".repeat(64),disposition:"not_duplicates",reasonCode:"different_work"});
  expect(route.request().postDataJSON()).not.toHaveProperty("actorMembershipId");
  if(refusal){const code=refusal;refusal=code==="SELF_DISMISSAL"?"STALE_REVISION":"";return route.fulfill({status:409,json:{code}});}
  dismissed=true;return route.fulfill({json:{factId:id(8)}});
 });
 await page.goto("/approvals/extras");const main=page.getByRole("main"),section=main.getByRole("region",{name:`Possible duplicates on job ${id(3)}`});
 const button=section.getByRole("button",{name:"Not duplicates",exact:true});await expect(button).toBeDisabled();
 await section.getByLabel("Reason these are not duplicates (required)").selectOption("different_work");
 for(const code of ["SELF_DISMISSAL","STALE_REVISION"]){await button.click();await expect(main.getByRole("alert")).toContainText(code);await expect(section.getByRole("listitem").filter({hasText:"Fictional separate work 1"})).toBeVisible();}
 await button.click();await expect(section.getByText("No unresolved candidate groups.")).toBeVisible();
});
