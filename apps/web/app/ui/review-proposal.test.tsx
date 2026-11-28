import * as React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { captureWorkspaceResponseV1 } from "@jobguard/api/capture-contracts";
import { ReviewProposal, type ReviewCaptureResult } from "./review-proposal";

// Exercise event handlers with the existing job-sources hook-harness pattern.
const hooks = vi.hoisted(() => {
  let cursor = 0;
  const slots: any[] = [], effects: (() => void)[] = [];
  return {
    reset() { cursor = 0; slots.length = 0; effects.length = 0; },
    render() { cursor = 0; },
    effects() { while (effects.length) effects.shift()!(); },
    useState(initial: any) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], (value: any) => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
    },
    useRef(initial: unknown) { return slots[cursor++] ??= { current: initial }; },
    useMemo(fn: () => unknown) { return fn(); },
    useEffect(fn: () => void, deps: unknown[]) {
      const index = cursor++, old = slots[index];
      if (!old || !deps.every((value, i) => Object.is(value, old[i]))) { slots[index] = deps; effects.push(fn); }
    },
  };
});
vi.mock("react", async original => ({ ...await original<typeof React>(), ...hooks }));
type Node = React.ReactElement<Record<string, any>>;
function all(tree: React.ReactNode, match: (node: Node) => boolean): Node[] {
  if (Array.isArray(tree)) return tree.flatMap(child => all(child, match));
  if (!React.isValidElement<Record<string, any>>(tree)) return [];
  return [...(match(tree) ? [tree] : []), ...all(tree.props.children, match)];
}
function text(tree: React.ReactNode): string {
  if (Array.isArray(tree)) return tree.map(text).join("");
  if (React.isValidElement<Record<string, any>>(tree)) return text(tree.props.children);
  return typeof tree === "string" || typeof tree === "number" ? String(tree) : "";
}
const line = { id: "line", scopeItemId: "scope", origin: "proposal", description: "Protect room", room: "Room", category: "Work", quantity: "1", unit: "item", unitPricePence: 100, disposition: "proposed", dismissalReason: null, parentScopeItemIds: [], sourceExcerpt: "Protect the room and doorway." };
const fixture = {
  jobId: "job", reviewId: "review", proposalId: "proposal", status: "draft",
  proposal: { lines: [{ unitPricePence: { value: 100 } }], questions: [] },
  source: { kind: "typed_notes", version: 1, text: line.sourceExcerpt },
  review: { version: "proposal_review_v1", reviewId: "review", proposalId: "proposal", jobId: "job", revision: 3, lines: [line], questions: [] },
} as unknown as ReviewCaptureResult;
beforeEach(() => { hooks.reset(); vi.stubGlobal("React", React); });
afterEach(() => vi.unstubAllGlobals());
function panel(result = fixture) {
  const focus = vi.fn(), scroll = vi.fn();
  const render = (props: Partial<React.ComponentProps<typeof ReviewProposal>> = {}) => {
    hooks.render();
    const tree = ReviewProposal({ result, back: vi.fn(), ...props });
    for (const article of all(tree, node => node.type === "article")) article.props.ref({ querySelector: (selector: string) => selector === "strong" ? { scrollIntoView: scroll } : { focus: () => focus(article.key) } });
    hooks.effects();
    return tree;
  };
  const button = (tree: React.ReactNode, name: string) => all(tree, node => node.type === "button" && (node.props["aria-label"] ?? text(node.props.children)) === name)[0]!;
  return { render, button, focus, scroll };
}
it("keeps full accessible names and walkthrough Accept text with one-word visible actions for a 215-character line", () => {
  const description = "Fictional bathroom refit: ".padEnd(215, "work ");
  const p = panel({ ...fixture, review: { ...fixture.review!, lines: [{ ...fixture.review!.lines[0]!, description }] } });
  const tree = p.render();
  const actions = all(tree, n => n.props.className === "line-actions")[0]!;
  expect(actions.props.style).toMatchObject({ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))" });
  for (const name of ["Accept", "Split", "Dismiss"]) {
    const button = p.button(tree, `${name} ${description}`);
    expect(button).toBeDefined();
    const visible = React.Children.toArray(button.props.children).filter(child => !React.isValidElement<Record<string, any>>(child) || child.props.className !== "sr-only");
    expect(text(visible)).toBe(name);
  }
  expect(text(p.button(tree, `Accept ${description}`).props.children)).toBe(`Accept ${description}`);
  expect(all(tree, n => n.props["aria-label"] === `Description ${description}`)[0]!.props.value).toBe(description);
  expect(text(all(tree, n => n.type === "blockquote")[0])).toContain(line.sourceExcerpt);
});
it("adds a human line to the whole job with trade Other, and shows old fixed labels the same way", async () => {
  const fetch = vi.fn(async () => ({ ok: false, json: async () => ({ code: "TEST_RESPONSE" }) }));
  vi.stubGlobal("fetch", fetch);
  const old = { ...line, room: "Practice job", category: "Work" };
  const p = panel({ ...fixture, review: { ...fixture.review!, lines: [old] } } as ReviewCaptureResult);
  p.button(p.render(), "Add omitted line").props.onClick();
  await p.button(p.render(), "Save review").props.onClick();
  await new Promise<void>(resolve => setImmediate(resolve));
  const lines = JSON.parse((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).review.lines;
  expect(lines.map((saved: { room: string; category: string }) => [saved.room, saved.category])).toEqual([["Whole job", "Other"], ["Whole job", "Other"]]);
});

it("announces Split, focuses the first adjacent editable child, and saves the unchanged lineage payload", async () => {
  const fetch = vi.fn(async () => ({ ok: false, json: async () => ({ code: "TEST_RESPONSE" }) }));
  vi.stubGlobal("fetch", fetch);
  const nullableParent = { ...line, quantity: null, unit: null };
  const splitFixture = { ...fixture, review: { ...fixture.review!, lines: [nullableParent] } } as ReviewCaptureResult;
  const p = panel(splitFixture);
  p.button(p.render(), "Split Protect room").props.onClick();
  expect(fetch).not.toHaveBeenCalled();
  let tree = p.render();
  const articles = all(tree, n => n.type === "article");
  expect(articles).toHaveLength(3);
  expect(text(all(articles[0], n => n.type === "strong")[0])).toBe("split");
  expect(text(all(articles[1], n => n.props.role === "status")[0])).toBe("Split into two lines — check both descriptions and accept each child. Part A and part B are editable placeholders.");
  expect(p.focus).toHaveBeenCalledExactlyOnceWith(articles[1]!.key);
  const descriptions = all(tree, n => n.type === "input" && n.props["aria-label"]?.startsWith("Description "));
  expect(descriptions.map(n => n.props.value)).toEqual(["Protect room", "Protect room — part A", "Protect room — part B"]);
  for (const [index, description] of [[1, "Protect doorway"], [2, "Protect floor"]] as const) {
    descriptions[index]!.props.onChange({ target: { value: description } });
  }
  tree = p.render();
  await p.button(tree, "Save review").props.onClick();
  await new Promise<void>(resolve => setImmediate(resolve));
  const [url, options] = fetch.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("/api/jobs/job/review");
  expect(options.method).toBe("POST");
  const command = JSON.parse(options.body as string);
  const children = command.review.lines.slice(1);
  expect(command).toEqual({ contractVersion: "proposal_review_command_v1", expectedRevision: 3, review: { ...splitFixture.review, lines: [{ ...nullableParent, disposition: "split" }, ...children] } });
  expect(children).toHaveLength(2);
  for (const [index, child] of children.entries()) expect(child).toEqual({
    ...line, id: expect.any(String), scopeItemId: expect.any(String), origin: "human", description: index === 0 ? "Protect doorway" : "Protect floor", quantity: "1", unit: "item", unitPricePence: null, disposition: "proposed", parentScopeItemIds: ["scope"], sourceExcerpt: null,
  });
  expect(new Set(children.flatMap((child: any) => [child.id, child.scopeItemId])).size).toBe(4);
});
it.each([["Accept", "accepted", "Accepted"], ["Dismiss", "dismissed", "Dismissed"]])("announces %s and brings its status badge into view", (action, disposition, announcement) => {
  const p = panel();
  p.button(p.render(), `${action} Protect room`).props.onClick();
  const tree = p.render();
  expect(text(all(tree, n => n.props.role === "status")[0])).toBe(`${announcement}: Protect room`);
  expect(text(all(tree, n => n.type === "strong").find(n => text(n) === disposition))).toBe(disposition);
  expect(p.scroll).toHaveBeenCalledWith({ block: "nearest" });
  expect(p.focus).not.toHaveBeenCalled();
});

function validFixture(): ReviewCaptureResult {
  const jobId = crypto.randomUUID(), proposalId = crypto.randomUUID(), reviewId = crypto.randomUUID();
  const validLine = { ...line, origin: "proposal" as const, id: crypto.randomUUID(), scopeItemId: crypto.randomUUID(), disposition: "accepted" as const, unitPricePence: null };
  return {
    version: 1, environment: "synthetic_demo", captureId: crypto.randomUUID(), jobId, proposalId, reviewId, status: "draft",
    source: { kind: "text", text: line.sourceExcerpt, version: 1, acquisition: null, audioByteLength: 0 },
    proposal: { title: "Fictional job", lines: [{ ...validLine, description: { value: validLine.description }, quantity: { value: "1" }, unit: { value: "item" }, unitPricePence: { value: null } }], questions: [] },
    review: { version: "proposal_review_v1", reviewId, proposalId, jobId, revision: 3, lines: [validLine], questions: [] },
  };
}
const settle = () => new Promise<void>(resolve => setImmediate(resolve));
function server(result: ReviewCaptureResult, confirmStatus = 200) {
  return vi.fn(async (url: string, options: RequestInit) => {
    if (url.endsWith("/review")) {
      const command = JSON.parse(options.body as string);
      return { ok: true, status: 200, json: async () => ({ ...result, review: { ...command.review, revision: command.expectedRevision + 1 } }) };
    }
    return { ok: confirmStatus === 200, status: confirmStatus, json: async () => confirmStatus === 200 ? { ...result, status: "quoting" } : { code: "REVIEW_REVISION_CONFLICT" } };
  });
}
it.each(["Quantity", "Unit"])("names missing %s and its line, saves valid choices, and never sends confirmation", async field => {
  const result = validFixture(), fetch = server(result);
  vi.stubGlobal("fetch", fetch);
  const p = panel(result);
  all(p.render(), n => n.props["aria-label"] === `${field} Protect room`)[0]!.props.onChange({ target: { value: "" } });
  p.button(p.render(), "Confirm scope").props.onClick(); await settle();
  const tree = p.render();
  expect(text(all(tree, n => n.props.role === "alert"))).toContain(`Scope is not confirmed. Add ${field} for ‘Protect room’ (REVIEW_INCOMPLETE).`);
  expect(fetch.mock.calls.map(call => call[0])).toEqual([`/api/jobs/${result.jobId}/review`]);
});
it("names all unanswered questions, treats whitespace as unanswered, and keeps the refusal after saving", async () => {
  const result = validFixture();
  result.review!.questions = ["Who removes waste?", "Which finish?"].map(question => ({ id: crypto.randomUUID(), question, blocking: true, disposition: "unresolved", answer: null }));
  const fetch = server(result); vi.stubGlobal("fetch", fetch);
  const p = panel(result);
  all(p.render(), n => n.props["aria-label"] === "Answer Who removes waste?")[0]!.props.onChange({ target: { value: "   " } });
  p.button(p.render(), "Confirm scope").props.onClick(); await settle();
  expect(text(all(p.render(), n => n.props.role === "alert"))).toBe("Scope is not confirmed. Answer: “Who removes waste?”; Answer: “Which finish?” (REVIEW_INCOMPLETE).");
  expect(fetch).toHaveBeenCalledTimes(1);
  const command = JSON.parse(fetch.mock.calls[0]![1].body as string);
  expect(command.review.questions[0]).toMatchObject({ answer: null, disposition: "unresolved" });
});
it("submits edits after Save review before confirming, allows unknown prices, and retains edits on a conflict", async () => {
  const result = validFixture(), fetch = server(result, 409);
  vi.stubGlobal("fetch", fetch);
  const p = panel(result);
  p.button(p.render(), "Save review").props.onClick(); await settle();
  let tree = p.render();
  expect(text(all(tree, n => n.props.role === "alert"))).toContain("Review saved.");
  all(tree, n => n.props["aria-label"] === "Description Protect room")[0]!.props.onChange({ target: { value: "Protect fictional doorway" } });
  p.button(p.render(), "Confirm scope").props.onClick(); await settle();
  tree = p.render();
  expect(fetch.mock.calls.map(call => call[0].split("/").at(-1))).toEqual(["review", "review", "confirm"]);
  const saved = JSON.parse(fetch.mock.calls[1]![1].body as string);
  expect(saved).toMatchObject({ expectedRevision: 4, review: { revision: 4, lines: [{ description: "Protect fictional doorway", unitPricePence: null }] } });
  expect(JSON.parse(fetch.mock.calls[2]![1].body as string).expectedRevision).toBe(5);
  expect(text(all(tree, n => n.props.role === "alert"))).toBe("This draft changed. Review the latest version.");
  expect(all(tree, n => n.props["aria-label"] === "Description Protect fictional doorway")[0]!.props.value).toBe("Protect fictional doorway");
});
it("preserves input typed during a save and does not confirm an older saved draft", async () => {
  const result = validFixture();
  let release!: (response: unknown) => void;
  const fetch = vi.fn(() => new Promise(resolve => { release = resolve; }));
  vi.stubGlobal("fetch", fetch);
  const p = panel(result);
  p.button(p.render(), "Confirm scope").props.onClick();
  const command = JSON.parse((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
  all(p.render(), n => n.props["aria-label"] === "Description Protect room")[0]!.props.onChange({ target: { value: "Newer input" } });
  p.render();
  release({ ok: true, status: 200, json: async () => ({ ...result, review: { ...command.review, revision: 4 } }) });
  await settle();
  const tree = p.render();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(all(tree, n => n.props["aria-label"] === "Description Newer input")[0]!.props.value).toBe("Newer input");
  expect(text(all(tree, n => n.props.role === "alert"))).toContain("Your review changed while saving");
});
it("lists invalid descriptions, quantities, units and dismissal reasons without submitting invalid schemas", async () => {
  const result = validFixture();
  result.review!.lines[0] = { ...result.review!.lines[0]!, description: " ", quantity: "not a quantity", unit: "" };
  result.review!.lines.push({ ...result.review!.lines[0]!, id: crypto.randomUUID(), scopeItemId: crypto.randomUUID(), description: "Excluded work", disposition: "dismissed", quantity: "1", unit: "item", dismissalReason: " " });
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  const p = panel(result);
  p.button(p.render(), "Confirm scope").props.onClick(); await settle();
  const notice = text(all(p.render(), n => n.props.role === "alert"));
  for (const phrase of ["Description", "Quantity", "Unit", "Dismissal reason for ‘Excluded work’", "REVIEW_INCOMPLETE"]) expect(notice).toContain(phrase);
  expect(fetch).not.toHaveBeenCalled();
});

it.each(["Save review", "Confirm scope"])("starts the first %s activation and ignores a second activation before render", async action => {
  const result = validFixture(), respond = server(result);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const fetch = vi.fn(async (url: string, options: RequestInit) => {
    await gate;
    return respond(url, options);
  });
  vi.stubGlobal("fetch", fetch);
  const p = panel(result), tree = p.render();
  const activate = p.button(tree, action).props.onClick;
  activate();
  expect(fetch).toHaveBeenCalledTimes(1); // The first click starts its request immediately.
  activate();
  p.button(tree, action === "Save review" ? "Confirm scope" : "Save review").props.onClick();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(p.button(p.render(), action).props.disabled).toBe(true);
  release(); await settle();
  expect(fetch.mock.calls.map(call => call[0].split("/").at(-1))).toEqual(action === "Save review" ? ["review"] : ["review", "confirm"]);
  if (action === "Confirm scope") expect(text(p.render())).toContain("Scope confirmed");
  else expect(p.button(p.render(), action).props.disabled).toBe(false);
});

it("keeps the guard through review response rendering and the confirmation request", async () => {
  const result = validFixture(), respond = server(result);
  let releaseReview!: () => void, releaseConfirm!: () => void;
  const reviewGate = new Promise<void>(resolve => { releaseReview = resolve; });
  const confirmGate = new Promise<void>(resolve => { releaseConfirm = resolve; });
  const p = panel(result);
  const fetch = vi.fn(async (url: string, options: RequestInit) => {
    if (url.endsWith("/review")) {
      await reviewGate;
      const response = await respond(url, options);
      return { ...response, json: async () => {
        const snapshot = await response.json();
        // Render the newly saved review before confirm's continuation runs.
        queueMicrotask(() => p.render());
        return snapshot;
      } };
    }
    await confirmGate;
    return respond(url, options);
  });
  vi.stubGlobal("fetch", fetch);
  const staleSave = p.button(p.render(), "Save review").props.onClick;
  p.button(p.render(), "Confirm scope").props.onClick();
  releaseReview(); await settle();
  expect(fetch.mock.calls.map(call => call[0].split("/").at(-1))).toEqual(["review", "confirm"]);
  expect(p.button(p.render(), "Save review").props.disabled).toBe(true);
  staleSave();
  p.button(p.render(), "Confirm scope").props.onClick();
  expect(fetch).toHaveBeenCalledTimes(2);
  releaseConfirm(); await settle();
  expect(text(p.render())).toContain("Scope confirmed");
});

it.each(["conflict", "network"])("releases the guard after a %s so a new save can succeed", async failure => {
  const result = validFixture(), respond = server(result);
  const fetch = vi.fn(async (url: string, options: RequestInit) => {
    if (fetch.mock.calls.length === 1) {
      if (failure === "network") throw new Error("Connection lost");
      return { ok: false, status: 409, json: async () => ({ code: "REVIEW_REVISION_CONFLICT" }) };
    }
    return respond(url, options);
  });
  vi.stubGlobal("fetch", fetch);
  const p = panel(result);
  p.button(p.render(), "Confirm scope").props.onClick(); await settle();
  const tree = p.render();
  expect(p.button(tree, "Save review").props.disabled).toBe(false);
  expect(text(all(tree, n => n.props.role === "alert"))).toContain(failure === "conflict" ? "This draft changed" : "Connection lost");
  p.button(tree, "Save review").props.onClick(); await settle();
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(text(all(p.render(), n => n.props.role === "alert"))).toContain("Review saved.");
});

it("keeps pricing open across incidental snapshots and acceptance, then obeys explicit Scope navigation", () => {
 const result = { ...validFixture(), status: "quoting" as const };
 const p = panel(result);
 p.button(p.render({ sectionView: "scope" }), "Price the work").props.onClick();
 const editor = (tree: React.ReactNode) => all(tree, n => typeof n.type === "function" && n.type.name === "QuoteEditor");
 expect(editor(p.render({ sectionView: "scope" }))).toHaveLength(1);
 for (const status of ["quoting", "accepted", "live"] as const) {
  const props = { result: { ...result, status }, sectionView: "scope" as const };
  p.render(props);
  expect(editor(p.render(props))).toHaveLength(1);
 }
 p.render({ sectionView: "pricing" });
 expect(editor(p.render({ sectionView: "pricing" }))).toHaveLength(1);
 p.render({ sectionView: "scope" });
 expect(p.button(p.render({ sectionView: "scope" }), "Price the work")).toBeDefined();
});
it("returns from pricing through a saved Scope review without remounting", async () => {
 const result = { ...validFixture(), status: "quoting" as const };
 const onScope = vi.fn();
 vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => result })));
 const p = panel(result);
 p.button(p.render(), "Price the work").props.onClick();
 const editor = all(p.render({ onScope }), n => typeof n.type === "function" && n.type.name === "QuoteEditor")[0]!;
 editor.props.back(); await settle();
 expect(onScope).toHaveBeenCalledWith(captureWorkspaceResponseV1.parse(result));
 expect(p.button(p.render(), "Price the work")).toBeDefined();
});
it.each(["draft"] as const)("closes pricing on a genuine %s lifecycle transition", status => {
 const result = { ...validFixture(), status: "quoting" as const };
 const p = panel(result);
 p.button(p.render(), "Price the work").props.onClick();
 const props = { result: { ...result, status } };
 p.render(props);
 expect(all(p.render(props), n => typeof n.type === "function" && n.type.name === "QuoteEditor")).toHaveLength(0);
});

it("keeps pricing open and reports a failed Scope read without publishing a snapshot", async () => {
 const result = { ...validFixture(), status: "quoting" as const };
 const onScope = vi.fn();
 vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503 })));
 const p = panel(result);
 p.button(p.render(), "Price the work").props.onClick();
 const editor = all(p.render({ onScope }), n => typeof n.type === "function" && n.type.name === "QuoteEditor")[0]!;
 editor.props.back(); await settle();
 const tree = p.render();
 expect(onScope).not.toHaveBeenCalled();
 expect(all(tree, n => typeof n.type === "function" && n.type.name === "QuoteEditor")).toHaveLength(1);
 expect(text(all(tree, n => n.props.role === "alert"))).toContain("The saved job status could not be loaded");
});


it.each(["accepted", "live"] as const)("reloads the saved %s quote on section navigation but preserves the editor on snapshots", status => {
 const result = { ...validFixture(), status: "quoting" as const };
 const p = panel(result);
 const editor = (tree: React.ReactNode) => all(tree, n => typeof n.type === "function" && n.type.name === "QuoteEditor")[0]!;
 // Open pricing locally, then receive acceptance without leaving this section.
 p.button(p.render({ sectionNavigationKey: "" }), "Price the work").props.onClick();
 const original = editor(p.render({ sectionNavigationKey: "" }));
 const saved = { ...result, status };
 const refreshed = editor(p.render({ result: saved, sectionNavigationKey: "" }));
 expect(refreshed.type).toBe(original.type);
 expect(refreshed.key).toBe(original.key);
 // A fragment-only navigation selects Saved quote without discarding the editor.
 const navigated = editor(p.render({ result: saved, sectionNavigationKey: "#quote", sectionView: "pricing" }));
 expect(navigated.key).toBe(original.key);
 expect(navigated.props.sectionNavigationKey).toBe("#quote");
 const snapshot = editor(p.render({ result: { ...saved }, sectionNavigationKey: "#quote", sectionView: "pricing" }));
 expect(snapshot.type).toBe(navigated.type);
 expect(snapshot.key).toBe(navigated.key);
 // Both destinations use the pricing view; the fragment still changes editor identity.
 const work = editor(p.render({ result: saved, sectionNavigationKey: "#work-proof", sectionView: "pricing" }));
 expect(editor(p.render({ result: saved, sectionNavigationKey: "#quote", sectionView: "pricing" })).key).toBe(work.key);
});

it("retains decline history in the mounted editor and disables closed-job editing", () => {
 const result = { ...validFixture(), status: "quoting" as const };
 const p = panel(result);
 p.button(p.render(), "Price the work").props.onClick();
 const props = { result: { ...result, status: "lost" as const } };
 p.render(props);
 const editor = all(p.render(props), n => typeof n.type === "function" && n.type.name === "QuoteEditor")[0]!;
 expect(editor).toBeDefined();
 expect(editor.props.readOnly).toBe(true);
});
it("retains the nested editor when showing Scope and restores its identity on return", () => {
 const p = panel({ ...validFixture(), status: "live" as const });
 p.button(p.render(), "Price the work").props.onClick();
 const editor = (tree: React.ReactNode) => all(tree, n => typeof n.type === "function" && n.type.name === "QuoteEditor")[0]!;
 const original = editor(p.render());
 p.render({ sectionView: "scope" });
 const scope = p.render({ sectionView: "scope" });
 expect(editor(scope).key).toBe(original.key);
 expect(editor(scope).props.hidden).toBe(true);
 expect(p.button(scope, "Price the work")).toBeDefined();
 p.render({ sectionView: "pricing" });
 const pricing = p.render({ sectionView: "pricing" });
 expect(editor(pricing).key).toBe(original.key);
 expect(editor(pricing).props.hidden).toBe(false);
});

// V2-SQ2: combine keeps the known sum, split never guesses, and the running total says when it is incomplete.
it("combines two priced rows, splits the result blank, and saves the prices typed into each part", async () => {
  const fetch = vi.fn(async (_url: string, options: RequestInit) => ({ ok: false, json: async () => ({ code: "TEST_RESPONSE" }), body: options.body }));
  vi.stubGlobal("fetch", fetch);
  const walls = { ...line, id: crypto.randomUUID(), scopeItemId: crypto.randomUUID(), description: "paint the walls", unitPricePence: 20000, disposition: "accepted" };
  const door = { ...line, id: crypto.randomUUID(), scopeItemId: crypto.randomUUID(), description: "fit the door", unitPricePence: 6000, disposition: "accepted" };
  const p = panel({ ...fixture, review: { ...fixture.review!, lines: [walls, door] } } as ReviewCaptureResult);
  const byTestId = (tree: React.ReactNode, id: string) => all(tree, n => n.props["data-testid"] === id).map(text);
  expect(byTestId(p.render(), "running-total")).toEqual(["Total so far £260.00 · complete"]);
  expect(byTestId(p.render(), "line-total")).toEqual(["Line total: £200.00", "Line total: £60.00"]);
  for (const name of ["paint the walls", "fit the door"]) all(p.render(), n => n.props["aria-label"] === `Select ${name} for merge`)[0]!.props.onChange({ target: { checked: true } });
  p.button(p.render(), "Merge selected (2)").props.onClick();
  expect(byTestId(p.render(), "row-origin")).toEqual(["Combined from 2 rows · £260.00"]);
  expect(byTestId(p.render(), "running-total")).toEqual(["Total so far £260.00 · complete"]);
  p.button(p.render(), "Split paint the walls + fit the door").props.onClick();
  expect(byTestId(p.render(), "row-origin")).toEqual(["Combined from 2 rows · £260.00", "Before the split: £260.00 for the whole row", "Before the split: £260.00 for the whole row"]);
  expect(byTestId(p.render(), "running-total")).toEqual(["Total so far £0.00 · incomplete: 2 rows need a price"]);
  const prices = all(p.render(), n => n.type === "input" && /^Price paint the walls \+ fit the door — part [AB]$/u.test(n.props["aria-label"] ?? ""));
  expect(prices.map(n => n.props.value)).toEqual(["", ""]);
  prices[0]!.props.onChange({ target: { value: "160" } });
  expect(byTestId(p.render(), "running-total")).toEqual(["Total so far £160.00 · incomplete: 1 row needs a price"]);
  all(p.render(), n => n.props["aria-label"] === "Price paint the walls + fit the door — part B")[0]!.props.onChange({ target: { value: "100.00" } });
  expect(byTestId(p.render(), "running-total")).toEqual(["Total so far £260.00 · complete"]);
  await p.button(p.render(), "Save review").props.onClick(); await settle();
  const saved = JSON.parse((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).review.lines;
  expect(saved.map((l: { disposition: string; unitPricePence: number | null }) => [l.disposition, l.unitPricePence]))
    .toEqual([["merged", 20000], ["merged", 6000], ["split", 26000], ["proposed", 16000], ["proposed", 10000]]);
});
it("a price that is not plain pounds leaves the row unpriced and says why", () => {
  const p = panel();
  all(p.render(), n => n.props["aria-label"] === "Price Protect room")[0]!.props.onChange({ target: { value: "twelve" } });
  const tree = p.render();
  expect(all(tree, n => n.props["data-testid"] === "running-total").map(text)).toEqual(["Total so far £0.00 · incomplete: 1 row needs a price"]);
  expect(text(all(tree, n => n.props.role === "alert"))).toContain("Check the price for Protect room");
});
it("V2-SQ-D: groups rows by room, moves a row and back, and quotes one room as one price with merge lineage", async () => {
  const fetch = vi.fn(async (_url: string, options: RequestInit) => ({ ok: false, json: async () => ({ code: "TEST_RESPONSE" }), body: options.body }));
  vi.stubGlobal("fetch", fetch);
  const make = (id: string, description: string, room: string, category: string, unitPricePence: number | null, quantity = "1") =>
    ({ ...line, id, scopeItemId: `scope-${id}`, description, room, category, quantity, unitPricePence, disposition: "proposed" });
  const rows = [make("k1", "Fit the units", "Kitchen", "Kitchen fitting", 120000), make("b1", "Tile the floor", "Bathroom", "Tiling", null),
    make("b2", "Two sockets", "Bathroom", "Electrics", 4500, "2"), make("h1", "Paint the hall", "Hall", "Decorating", 30000)];
  const result = { ...fixture,
    proposal: { lines: rows.map(r => ({ id: r.id, unitPricePence: { value: r.unitPricePence }, room: r.room, category: r.category, roomInferred: r.id === "b2" })),
      questions: [], roomPrices: [{ room: "Bathroom", pence: 90000, words: "nine hundred for the bathroom" }], wholeJobPrice: null },
    review: { ...fixture.review!, lines: rows } } as unknown as ReviewCaptureResult;
  const p = panel(result);
  const byTestId = (tree: React.ReactNode, id: string) => all(tree, n => n.props["data-testid"] === id).map(text);
  const heads = (tree: React.ReactNode) => all(tree, n => n.type === "section" && n.props["data-testid"] === "room-group").map(n => n.props["aria-label"]);
  expect(heads(p.render())).toEqual(["Kitchen", "Bathroom", "Hall"]);
  expect(byTestId(p.render(), "room-total")).toEqual(["£1,200.00", "£90.00 · incomplete: 1 row needs a price", "£300.00"]);
  expect(byTestId(p.render(), "running-total")).toEqual(["Total so far £1,590.00 · incomplete: 1 row needs a price"]);
  // A trade the closed list holds is a select; an inferred trade shows "check" until touched.
  expect(all(p.render(), n => n.type === "select" && n.props["aria-label"] === "Trade Tile the floor")[0]!.props.value).toBe("Tiling");
  expect(all(p.render(), n => n.props["aria-label"] === "Trade looks right: Tile the floor")).toHaveLength(1);
  all(p.render(), n => n.props["aria-label"] === "Trade Tile the floor")[0]!.props.onChange({ target: { value: "Flooring" } });
  expect(all(p.render(), n => n.props["aria-label"] === "Trade looks right: Tile the floor")).toHaveLength(0);
  // Combine is one room at a time.
  for (const name of ["Fit the units", "Tile the floor"]) all(p.render(), n => n.props["aria-label"] === `Select ${name} for merge`)[0]!.props.onChange({ target: { checked: true } });
  expect(p.button(p.render(), "Merge selected (2)").props.disabled).toBe(true);
  for (const name of ["Fit the units", "Tile the floor"]) all(p.render(), n => n.props["aria-label"] === `Select ${name} for merge`)[0]!.props.onChange({ target: { checked: false } });
  // Move the sockets to the kitchen and back: only the two subtotals change, and the row keeps everything else.
  p.button(p.render(), "Move Two sockets").props.onClick();
  p.button(all(p.render(), n => n.props.className === "move-sheet")[0]!, "Kitchen").props.onClick();
  expect(byTestId(p.render(), "room-total")).toEqual(["£1,290.00", "£0.00 · incomplete: 1 row needs a price", "£300.00"]);
  expect(byTestId(p.render(), "running-total")).toEqual(["Total so far £1,590.00 · incomplete: 1 row needs a price"]);
  p.button(p.render(), "Move Two sockets").props.onClick();
  p.button(all(p.render(), n => n.props.className === "move-sheet")[0]!, "Bathroom").props.onClick();
  expect(heads(p.render())).toEqual(["Kitchen", "Bathroom", "Hall"]);
  // One price for the bathroom: the said figure is offered, never applied without a press; a moved row counts as checked.
  all(p.render(), n => n.type === "input" && n.props.name === "mode-Bathroom" && n.props.checked === false)[0]!.props.onChange();
  expect(all(p.render(), n => n.props["aria-label"] === "Room price Bathroom")[0]!.props.value).toBe("");
  p.button(p.render(), "Use the £900.00 you said for Bathroom").props.onClick();
  expect(byTestId(p.render(), "room-total")[1]).toBe("£90.00 · incomplete: 1 row needs a price");
  p.button(p.render(), "Set one price for Bathroom").props.onClick();
  const confirm = all(p.render(), n => n.props.className === "room-confirm")[0]!;
  expect(text(confirm)).toContain("these 2 rows, which become one row");
  expect(all(confirm, n => n.type === "li").map(text)).toEqual(["Tile the floor · proposed", "Two sockets · proposed"]);
  p.button(confirm, "Apply one price").props.onClick();
  expect(byTestId(p.render(), "room-total")).toEqual(["£1,200.00", "£900.00", "£300.00"]);
  expect(byTestId(p.render(), "running-total")).toEqual(["Total so far £2,400.00 · complete"]);
  expect(byTestId(p.render(), "row-origin")).toContain("Itemised incomplete · room price £900.00");
  // Undo before save restores the rows.
  p.button(p.render(), "Undo one price for Bathroom").props.onClick();
  expect(byTestId(p.render(), "running-total")).toEqual(["Total so far £1,590.00 · incomplete: 1 row needs a price"]);
  all(p.render(), n => n.type === "input" && n.props.name === "mode-Bathroom" && n.props.checked === false)[0]!.props.onChange();
  all(p.render(), n => n.props["aria-label"] === "Room price Bathroom")[0]!.props.onChange({ target: { value: "900" } });
  p.button(p.render(), "Set one price for Bathroom").props.onClick();
  p.button(all(p.render(), n => n.props.className === "room-confirm")[0]!, "Apply one price").props.onClick();
  await p.button(p.render(), "Save review").props.onClick(); await settle();
  const saved = JSON.parse((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).review.lines;
  expect(saved.map((l: { room: string; disposition: string; unitPricePence: number | null; parentScopeItemIds: string[] }) => [l.room, l.disposition, l.unitPricePence, l.parentScopeItemIds]))
    .toEqual([["Kitchen", "proposed", 120000, []], ["Bathroom", "merged", null, []], ["Bathroom", "merged", 4500, []], ["Hall", "proposed", 30000, []],
      ["Bathroom", "accepted", 90000, ["scope-b1", "scope-b2"]]]);
  expect(saved.at(-1).description).toBe("Bathroom: all work as described");
});
it("V2-SQ-D: one price is blocked while a row's inferred room is unchecked, and rooms can be added, renamed and merged", () => {
  const make = (id: string, description: string, room: string) => ({ ...line, id, scopeItemId: `scope-${id}`, description, room, unitPricePence: 1000, disposition: "accepted" });
  const rows = [make("a", "Strip the units", "Kitchen"), make("b", "Fit a sink", "Kitchen"), make("c", "Paint the hall", "Hall")];
  const result = { ...fixture, proposal: { lines: rows.map(r => ({ id: r.id, unitPricePence: { value: 1000 }, room: r.room, category: "Work", roomInferred: r.id === "b" })), questions: [] },
    review: { ...fixture.review!, lines: rows } } as unknown as ReviewCaptureResult;
  const p = panel(result);
  const heads = (tree: React.ReactNode) => all(tree, n => n.type === "section" && n.props["data-testid"] === "room-group").map(n => n.props["aria-label"]);
  all(p.render(), n => n.type === "input" && n.props.name === "mode-Kitchen" && n.props.checked === false)[0]!.props.onChange();
  all(p.render(), n => n.props["aria-label"] === "Room price Kitchen")[0]!.props.onChange({ target: { value: "500" } });
  p.button(p.render(), "Set one price for Kitchen").props.onClick();
  expect(all(p.render(), n => n.props.className === "room-confirm")).toHaveLength(0);
  expect(all(p.render(), n => n.props["data-testid"] === "room-notice").map(text)).toEqual(["Check the room on ‘Fit a sink’ before quoting Kitchen as one price."]);
  p.button(p.render(), "Room looks right: Fit a sink").props.onClick();
  p.button(p.render(), "Set one price for Kitchen").props.onClick();
  expect(all(p.render(), n => n.props.className === "room-confirm")).toHaveLength(1);
  // Rooms: add an empty one, rename, merge (rows move, order kept).
  all(p.render(), n => n.props["aria-label"] === "Add a room")[0]!.props.onChange({ target: { value: "  Loft " } });
  p.button(p.render(), "Add room").props.onClick();
  expect(heads(p.render())).toEqual(["Kitchen", "Hall", "Loft"]);
  all(p.render(), n => n.props["aria-label"] === "Rename Hall")[0]!.props.onChange({ target: { value: "Landing" } });
  p.button(all(p.render(), n => n.type === "section" && n.props["aria-label"] === "Hall")[0]!, "Rename").props.onClick();
  expect(heads(p.render())).toEqual(["Kitchen", "Landing", "Loft"]);
  all(p.render(), n => n.props["aria-label"] === "Merge Kitchen into")[0]!.props.onChange({ target: { value: "Landing" } });
  expect(heads(p.render())).toEqual(["Landing", "Loft"]);
  expect(all(p.render(), n => n.type === "article").map(n => n.key)).toEqual(["a", "b", "c"]);
  all(p.render(), n => n.props["aria-label"] === "Rename Loft")[0]!.props.onChange({ target: { value: "   " } });
  p.button(all(p.render(), n => n.type === "section" && n.props["aria-label"] === "Loft")[0]!, "Rename").props.onClick();
  expect(all(p.render(), n => n.props["data-testid"] === "room-notice").map(text)).toEqual(["A room name is 1 to 100 characters."]);
});
it("V2-SQ-D: splitting the one-price row ends its undo, so undo cannot duplicate or orphan rows", () => {
  const make = (id: string, description: string) => ({ ...line, id, scopeItemId: `scope-${id}`, description, room: "Kitchen", unitPricePence: 1000, disposition: "accepted" });
  const rows = [make("a", "Strip the units"), make("b", "Fit a sink")];
  const result = { ...fixture, proposal: { lines: rows.map(r => ({ id: r.id, unitPricePence: { value: 1000 }, room: r.room, category: "Work", roomInferred: false })), questions: [] },
    review: { ...fixture.review!, lines: rows } } as unknown as ReviewCaptureResult;
  const p = panel(result);
  all(p.render(), n => n.type === "input" && n.props.name === "mode-Kitchen" && n.props.checked === false)[0]!.props.onChange();
  all(p.render(), n => n.props["aria-label"] === "Room price Kitchen")[0]!.props.onChange({ target: { value: "500" } });
  p.button(p.render(), "Set one price for Kitchen").props.onClick();
  p.button(all(p.render(), n => n.props.className === "room-confirm")[0]!, "Apply one price").props.onClick();
  expect(all(p.render(), n => n.props["aria-label"] === "Undo one price for Kitchen" || text(n) === "Undo one price for Kitchen")).not.toHaveLength(0);
  p.button(p.render(), "Split Kitchen: all work as described").props.onClick();
  expect(all(p.render(), n => n.type === "button" && text(n) === "Undo one price for Kitchen")).toHaveLength(0);
  expect(all(p.render(), n => n.type === "article")).toHaveLength(5);
});
it("V2-SQ-D: undo after editing the one-price row's price shows the restored price, not the edit", () => {
  const row = { ...line, id: "a", scopeItemId: "scope-a", description: "Strip the units", room: "Kitchen", unitPricePence: 1000, disposition: "accepted" };
  const result = { ...fixture, proposal: { lines: [{ id: "a", unitPricePence: { value: 1000 }, room: "Kitchen", category: "Work", roomInferred: false }], questions: [] },
    review: { ...fixture.review!, lines: [row] } } as unknown as ReviewCaptureResult;
  const p = panel(result);
  all(p.render(), n => n.type === "input" && n.props.name === "mode-Kitchen" && n.props.checked === false)[0]!.props.onChange();
  all(p.render(), n => n.props["aria-label"] === "Room price Kitchen")[0]!.props.onChange({ target: { value: "500" } });
  p.button(p.render(), "Set one price for Kitchen").props.onClick();
  p.button(all(p.render(), n => n.props.className === "room-confirm")[0]!, "Apply one price").props.onClick();
  const priced = () => all(p.render(), n => n.type === "input" && String(n.props["aria-label"] ?? "").startsWith("Price "));
  for (const input of priced()) input.props.onChange({ target: { value: "777" } });
  p.button(p.render(), "Undo one price for Kitchen").props.onClick();
  expect(priced().map(input => input.props.value)).toEqual(["10.00"]);
});
it("V2-SQ-D: renaming a one-price room keeps its undo, which restores the rows under the new name", () => {
  const make = (id: string, description: string) => ({ ...line, id, scopeItemId: `scope-${id}`, description, room: "Kitchen", unitPricePence: 1000, disposition: "accepted" });
  const rows = [make("a", "Strip the units"), make("b", "Fit a sink")];
  const result = { ...fixture, proposal: { lines: rows.map(r => ({ id: r.id, unitPricePence: { value: 1000 }, room: r.room, category: "Work", roomInferred: false })), questions: [] },
    review: { ...fixture.review!, lines: rows } } as unknown as ReviewCaptureResult;
  const p = panel(result);
  const heads = (tree: React.ReactNode) => all(tree, n => n.type === "section" && n.props["data-testid"] === "room-group").map(n => n.props["aria-label"]);
  all(p.render(), n => n.type === "input" && n.props.name === "mode-Kitchen" && n.props.checked === false)[0]!.props.onChange();
  all(p.render(), n => n.props["aria-label"] === "Room price Kitchen")[0]!.props.onChange({ target: { value: "500" } });
  p.button(p.render(), "Set one price for Kitchen").props.onClick();
  p.button(all(p.render(), n => n.props.className === "room-confirm")[0]!, "Apply one price").props.onClick();
  all(p.render(), n => n.props["aria-label"] === "Rename Kitchen")[0]!.props.onChange({ target: { value: "Utility" } });
  p.button(all(p.render(), n => n.type === "section" && n.props["aria-label"] === "Kitchen")[0]!, "Rename").props.onClick();
  p.button(p.render(), "Undo one price for Utility").props.onClick();
  expect(heads(p.render())).toEqual(["Utility"]);
  expect(all(p.render(), n => n.type === "article").map(n => n.key)).toEqual(["a", "b"]);
});
