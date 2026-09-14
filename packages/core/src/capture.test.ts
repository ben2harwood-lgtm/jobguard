import { describe,expect,it } from "vitest";
import { jobRecordProposalV1 } from "./capture.js";
describe("proposal boundary",()=>{it("rejects extracted values without a versioned span",()=>{expect(jobRecordProposalV1.safeParse({title:{value:"x",provenance:{kind:"extracted"}},lines:[],materials:[],questions:[]}).success).toBe(false);});});
