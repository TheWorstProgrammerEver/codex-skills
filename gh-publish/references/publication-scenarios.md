# Publication Scenarios

Use this matrix to keep tool and PR-state choices explicit.

| Scenario | Required choice | Verification |
| --- | --- | --- |
| Completed work, no draft request | Create or convert to Ready | GitHub reports the PR open with `draft: false` |
| Explicit draft request | Create or retain draft and record the request | GitHub reports `draft: true`; handoff explains why |
| Deliberately incomplete artifact | Create draft and name the missing work | PR body and handoff identify the incomplete boundary |
| Connected GitHub creation succeeds | Use the connector for PR creation/metadata | Re-read the PR through GitHub and compare base, head, URL, and draft state |
| Connector absent or unsuitable | Use the discovered host-approved scoped wrapper | Re-read the PR through the wrapper or connected metadata surface |
| Scoped wrapper exists but Git push lacks credentials | Discover the approved Git askpass/helper separately | Remote branch resolves to the local commit after the real push |
| Approved helper cannot be found | Stop; do not start a personal/browser login flow | Report the missing host capability and the discovery paths checked |

## Authentication Discovery

Use explicit repository or host guidance first. Host-neutral candidates can
include environment-named wrappers and askpass programs, commands such as a
GitHub App wrapper found on `PATH`, and durable runbooks linked from the current
user's agent notes. Treat names as candidates until their runbook and a
redacted status check confirm their purpose.

Do not hard-code a username, home directory, agent name, host name, private
repository layout, or credential path into reusable instructions, commands, PR
text, or fixtures.

## Failure Projection

Report the failing boundary without replaying raw command output that might
contain credentials:

- `guidance_missing`: no approved local publication method was documented;
- `auth_helper_unavailable`: a documented helper was not installed;
- `repository_not_granted`: the scoped installation omitted the repository;
- `git_push_denied`: the real issue-branch write was rejected;
- `pr_capability_unavailable`: neither connector nor approved wrapper supports
  PR creation;
- `publication_mismatch`: pushed commit or PR metadata differs from intent;
- `checks_incomplete`: relevant checks are pending, failed, or indeterminate.

Keep exact non-secret commands and statuses locally for diagnosis. Do not copy
private paths or host identifiers into shared artifacts.
