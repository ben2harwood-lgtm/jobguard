import { z } from "zod";

// Customer text is explicitly reviewed; never copy diary, financial or evidence payloads.
const line = z.string().trim().min(1).max(400).refine(value => {
  if (/[£$€]|\b(?:GBP|USD|EUR)\b|\b\d+\s*(?:pence|pounds?|p)\b/iu.test(value)) return false;
  // A two-decimal number needs an explicit measurement unit or a valid am/pm clock time.
  return [...value.matchAll(/\d+[.,]\d{2}(?!\d)/gu)].every(match => {
    const after = value.slice(match.index + match[0].length);
    return /^\s*(?:mm|cm|m|m2|m²|m3|kg|g|l|ltr|litres?|metres?|sq ?m|lm)(?![\p{L}\p{N}_])/iu.test(after)
      || (/^(?:0?[1-9]|1[0-2])\.[0-5]\d$/u.test(match[0]) && /^\s*(?:am|pm)\b/iu.test(after));
  });
}, "Leave amounts out of the customer update");
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
const fridayOmitted = {
  thisWeek: "Some work this week has been left out of this update. Please check before sending.",
  nextWeek: "Some work next week has been left out of this update. Please check before sending.",
};
export function fridayWeekDates(week: string) {
  fridayQueryV1.parse({ week });
  const start = new Date(week + "T00:00:00Z");
  if (start.getUTCDay() !== 1) throw new Error("FRIDAY_WEEK_MUST_START_MONDAY");
  return [0, 7, 14].map(days => new Date(start.getTime() + days * 86400000).toISOString().slice(0, 10));
}
export function fridayContentFromPlan(week: string, tasks: readonly { title: string; scheduledDate?: string | null }[]): FridayContent {
  const [start, next, end] = fridayWeekDates(week) as [string, string, string];
  const titles = (from: string, until: string, omitted: string) => {
    const scheduled = tasks.filter(task => task.scheduledDate && task.scheduledDate >= from && task.scheduledDate < until);
    const kept = scheduled.flatMap(task => line.safeParse(task.title).success ? [task.title] : []);
    const dropped = scheduled.length - kept.length;
    return dropped ? [...kept.slice(0, 29), omitted] : kept.slice(0, 30);
  };
  return fridayContentV1.parse({ schema: "friday-content.v1", thisWeek: titles(start, next, fridayOmitted.thisWeek),
    nextWeek: titles(next, end, fridayOmitted.nextWeek), photos: [] });
}
export function fridayWeekLabel(week: string) {
  fridayQueryV1.parse({ week });
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(week + "T00:00:00Z")).replace(",", "");
}
export function fridayMessage(snapshot: Pick<FridaySnapshot, "content" | "week">) {
  const content = fridayContentV1.parse(snapshot.content);
  return ["Practice sandbox — synthetic data; nothing is sent or charged", `Your Friday update · week of ${fridayWeekLabel(snapshot.week)}`,
    "This week", ...(content.thisWeek.length ? content.thisWeek : [fridayEmpty.thisWeek]),
    "Photos", fridayEmpty.photos, "Next week", ...(content.nextWeek.length ? content.nextWeek : [fridayEmpty.nextWeek])].join("\n");
}
