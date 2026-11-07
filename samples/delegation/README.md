# Delegated agent sample

Run the two patterns from [Agents acting for users](https://ai.speedle.io/#lc-agents)
with a local Speedle PMS + ADS (file store).

An AI agent acts for a user. The delegation is proven by a signed delegation
token, not by claims in the request. The agent may act only when the token is
valid, the token scope covers the request, and the user who delegated is still
allowed to do it now.

- **Pattern 1 (main pattern):** the enforcement point (PEP) verifies the token,
  then makes two `is-allowed` calls and allows only if both pass: the agent
  inside the token scope, and the delegator with their own permissions now. It
  uses only built-in SPDL, no custom functions.
- **Pattern 2 (self-hosted option):** the PEP makes one `is-allowed` call. Two
  custom functions in the policy verify the token and ask ADS about the
  delegator. Speedle Cloud does not run custom functions, so this pattern needs
  self-hosted Speedle.

Pattern 1 also shows a human approval: a refund above 100 needs a signed
approval record from someone other than the user.

The token, its key and the function server are demo-only. Read
[Production notes](#production-notes) before you build on this.

## Files

- `pattern1.spdl` — the Pattern 1 policy, exactly as published on the page.
- `pattern2.spdl` — the Pattern 2 policy.
- `pep.py` — a demo token issuer (`issue`), a demo approval system
  (`approve`) and the PEP (`check --pattern 1|2`). Python 3.8+, standard
  library only.
- `main.go` — the Pattern 2 custom-function server: `DelegationValid` and
  `DelegatorAllowed`. Go standard library only.
- `go.mod`.

### The demo token

`pep.py issue` signs an HS256 JWT with a fixed key, `DEMO_KEY`, written in
`pep.py` and `main.go`. **The key is public and demo-only: anyone with these
files can mint a token.** The claims are:

```json
{
  "iss": "https://issuer.example/demo",
  "aud": "crm",
  "kind": "delegation",
  "sub": "alice",
  "act": {"sub": "triage-agent"},
  "scope": {"actions": ["read"], "resources": ["/tickets/T-42"]},
  "iat": 1794037784,
  "exp": 1794038084
}
```

`sub` is the delegating user, `act.sub` the agent the token was issued to (the
`act` claim of OAuth 2.0 Token Exchange, RFC 8693), and `scope` the actions and
resources the user delegated. `kind` keeps delegation tokens and approval
records apart, since the demo signs both with the same key.

## Pattern 1: verify token, agent scope, delegator now

```text
agent request + delegation token
        │
        ▼
1. PEP verifies the token: signature, issuer, audience, expiry, act.sub = agent
        │ valid
        ▼
2. is-allowed: subject = the agent, token scope passed as attributes
        │ allowed
        ▼
3. is-allowed: subject = the delegator from the verified sub, no token attributes;
   for a refund, the amount and a verified approver
        │ allowed
        ▼
      allow   (any other outcome: deny)
```

```spdl
[service.crm]
[policy]
# Check 1: the agent, only while its verified token covers the request
grant role in-scope read, update expr:^/tickets/
grant role in-scope refund expr:^/orders/
# Check 2: the delegating user (the token's sub), with their roles now
grant role support read, update expr:^/tickets/
grant role support refund expr:^/orders/ if amount <= 100
# Larger refunds: a verified approval by someone other than the user
grant role support refund expr:^/orders/ if approved_by != request_user
[rolepolicy]
# Check 1 in three steps, each role needing the one before:
# the token has not expired,
grant entity triage-agent in-time if request_time < token_expires
# it lists this action,
grant role in-time in-action if request_action in token_actions
# and it lists this resource
grant role in-action in-scope if request_resource in token_resources
# Check 2: the user's own role
grant user alice support
```

SPDL has no line continuation, so check 1 is split into a chain of roles
instead of one long condition. The agent entity gets `in-time` while the token
has not expired, `in-time` leads to `in-action` only if the token lists the
action, and `in-action` leads to `in-scope` only if it lists the resource. Only
`in-scope` has grants, so the agent is allowed only when all three conditions
hold.

The PEP rejects an expired token before it asks Speedle. The
`request_time < token_expires` condition repeats the expiry check inside
Speedle, so check 1 also denies if a caller skips the local check. Check 2 asks
about the user alone: if the user's role is revoked after the token was issued,
the agent loses the permission at the next request.

### Human approval for large refunds

The user may refund up to 100 alone. A larger refund needs a recorded human
approval. The approval system signs an approval record (`kind: "approval"`)
that names the approver in `sub` and the action, resource and largest amount
approved. The PEP verifies the record like the token, checks that it covers
this refund, and passes the approver as `approved_by` in check 2. The grant
`if approved_by != request_user` then needs an approver who is not the user.
Without a record, `approved_by` is missing and that grant does not match.

## Pattern 2: one check with custom functions

```spdl
[service.crm-fn]
[policy]
# The agent, once the custom functions below have given it the role
grant role delegated-agent read, update expr:^/tickets/
# The delegator's own permissions, asked by DelegatorAllowed
grant role support read, update expr:^/tickets/
[rolepolicy]
# The agent gets the role in two steps, the second needing the first:
# the token is valid, issued to this agent and covers the request,
grant entity triage-agent token-valid if DelegationValid(delegation_token, request_entity, request_action, request_resource)
# and the delegator may do it now
grant role token-valid delegated-agent if DelegatorAllowed(delegation_token, request_action, request_resource)
grant user alice support
```

- `DelegationValid(token, agent, action, resource)` verifies the token in the
  function server and checks that `act.sub` is the requesting agent and that the
  scope covers the action and resource.
- `DelegatorAllowed(token, action, resource)` verifies the token again, takes
  the user from `sub` and calls ADS `is-allowed` with that user as the subject.
  This is a call back into ADS from inside an evaluation. The inner request has
  a user subject, which the `token-valid` role grant cannot match, so it does
  not call the functions again.

The two functions sit on a chain of role grants, as in Pattern 1, so that no
line holds both calls. `DelegatorAllowed` runs only for an agent that already
has `token-valid`.

## Prerequisites

- Python 3.8+, Go 1.21+, `curl`.
- A checkout of [teramoby/speedle-plus](https://github.com/teramoby/speedle-plus).

## 1. Build Speedle

From the speedle-plus checkout:

```bash
mkdir -p bin
go build -o bin/speedle-pms ./cmd/speedle-pms
go build -o bin/speedle-ads ./cmd/speedle-ads
go build -o bin/spctl ./cmd/spctl
```

Optionally parse both policy files without a server:

```bash
./bin/spctl check -f /path/to/samples/delegation/pattern1.spdl
./bin/spctl check -f /path/to/samples/delegation/pattern2.spdl
```

Expected:

```text
pattern1.spdl: OK, 1 service(s), 5 policies, 4 role policies
pattern2.spdl: OK, 1 service(s), 2 policies, 3 role policies
```

## 2. Start PMS, ADS and the function server

Use three terminals. In the first two, from the speedle-plus checkout:

```bash
printf '{}\n' > /tmp/deleg-policies.json
./bin/speedle-pms --store-type file --filestore-loc /tmp/deleg-policies.json --endpoint 127.0.0.1:6733 --grpc-endpoint 127.0.0.1:0 --insecure=true
```

```bash
./bin/speedle-ads --store-type file --filestore-loc /tmp/deleg-policies.json --endpoint 127.0.0.1:6734 --grpc-endpoint 127.0.0.1:0 --insecure=true
```

In the third, from this directory (Pattern 2 only):

```bash
go run .
```

The function server listens on `127.0.0.1:23457` and refuses any address that
is not a loopback IP. `--insecure=true` is for this loopback example only.

## 3. Load the policies

In a fourth terminal, from the speedle-plus checkout:

```bash
SP="./bin/spctl --pms-endpoint http://127.0.0.1:6733/policy-mgmt/v1/"

# Pattern 1
$SP create service crm
$SP create policy -c 'grant role in-scope read, update expr:^/tickets/' --service-name crm
$SP create policy -c 'grant role in-scope refund expr:^/orders/' --service-name crm
$SP create policy -c 'grant role support read, update expr:^/tickets/' --service-name crm
$SP create policy -c 'grant role support refund expr:^/orders/ if amount <= 100' --service-name crm
$SP create policy -c 'grant role support refund expr:^/orders/ if approved_by != request_user' --service-name crm
$SP create rolepolicy -c 'grant entity triage-agent in-time if request_time < token_expires' --service-name crm
$SP create rolepolicy -c 'grant role in-time in-action if request_action in token_actions' --service-name crm
$SP create rolepolicy -c 'grant role in-action in-scope if request_resource in token_resources' --service-name crm
$SP create rolepolicy -c 'grant user alice support' --service-name crm

# Pattern 2: register the two functions, then the policy
printf '{"name":"DelegationValid","funcURL":"http://127.0.0.1:23457/func/delegation-valid","resultCachable":false}\n' > /tmp/deleg-fn-valid.json
printf '{"name":"DelegatorAllowed","funcURL":"http://127.0.0.1:23457/func/delegator-allowed","resultCachable":false}\n' > /tmp/deleg-fn-delegator.json
$SP create function --json-file /tmp/deleg-fn-valid.json
$SP create function --json-file /tmp/deleg-fn-delegator.json
$SP create service crm-fn
$SP create policy -c 'grant role delegated-agent read, update expr:^/tickets/' --service-name crm-fn
$SP create policy -c 'grant role support read, update expr:^/tickets/' --service-name crm-fn
$SP create rolepolicy -c 'grant entity triage-agent token-valid if DelegationValid(delegation_token, request_entity, request_action, request_resource)' --service-name crm-fn
$SP create rolepolicy -c 'grant role token-valid delegated-agent if DelegatorAllowed(delegation_token, request_action, request_resource)' --service-name crm-fn
$SP create rolepolicy -c 'grant user alice support' --service-name crm-fn
```

These are the statements of `pattern1.spdl` and `pattern2.spdl`. PMS propagates
them to ADS asynchronously, so allow a moment before evaluating.

## 4. Run the cases

From this directory, issue two demo tokens for alice's agent: one valid for
300 s, and one that expired five minutes ago. Both delegate only `read` on
`/tickets/T-42`.

```bash
TOKEN=$(python3 pep.py issue --user alice --agent triage-agent --actions read --resources /tickets/T-42 --ttl 300)
EXPIRED=$(python3 pep.py issue --user alice --agent triage-agent --actions read --resources /tickets/T-42 --ttl 300 --offset -600)
```

`pep.py check` exits 0 on allow and 1 on deny. `reason` 0 is
`GRANT_POLICY_FOUND` and 3 is `NO_APPLICABLE_POLICIES`.

### Case 1: normal allow

```bash
python3 pep.py check --pattern 1 --agent triage-agent --token "$TOKEN" --action read --resource /tickets/T-42
python3 pep.py check --pattern 2 --agent triage-agent --token "$TOKEN" --action read --resource /tickets/T-42
```

```text
verify token: ok (sub=alice, act=triage-agent, exp=2026-11-07T09:16:31Z)
check 1 agent scope (triage-agent): {"allowed": true, "reason": 0}
check 2 delegator now (alice): {"allowed": true, "reason": 0}
ALLOW
```

```text
check agent + delegation chain (triage-agent): {"allowed": true, "reason": 0}
ALLOW
```

### Case 2: token expired

```bash
python3 pep.py check --pattern 1 --agent triage-agent --token "$EXPIRED" --action read --resource /tickets/T-42
python3 pep.py check --pattern 2 --agent triage-agent --token "$EXPIRED" --action read --resource /tickets/T-42
```

```text
verify token: token expired
DENY (token not valid, no Speedle call made)
```

```text
check agent + delegation chain (triage-agent): {"allowed": false, "reason": 3}
DENY (delegation chain)
```

The function server logs `DelegationValid(...) -> false (token expired)`.

### Case 3: token scope does not cover the action

The token delegates `read`; the agent asks for `update`. Alice herself may
update tickets, so only the token scope stops it.

```bash
python3 pep.py check --pattern 1 --agent triage-agent --token "$TOKEN" --action update --resource /tickets/T-42
python3 pep.py check --pattern 2 --agent triage-agent --token "$TOKEN" --action update --resource /tickets/T-42
```

```text
verify token: ok (sub=alice, act=triage-agent, exp=2026-11-07T09:16:31Z)
check 1 agent scope (triage-agent): {"allowed": false, "reason": 3}
DENY (agent scope)
```

```text
check agent + delegation chain (triage-agent): {"allowed": false, "reason": 3}
DENY (delegation chain)
```

The function server logs `scope does not cover update /tickets/T-42`.

### Cases 5 to 7: human approval for a refund above 100 (Pattern 1)

Run these before case 4, which removes alice's role. Issue a token that
delegates `refund` on order `/orders/O-7`, and two demo approval records for a
refund of up to 250: one by bob, one by alice herself.

```bash
REFUND=$(python3 pep.py issue --user alice --agent triage-agent --actions refund --resources /orders/O-7 --ttl 300)
BY_BOB=$(python3 pep.py approve --approver bob --action refund --resource /orders/O-7 --amount 250)
BY_ALICE=$(python3 pep.py approve --approver alice --action refund --resource /orders/O-7 --amount 250)
```

Case 5, a refund of 250 with no approval:

```bash
python3 pep.py check --agent triage-agent --token "$REFUND" --action refund --resource /orders/O-7 --amount 250
```

```text
verify token: ok (sub=alice, act=triage-agent, exp=2026-11-07T09:16:31Z)
check 1 agent scope (triage-agent): {"allowed": true, "reason": 0}
check 2 delegator now (alice): {"allowed": false, "reason": 3}
DENY (delegator)
```

Case 6, approved by bob:

```bash
python3 pep.py check --agent triage-agent --token "$REFUND" --action refund --resource /orders/O-7 --amount 250 --approval "$BY_BOB"
```

```text
verify token: ok (sub=alice, act=triage-agent, exp=2026-11-07T09:16:31Z)
check 1 agent scope (triage-agent): {"allowed": true, "reason": 0}
verify approval: ok (approved_by=bob)
check 2 delegator now (alice): {"allowed": true, "reason": 0}
ALLOW
```

Case 7, approved by alice, the user herself:

```bash
python3 pep.py check --agent triage-agent --token "$REFUND" --action refund --resource /orders/O-7 --amount 250 --approval "$BY_ALICE"
```

```text
verify token: ok (sub=alice, act=triage-agent, exp=2026-11-07T09:16:31Z)
check 1 agent scope (triage-agent): {"allowed": true, "reason": 0}
verify approval: ok (approved_by=alice)
check 2 delegator now (alice): {"allowed": false, "reason": 3}
DENY (delegator)
```

A refund of 80 with the same token needs no approval and is allowed
(`--amount 80`, both checks `{"allowed": true, "reason": 0}`).

### Case 4: the delegator's permission is revoked after the token was issued

Remove alice's `support` role in both services. The token is unchanged
and still valid.

```bash
cd /path/to/speedle-plus
for S in crm crm-fn; do
  ID=$($SP get rolepolicy --all --service-name $S | python3 -c 'import json,sys; print(next(r["id"] for r in json.load(sys.stdin) if r["principals"] == ["user:alice"]))')
  $SP delete rolepolicy "$ID" --service-name $S
done
cd -

python3 pep.py check --pattern 1 --agent triage-agent --token "$TOKEN" --action read --resource /tickets/T-42
python3 pep.py check --pattern 2 --agent triage-agent --token "$TOKEN" --action read --resource /tickets/T-42
```

```text
verify token: ok (sub=alice, act=triage-agent, exp=2026-11-07T09:16:31Z)
check 1 agent scope (triage-agent): {"allowed": true, "reason": 0}
check 2 delegator now (alice): {"allowed": false, "reason": 3}
DENY (delegator)
```

```text
check agent + delegation chain (triage-agent): {"allowed": false, "reason": 3}
DENY (delegation chain)
```

In Pattern 1 the agent scope still passes and the delegator check denies. In
Pattern 2 the function server logs `DelegationValid(...) -> true (ok)` and then
`DelegatorAllowed(sub="alice", ...) -> false`.

### Summary

| Case | Pattern 1 | Pattern 2 |
| --- | --- | --- |
| 1. Normal request | allow | allow |
| 2. Token expired | deny at token verification | deny (`DelegationValid` false) |
| 3. Scope does not cover the action | deny at check 1 | deny (`DelegationValid` false) |
| 4. Delegator revoked after issue | deny at check 2 | deny (`DelegatorAllowed` false) |
| 5. Refund 250, no approval | deny at check 2 | — |
| 6. Refund 250, approved by bob | allow | — |
| 7. Refund 250, approved by alice herself | deny at check 2 | — |

Stop PMS, ADS and the function server when finished.

## Production notes

1. **Use a real token issuer.** The demo issuer and the HS256 key exist so the
   sample runs offline. In production the identity provider or OAuth
   authorization server issues the delegation token after the user consents,
   for example with OAuth 2.0 Token Exchange (RFC 8693) and its `act` claim.
   Prefer asymmetric signatures (RS256, ES256, EdDSA) so enforcement points
   hold only public keys, published as a JWKS. Verify the signature, `alg`,
   issuer, audience, expiry and not-before, and check that `act.sub` is the
   agent that authenticated the request, not an identity the request claims.
2. **Manage keys outside the code.** Never write a signing key in code or
   configuration files. Keep it in a key management service or HSM, rotate it,
   and select verification keys by `kid`. The demo key is public; replace it.
3. **Build the attribute set in the PEP.** Pass only claims from the verified
   token, and never forward attributes from the caller. Attributes passed by the
   PEP take priority over Speedle built-ins such as `request_time`,
   `request_entity`, `request_action` and `request_resource`, and a condition on
   a missing attribute does not match. The PEP must supply every attribute the
   policy reads.
4. **Caching and revocation.** Revocation reaches the agent at the next
   decision only if that decision is fresh. In Pattern 1, if the application
   caches the delegator check, the cache lifetime is how long a revoked user's
   agent keeps access; keep it short or invalidate it on role changes. In
   Pattern 2, register both functions with `resultCachable: false`. ADS caches
   function results by function name and arguments, and the token is the same
   on every call, so a cached `DelegatorAllowed` result would hide a revocation
   until it expires. To revoke the token itself before `exp`, keep tokens short
   or check a token status list in the PEP.
5. **Approvals.** The approval system, not the agent or the caller, records
   the human decision and signs it. The PEP takes `approved_by` only from a
   verified record that covers this action, resource and amount, and should
   accept each record once. The demo signs approvals with the token key; a real
   approval system has its own key.
6. **Latency and failure.** Pattern 1 costs two decisions; the PEP can send them
   in parallel and must deny unless both allow. Pattern 2 runs one decision
   that contains an HTTP call to the function server, which in turn calls ADS.
   Every external call adds latency and a failure point; ADS times out a
   function after 5 s by default, and a function error makes the condition not
   match, so it fails closed.
7. **Recursion back into ADS (Pattern 2).** The inner `is-allowed` must not be
   able to match the grant that calls `DelegatorAllowed`, or the evaluation
   calls itself. Here the inner subject is a user, and `DelegatorAllowed` sits
   on the grant of `token-valid` to the agent role chain, which only the agent
   entity can reach. Keep it that way, and set a client timeout on the inner
   call.
8. **Speedle Cloud.** Speedle Cloud does not run custom functions, so Pattern 2
   needs self-hosted Speedle. Pattern 1 uses only built-in SPDL.
9. **Replace the demo parts.** The function server is unauthenticated, uses
   plain HTTP and binds loopback only. A real function endpoint uses TLS
   (register its CA in the function's `ca` field) and accepts calls only from
   ADS.
