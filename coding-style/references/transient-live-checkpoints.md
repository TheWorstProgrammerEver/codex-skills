# Transient Live Checkpoint Gates

Use this guidance when a physical or production validation requires a real
service, process, host, connection, or control-plane interruption while a
workflow is in a particular non-terminal state. Treat that state as transient:
once the workflow advances, later simulation or restart from terminal success
cannot recreate the same evidence.

## Contents

- [Plan The Gate Before Execution](#plan-the-gate-before-execution)
- [Execute And Release The Gate](#execute-and-release-the-gate)
- [Keep Evidence Classes Separate](#keep-evidence-classes-separate)
- [Evidence And Handoff Template](#evidence-and-handoff-template)
- [Redaction Boundary](#redaction-boundary)
- [Scenario Review](#scenario-review)

## Plan The Gate Before Execution

Inventory every required live intervention while writing the runbook. For each
one, name:

- the observable checkpoint and the completed-step identity that proves the
  workflow reached it without advancing past it;
- the exact real interruption to perform and the resume assertions it must
  satisfy;
- the next irreversible action that must remain disabled until the evidence is
  accepted;
- the operator, physical access, or human-authentication dependency and the
  resumable handoff location; and
- the bounded, redacted evidence fields allowed to leave the live environment.

Render each intervention as a blocking operator gate in the executable
runbook, not as optional prose after the main steps. The workflow must stop at
the checkpoint and require an explicit `checkpoint observed` acknowledgement
before enabling the interruption. It must then require a separate
`interruption and resume evidence recorded` acknowledgement before releasing
the irreversible next action. A general start approval, destructive-operation
confirmation, or terminal success acknowledgement does not satisfy either
gate.

When automation owns the workflow, encode the pause as a durable state whose
allowed transitions exclude forward advancement until the required evidence
record is present and valid. When a human owns the pause, make the stop
condition and resume command explicit and persist a handoff before yielding
for physical access or authentication.

## Execute And Release The Gate

At the checkpoint:

1. Stop the run before the transient state can disappear.
2. Capture the phase, completed-step identity, planned next step, and
   allowlisted pre-interruption observations.
3. Record the first acknowledgement, then perform the specified real
   interruption against the live system.
4. Resume through the supported recovery path and capture the assertions that
   prove the workflow continued from the checkpoint without silently replaying
   completed effects.
5. Record the second acknowledgement only after the evidence is stored, then
   allow the run to advance.

If the checkpoint is missed, record the live mid-flight case as not executed.
Preserve any terminal system and its legitimate terminal-re-entry evidence.
Never delete checkpoints, roll back durable state ad hoc, or replay completed
effects merely to manufacture a past transient condition. Schedule a fresh
safe run when the live interruption remains required.

## Keep Evidence Classes Separate

| Evidence class | What it can prove | What it cannot substitute for |
| --- | --- | --- |
| Simulation or injected fake | Recovery logic, assertions, and failure handling behave under controlled inputs. | A real service, process, host, connection, or control-plane interruption at the required live checkpoint. |
| Live mid-flight interruption | The deployed workflow resumes from the named transient checkpoint after the specified real interruption. | Broader fault matrices supplied by simulation, or restart behavior after terminal completion. |
| Terminal-state re-entry | A completed system remains stable or idempotent across a later restart, reboot, or invocation. | Resume while the workflow is still waiting or partially complete. |

Record all applicable classes as complementary evidence. Do not summarize two
classes as a pass for an unexecuted third class.

## Evidence And Handoff Template

Use a structure equivalent to this for every gate:

```markdown
### Gate: <role-based checkpoint name>

- Expected checkpoint: <phase and observable wait condition>
- Completed step: <stable step ID or revision>
- Planned next step: <blocked irreversible action>
- Pre-interruption evidence: <allowlisted, redacted observations>
- Checkpoint observed acknowledgement: <operator role and timestamp>
- Live intervention: <actual service/process/host/control-plane action>
- Resume assertions: <checkpoint restored, completed effects not replayed,
  expected next transition available>
- Evidence classes recorded: simulation / live mid-flight / terminal re-entry
- Intervention and resume evidence recorded acknowledgement: <operator role and timestamp>
- Gate release: blocked / released
- Resume or handoff locator: <bounded run ID, phase, artifact, and next command>
```

Keep the handoff useful without copying the live environment. It should
identify the bounded run or deployment, current phase, completed and pending
step identities, gate state, evidence location, responsible operator role,
safe resume/reconcile command, and expiration or cleanup constraints.

## Redaction Boundary

Do not capture authentication codes, credential values or hints, private keys,
tokens, passwords, recovery codes, full device identifiers, serial numbers,
private hostnames, IP or MAC addresses, network names, or raw journal exports.
Use role-based service and device labels, bounded event names, stable
non-sensitive step IDs, coarse timestamps, and allowlisted structured fields.

If a journal or control-plane log supports an assertion, extract only the
minimum redacted event and count needed to prove it. Review screenshots,
transcripts, copied commands, and handoff artifacts for the same boundary
before storing or sharing them.

## Scenario Review

| Workflow | Blocking checkpoint and intervention | Evidence required before irreversible advancement |
| --- | --- | --- |
| Manual-auth service | Pause while the live service is waiting for operator authentication, after recording the preceding completed step. Perform the specified real service/process interruption, then resume through its supported supervisor path. | Prove the same waiting phase is recovered, the completed step is not replayed, and authentication can continue. Keep the auth code and raw TTY or journal bytes out of evidence. Do not permit terminal success before gate release. |
| Database migration | Pause after the named durable migration phase and before the next irreversible schema or data transition. Interrupt the real migration worker or connection as specified, then invoke supported recovery. | Prove the committed phase identity is retained, the completed effects are not duplicated, and the next migration phase remains blocked until recovery evidence is accepted. |
| Deployment health gate | Pause after the candidate reaches the named live health-check phase and before promotion, traffic shift, or old-version removal. Perform the specified real orchestrator, agent, or health-check interruption, then resume. | Prove health evaluation resumes for the same candidate revision and no promotion or cleanup occurred during the pause. Release promotion only after the live-resume assertions are recorded. |

For each scenario, simulation may establish broader fault coverage and a later
restart may establish terminal stability. Neither changes the live gate's
blocked result when the required mid-flight intervention was not performed.

Keep the originating evidence distinction linked to
[RYA-194](https://linear.app/ryan-hayward/issue/RYA-194/hive-mind-treat-transient-live-checkpoints-as-non-substitutable-test).
