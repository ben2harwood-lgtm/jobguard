import { readFileSync } from "node:fs";
import ts from "typescript";
import { expect, it } from "vitest";

it("keeps onboarding answers and the routing result out of subscription commands", () => {
  const source = readFileSync("app/plans/subscription-onboarding.tsx", "utf8");
  const file = ts.createSourceFile("subscription-onboarding.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const calls: string[] = [], imports: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) calls.push(node.expression.getText(file));
    if (ts.isImportSpecifier(node)) imports.push(node.name.text);
    ts.forEachChild(node, visit);
  };
  visit(file);
  expect(imports.sort()).toEqual(["routeSubscriptionOnboarding", "useState"]);
  // An explicit capability allowlist catches command, network, storage and callback calls.
  expect([...new Set(calls)].sort()).toEqual([
    "Error", "FormData", "Number", "String", "data.get", "event.preventDefault",
    "routeSubscriptionOnboarding", "setAnswers", "useState",
    '["yes", "no"].includes', '/^\\d+$/u.test',
    'String(data.get("usualJobs") ?? "").trim',
  ].sort());
  const screen = readFileSync("app/plans/plan-screen.tsx", "utf8");
  expect(screen).toContain("!view.agreement && <SubscriptionOnboarding />");
  expect(screen).not.toMatch(/routeSubscriptionOnboarding|recommendedTrack|usualJobs|siteStaffCapture/u);
});
