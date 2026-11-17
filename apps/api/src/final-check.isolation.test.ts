import {readFile} from "node:fs/promises";
import {expect,it} from "vitest";
it("SV5-24 own builder application and controller contain no detector or shadow query",async()=>{
 for(const file of ["final-check.application.ts","final-check.controller.ts"]){const source=await readFile(new URL(file,import.meta.url),"utf8");expect(source).not.toMatch(/detectShadowObservations|shadow_commercial_signal|shadow_signal_evidence|ShadowDetectionRepository/u);}
});
