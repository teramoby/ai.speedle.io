#!/usr/bin/env bash
#
# Validate a Speedle SPDL model end to end:
#   1. "$SPEEDLE_SPCTL" check -f MODEL
#   2. start PMS and ADS against the same .spdl file on free loopback ports
#   3. run every case in CASES against ADS
#   4. stop both servers and print the logs if anything failed
#
# Usage:
#   validate-model.sh MODEL.spdl CASES.json [--spctl PATH] [--pms PATH] [--ads PATH]
#
# The model is never modified. The .spdl file store is read-only for management
# writes, so this script only reads it.

set -euo pipefail

usage() {
    cat <<'USAGE'
Usage: validate-model.sh MODEL.spdl CASES.json [options]

Options:
  --spctl PATH   Speedle spctl binary (default: SPEEDLE_SPCTL, ./bin/spctl,
                 then spctl on PATH after verifying its help output)
  --pms PATH     speedle-pms binary (default: ./bin/speedle-pms, then PATH)
  --ads PATH     speedle-ads binary (default: ./bin/speedle-ads, then PATH)
  -h, --help     show this help

Environment variables SPEEDLE_SPCTL, SPEEDLE_PMS and SPEEDLE_ADS are used when
the corresponding flag is absent. On macOS, /usr/sbin/spctl is Apple's
Gatekeeper tool, not Speedle's CLI; set SPEEDLE_SPCTL to the Speedle binary path.
USAGE
}

need_file() {
    if [ ! -f "$1" ]; then
        echo "error: file not found: $1" >&2
        exit 2
    fi
}

resolve_tool() {
    local label=$1
    local explicit=$2
    shift 2
    if [ -n "$explicit" ]; then
        if command -v "$explicit" >/dev/null 2>&1; then
            printf '%s\n' "$explicit"
            return 0
        fi
        echo "error: $label not found at $explicit" >&2
        return 1
    fi
    local candidate
    for candidate in "$@"; do
        if command -v "$candidate" >/dev/null 2>&1; then
            printf '%s\n' "$candidate"
            return 0
        fi
    done
    echo "error: $label not found; pass --$label or build the speedle-plus/bin tools" >&2
    return 1
}

MODEL=""
CASES=""
SPCTL_ARG="${SPEEDLE_SPCTL:-}"
PMS_ARG="${SPEEDLE_PMS:-}"
ADS_ARG="${SPEEDLE_ADS:-}"

while [ $# -gt 0 ]; do
    case "$1" in
        --spctl)
            [ $# -ge 2 ] || { echo "error: --spctl needs a path" >&2; exit 2; }
            SPCTL_ARG=$2; shift 2 ;;
        --pms)
            [ $# -ge 2 ] || { echo "error: --pms needs a path" >&2; exit 2; }
            PMS_ARG=$2; shift 2 ;;
        --ads)
            [ $# -ge 2 ] || { echo "error: --ads needs a path" >&2; exit 2; }
            ADS_ARG=$2; shift 2 ;;
        -h|--help)
            usage; exit 0 ;;
        --)
            shift; break ;;
        -*)
            echo "error: unknown option $1" >&2; usage >&2; exit 2 ;;
        *)
            if [ -z "$MODEL" ]; then
                MODEL=$1
            elif [ -z "$CASES" ]; then
                CASES=$1
            else
                echo "error: unexpected argument $1" >&2; exit 2
            fi
            shift ;;
    esac
done

if [ -z "$MODEL" ] || [ -z "$CASES" ]; then
    usage >&2
    exit 2
fi
need_file "$MODEL"
need_file "$CASES"

command -v python3 >/dev/null 2>&1 || { echo "error: python3 is required" >&2; exit 2; }
command -v curl >/dev/null 2>&1 || { echo "error: curl is required" >&2; exit 2; }

SPCTL_BIN=$(resolve_tool spctl "$SPCTL_ARG" ./bin/spctl spctl)
SPCTL_HELP=$("$SPCTL_BIN" check --help 2>&1 || true)
case "$SPCTL_HELP" in
    *"valid SPDL"*) ;;
    *)
        echo "error: $SPCTL_BIN is not Speedle's spctl." >&2
        echo "       On macOS, /usr/sbin/spctl is Apple's Gatekeeper tool." >&2
        echo "       Set SPEEDLE_SPCTL to the Speedle CLI path, for example:" >&2
        echo "       export SPEEDLE_SPCTL=/path/to/speedle-plus/bin/spctl" >&2
        exit 2
        ;;
esac

PMS_BIN=$(resolve_tool pms "$PMS_ARG" ./bin/speedle-pms speedle-pms)
ADS_BIN=$(resolve_tool ads "$ADS_ARG" ./bin/speedle-ads speedle-ads)

echo "==> spctl check -f $MODEL"
if ! "$SPCTL_BIN" check -f "$MODEL"; then
    echo "error: spctl check failed; fix the SPDL before starting a server" >&2
    exit 1
fi

read -r PMS_PORT ADS_PORT < <(python3 -c '
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
if [ -z "${PMS_PORT:-}" ] || [ -z "${ADS_PORT:-}" ]; then
    echo "error: could not allocate loopback ports" >&2
    exit 2
fi

TMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/speedle-model.XXXXXX")
PMS_LOG="$TMP_DIR/pms.log"
ADS_LOG="$TMP_DIR/ads.log"
PMS_PID=""
ADS_PID=""

cleanup() {
    local status=$1
    trap - EXIT INT TERM
    if [ -n "$PMS_PID" ]; then kill "$PMS_PID" 2>/dev/null || true; fi
    if [ -n "$ADS_PID" ]; then kill "$ADS_PID" 2>/dev/null || true; fi
    if [ -n "$PMS_PID" ]; then wait "$PMS_PID" 2>/dev/null || true; fi
    if [ -n "$ADS_PID" ]; then wait "$ADS_PID" 2>/dev/null || true; fi
    if [ "$status" -ne 0 ]; then
        echo "--- PMS log (last 20 lines) ---" >&2
        tail -n 20 "$PMS_LOG" >&2 || true
        echo "--- ADS log (last 20 lines) ---" >&2
        tail -n 20 "$ADS_LOG" >&2 || true
    fi
    rm -rf "$TMP_DIR"
}

trap 'status=$?; cleanup "$status"; exit "$status"' EXIT
trap 'cleanup 130; exit 130' INT TERM

echo "==> starting PMS on 127.0.0.1:$PMS_PORT and ADS on 127.0.0.1:$ADS_PORT"
"$PMS_BIN" --store-type file --filestore-loc "$MODEL" \
    --endpoint "127.0.0.1:$PMS_PORT" --insecure=true --log-level warn \
    >"$PMS_LOG" 2>&1 &
PMS_PID=$!
"$ADS_BIN" --store-type file --filestore-loc "$MODEL" \
    --endpoint "127.0.0.1:$ADS_PORT" --insecure=true --log-level warn \
    >"$ADS_LOG" 2>&1 &
ADS_PID=$!

PMS_READY=false
for _ in $(seq 1 200); do
    CODE=$(curl -s -o /dev/null -w '%{http_code}' \
        "http://127.0.0.1:$PMS_PORT/policy-mgmt/v1/service" 2>/dev/null || true)
    if [ "$CODE" = "200" ]; then
        PMS_READY=true
        break
    fi
    if ! kill -0 "$PMS_PID" 2>/dev/null; then
        echo "error: PMS exited during startup" >&2
        exit 1
    fi
    sleep 0.1
done
if [ "$PMS_READY" != "true" ]; then
    echo "error: PMS did not become ready on 127.0.0.1:$PMS_PORT" >&2
    exit 1
fi

echo "==> running test cases against ADS"
python3 -I "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/run-cases.py" \
    --base-url "http://127.0.0.1:$ADS_PORT" \
    --cases "$CASES" \
    --wait 30

echo "==> all checks passed"
