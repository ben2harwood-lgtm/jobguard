import { expect, it } from "vitest";
import { reminderLabel } from "./v2-fact-reminder-label";

it("shows the reminder time in London and each unconfirmed reason", () => {
  expect(reminderLabel({ kind: "reminder", reason: null, recordedAt: "2026-12-01T12:00:00.000Z" })).toBe("Reminder sent Tue 1 Dec, 12:00");
  expect(reminderLabel({ kind: "reminder", reason: null, recordedAt: "2026-03-29T07:00:00.000Z" })).toBe("Reminder sent Sun 29 Mar, 08:00");
  expect(reminderLabel({ kind: "unconfirmed", reason: "no_reply", recordedAt: "2026-12-02T08:00:00.000Z" }))
    .toBe("Unconfirmed: no reply by the day before");
  expect(reminderLabel({ kind: "unconfirmed", reason: "link_expired", recordedAt: "2026-12-02T08:00:00.000Z" }))
    .toBe("Unconfirmed: the reply link expired");
});
