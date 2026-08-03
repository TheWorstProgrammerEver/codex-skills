# Validation And Service Cutover

Use the shared Linear agent identity runbook for identity architecture, app
provisioning policy, team grants, and fallback policy. This reference defines
the operational evidence required around the bundled script.

## Evidence Matrix

| Boundary | Required evidence | Fail closed when |
| --- | --- | --- |
| Credential state | Directory `0700`, regular file `0600`, current owner, no symlink, no placeholders | A path, owner, mode, field, or placeholder check fails |
| Token mint | Client-credentials response has a bearer access token and positive expiry; token remains in memory | HTTP, JSON, token type, expiry, or scope is invalid |
| Identity | GraphQL `viewer` ID and name both match expected app user | Either value differs or GraphQL returns errors |
| Authorization | Intended test team is readable; a non-granted private team is absent or denied | Results are broader than the approved team grant |
| GraphQL attribution | Disposable issue/comment mutation succeeds and returned comment user matches viewer | Mutation outcome is ambiguous or author differs |
| MCP attribution | Same app bearer reaches read-write MCP, reads the disposable issue, creates a reversible comment, and Linear reports the same app author | Connector uses user OAuth, bearer injection is unavailable, or author differs |
| Replacement | First idempotent read receives `401`; exactly one new token is minted; viewer and team checks pass | Retry loops, a second `401`, or permissions widen |
| Revocation | A newly minted disposable token works, revocation returns success, and the same token then receives `401` | Token remains usable or another token was targeted |

Preserve only timestamps, stable status codes, expected non-secret app-user
metadata, disposable object IDs, and pass/fail outcomes. Never preserve request
headers, token responses, raw error bodies, environment dumps, or credential
paths in a shared artifact.

## MCP Attribution Path

Use a connected Linear capability only after confirming its credential source
is the same per-agent app bearer token validated through GraphQL. Interactive
user OAuth proves the wrong actor for this check.

1. Connect to `https://mcp.linear.app/mcp` through a client that supports
   secret-store or broker injection into the `Authorization: Bearer` header.
   Do not paste the bearer into configuration committed to a repository or
   into an agent-visible prompt.
2. Invoke the MCP viewer or identity read when exposed and require the expected
   app user. If the surface does not expose viewer, read the GraphQL-created
   disposable issue as an access check.
3. Create a comment containing a fresh non-secret reconciliation marker on the
   disposable issue.
4. Read the comment through GraphQL or Linear's UI and require its user/author
   to match the expected app-user ID and name.
5. Remove the comment when supported. Record its ID until cleanup succeeds.
6. Repeat through `https://mcp.linear.app/mcp/readonly` or a read-scoped token
   and require mutation tools to be absent or the write to be denied.

If the available MCP connector cannot accept an externally managed bearer
without starting interactive OAuth, do not reauthenticate it as the human and
call the result app validation. Mark MCP validation unavailable and leave the
MCP-dependent cutover gate closed.

## Staged Cutover

1. Stop or drain the worker/reviewer so no mutation is in flight. Record its
   last processed cursor or job ID without recording payload secrets.
2. Validate the OAuth credential file, viewer, intended and denied team access,
   GraphQL attribution, replacement behavior, revocation, and MCP attribution
   where the service uses MCP.
3. Snapshot only non-secret service configuration and the rollback command.
   Keep the API-key credential protected and disabled; do not expose it to the
   OAuth process.
4. Change the service credential reference and authentication mode atomically
   or through a service-manager credential/drop-in mechanism. Validate the
   generated configuration before restart.
5. Start one canary worker. Require readiness to finish before hydrating job
   content. Perform one reversible read and one disposable attributed mutation.
6. Enable normal work only after the canary passes. Monitor stable error codes,
   `401` replacement count, and app attribution without logging bodies or
   headers.
7. Revoke the API-key fallback after the agreed observation window, or retain
   it only as a documented, time-bounded break-glass credential.

Do not install a feature-branch skill into a worker that is under review. Cut
over only from a reviewed canonical release or the latest merged source
required by the repository workflow.

## Rollback

Trigger rollback on viewer mismatch, team-scope mismatch, wrong author,
repeated `401`, token-mint failure, ambiguous mutation outcome, or MCP actor
mismatch.

1. Stop OAuth writers and settle or reconcile any in-flight marker.
2. Remove the OAuth credential reference from the service process.
3. Restore the previous read-only or API-key mode from the protected rollback
   configuration. Load only that credential into the fallback process.
4. Record that API-key mutations are attributed to its human owner. Keep the
   fallback time-bounded.
5. Inspect recent app-authored disposable mutations, clean them up, and retain
   their IDs until cleanup is confirmed.
6. Correct app installation, scopes, team grants, or service configuration and
   repeat the full evidence matrix before another cutover.

## Failure Handling

- `config_*`: make no network request; correct ownership, modes, fields, or
  placeholders first.
- `token_mint_failed`: do not start the service or fall into an unbounded retry.
- `viewer_mismatch`: revoke the tested token and stop all writes.
- `mutation_outcome_ambiguous`: search for the exact reconciliation marker
  before retrying; never blindly duplicate a mutation.
- `attribution_mismatch`: stop writes and verify `actor=app`, application, and
  bearer source.
- `revocation_not_effective`: keep the service stopped and reconcile the exact
  token/application operation with a workspace administrator.
- `mcp_validation_unavailable`: allow GraphQL-only service cutover only when
  MCP is not part of that service; otherwise keep the gate closed.
