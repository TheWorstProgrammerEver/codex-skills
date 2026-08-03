---
name: linear-agent-oauth
description: Provision, validate, rotate, revoke, and cut over a durable agent or unattended service to a distinct Linear OAuth app identity. Use when Codex needs per-agent Linear app attribution, client-credentials token lifecycle checks, protected credential-file setup, GraphQL or MCP identity validation, API-key fallback migration, service cutover, rollback, or redacted OAuth diagnostics.
---

# Operate A Linear Agent OAuth Identity

Use one private Linear OAuth application per durable agent identity when the
agent needs distinct attribution and revocation. Read the canonical shared
[Linear agent identity runbook](https://github.com/TheWorstProgrammerEver/Codex-Shared-Durable-Notes/blob/main/runbooks/linear-agent-identity.md)
before provisioning or changing a service. If that canonical link is not yet
published, use its reviewed source in
[Codex-Shared-Durable-Notes PR #38](https://github.com/TheWorstProgrammerEver/Codex-Shared-Durable-Notes/pull/38).
Treat the runbook as the authority for architecture and policy; use this skill
for mechanical local operations.

Never paste a client secret, access token, refresh token, authorization code,
or API key into chat, a command argument, an issue, a PR, a log, a fixture, or
durable notes.

## Prepare Protected Credential State

Choose a service-owned private directory outside the repository. Create the
placeholder file without overwriting anything:

```bash
python3 scripts/linear_oauth.py init-env --directory "$linear_oauth_config_dir"
```

The command creates the target directory as `0700` and
`linear-agent-oauth.env` as `0600` from
[`linear-agent-oauth.env.example`](references/linear-agent-oauth.env.example).
It prints only a bounded status, never the path or file content.

Have a human operator or secret broker replace placeholders outside the model
transcript. Keep the client secret in a service credential facility when one
is available; the env file is a compatibility boundary, not a reason to expose
secrets to an agent. Validate type, ownership, modes, fields, scopes, and
placeholders before network access:

```bash
python3 scripts/linear_oauth.py check-env --env-file "$linear_oauth_env_file"
```

The parser accepts only the documented keys and literal `KEY=value` lines. It
does not evaluate shell syntax.

## Validate Identity Before Writes

Mint a client-credentials token in memory and query `viewer`:

```bash
python3 scripts/linear_oauth.py validate-viewer --env-file "$linear_oauth_env_file"
```

Require both expected viewer ID and name to match the app user. A `401` on this
idempotent read causes exactly one replacement token mint and one retry. Any
second failure stops. Tokens are never returned or cached by the script.

Confirm the app's intended team grants separately, including a denied private
team. A correct viewer is necessary but does not prove authorization scope.

## Validate GraphQL And MCP Attribution

For a new disposable GraphQL issue and comment in the configured test team:

```bash
python3 scripts/linear_oauth.py validate-attribution \
  --env-file "$linear_oauth_env_file" \
  --create-disposable-issue \
  --confirm-write
```

Alternatively pass `--issue-id` for an existing disposable issue. The command
checks `viewer` before mutation, attaches a unique reconciliation marker,
verifies the returned comment user against the expected app identity, and
prints only non-secret disposable IDs. It never retries a mutation after an
ambiguous transport or `401` result; reconcile the marker before repeating.

When a connected Linear MCP capability can be configured with the same app
bearer token, follow the MCP procedure in
[validation and cutover](references/validation-and-cutover.md). Do not claim MCP
attribution from a user-authenticated connector. If direct bearer injection is
unavailable, record MCP validation as unavailable and keep the service cutover
gated.

## Exercise Token Revocation

Validate revocation with a newly minted disposable token:

```bash
python3 scripts/linear_oauth.py validate-revocation --env-file "$linear_oauth_env_file"
```

The script verifies the viewer, revokes only that newly minted token through
Linear's revocation endpoint, then requires the same token to receive `401`.
This does not revoke other same-scope client-credentials tokens.

Client-credentials tokens have no refresh token. Treat refresh as replacement:
mint one new same-scope token in memory after a `401`, validate viewer and team
access, and retry only an idempotent read or a mutation whose outcome was safely
reconciled. A scope change or client-secret rotation can invalidate existing
app tokens; stop writers and perform a controlled cutover.

## Cut Over And Roll Back

Follow the staged service sequence and failure table in
[validation and cutover](references/validation-and-cutover.md). Keep an API key
fallback disabled but recoverable until OAuth attribution, access, replacement,
revocation, GraphQL, and MCP checks pass. Never load both credentials into the
same worker process merely for convenience.

On identity, authorization, or attribution mismatch, stop writes, remove OAuth
from the worker, and either pause automation or explicitly restore the
time-bounded API-key fallback. Record that fallback mutations act as the human
key owner. Repeat the complete validation before restoring OAuth writes.

## Interpret Safe Failures

The operator script emits stable codes such as `config_permissions`,
`config_placeholder`, `token_mint_failed`, `viewer_mismatch`,
`mutation_outcome_ambiguous`, `attribution_mismatch`, and
`revocation_not_effective`. It deliberately suppresses raw HTTP bodies,
exceptions, credentials, and attacker-controlled response text.
