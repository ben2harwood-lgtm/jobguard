# Private evidence storage (M0-11)

The evidence bucket is private and bucket versioning is mandatory. Local Compose
creates `jobguard-evidence-private`, removes anonymous access, and enables versioning.
Production provisioning must do the equivalent independently; the application fails
finalization when S3/MinIO does not return a concrete version ID. Do not enable Object
Lock or WORM until retention/deletion policy is approved.

Clients receive a PUT URL valid for five minutes. Downloads are authorized against the
verified tenant plus the registered job and scope identity, and are signed for at most
15 minutes. Finalization reads the exact submitted version on the server and checks its
bytes, SHA-256, size, and allow-listed image MIME type before immutable registration.
Provider metadata is not treated as verification.

Original registrations and derived preview registrations are distinct: previews point
to an original and cannot mutate its key, version, bytes, or SHA-256. Device capture
metadata is untrusted and stored separately from server receive and verification times.
Cleanup only removes expired, unregistered `transient_upload` object versions;
registered evidence and retained classes are excluded.
