import { z } from "zod";

// Customer text is explicitly reviewed; never copy diary, financial or evidence payloads.
const line = z.string().trim().min(1).max(400).refine(value =>
  !/[£$€]|\b(?:GBP|USD|EUR)\b|\d+[.,]\d{2}\b|\b\d+\s*(?:pence|pounds?)\b/iu.test(value), "Leave amounts out of the customer update");
export const fridayContentV1 = z.strictObject({
  schema: z.literal("friday-content.v1"),
  thisWeek: z.array(line).max(30), nextWeek: z.array(line).max(30),
  photos: z.array(z.never()).max(0),
});
const date = z.iso.date().refine(value => new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value);
export const fridayQueryV1 = z.strictObject({ week: date });
const fields = { schema: z.literal("friday-command.v1"), commandId: z.uuid(), week: date,
  expectedVersion: z.number().int().min(0).max(10000), clientCreatedAt: z.iso.datetime() };
export const fridayCommandV1 = z.discriminatedUnion("action", [
  z.strictObject({ ...fields, action: z.literal("prepare") }),
  z.strictObject({ ...fields, action: z.literal("edit"), content: fridayContentV1 }),
  z.strictObject({ ...fields, action: z.literal("send"), contentHash: z.string().regex(/^[a-f0-9]{64}$/u) }),
]);
export type FridayContent = z.infer<typeof fridayContentV1>;
export type FridayCommand = z.infer<typeof fridayCommandV1>;
export type FridaySnapshot = {
  commandId: string; week: string; sequence: number; contentVersion: number; content: FridayContent;
  contentHash: string; recipient: string; sentAt: string | null; sentBy: string | null;
};
export const fridayEmpty = { thisWeek: "No work scheduled this week.", nextWeek: "Nothing planned for next week yet.",
  photos: "No photos this week." };
export function fridayWeekDates(week: string) {
  fridayQueryV1.parse({ week });
  const start = new Date(week + "T00:00:00Z");
  if (start.getUTCDay() !== 1) throw new Error("FRIDAY_WEEK_MUST_START_MONDAY");
  return [0, 7, 14].map(days => new Date(start.getTime() + days * 86400000).toISOString().slice(0, 10));
}
export function fridayContentFromPlan(week: string, tasks: readonly { title: string; scheduledDate?: string | null }[]): FridayContent {
  const [start, next, end] = fridayWeekDates(week) as [string, string, string];
  const titles = (from: string, until: string) => tasks.filter(task => task.scheduledDate && task.scheduledDate >= from && task.scheduledDate < until)
    .flatMap(task => line.safeParse(task.title).success ? [task.title] : []).slice(0, 30);
  return fridayContentV1.parse({ schema: "friday-content.v1", thisWeek: titles(start, next), nextWeek: titles(next, end), photos: [] });
}
export function fridayMessage(snapshot: Pick<FridaySnapshot, "content" | "week">) {
  const content = fridayContentV1.parse(snapshot.content);
  return ["Practice sandbox — synthetic data; nothing is sent or charged", `Your Friday update · week of ${snapshot.week}`,
    "This week", ...(content.thisWeek.length ? content.thisWeek : [fridayEmpty.thisWeek]),
    "Photos", fridayEmpty.photos, "Next week", ...(content.nextWeek.length ? content.nextWeek : [fridayEmpty.nextWeek])].join("\n");
}
