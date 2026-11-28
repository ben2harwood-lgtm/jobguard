import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { ReviewProposal } from "./review-proposal";
import { WalkIt } from "./jobguard-app";
import { ARTIFACT_DIR, HEAD_UNDER_TEST, mobileQuote } from "./rt10-mobile.fixtures";

afterEach(() => vi.unstubAllGlobals());

it("RT-10-render: renders this head's real components and CSS for isolated browser geometry checks", () => {
  vi.stubGlobal("React", React);
  const css = ["styles.css", "(designed)/design.css", "(designed)/design-fit.css", "(designed)/design-tools.css"]
    .map(path => readFileSync(`app/${path}`, "utf8")).join("\n");
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const screens: Record<string, React.ReactNode> = {};
  for (const count of [1, 10, 30, 100]) {
    screens[`lines-${count}`] = <ReviewProposal result={mobileQuote(count)} back={() => {}}/>;
    screens[`capture-${count}`] = <WalkIt tenantId="rt10-fictional-firm" mode="own" initialText={mobileQuote(count).source.text} close={() => {}}/>;
  }
  screens.long = <ReviewProposal result={mobileQuote(10, { long: true })} back={() => {}}/>;
  screens.questions = <ReviewProposal result={mobileQuote(20, { questions: 20 })} back={() => {}}/>;
  screens.maximum = <ReviewProposal result={mobileQuote(1, { maximum: true })} back={() => {}}/>;
  for (const [name, screen] of Object.entries(screens)) {
    const markup = renderToStaticMarkup(<div className="jgd"><section className="jgd-legacy jgd-tools"><div className="workspace-page">{screen}</div></section></div>);
    expect(markup).toContain(name.startsWith("capture-") ? "Work details" : "Check the work items");
    writeFileSync(`${ARTIFACT_DIR}/${name}.html`, `<!doctype html><html lang="en-GB"><head><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="rt10-head" content="${HEAD_UNDER_TEST}"><style>${css}</style></head><body>${markup}</body></html>`);
  }
  expect(renderToStaticMarkup(screens.maximum)).toContain("999999.99");
});
