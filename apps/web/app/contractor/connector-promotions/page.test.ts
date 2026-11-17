import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect,it } from "vitest";
import Page from "./page";
it("renders a synthetic human promotion screen with a loading state",()=>{
 const html=renderToStaticMarkup(createElement(Page));
 expect(html).toContain("Staged connector events");
 expect(html).toContain("Practice sandbox — synthetic data; nothing is sent or charged");
 expect(html).toContain('role="status"');expect(html).toContain("Loading staged events");
});
