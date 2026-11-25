# 2008 · V2 walk session record

The checked V2 bootstrap applies this migration after 2001. The shared runner
leaves databases without both the V2 name and the firm policy untouched.

No backfill is needed. A job starts with no walk.

`app.v2_walk_session` holds one phone walk-round of a job: who started it, the
phone's claimed start time and the server's receipt time.

`app.v2_walk_entry` holds append-only revisions of the walk's numbered
entries: a room, a note segment, a stated measurement with its unit, or a
photo. The phone numbers each entry in the order it captured it. A note,
measurement or photo is filed under the room entry with the nearest lower
number, worked out on read. Device time and photo metadata never choose the
room, so entries that arrive out of order or carry identical or wrong device
times still land in the right room. An entry after a missing number reads as
"waiting" until the gap arrives.

Each revision keeps three times apart: the phone's claimed capture time, the
server's receipt time (set by the database), and, for a photo, the final
verification of its bytes, which stays on `app.evidence_upload` and is read
live, never copied. A device time more than five minutes from the server's
receipt time is flagged on read.

Every revision records the verified person, job, expected version and a
command identity. An exact retry replays the first result; the same identity
with different content is refused. A revision whose expected version is not
the latest is refused. A revision keeps its entry's kind and photo.

A photo must be an evidence upload of the same job. A trigger refuses a photo
from another job of the same firm or from another firm, and a photo is filed in
one entry only. Stated measurements stay on the walk entry; feeding them into
the d1 measurement record is a later piece. No audio is stored.

`app.v2_walk_editor(text)` resolves the signed-in person's membership from
their verified linked credential and bound firm, like the work-plan editor in
2003, under its own name so this piece does not depend on chunk C.

Runtime can only read and append rows of visible jobs; it has no update,
delete or truncate. Composite foreign keys bind every entry to its firm, job
and session, and every photo to an upload in the same firm.

Correct the schema with a later V2 migration if needed. To rehearse the
previous branch, keep its database in a separate checkout with separate state.

Repair (Lane C P2, 25 Nov): a photo entry may be filed before its evidence
upload begins. A second guard, `app.v2_walk_photo_upload_guard`, is a BEFORE
INSERT trigger on `app.evidence_upload` that refuses an upload whose ID a walk
already filed on a different job. Both guards take the same per-photo
transaction advisory lock before checking, so concurrent inserts in either
order serialize and the second sees the first. A pending upload on the walk's
own job is unaffected. Both run with the caller's rights; a writer without
SELECT on walk entries skips the upload-side check, and a photo filed by a
different firm in the shared practice tenant is not visible to it (photo IDs
are random device-generated UUIDs).
