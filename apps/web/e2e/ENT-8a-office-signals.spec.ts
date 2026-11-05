import { test,expect } from "@playwright/test";
const job="10000000-0000-4000-8000-000000000001",prompt="10000000-0000-4000-8000-000000000002",variation="10000000-0000-4000-8000-000000000003",cursor="10000000-0000-4000-8000-000000000004";
// Synthetic transport rendering cases in both configured projects. Real authority, dismissed-match
// persistence and zero fee are independently exercised by the PostgreSQL office integration suite.
test("office matches are advisory, paginated, accessible and clear on unavailable reads",async({page})=>{
 let unavailable=false;
 await page.route(`**/api/contractor/jobs/${job}/office-signals*`,route=>route.fulfill({status:unavailable?404:200,contentType:"application/json",body:JSON.stringify(unavailable?{version:"office-signals-error.v1",code:"NOT_FOUND"}:new URL(route.request().url()).searchParams.has("after")?{items:[],nextCursor:null}:{items:[{promptId:prompt,variationId:variation,recordedAt:"2026-11-04T04:00:00Z"}],nextCursor:cursor})}));
 await page.goto(`/contractor/jobs/${job}/office-signals`);
 const main=page.getByRole("main");
 await expect(main.getByRole("heading",{level:1,name:"Office entry matches"})).toBeVisible();
 await expect(main.getByText(`Office entry ${variation} matches possible extra ${prompt}.`,{exact:true})).toBeVisible();
 await expect(main.getByText(/Advisory only. This adds no fee./)).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
 const next=main.getByRole("button",{name:"Next page"});
 await expect(next).toBeVisible();
 const box=await next.boundingBox();expect(box!.height).toBeGreaterThanOrEqual(44);expect(box!.width).toBeGreaterThanOrEqual(44);
 // Bounded serious-accessibility audit: landmark, heading hierarchy, named keyboard controls,
 // visible focus target size and document language. No third-party audit dependency is installed.
 const serious=await page.evaluate(()=>{
  const issues:string[]=[];
  if(document.querySelectorAll("main").length!==1)issues.push("main landmark");
  if(document.querySelectorAll("main h1").length!==1)issues.push("page heading");
  if(!document.documentElement.lang)issues.push("document language");
  for(const button of document.querySelectorAll("main button")){
   if(!button.textContent?.trim()&&!button.getAttribute("aria-label"))issues.push("unnamed control");
   if((button as HTMLButtonElement).tabIndex<0)issues.push("keyboard access");
  }
  return issues;
 });expect(serious).toEqual([]);
 await next.focus();await expect(next).toBeFocused();await page.keyboard.press("Enter");
 await expect(main.getByText("No office entry matches recorded.")).toBeVisible();
 const firstBox=await main.getByRole("button",{name:"First page"}).boundingBox();
 expect(firstBox!.height).toBeGreaterThanOrEqual(44);expect(firstBox!.width).toBeGreaterThanOrEqual(44);
 await expect(main.getByText(variation,{exact:false})).toHaveCount(0);
 unavailable=true;await main.getByRole("button",{name:"First page"}).click();
 await expect(main.getByRole("alert")).toHaveText("Job not found.");
 await expect(main.getByText("No office entry matches recorded.")).toHaveCount(0);
});
test("an initial read with no match shows the honest empty state",async({page})=>{
 await page.route(`**/api/contractor/jobs/${job}/office-signals`,route=>route.fulfill({contentType:"application/json",body:JSON.stringify({items:[],nextCursor:null})}));
 await page.goto(`/contractor/jobs/${job}/office-signals`);
 await expect(page.getByRole("main").getByText("No office entry matches recorded.")).toBeVisible();
});
