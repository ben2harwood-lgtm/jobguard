# 0773 Pilot capture track

Pilot drafts must appear in the verified pilot list before quote activation.
The capture trigger inserts the immutable track row in the proposal transaction.
It uses the existing bound request, checks an active owner and applies only in a
pilot data database. The runtime role retains its existing track-table grants.
Existing job tracks are preserved.

The pilot HTTP integration covers a fresh migration and capture. To disable
this entry path, close G1 and roll forward with a migration that removes the
capture trigger. Retain existing track rows as their job classification.
