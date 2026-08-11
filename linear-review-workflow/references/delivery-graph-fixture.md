# Delivery-Graph Audit Fixture

Use this compact service plan to distinguish an acyclic task graph from a
complete delivery graph. An arrow means the producer must finish before the
consumer.

## Parent Outcomes

The service must provide an API, phased database tables, an event-consuming
UI, an executable supervised background runner, bounded list reads, production
deployment and credential delivery, restart/resume behavior, production
cutover, and post-deploy certification. Retention and runner placement are
human choices required before implementation.

## Defective Plan

- `foundation` creates the application skeleton without a decision gate.
- `core-schema` creates `jobs` but also claims cascade coverage for `audit-entries`.
- `audit-schema` creates `audit-entries` later.
- `api` bounds `jobs` with a cursor and limit, but returns the secondary
  `audit-entries` collection without either bound.
- `events` implements the event stream; `ui` consumes both the API and stream.
- `runbook` documents how a runner and deployment should work.
- `certify` claims final end-to-end proof.
- No task is the operational owner for implementing the runner, delivering
  credentials, deploying or supervising it, or completing production cutover.

### Defective graph

```text
foundation -> core-schema
core-schema -> audit-schema
core-schema -> api
api -> events
api -> ui
api -> runbook
api -> certify
audit-schema -> certify
events -> certify
ui -> certify
runbook -> certify
```

This graph is acyclic and even has one root and one leaf, but the audit must
still report:

- an ungated human decision because implementation can start without a
  `decision-gate`;
- a missing semantic consumer/producer edge because `ui` can run before its
  `events` producer;
- a forward-referenced cascade because `core-schema` claims lifecycle work for
  the table introduced by downstream `audit-schema`, which must be that table's
  schema lifecycle owner;
- an unbounded secondary collection because only `jobs` is cursor-bounded;
- a missing operational owner and missing deployment owner; `runbook` and
  `certify` do not implement, deploy, supervise, restart, resume, deliver
  credentials, or cut over the service;
- no ordering from production cutover to post-deploy certification; and
- the redundant `api -> certify` edge, which is separate from the missing
  `events -> ui` semantic edge.

## Corrected Plan

| Task | Owned result |
| --- | --- |
| `decision-gate` | Records retention and runner-placement choices before implementation. |
| `foundation` | Produces the executable application skeleton. |
| `core-schema` | Introduces `jobs` and owns its cascade lifecycle validation. |
| `audit-schema` | Introduces `audit-entries` and owns its cascade lifecycle validation. |
| `api` | Produces the API and validates limits/cursors for both bounded collections. |
| `events` | Produces the event stream consumed by later tasks. |
| `runner` | Implements the supervised executable runner and restart/resume proof. |
| `ui` | Implements the UI after its event producer is available. |
| `runbook` | Documents operation; it does not own implementation or external state. |
| `deploy` | Owns production deployment, credential delivery, runner supervision, cutover, smoke proof, and rollback readiness. |
| `certify` | Independently certifies the deployed service after cutover. |

### Corrected graph

```text
decision-gate -> foundation
foundation -> core-schema
core-schema -> audit-schema
audit-schema -> api
api -> events
events -> runner
events -> ui
runner -> runbook
runbook -> deploy
ui -> deploy
deploy -> certify
```

The corrected graph is acyclic, has `decision-gate` as its only root and
`certify` as its only leaf, orders every named producer before its consumer,
and places post-deploy certification after the task that owns production
cutover.
