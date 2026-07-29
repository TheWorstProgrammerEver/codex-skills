# Systemd Interactive Descriptor Routing

Use this guidance when a systemd service combines ownership of a physical
interactive console with redacted, structured progress logging.

## Descriptor Contract

Review the effective destination of file descriptors 0, 1, and 2 independently
for both the service process and every child. Do not infer a complete foreground
TTY from `TTYPath=` or `StandardInput=tty-force`. `TTYPath=` selects the terminal
for a standard descriptor that systemd is connecting to `tty`; it does not
redirect a descriptor configured as `journal` or `journal+console`.

Journald output uses an `AF_UNIX` stream. With `StandardOutput=journal+console`
or `StandardError=journal+console`, console mirroring may make bytes visible on
a physical console, but it does not turn the inherited output descriptor into a
TTY. A child that inherits those descriptors can therefore observe non-TTY
stdout and stderr and send raw interactive or authentication bytes to the
journal.

When the service itself must retain a redacted journal path but a foreground
child needs the physical terminal:

- keep the parent's journal writes limited to explicitly allowlisted,
  structured progress;
- verify that the inherited standard-input descriptor is a TTY before starting
  the interactive child;
- duplicate that already-open descriptor onto child file descriptors 0, 1, and
  2, so the child's complete stdio triplet refers to the verified terminal;
- prefer reusing the descriptor opened by systemd over reopening the configured
  console path after a user or privilege transition, which introduces a
  separate target-permissions dependency; and
- fail closed before child spawn when the descriptor is absent or is not a TTY.

If a design intentionally gives the child different input and output
destinations, document and verify that program-specific contract instead of
calling it foreground-TTY inheritance. Never route raw interactive output to
journald merely because it is also mirrored to a console.

`systemd-analyze verify` checks unit syntax and dependencies. It does not prove
runtime `isatty` results, child descriptor mappings, journal redaction, or
separation between raw interactive bytes and structured progress.

## Review Scenarios

| Service and child routing | Review result |
| --- | --- |
| `TTYPath=` plus `StandardInput=tty-force`; stdout and stderr use `journal+console`; the child inherits all service stdio | Reject. Only fd 0 is established as the physical TTY. The child can receive non-TTY output descriptors and leak raw bytes to journald. |
| The parent sends only allowlisted progress to its journal descriptors; it verifies inherited fd 0 is a TTY and maps that same descriptor to child fds 0, 1, and 2; raw child bytes have no journal route | Accept the routing boundary, subject to the descriptor-level tests below. The interactive child owns a complete TTY triplet while structured parent logging remains separate. |

Keep service names, account names, and configured console locations role-based
in reusable examples and fixtures. Do not copy host identities, credentials, or
real authentication output into test data.

## Descriptor-Routing Tests

Use a routing fake or an isolated descriptor-level test that can observe the
parent sinks, the `isatty` decision, the exact child stdio triplet, spawn order,
and bytes delivered to each sink.

- Model TTY input with a pseudo-terminal and journal output with a pipe or local
  Unix stream. Assert the expected `isatty` result for each descriptor rather
  than inferring it from unit text or visible console output.
- In the accepted path, assert that TTY verification occurs before spawn, child
  fds 0, 1, and 2 all reference the verified descriptor, a generated manual
  marker reaches only the TTY sink, and the journal sink receives only
  allowlisted structured progress.
- In the denied path, substitute a non-TTY inherited input descriptor. Assert
  rejection before spawn, zero child launches, zero manual-marker bytes in the
  journal sink, and no partial descriptor remapping.
- Keep a regression for the rejected review scenario: TTY stdin with inherited
  `journal+console` stdout and stderr must be flagged even when the unit passes
  `systemd-analyze verify`.
- Scenario-review the accepted split design separately. Passing syntax
  validation is useful additional evidence, but never substitute it for the
  routing fake or isolated `isatty` assertions.

Use generated placeholder markers only, isolate pseudo-terminals and sockets,
and close every descriptor in `finally`.

Keep the originating descriptor distinction linked to
[RYA-179](https://linear.app/ryan-hayward/issue/RYA-179/hive-mind-verify-inherited-tty-descriptors-separately-from-journal).
