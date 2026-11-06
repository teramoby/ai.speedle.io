# Zero standing privileges (ZSP) sample

Run the SPDL example from [Zero standing privileges](https://ai.speedle.io/#zsp)
with a local Speedle PMS + ADS (file store) and a small demo server.

This is a solution pattern, not a security guarantee. It was reviewed
statically, not security-tested end to end, and the demo server is local-only.
The [Production requirements](#production-requirements) section lists what a
real deployment must add.

## Files

- `zsp.spdl` — the policy block exactly as published on the page.
- `main.go` — the demo server: a read-only token-status function, the atomic
  consume step, and demo admin endpoints.
- `go.mod`.

## Prerequisites

- Go 1.26.10+ or 1.27.3+ (the toolchains supported by speedle-plus; this sample
  itself uses only the standard library).
- `curl` and `python3`.
- A checkout of [teramoby/speedle-plus](https://github.com/teramoby/speedle-plus).

## 1. Build Speedle

From the speedle-plus checkout:

```bash
mkdir -p bin
go build -o bin/speedle-pms ./cmd/speedle-pms
go build -o bin/speedle-ads ./cmd/speedle-ads
go build -o bin/spctl ./cmd/spctl
```

## 2. Start the demo server

From this directory:

```bash
go run .
```

It listens on `127.0.0.1:23456` and refuses any address that is not a loopback
IP. It plays two roles:

- `POST /func/token-unused` — the custom function behind `TokenUnused(token_id)`.
  It is read-only: it reports whether the store says the token is unused.
- `POST /consume` — the application or enforcement layer's atomic
  compare-and-set, called after Speedle allows the request and before the
  operation runs. A token moves from `unused` to `used` exactly once.

The admin endpoints `POST /admin/issue`, `/admin/use` and `/admin/revoke` change
the store for the demo. They are unauthenticated. Token state lives in process
memory and resets on restart: these are demo-only shortcuts, not a design.

## 3. Start PMS and ADS

In a second terminal, from the speedle-plus checkout:

```bash
printf '{}\n' > /tmp/zsp-policies.json
./bin/speedle-pms --store-type file --filestore-loc /tmp/zsp-policies.json --endpoint 127.0.0.1:6733 --grpc-endpoint 127.0.0.1:0 --insecure=true
```

In a third terminal, from the speedle-plus checkout:

```bash
./bin/speedle-ads --store-type file --filestore-loc /tmp/zsp-policies.json --endpoint 127.0.0.1:6734 --grpc-endpoint 127.0.0.1:0 --insecure=true
```

`--insecure=true` is for this loopback example only.

## 4. Register the function and load the policy

In a fourth terminal, from the speedle-plus checkout:

```bash
cat > /tmp/zsp-function.json <<'JSON'
{"name":"TokenUnused","funcURL":"http://127.0.0.1:23456/func/token-unused","resultCachable":false}
JSON

./bin/spctl --pms-endpoint http://127.0.0.1:6733/policy-mgmt/v1/ create function --json-file /tmp/zsp-function.json
./bin/spctl --pms-endpoint http://127.0.0.1:6733/policy-mgmt/v1/ create service zsp
./bin/spctl --pms-endpoint http://127.0.0.1:6733/policy-mgmt/v1/ create policy -c 'grant role agent-runtime invoke /api/orders if expires_at > issued_at && expires_at - issued_at <= 600 && issued_at <= request_time + 60 && not_before <= request_time + 60 && request_time < expires_at && TokenUnused(token_id)' --service-name zsp
./bin/spctl --pms-endpoint http://127.0.0.1:6733/policy-mgmt/v1/ create rolepolicy -c 'grant entity agent-billing-1 agent-runtime' --service-name zsp
```

`zsp.spdl` is the same block with the `[service.zsp]`, `[policy]` and
`[rolepolicy]` section headers; `spctl check -f zsp.spdl` parses and compiles it
without a server. These commands load its policy and role policy; PMS propagates
them to ADS asynchronously, so allow a moment before evaluating.

The condition is all of the time checks the pattern needs:

- `expires_at > issued_at`: a positive lifetime;
- `expires_at - issued_at <= 600`: a short lifetime, at most 600 s;
- `issued_at <= request_time + 60`: not issued in the future, allowing 60 s of
  clock skew;
- `not_before <= request_time + 60`: the not-before claim is respected, with the
  same 60 s allowance;
- `request_time < expires_at`: not expired at decision time;
- `TokenUnused(token_id)`: a read-only status check, not a consume.

`request_time` is a Speedle built-in: ADS fills it from its own clock when it
evaluates the request. `not_before` is a customer attribute. A token without a
not-before claim must be normalized to `not_before = issued_at` by the component
that verifies the token; if the attribute is missing, the condition does not
evaluate and the request is denied.

## 5. Evaluate the cases

Define two helpers. `request` asks ADS; `ts` prints an RFC3339 UTC timestamp
offset by the given number of seconds.

```bash
ts() { python3 -c 'import datetime,sys; print((datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(seconds=int(sys.argv[1]))).strftime("%Y-%m-%dT%H:%M:%SZ"))' "$1"; }

request() {
  curl -s -H 'Content-Type: application/json' -d "{\"subject\":{\"principals\":[{\"type\":\"entity\",\"name\":\"agent-billing-1\"}]},\"serviceName\":\"zsp\",\"resource\":\"/api/orders\",\"action\":\"invoke\",\"attributes\":[{\"name\":\"token_id\",\"type\":\"string\",\"value\":\"$1\"},{\"name\":\"issued_at\",\"type\":\"datetime\",\"value\":\"$2\"},{\"name\":\"expires_at\",\"type\":\"datetime\",\"value\":\"$3\"},{\"name\":\"not_before\",\"type\":\"datetime\",\"value\":\"$4\"}]}" http://127.0.0.1:6734/authz-check/v1/is-allowed
  echo
}
```

### 1. Fresh, short-lived, unused token: allow

```bash
request tok-fresh "$(ts -60)" "$(ts 540)" "$(ts -60)"
```

`issued_at` is 60 s ago and `expires_at` is 540 s from now: a 600 s lifetime,
still valid. Expected:

```json
{"allowed":true,"reason":0}
```

### 2. Lifetime too long: deny

```bash
request tok-long-lived "$(ts -60)" "$(ts 86400)" "$(ts -60)"
```

The lifetime is 86,460 s, above the 600 s bound. Expected:

```json
{"allowed":false,"reason":3}
```

### 3. Expired token: deny

```bash
request tok-expired "$(ts -700)" "$(ts -100)" "$(ts -700)"
```

The lifetime is 600 s, but the token expired 100 s ago. Expected:

```json
{"allowed":false,"reason":3}
```

### 4. Used or revoked token: deny

```bash
request tok-used "$(ts -60)" "$(ts 540)" "$(ts -60)"
request tok-revoked "$(ts -60)" "$(ts 540)" "$(ts -60)"
```

Both have a valid lifetime; the store reports one used and one revoked. Expected
for both:

```json
{"allowed":false,"reason":3}
```

### 5. Issued in the future: deny

```bash
request tok-future "$(ts 120)" "$(ts 720)" "$(ts 120)"
```

The lifetime is 600 s, but `issued_at` is 120 s ahead and the skew allowance is
60 s. Expected: `{"allowed":false,"reason":3}`.

### 6. Non-positive lifetime: deny

```bash
request tok-backwards "$(ts -100)" "$(ts -100)" "$(ts -100)"
```

`expires_at` equals `issued_at`, so the lifetime is zero. Expected:
`{"allowed":false,"reason":3}`.

### 7. Not-before in the future: deny

```bash
request tok-nbf-future "$(ts -60)" "$(ts 540)" "$(ts 180)"
```

The lifetime and expiry are fine, but the token is not valid before 180 s from
now. Expected: `{"allowed":false,"reason":3}`.

### 8. Not-before omitted: deny

```bash
curl -s -H 'Content-Type: application/json' -d "{\"subject\":{\"principals\":[{\"type\":\"entity\",\"name\":\"agent-billing-1\"}]},\"serviceName\":\"zsp\",\"resource\":\"/api/orders\",\"action\":\"invoke\",\"attributes\":[{\"name\":\"token_id\",\"type\":\"string\",\"value\":\"tok-fresh\"},{\"name\":\"issued_at\",\"type\":\"datetime\",\"value\":\"$(ts -60)\"},{\"name\":\"expires_at\",\"type\":\"datetime\",\"value\":\"$(ts 540)\"}]}" http://127.0.0.1:6734/authz-check/v1/is-allowed
echo
```

The condition cannot read `not_before`, logs `No parameter 'not_before' found.`
and does not match, so the request is denied: `{"allowed":false,"reason":3}`.
This is fail-closed behaviour, not a separate deny rule.

`reason` 0 is `GRANT_POLICY_FOUND` and 3 is `NO_APPLICABLE_POLICIES`. Datetime
attributes are evaluated as Unix seconds, so `expires_at - issued_at` is the
lifetime in seconds and `request_time` is the ADS decision time.

## 6. Consume after allow, before the operation

The policy checks the token status but never consumes it. Authorization checks
are repeatable and are not always followed by the operation, so consuming inside
the check would be wrong. The application or enforcement layer consumes the
token atomically, before the operation runs:

```bash
consume() {
  curl -s -H 'Content-Type: application/json' -d "{\"token_id\":\"$1\",\"idempotency_key\":\"$2\"}" http://127.0.0.1:23456/consume
  echo
}

# reset the demo token
curl -s -H 'Content-Type: application/json' -d '{"params":["tok-concurrent"]}' http://127.0.0.1:23456/admin/issue > /dev/null

request tok-concurrent "$(ts -60)" "$(ts 540)" "$(ts -60)"
consume tok-concurrent req-1
request tok-concurrent "$(ts -60)" "$(ts 540)" "$(ts -60)"
```

Expected: the first request is allowed, `consume` returns `{"consumed":true}`,
and the second request is denied because the token is used.

### Two concurrent requests, one consume

Both decisions can be allowed because `TokenUnused` is only a status read. Run
the two checks concurrently, then the two consumes concurrently:

```bash
request tok-concurrent "$(ts -60)" "$(ts 540)" "$(ts -60)" > /tmp/zsp-allow-a.json &
request tok-concurrent "$(ts -60)" "$(ts 540)" "$(ts -60)" > /tmp/zsp-allow-b.json &
wait
cat /tmp/zsp-allow-a.json /tmp/zsp-allow-b.json

consume tok-concurrent req-a > /tmp/zsp-consume-a.json &
consume tok-concurrent req-b > /tmp/zsp-consume-b.json &
wait
cat /tmp/zsp-consume-a.json /tmp/zsp-consume-b.json
```

Expected: both decisions are `{"allowed":true,"reason":0}`; exactly one consume
is `{"consumed":true}` and the other is `{"consumed":false,"reason":"used"}`.
Reset the token with `/admin/issue` before repeating.

### Retry and idempotency

Retrying the winning consume with the same idempotency key returns the same
success instead of a second consume:

```bash
consume tok-concurrent req-a   # if req-a won
consume tok-concurrent req-b   # if req-b won
```

Expected: `{"consumed":true,"idempotent_replay":true}` for the winning key, and
`{"consumed":false,"reason":"used"}` for any other key. In production the key is
the operation's idempotency key, so a retried request after a lost response does
not fail and does not run twice.

### Crash after consume

If the enforcement layer crashes after the consume succeeds and before the
operation runs, the token is spent and the request fails closed. Do not put the
token back; issue a new one. Retry the operation only if it has its own
idempotency key, and reconcile the outcome before retrying. The in-memory demo
store loses the consumed mark on restart, which is why production requires a
persistent shared store with a durable compare-and-set.

## 7. Revoke after use

The issuer or application can revoke a token instead of waiting for expiry:

```bash
curl -s -H 'Content-Type: application/json' -d '{"params":["tok-concurrent"]}' http://127.0.0.1:23456/admin/revoke
request tok-concurrent "$(ts -60)" "$(ts 540)" "$(ts -60)"
```

Expected: `{"result":true}` then `{"allowed":false,"reason":3}`. Revocation is a
state change in the issuer's store, so the next decision denies the token. It
does not cancel an operation that is already running.

## 8. Failure behaviour

Stop the demo server and send a fresh, valid request. The custom function is
unreachable, the condition cannot evaluate, and the request is denied:

```json
{"allowed":false,"reason":3}
```

ADS logs the call failure and the condition error. Fail-closed is the policy's
behaviour, not the function's: a function error never matches, so it never
grants.

A deny here is a deny for this grant only. The sample has exactly one grant for
`invoke /api/orders`, so no other grant can match. If the policy set also
contained an unconditional `grant role agent-runtime invoke /api/orders`, a used
token would be allowed again. A real policy set must not contain another grant
for these resources unless it applies the same checks.

## Production requirements

1. **Atomic check-and-consume.** Keep the policy function read-only. After the
   allow, and before the operation, the enforcement layer must move a single-use
   token from unused to used with one atomic compare-and-set in a trusted
   component. Define retry semantics with an idempotency key, and fail closed on
   a crash after the consume: the token is spent, the request is denied, and the
   operation is retried only with its own idempotency key.
2. **Verify the token.** Do not trust request attributes. A trusted component
   verifies the token's signature, issuer, audience and not-before, and passes
   only verified claims to Speedle. Bind the claims to the subject, resource,
   action and task scope; a token for one task must not authorize another.
3. **ZSP is a pattern, not a token property.** The role binding
   (`agent-billing-1` → `agent-runtime`) and the grant are standing rules.
   Whether access is really zero-standing depends on who can issue tokens,
   whether other access paths exist, and what background credentials can do.
   This sample supports a ZSP pattern only when issuance and those controls are
   in place.
4. **Time checks need a trusted clock.** The policy requires a positive and
   short lifetime, an `issued_at` that is not in the future, a not-before check,
   and an explicit 60 s clock-skew allowance. `request_time` is ADS server time,
   but ADS merges the caller's attributes after its built-ins, so a caller that
   can send an attribute named `request_time` can shadow the server clock. The
   enforcement layer must construct the attribute set itself, or strip reserved
   names such as `request_time` before calling ADS. Test this in your own
   deployment.
5. **Scope the denial claim.** A deny means no grant matched; it is not proof
   that the policy set denies. The policy set must contain no other grant for
   these resources, and each grant that does exist must apply the same checks.
   Measure the function-failure path in your own policy set, not just in this
   sample's one-grant set.
6. **Single use is an option.** Task-scoped, time-limited, multi-use credentials
   can also fit a ZSP pattern, depending on the threat model. Single use is the
   stricter choice, not the definition.
7. **Replace the demo parts.** The in-memory store and the unauthenticated admin
   endpoints are demo-only. Production needs a persistent shared token store
   with a durable compare-and-set, and a protected admin API.

## Notes

- The lifetime and expiry checks are plain SPDL conditions. The
  `TokenUnused(token_id)` check is a custom function, which is a self-hosted
  Speedle Engine feature; Speedle Cloud does not support custom external
  functions.
- `resultCachable` is false so every decision reads the current store.
- The custom function fails closed: an unknown token returns false, and a
  function error makes the condition non-matching.
- Stop PMS, ADS and the demo server when finished.
