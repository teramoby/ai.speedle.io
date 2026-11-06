#!/usr/bin/env python3
"""Run SPDL policy test cases against a Speedle ADS is-allowed endpoint.

The input is the JSON schema in templates/test-cases.json. The runner sends one
POST /authz-check/v1/is-allowed request per case, compares the decision (and the
optional reason code), prints PASS/FAIL, and exits 1 if any case fails.

Only the Python standard library is used, so this works in a bare checkout.
"""

import argparse
import json
import sys
import time
import urllib.error
import urllib.request

ENDPOINT = "/authz-check/v1/is-allowed"
REASONS = {
    0: "GRANT_POLICY_FOUND",
    1: "DENY_POLICY_FOUND",
    2: "SERVICE_NOT_FOUND",
    3: "NO_APPLICABLE_POLICIES",
    4: "ERROR_IN_EVALUATION",
}


def load_cases(path):
    with open(path, encoding="utf-8") as f:
        spec = json.load(f)
    if not isinstance(spec, dict):
        raise ValueError("the case file must be a JSON object")
    service = spec.get("service")
    cases = spec.get("cases")
    if not isinstance(service, str) or not service:
        raise ValueError("the case file needs a non-empty 'service' string")
    if not isinstance(cases, list) or not cases:
        raise ValueError("the case file needs a non-empty 'cases' array")
    seen = set()
    for index, case in enumerate(cases, 1):
        where = "case %d" % index
        if not isinstance(case, dict):
            raise ValueError("%s is not an object" % where)
        for field in ("id", "description", "subject", "resource", "action", "expect"):
            if field not in case:
                raise ValueError("%s has no %r" % (where, field))
        if case["id"] in seen:
            raise ValueError("duplicate case id %r" % case["id"])
        seen.add(case["id"])
        expect = case["expect"]
        if not isinstance(expect, dict) or not isinstance(expect.get("allowed"), bool):
            raise ValueError("case %r needs expect.allowed as a boolean" % case["id"])
        if "reason" in expect and not isinstance(expect["reason"], int):
            raise ValueError("case %r has a non-integer expect.reason" % case["id"])
    return service, cases


def payload(service, case):
    body = {
        "subject": case["subject"],
        "serviceName": service,
        "resource": case["resource"],
        "action": case["action"],
    }
    if case.get("attributes"):
        body["attributes"] = case["attributes"]
    return body


def post(url, body, timeout):
    data = json.dumps(body).encode("utf-8")
    request = urllib.request.Request(
        url, data=data, headers={"Content-Type": "application/json"}, method="POST"
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8", "replace")
            try:
                return response.status, json.loads(raw)
            except ValueError:
                return response.status, {"error": raw}
    except urllib.error.HTTPError as error:
        raw = error.read().decode("utf-8", "replace")
        try:
            return error.code, json.loads(raw)
        except ValueError:
            return error.code, {"error": raw}
    except urllib.error.URLError as error:
        return None, {"error": str(error.reason)}
    except OSError as error:
        return None, {"error": str(error)}


def wait_for_ads(url, service, case, seconds, timeout):
    deadline = time.time() + seconds
    last = None
    while time.time() < deadline:
        status, body = post(url, payload(service, case), timeout)
        last = (status, body)
        if status == 200 and "allowed" in body:
            return True, last
        time.sleep(0.1)
    return False, last


def describe_reason(reason):
    if isinstance(reason, int) and reason in REASONS:
        return "%s (%d)" % (REASONS[reason], reason)
    return str(reason)


def main():
    parser = argparse.ArgumentParser(
        description="Run Speedle is-allowed cases from a JSON file"
    )
    parser.add_argument("--base-url", required=True, help="ADS base URL, for example http://127.0.0.1:6734")
    parser.add_argument("--cases", required=True, help="test case JSON file")
    parser.add_argument("--wait", type=float, default=0.0, help="seconds to wait for ADS readiness")
    parser.add_argument("--timeout", type=float, default=5.0, help="per-request timeout in seconds")
    parser.add_argument("--verbose", action="store_true", help="print each request payload")
    args = parser.parse_args()

    try:
        service, cases = load_cases(args.cases)
    except (OSError, ValueError) as error:
        print("error: %s" % error, file=sys.stderr)
        return 2

    url = args.base_url.rstrip("/") + ENDPOINT
    print("service: %s" % service)
    print("cases:   %d" % len(cases))

    if args.wait:
        ready, last = wait_for_ads(url, service, cases[0], args.wait, args.timeout)
        if not ready:
            print("error: ADS did not become ready at %s; last response: %r" % (url, last), file=sys.stderr)
            return 2

    failures = 0
    for case in cases:
        body = payload(service, case)
        if args.verbose:
            print("request %s: %s" % (case["id"], json.dumps(body, ensure_ascii=False)))
        status, response = post(url, body, args.timeout)
        expect = case["expect"]
        ok = status == 200 and response.get("allowed") == expect["allowed"]
        if ok and "reason" in expect:
            ok = response.get("reason") == expect["reason"]
        if not ok:
            failures += 1

        expected = "allowed=%s" % str(expect["allowed"]).lower()
        if "reason" in expect:
            expected += " reason=%s" % describe_reason(expect["reason"])
        if status == 200:
            got = "allowed=%s reason=%s" % (
                str(response.get("allowed")).lower(),
                describe_reason(response.get("reason")),
            )
        else:
            got = "HTTP %s: %r" % (status, response)

        print("%s %s %s" % ("PASS" if ok else "FAIL", case["id"], case["description"]))
        print("     expected %s; got %s" % (expected, got))

    passed = len(cases) - failures
    print()
    print("%d/%d cases passed" % (passed, len(cases)))
    return 0 if failures == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
