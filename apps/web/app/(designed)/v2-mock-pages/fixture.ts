// Fictional data for the four new V2 page mock-ups (V2-M2). Static only: no fetches, no writes,
// no camera, no sends. Same splashback-and-hall job as the Work mock (v2-mock).
export { briefs, job, tasks } from "../v2-mock/fixture";

export const firm = "Rowan Close Builders (fictional)";
export const customer = "Alex Morgan (fictional customer)";
export const week = "Week ending Fri 4 Dec";

export type Photo = { id: string; label: string; src: string; customerVisible: boolean };

// Only photos marked customer-visible may reach the Friday update; the private one must never show.
export const photos: Photo[] = [
  { id: "m1", label: "Illustrative photo · splashback tiled", src: "/design/assets/kitchen-photo-native.avif", customerVisible: true },
  { id: "m2", label: "Illustrative photo · hall walls prepared", src: "/design/assets/renovation-room.jpg", customerVisible: true },
  { id: "m3", label: "Illustrative photo · damp patch behind the sink", src: "/design/assets/renovation-interior.jpg", customerVisible: false },
];

export type UpdateSection = { key: "done" | "next" | "decisions" | "buy"; title: string; empty: string; lines: string[] };

export const update: UpdateSection[] = [
  { key: "done", title: "Done this week", empty: "Nothing finished this week.", lines: [
    "Kitchen splashback prepared and tiled to the end of the worktop.",
    "Kitchen splashback grouted.",
    "Hall walls and woodwork filled and sanded.",
  ] },
  { key: "next", title: "Next week", empty: "Nothing planned for next week yet.", lines: [
    "Paint the hall walls and woodwork, now Mon 7 Dec, once your eggshell paint is here.",
    "Refit the splashback trim at the sink end.",
  ] },
  { key: "decisions", title: "Decisions needed from you", empty: "No decisions needed this week.", lines: [
    "Should we take the hall radiator off the wall to paint behind it? Please decide by Mon 7 Dec.",
  ] },
  { key: "buy", title: "Items you need to buy", empty: "Nothing for you to buy.", lines: [
    "Eggshell paint for the hall woodwork, 1 litre, in your chosen colour. Needed on site by Mon 7 Dec.",
  ] },
];

export type Question = { who: string; asker: string; text: string; by: string; options: string[] };

export const questions: Record<"customer" | "merchant", Question> = {
  customer: { who: customer, asker: firm, text: "Should we take the hall radiator off the wall to paint behind it?", by: "Please answer by Mon 7 Dec.",
    options: ["Yes, take it off and refit it", "No, paint around it"] },
  merchant: { who: "Rowan Builders’ Merchant (fictional)", asker: firm, text: "Can you deliver 6 packs of white ceramic wall tiles (1.2 m²) to 24 Rowan Close?", by: "Needed by Mon 30 Nov.",
    options: ["Yes, by Mon 30 Nov", "Not by then", "Out of stock"] },
};

export const ramsWording = "Prepared by JobGuard from your plan. You must check and complete it. It is not a certificate.";

export type RamsSection = { key: string; title: string; lines: string[]; toComplete?: string[] };

export const rams: RamsSection[] = [
  { key: "job", title: "Job", lines: [
    "Kitchen splashback & hall decorating · 24 Rowan Close.",
    "Occupied home: the household stays in during the work.",
    "Planned work: Mon 30 Nov to Wed 2 Dec.",
  ] },
  { key: "tiling", title: "Hazards and controls · Prepare and tile the splashback", lines: [
    "Dust from tile cutting: cut outside or use wet cutting, wear an FFP3 mask, vacuum with an H-class extractor.",
    "Tile adhesive and grout (COSHH): read the data sheets, wear gloves, keep the kitchen ventilated.",
    "Sharp tile edges: wear cut-resistant gloves and clear offcuts at the end of each visit.",
  ] },
  { key: "painting", title: "Hazards and controls · Prepare and paint the hall", lines: [
    "Working at height on steps for the upper walls: check the steps before use, keep three points of contact.",
    "Filler dust from sanding: dust sheets, mask and extraction.",
    "Paint (COSHH): water-based paint, ventilate the hall, store tins closed.",
  ] },
  { key: "home", title: "Occupied home", lines: [
    "Keep a clear route through the hall at all times.",
    "Never leave tools, cutters or open tins where the household can reach them.",
    "Keep the sink usable for the household at the end of each visit.",
  ] },
  { key: "sequence", title: "Sequence of work", lines: [
    "1. Prepare and tile the splashback (Tiler).",
    "2. Prepare hall walls and woodwork (Decorator).",
    "3. Grout the splashback (Tiler).",
    "4. Paint hall walls and woodwork (Decorator).",
  ] },
  { key: "welfare", title: "Site rules and welfare", lines: [
    "Ring the front bell on arrival.",
    "Toilet and hand washing: agree with the customer before work starts.",
  ] },
  { key: "emergency", title: "Emergency contacts", lines: ["Site address: 24 Rowan Close."],
    toComplete: ["Nearest A&E", "First aider on site"] },
];

export const builder = "Jordan Hale (fictional builder)";

// Photos already on the job that a trade can attach as proof. A proof slot holds a reference
// to one of these; the mock never opens the camera.
export const jobPhotos: Photo[] = [
  { id: "m4", label: "Illustrative photo · prepared kitchen wall", src: "/design/assets/reference-photos.avif", customerVisible: false },
  { id: "m1", label: "Illustrative photo · splashback tiled", src: "/design/assets/kitchen-photo-native.avif", customerVisible: true },
];

export type BriefTask = { id: string; name: string; day: string; proof: string[] };

// The tiler's today and tomorrow, from the Work mock's plan and brief.
export const tilerTasks: BriefTask[] = [
  { id: "t1", name: "Prepare and tile the splashback", day: "Today · Mon 30 Nov", proof: ["Prepared wall", "Finished tiles"] },
  { id: "t2", name: "Grout the splashback", day: "Tomorrow · Tue 1 Dec", proof: ["Finished grout"] },
];

export const blockedReasons = ["Materials not here", "No access to the room", "Earlier work not ready", "Something else"];
