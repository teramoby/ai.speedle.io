# Zero standing privileges (ZSP) sample

Run the SPDL example from [Zero standing privileges](https://ai.speedle.io/#zsp)
with a local Speedle PMS + ADS (file store) and a small custom function server.
This is a solution pattern, not a shipped integration.

## Files

- `zsp.spdl` — the policy block exactly as published on the page.
- `main.go` — the custom function server and the used/revoked token store.
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

## 2. Start the custom function server

From this directory:

```bash
go run .
```

It listens on `127.0.0.1:23456`. `TokenUnused(token_id)` returns true only for a
token that is not used and not revoked; unknown tokens are denied.

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
./bin/spctl --pms-endpoint http://127.0.0.1:6733/policy-mgmt/v1/ create policy -c 'grant role agent-runtime invoke /api/orders if expires_at - issued_at <= 600 && request_time < expires_at && TokenUnused(token_id)' --service-name zsp
./bin/spctl --pms-endpoint http://127.0.0.1:6733/policy-mgmt/v1/ create rolepolicy -c 'grant entity agent-billing-1 agent-runtime' --service-name zsp
```

`zsp.spdl` is the same block with the `[service.zsp]`, `[policy]` and
`[rolepolicy]` section headers. These commands load its policy and role policy;
PMS propagates them to ADS asynchronously, so allow a moment before evaluating.

## 5. Evaluate the four cases

Define two helpers:

```bash
ts() { python3 -c 'import datetime,sys; print((datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(seconds=int(sys.argv[1]))).strftime("%Y-%m-%dT%H:%M:%SZ"))' "$1"; }

request() {
  curl -s -H 'Content-Type: application/json' -d "{\"subject\":{\"principals\":[{\"type\":\"entity\",\"name\":\"agent-billing-1\"}]},\"serviceName\":\"zsp\",\"resource\":\"/api/orders\",\"action\":\"invoke\",\"attributes\":[{\"name\":\"token_id\",\"type\":\"string\",\"value\":\"$1\"},{\"name\":\"issued_at\",\"type\":\"datetime\",\"value\":\"$2\"},{\"name\":\"expires_at\",\"type\":\"datetime\",\"value\":\"$3\"}]}" http://127.0.0.1:6734/authz-check/v1/is-allowed
  echo
}
```

### 1. Fresh, short-lived, unused token: allow

```bash
request tok-fresh "$(ts -60)" "$(ts 540)"
```

`issued_at` is 60 s ago and `expires_at` is 540 s from now: a 600 s lifetime,
still valid. Expected:

```json
{"allowed":true,"reason":0}
```

### 2. Lifetime too long: deny

```bash
request tok-long-lived "$(ts -60)" "$(ts 86400)"
```

The lifetime is 86,460 s, above the 600 s bound. Expected:

```json
{"allowed":false,"reason":3}
```

### 3. Expired token: deny

```bash
request tok-expired "$(ts -700)" "$(ts -100)"
```

The lifetime is 600 s, but the token expired 100 s ago. Expected:
`{"allowed":false,"reason":3}`.

### 4. Used or revoked token: deny

```bash
request tok-used "$(ts -60)" "$(ts 540)"
request tok-revoked "$(ts -60)" "$(ts 540)"
```

Both have a valid lifetime; the store reports one used and one revoked. Expected
for both: `{"allowed":false,"reason":3}`.

`reason` 0 is `GRANT_POLICY_FOUND` and 3 is `NO_APPLICABLE_POLICIES`.
Datetime attributes are evaluated as Unix seconds, so `expires_at - issued_at`
is the lifetime in seconds and `request_time` is the decision time.

## Revoke after use

The issuer or application revokes a token after it has served its purpose;
Speedle then denies reuse.

```bash
# allowed before use
request tok-fresh "$(ts -60)" "$(ts 540)"

# the application marks the token used in the store the function reads
curl -s -H 'Content-Type: application/json' -d '{"params":["tok-fresh"]}' http://127.0.0.1:23456/admin/use

# the same request is denied
request tok-fresh "$(ts -60)" "$(ts 540)"
```

Expected: allow, `{"result":true}`, deny.

## Notes

- The lifetime and expiry checks are plain SPDL conditions. The
  `TokenUnused(token_id)` check is a custom function, which is a self-hosted
  Speedle Engine feature; Speedle Cloud does not support custom external
  functions.
- `resultCachable` is false so every decision reads the current store.
- The custom function fails closed: an unknown token returns false, and a
  function error makes the request denied.
- Stop PMS, ADS and the function server when finished.
