# Systemd Timer Lifecycle Across Repeat Installation

Use this guidance for timers managed by the system manager. Keep per-user
manager behavior and service namespace construction as separate contracts.

## Distinguish Installed, Active, And Armed

A system timer has three independent readiness properties:

1. `systemctl is-enabled` proves whether the unit is configured for the
   applicable boot target.
2. `systemctl is-active` proves that the timer unit is loaded and active.
3. A finite future trigger proves that the active timer is armed.

The first two do not imply the third. An active timer can be elapsed with
`Trigger: n/a`, `NextElapseUSecMonotonic=infinity`, no realtime elapse, and no
`NEXT` value in `systemctl list-timers`.

In particular, `systemctl enable --now example.timer` enables the unit and
starts it when it is inactive. It is not a deterministic re-arm operation for
an already-active timer after `systemctl daemon-reload`. A repeat installer can
therefore report an enabled and active timer while unattended scheduling is
dead.

## Make Re-arming An Installer Transition

Define the final timer state for every install mode, upgrade, and mode
transition. After publishing the complete unit set and running
`systemctl daemon-reload`, apply that state explicitly:

- For an enabled scheduling mode, enable the timer and perform the documented
  deterministic re-arm operation, normally `systemctl restart example.timer`
  after the final unit content is present. Do not rely on `enable --now` to
  restart an already-active timer.
- For a disabled or manual-only mode, stop and disable the timer deliberately.
  Do not leave the prior mode's active timer running.
- Validate the final state after the last transition. A successful earlier
  install is not evidence for a later reinstall with different configuration.

A restart is necessary but not always sufficient. The timer's schedule source
must be able to produce future triggers under every supported service result.
For recurring work that must continue when a oneshot service is skipped by a
`Condition...=` check, do not rely only on `OnUnitActiveSec=` or
`OnUnitInactiveSec=`. A condition skip can prevent the service transition that
would establish the next relative anchor, leaving the restarted timer active
but elapsed.

Choose a schedule whose semantics match the recurrence contract. A recurring
`OnCalendar=` cadence retains future calendar triggers independently of service
activation; add `Persistent=true` only when catch-up after timer inactivity is
also intended. Service-state-relative timers remain appropriate when recurrence
is deliberately anchored to a proven service transition. Document that
dependency and validate the skipped, failed, and successful service paths that
the unit supports.

## Validate Scheduling Semantics

After every install or mode transition that should leave scheduling enabled,
require all of these:

- `systemctl is-enabled example.timer` succeeds;
- `systemctl is-active example.timer` succeeds; and
- at least one of `NextElapseUSecMonotonic` or
  `NextElapseUSecRealtime` from `systemctl show example.timer` represents a
  finite future activation, or `systemctl list-timers` reports a concrete
  `NEXT` value for that exact unit.

Treat empty, zero, `infinity`, `n/a`, or `-` next-trigger values as unarmed
unless the target systemd contract explicitly gives the value another finite
meaning. Validate the timer row by exact unit identity; an unrelated scheduled
timer is not evidence. Keep static `systemd-analyze verify`, enabled state,
active state, and finite-next-trigger checks as separate gates.

If the service uses `User=` with filesystem sandboxing or mount namespace
directives, also
[exercise its runtime namespace](packaged-runtime-verification.md#exercise-hardened-system-units-at-runtime)
as established by
[RYA-221](https://linear.app/ryan-hayward/issue/RYA-221/hive-mind-validate-systemd-service-user-paths-in-runtime-namespaces).
A successful service namespace start does not prove that its timer will fire
again, and a finite timer trigger does not prove that service namespace
construction will reach `ExecStart`.

Use the two-install and condition-skip regressions in
[`automated-testing.md`](automated-testing.md#repeat-install-system-timer-tests).
