# Systemd Service Activation Transactions

Use this contract when an installer, credential hydrator, deployer, or custody
CLI activates or revokes one service owned by the system manager. Keep user
manager, timer re-arming, unit publication, and credential-file rotation as
separate contracts.

- [Establish Exact Unit Authority Before State](#establish-exact-unit-authority-before-state)
- [Project Activation As Bounded Stages](#project-activation-as-bounded-stages)
- [Reconcile Failure Before Reporting Rollback](#reconcile-failure-before-reporting-rollback)

## Establish Exact Unit Authority Before State

Treat every caller-provided unit name as untrusted authority. Before creating
mutable service control, credential custody, rollback state, or a recovery
command:

1. Validate the complete unit against the one owned template and its canonical
   instance grammar, such as `example-runner@<validated-instance>.service`.
   Derive the instance from the authoritative account or principal when that
   relationship is part of ownership. Reject aliases, suffix changes, escaped
   or normalized alternatives, glob-like input, and unrelated valid units.
2. Retain that exact validated string as the only manager-command operand. Use
   an argument vector, not shell interpolation or a later caller value.
3. Ask the manager to load that exact unit and verify its canonical loaded
   identity, load state, trusted fragment or generated source, effective
   drop-ins, and exact effective credential directive. Require the expected
   credential name and protected source binding with no extra or substituted
   credential entry. Use authoritative manager properties when available, or
   a systemd-aware merged-unit path; a source-file parse alone does not prove
   what the manager loaded.

Finish this authority check before `enable`, `restart`, `stop`, `disable`, or
`reset-failed`. Repeat the effective identity and binding check after a manager
reload and immediately before every destructive stop, disable, reset, or
credential-revocation path. If authority cannot be re-established, record a
bounded binding failure and withhold the mutation; never broaden cleanup to an
unverified name merely to make progress.

Declare the activation policy and rollback target before the first mutation,
including whether failure should leave the exact unit enabled or disabled.
This prevents cleanup from guessing the prior or intended unit-file state.

## Project Activation As Bounded Stages

Give each transition its own allowlisted stage, code, and fixed recovery-command
template:

| Stage | Required boundary |
| --- | --- |
| `unit_binding` | Exact owned unit and effective credential binding are proven. |
| `activation_readiness` | The exact unit's current active state is read; a stale failed state may be reset. |
| `service_enablement` | The declared enable transition settles. |
| `service_start` | Restart of the exact owned unit settles. |
| `service_health` | A fresh manager health read proves the declared ready state. |
| `activation_reconciliation` | Cleanup commands and the authoritative final-state read are reconciled separately from the initiating failure. |

Clear a start limit only for the exact validated instance, only after an
authoritative read shows the state that requires it, and only at activation
readiness or failure-reconciliation boundaries. Never run a template-wide,
prefix, discovered-unit, or unrelated reset. A successful reset is not health
evidence; continue through restart and a fresh readiness read.

Generate operator commands only after validation from fixed tokens plus the
validated unit. Keep commands copy-safe and stage-specific. Do not collapse a
binding failure, stale start limit, enable failure, restart failure, inactive
service, or cleanup defect into a generic install or credential error.

## Reconcile Failure Before Reporting Rollback

Map the initiating activation error immediately to its bounded stage, code,
and recovery command. Do not retain the native exception as report data. Then
run reconciliation as a separate fallible transition:

1. Re-establish exact unit and credential-binding authority for the cleanup
   path.
2. Attempt every authorized cleanup step independently—normally disable when
   the failed transaction enabled the unit, stop it, and reset only its stale
   failed state. Record a bounded code for each failed or safely withheld step;
   one failure must not skip later eligible cleanup.
3. Regardless of cleanup-command results, read authoritative manager state for
   the exact unit. Prove `ActiveState=inactive` and the predeclared enabled or
   disabled target. Command exit status, a preserved credential file, or the
   absence of a process observed elsewhere is not final-state proof.
4. If every cleanup step settled and the final read matches, return the
   original activation stage and code with an explicit bounded
   `cleanup_verified` reconciliation result. Do not replace the initiating
   cause with a success-shaped rollback message.
5. If a cleanup step failed, the state read failed, or final state differs,
   report `activation_reconciliation` with its own bounded primary code while
   retaining the original activation stage and code as separate fields. Give
   a fixed reconciliation command that rechecks the exact unit.

Use a closed report schema. Permit only allowlisted stages and codes, the
validated unit, bounded cleanup-step codes, normalized manager states, and
fixed recovery commands. Structurally exclude native stdout, stderr, exception
messages and causes, journal text, credential values, credential paths not
already public contract data, and unkeyed secret-derived values from both the
activation and reconciliation records. Apply
[Structural Secret Exclusion](automated-testing.md#structural-secret-exclusion)
to the serializer, not only a final log scrubber.

Keep the credential entry's crash-safe install, rotate, rollback, commit, and
revoke mechanics in
[Reversible Credential Rotation](general-implementation.md#reversible-credential-rotation),
established by
[RYA-330](https://linear.app/ryan-hayward/issue/RYA-330/hive-mind-add-crash-safe-credential-rotation-and-pty-handoff-guidance).
Use this activation transaction only after that custody state is safe. Use
[systemd timer lifecycle](systemd-timer-lifecycle.md) for scheduling readiness
and [hardened system-unit runtime checks](packaged-runtime-verification.md#exercise-hardened-system-units-at-runtime)
for namespace construction; neither proves activation rollback.

Use the deterministic and live-manager matrix in
[`automated-testing.md`](automated-testing.md#systemd-service-activation-reconciliation-tests).
