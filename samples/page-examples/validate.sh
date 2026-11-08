#!/usr/bin/env bash
# Validate every SPDL block published on the English and Chinese patterns pages.
# Put spctl, speedle-pms, speedle-ads and the samples/zsp demo binary (zsp-demo)
# on PATH, or set SPEEDLE_SPCTL, SPEEDLE_PMS, SPEEDLE_ADS and ZSP_DEMO to their paths.
# On macOS, set SPEEDLE_SPCTL explicitly: /usr/sbin/spctl is Apple's Gatekeeper tool.

set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
VALIDATE="$ROOT/../../skills/speedle-policy-modeler/scripts/validate-model.sh"
SPCTL_BIN=${SPEEDLE_SPCTL:-spctl}
PMS_BIN=${SPEEDLE_PMS:-speedle-pms}
ADS_BIN=${SPEEDLE_ADS:-speedle-ads}
ZSP_DEMO_BIN=${ZSP_DEMO:-zsp-demo}

for tool in "$SPCTL_BIN" "$PMS_BIN" "$ADS_BIN" "$ZSP_DEMO_BIN" python3 curl; do
    command -v "$tool" >/dev/null 2>&1 || {
        echo "error: required tool not found: $tool" >&2
        exit 2
    }
done

for name in training release rag agents mcp a2a; do
    echo "==> validating $name"
    "$VALIDATE" "$ROOT/$name/$name.spdl" "$ROOT/$name/test-cases.json" \
        --spctl "$SPCTL_BIN" --pms "$PMS_BIN" --ads "$ADS_BIN"
done

# TokenUnused is a custom function, so its definition lives in the policy store
# rather than in SPDL. Convert a scratch copy through PMS, add the existing demo
# function, and validate the resulting JSON store without modifying the page
# example. The original SPDL is still checked directly first.
echo "==> validating zsp"
ZSP_MODEL="$ROOT/zsp/zsp.spdl"
"$SPCTL_BIN" check -f "$ZSP_MODEL"

TMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/speedle-page-zsp.XXXXXX")
DEMO_PID=""
CONVERT_PMS_PID=""
cleanup() {
    local status=$1
    trap - EXIT INT TERM
    if [ -n "$DEMO_PID" ]; then kill "$DEMO_PID" 2>/dev/null || true; fi
    if [ -n "$CONVERT_PMS_PID" ]; then kill "$CONVERT_PMS_PID" 2>/dev/null || true; fi
    if [ -n "$DEMO_PID" ]; then wait "$DEMO_PID" 2>/dev/null || true; fi
    if [ -n "$CONVERT_PMS_PID" ]; then wait "$CONVERT_PMS_PID" 2>/dev/null || true; fi
    if [ "$status" -ne 0 ]; then
        echo "--- ZSP demo log (last 20 lines) ---" >&2
        tail -n 20 "$TMP_DIR/demo.log" >&2 2>/dev/null || true
        echo "--- ZSP conversion PMS log (last 20 lines) ---" >&2
        tail -n 20 "$TMP_DIR/convert-pms.log" >&2 2>/dev/null || true
    fi
    rm -rf "$TMP_DIR"
}
trap 'status=$?; cleanup "$status"; exit "$status"' EXIT
trap 'cleanup 130; exit 130' INT TERM

read -r FUNCTION_PORT CONVERT_PMS_PORT < <(python3 -c '
import socket
sockets = []
for _ in range(2):
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    sockets.append(sock)
print(sockets[0].getsockname()[1], sockets[1].getsockname()[1])
for sock in sockets:
    sock.close()
')

"$ZSP_DEMO_BIN" --listen "127.0.0.1:$FUNCTION_PORT" >"$TMP_DIR/demo.log" 2>&1 &
DEMO_PID=$!
cp "$ZSP_MODEL" "$TMP_DIR/zsp.spdl"
"$PMS_BIN" --store-type file --filestore-loc "$TMP_DIR/zsp.spdl" \
    --endpoint "127.0.0.1:$CONVERT_PMS_PORT" --insecure=true --log-level warn \
    >"$TMP_DIR/convert-pms.log" 2>&1 &
CONVERT_PMS_PID=$!

DEMO_READY=false
PMS_READY=false
for _ in $(seq 1 200); do
    DEMO_CODE=$(curl -s -o /dev/null -w '%{http_code}' \
        -H 'Content-Type: application/json' -d '{"params":["tok-fresh"]}' \
        "http://127.0.0.1:$FUNCTION_PORT/func/token-unused" 2>/dev/null || true)
    PMS_CODE=$(curl -s -o /dev/null -w '%{http_code}' \
        "http://127.0.0.1:$CONVERT_PMS_PORT/policy-mgmt/v1/service" 2>/dev/null || true)
    if [ "$DEMO_CODE" = "200" ]; then DEMO_READY=true; fi
    if [ "$PMS_CODE" = "200" ]; then PMS_READY=true; fi
    if [ "$DEMO_READY" = "true" ] && [ "$PMS_READY" = "true" ]; then break; fi
    if ! kill -0 "$DEMO_PID" 2>/dev/null; then
        echo "error: ZSP demo exited during startup" >&2
        exit 1
    fi
    if ! kill -0 "$CONVERT_PMS_PID" 2>/dev/null; then
        echo "error: conversion PMS exited during startup" >&2
        exit 1
    fi
    sleep 0.1
done
if [ "$DEMO_READY" != "true" ] || [ "$PMS_READY" != "true" ]; then
    echo "error: ZSP demo or conversion PMS did not become ready" >&2
    exit 1
fi

printf '{"name":"TokenUnused","funcURL":"http://127.0.0.1:%s/func/token-unused","resultCachable":false}\n' \
    "$FUNCTION_PORT" >"$TMP_DIR/function.json"
"$SPCTL_BIN" --pms-endpoint "http://127.0.0.1:$CONVERT_PMS_PORT/policy-mgmt/v1/" \
    create function --json-file "$TMP_DIR/function.json"
kill "$CONVERT_PMS_PID"
wait "$CONVERT_PMS_PID" 2>/dev/null || true
CONVERT_PMS_PID=""
mv "$TMP_DIR/zsp.spdl" "$TMP_DIR/zsp.json"

"$VALIDATE" "$TMP_DIR/zsp.json" "$ROOT/zsp/test-cases.json" \
    --spctl "$SPCTL_BIN" --pms "$PMS_BIN" --ads "$ADS_BIN"

echo "==> all seven page examples passed"
