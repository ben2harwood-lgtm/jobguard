# 0777 Pilot Final Check

Provision the NOLOGIN `jobguard_pilot_final_check` capability through an administrator before applying 0777 with a restricted migration owner. The pilot worker uses a distinct `jobguard_pilot_shadow_login` credential on the dedicated pilot business database. Provision this login with only the inherited `jobguard_shadow` and `jobguard_pilot_final_check` memberships, no object ownership and a separate password. Pin its URL as `PILOT_SHADOW_DATABASE_URL` in the deployment resource manifest. The Graphile login connects to the separate queue database and has no role memberships. A worker started without the shadow binding retains the disabled Final Check handler.

New pilot locks durably reserve a manifest and bind the approved terms digest to that reservation. A newer approval supersedes the version on the lock and blocks processing. The migration leaves prior locks and practice requests intact. The worker processes empty inventories and the exact fictional completion-photo fixture. Unsupported evidence leaves the check incomplete.

Use fictional inputs for this candidate. Pilot terms and D13 approval, supported D02/D06 policy and the candidate-specific G1 approval remain release gates. Publication stores the certificate through the existing checked path. Reveal and invoice routing belong to the later piece.

For a forward fix, stop discovery and execution by closing G1, then remove the shadow credential from the deployment and disable that login. Keep immutable locks, bindings, manifests and certificates for audit.
