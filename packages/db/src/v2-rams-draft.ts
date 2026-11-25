import { createHash } from "node:crypto";
import { z } from "zod";
import type { WorkPlan } from "./v2-work-plan-repository.js";
import { ramsHazards } from "./v2-rams-hazards.js";

export const ramsWarning = "Prepared by JobGuard from your plan. You must check and complete it. It is not a certificate.";
const uuid = z.uuid().transform(value => value.toLowerCase());
const revision = z.number().int().min(0).max(2_147_483_646);
const envelope = {
  version: z.literal("rams-command.v1"), commandId: uuid,
  expectedVersion: revision, quoteRevisionId: uuid, expectedPlanVersion: revision,
};
export const ramsCommandV1 = z.discriminatedUnion("action", [
  z.strictObject({ ...envelope, action: z.literal("generate") }),
  z.strictObject({ ...envelope, action: z.literal("edit"), sectionKey: z.string().min(1).max(200),
    text: z.string().trim().min(1).max(8_000) }),
  z.strictObject({ ...envelope, action: z.literal("sign"), checkedAllSections: z.literal(true), signerName: z.string().trim().min(1).max(100) }),
]);
export type RamsCommand = z.infer<typeof ramsCommandV1>;
export const ramsSectionV1 = z.strictObject({
  key: z.string(), heading: z.string(), text: z.string(), sourceHash: z.string(),
  edited: z.boolean(), needsReview: z.boolean(), required: z.boolean(),
});
export const ramsDraftV1 = z.strictObject({
  version: z.literal("rams-draft.v1"), environment: z.literal("synthetic_demo"), jobId: uuid, revision: revision, documentVersion: revision,
  quoteRevisionId: uuid, planVersion: revision, status: z.enum(["draft", "signed"]),
  sections: z.array(ramsSectionV1), actorMembershipId: uuid, recordedAt: z.string(),
  signedBy: uuid.nullable(), signedAt: z.string().nullable(), signedName: z.string().nullable(),
});
export type RamsDraft = z.infer<typeof ramsDraftV1>;
export type RamsSection = z.infer<typeof ramsSectionV1>;
export class RamsError extends Error {
  constructor(readonly code: "RAMS_INVALID_COMMAND" | "RAMS_VERSION_CONFLICT" | "RAMS_COMMAND_CONFLICT" |
    "RAMS_PLAN_CHANGED" | "RAMS_DRAFT_REQUIRED" | "RAMS_SECTION_NOT_FOUND" | "RAMS_INCOMPLETE") { super(code); }
}
export function ramsHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function ramsSections(plan: WorkPlan, previous?: RamsDraft): RamsSection[] {
  const taskSource = (task: WorkPlan["tasks"][number]) => ({
    ...task, scope: plan.scopeItems.find(item => item.scopeItemId === task.scopeItemId),
  });
  const section = (key: string, heading: string, text: string, source: unknown, required = false): RamsSection => ({
    key, heading, text, sourceHash: ramsHash(source), required, edited: false, needsReview: false,
  });
  const tasks = [...plan.tasks, ...plan.unplanned.map(item => ({
    key: "unplanned", scopeItemId: item.scopeItemId, title: item.title,
  }))];
  const sections = tasks.map(task => {
    const hazards = ramsHazards[plan.templateKey]?.[task.key];
    const source = plan.tasks.find(entry => entry.scopeItemId === task.scopeItemId && entry.key === task.key);
    return section(`hazards:${task.scopeItemId}:${task.key}`, `Hazards and controls — ${task.title}`,
      hazards?.join("\n") ?? "No standard hazards listed: add your own",
      { templateKey: plan.templateKey, task: source ? taskSource(source) : task }, !hazards);
  });
  sections.push(
    section("sequence", "Sequence of work", plan.tasks.map((task, index) => `${index + 1}. ${task.title} (${task.trade})`).join("\n"),
      plan.tasks.map(taskSource), plan.tasks.length === 0),
    section("site-rules", "Site rules", "Occupied home: agree working hours and access, separate the work area and keep escape routes clear. Check and add site-specific rules.", "site-rules.v1"),
    section("welfare", "Welfare", "To complete", "welfare.v1", true),
    section("emergency", "Emergency contacts", "To complete", "emergency.v1", true),
  );
  for (const current of sections) {
    const prior = previous?.sections.find(entry => entry.key === current.key);
    if (prior?.edited) {
      current.text = prior.text;
      current.edited = true;
      current.needsReview = prior.needsReview || prior.sourceHash !== current.sourceHash;
    }
  }
  // Removed edited tasks are retained explicitly for the builder to reconcile.
  for (const prior of previous?.sections ?? []) {
    if (prior.edited && !sections.some(entry => entry.key === prior.key)) {
      sections.push({ ...prior, heading: prior.heading.startsWith("Removed task — ") ? prior.heading : `Removed task — ${prior.heading}`, needsReview: true });
    }
  }
  return sections;
}

export function editRamsSections(sections: RamsSection[], key: string, text: string): RamsSection[] {
  if (!sections.some(section => section.key === key)) throw new RamsError("RAMS_SECTION_NOT_FOUND");
  return sections.map(section => section.key === key ? { ...section, text, edited: true, needsReview: false } : section);
}

export function ramsReadyToSign(sections: RamsSection[]): boolean {
  return sections.length > 0 && sections.every(section => !section.needsReview && section.text.trim().length > 0 &&
    (!section.required || (section.edited && !/^(To complete|No standard hazards listed: add your own)$/iu.test(section.text.trim()))));
}
