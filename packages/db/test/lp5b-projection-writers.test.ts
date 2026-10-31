import { readFileSync } from "node:fs";
import { expect,it } from "vitest";
const read=(path:string)=>readFileSync(new URL(path,import.meta.url),"utf8");
it("LP-5b projection writers use checked completion without submitting a timestamp or result snapshot",()=>{
 for(const file of ["prevention-check-repository","inbox-relevance-repository"]){
  const source=read(`../src/${file}.ts`);
  expect(source).not.toMatch(/(?:INSERT INTO|UPDATE) app\.command_receipt/);
  expect(source).toContain("beginRepositoryCommand");
  expect(source).toMatch(/completeRepositoryCommand(?:<[^\n]*>)?\(db,/);
 }
 const sql=read("../migrations/0496_lp5b_writers.sql");
 expect(sql).toContain("CREATE FUNCTION app.lp5b_prepare_projection");
 expect(sql).toContain("CREATE FUNCTION app.lp5b_projection_result");
 expect(sql).toContain("inbox_already_seeded");
 expect(sql).toContain("'latestCustomerRevisionId'");
 expect(sql).toContain("'decisionIds'");
 expect(sql).toContain("'asOfSequence'");
 expect(sql).toContain("JOIN created created_event");
 expect(sql).toContain("created_event.rule_id");
 expect(sql).not.toContain("JOIN created c\n");
});
