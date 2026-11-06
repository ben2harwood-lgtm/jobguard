# Synthetic machine registration v1

ENT-13A-MACHINE-REGISTER. RED: machine authentication boundary. No migration.

`MachineModule` registers `FictionalMachineController` at
`POST /connectors/machine/intake`, its connection service, and
`FictionalMachineManagement` only with server configuration
`JOBGUARD_CONNECTOR_MACHINE=synthetic` and the existing connector environment gate
`JOBGUARD_ENV=synthetic_demo`. The switch is absent by default: there is no machine
route. Any supplied switch value other than `synthetic`, or `synthetic` in any
other or missing environment, refuses application composition. Unset the switch
or remove the module import to undo registration.

Only this exact POST path delegates from the application guard to the existing
`connector-machine-signature.v1` verifier. Cookies and Authorization headers are
refused there, even alongside a correct machine signature. Other paths retain
normal member authentication and its blanket refusal of machine headers. The
controller requires original raw bytes; signature verification and persisted
machine authority precede the existing `connector.machine_stage` SQL path.
Staging is not promotion, approval, pricing, origin assignment or statement access.

The secret store is an in-memory fake. Module creation receives explicit maps of
connection IDs to fictional database tokens and `fixture:` labels to signing
bytes. Maps and bytes are copied; returned key bytes are also copied. Unknown or
non-fixture key labels refuse before staging. There is no environment-variable,
file or network secret resolver and no signing-byte logging. AppModule supplies
empty maps, so switching it on alone grants no usable machine credentials.
The machine pool requests the existing `jobguard_machine` role; the database must
already authorize that role. No grants or credentials are installed by this piece.
Management remains an injected application service with the existing owner and
membership checks; this piece creates no HTTP management endpoint.

## Named holds for landing

- API bootstrap currently omits Nest's `rawBody: true` option. `apps/api/src/main.ts`
  is outside this piece's allowed paths. A separately authorized bootstrap change
  and HTTP verification must enable raw-byte capture before synthetic HTTP intake
  can work. Until then the controller fails closed. Tests supplying raw bytes do
  not prove request-body capture over HTTP.
- Exact-head green CI and independent RED review remain required. Existing real
  PostgreSQL machine authority/staging tests must run in CI; query doubles are
  adapter evidence only.
- H4, real secret storage/resolution, real endpoints/partners, SFTP and G5 remain
  open. This registration closes none of those gates and authorizes no real data,
  provider action or production launch.
