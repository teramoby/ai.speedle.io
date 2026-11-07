#!/usr/bin/env python3
"""Demo issuer and policy enforcement point (PEP) for delegated agents.

An AI agent acts for a user. The user's delegation is proven by a signed
delegation token, not by request claims. This script plays three parts:

  issue   a demo token issuer: signs a delegation token for an agent;
  approve a demo approval system: signs a human approval record;
  check   the PEP in front of the business system.

Pattern 1 (`check --pattern 1`, the default): the PEP verifies the token, then
makes two is-allowed calls and allows only if both pass:
  1. the agent, with the verified token scope as attributes;
  2. the delegator (the token `sub`), with their own permissions now. For a
     refund it also passes the amount and, from a verified approval record,
     the approver as `approved_by`.

Pattern 2 (`check --pattern 2`, self-hosted only): the PEP makes one is-allowed
call and passes the raw token; custom functions verify it and ask about the
delegator (see main.go).

DEMO ONLY. The token is an HS256 JWT signed with DEMO_KEY, a fixed key written
in this file and in main.go. Anyone with this file can mint tokens. A real
deployment uses its identity provider or authorization server as the issuer
and keeps signing keys in a key management service; see README.md.

Standard library only. Python 3.8+.
"""

import argparse
import base64
import hashlib
import hmac
import json
import sys
import time
import urllib.error
import urllib.request

# DEMO ONLY: a fixed, public signing key. Never use a key written in code.
DEMO_KEY = b"speedle-delegation-demo-key-DEMO-ONLY-do-not-use-in-production"
ISSUER = "https://issuer.example/demo"
AUDIENCE = "crm"
CLOCK_SKEW = 60  # seconds allowed for iat in the future
ADS = "http://127.0.0.1:6734/authz-check/v1/is-allowed"
SERVICE = {1: "crm", 2: "crm-fn"}


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def b64url_decode(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def sign(claims: dict) -> str:
    header = b64url(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    payload = b64url(json.dumps(claims, separators=(",", ":")).encode())
    signing_input = f"{header}.{payload}".encode()
    signature = b64url(hmac.new(DEMO_KEY, signing_input, hashlib.sha256).digest())
    return f"{header}.{payload}.{signature}"


def verify_signed(token: str, now: int) -> dict:
    """Check signature, issuer, audience and lifetime; return the claims."""
    parts = token.split(".")
    if len(parts) != 3:
        raise ValueError("malformed token")
    try:
        header = json.loads(b64url_decode(parts[0]))
        expected = hmac.new(DEMO_KEY, f"{parts[0]}.{parts[1]}".encode(), hashlib.sha256).digest()
        signature_ok = hmac.compare_digest(expected, b64url_decode(parts[2]))
    except (ValueError, TypeError):
        raise ValueError("malformed token")
    if header.get("alg") != "HS256" or not signature_ok:
        raise ValueError("bad signature")
    claims = json.loads(b64url_decode(parts[1]))
    if claims.get("iss") != ISSUER:
        raise ValueError("wrong issuer")
    if claims.get("aud") != AUDIENCE:
        raise ValueError("wrong audience")
    exp, iat = claims.get("exp"), claims.get("iat")
    if not isinstance(exp, int) or not isinstance(iat, int):
        raise ValueError("missing exp or iat")
    if now >= exp:
        raise ValueError("token expired")
    if iat > now + CLOCK_SKEW:
        raise ValueError("token issued in the future")
    return claims


def verify(token: str, agent: str, now: int) -> dict:
    """Return the verified delegation claims, or raise ValueError with the reason."""
    claims = verify_signed(token, now)
    if claims.get("kind") != "delegation":
        raise ValueError("not a delegation token")
    if (claims.get("act") or {}).get("sub") != agent:
        raise ValueError("token was not issued to this agent")
    if not isinstance(claims.get("sub"), str) or not claims["sub"]:
        raise ValueError("missing sub")
    scope = claims.get("scope") or {}
    for key in ("actions", "resources"):
        values = scope.get(key)
        if not isinstance(values, list) or not values or not all(isinstance(v, str) for v in values):
            raise ValueError(f"scope.{key} must be a non-empty list of strings")
    return claims


def verify_approval(record: str, action: str, resource: str, amount: float, now: int) -> str:
    """Return the approver of a signed approval record that covers this request."""
    claims = verify_signed(record, now)
    if claims.get("kind") != "approval":
        raise ValueError("not an approval record")
    if claims.get("action") != action or claims.get("resource") != resource:
        raise ValueError("approval is for another action or resource")
    approved = claims.get("amount")
    if not isinstance(approved, (int, float)) or approved < amount:
        raise ValueError("approval does not cover the amount")
    if not isinstance(claims.get("sub"), str) or not claims["sub"]:
        raise ValueError("missing approver")
    return claims["sub"]


def is_allowed(body: dict) -> dict:
    request = urllib.request.Request(
        ADS, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            return json.loads(response.read())
    except (urllib.error.URLError, ValueError) as error:
        # Fail closed: no decision is a deny.
        return {"allowed": False, "error": str(error)}


def rfc3339(epoch: int) -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(epoch))


def cmd_issue(args) -> int:
    now = int(time.time())
    claims = {
        "iss": ISSUER,
        "aud": AUDIENCE,
        "kind": "delegation",
        "sub": args.user,
        "act": {"sub": args.agent},
        "scope": {"actions": args.actions.split(","), "resources": args.resources.split(",")},
        "iat": now + args.offset,
        "exp": now + args.offset + args.ttl,
    }
    print(sign(claims))
    return 0


def cmd_approve(args) -> int:
    # Demo approval step: in production the approval system records a human
    # decision and signs it; the PEP never takes an approver from the caller.
    now = int(time.time())
    claims = {
        "iss": ISSUER,
        "aud": AUDIENCE,
        "kind": "approval",
        "sub": args.approver,
        "action": args.action,
        "resource": args.resource,
        "amount": args.amount,
        "iat": now,
        "exp": now + args.ttl,
    }
    print(sign(claims))
    return 0


def deny(reason: str) -> int:
    print(f"DENY ({reason})")
    return 1


def cmd_check(args) -> int:
    now = int(time.time())
    service = SERVICE[args.pattern]

    if args.pattern == 2:
        if args.amount is not None or args.approval:
            print("--amount and --approval are shown with Pattern 1 only")
            return 2
        # One check: custom functions in ADS verify the token and ask about the
        # delegator. The PEP passes the raw token and builds every attribute
        # itself, so a caller cannot shadow built-ins such as request_entity.
        body = {
            "subject": {"principals": [{"type": "entity", "name": args.agent}]},
            "serviceName": service,
            "resource": args.resource,
            "action": args.action,
            "attributes": [{"name": "delegation_token", "type": "string", "value": args.token}],
        }
        result = is_allowed(body)
        print(f"check agent + delegation chain ({args.agent}): {json.dumps(result)}")
        if result.get("allowed") is not True:
            return deny("delegation chain")
        print("ALLOW")
        return 0

    # Step 1: verify the token locally (signature, issuer, audience, expiry, agent).
    try:
        claims = verify(args.token, args.agent, now)
    except ValueError as error:
        print(f"verify token: {error}")
        return deny("token not valid, no Speedle call made")
    print(f"verify token: ok (sub={claims['sub']}, act={args.agent}, exp={rfc3339(claims['exp'])})")

    # Step 2: the agent, inside the verified token scope.
    scope = claims["scope"]
    agent_check = is_allowed({
        "subject": {"principals": [{"type": "entity", "name": args.agent}]},
        "serviceName": service,
        "resource": args.resource,
        "action": args.action,
        "attributes": [
            {"name": "token_actions", "type": "string", "value": scope["actions"]},
            {"name": "token_resources", "type": "string", "value": scope["resources"]},
            {"name": "token_expires", "type": "datetime", "value": rfc3339(claims["exp"])},
        ],
    })
    print(f"check 1 agent scope ({args.agent}): {json.dumps(agent_check)}")
    if agent_check.get("allowed") is not True:
        return deny("agent scope")

    # Step 3: the delegator from the verified sub, with their permissions now.
    # Request facts (the refund amount) and a verified approver are passed
    # here, so the delegator's own policy decides how much they may refund.
    delegator_attributes = []
    if args.amount is not None:
        delegator_attributes.append({"name": "amount", "type": "numeric", "value": args.amount})
    if args.approval:
        try:
            approver = verify_approval(args.approval, args.action, args.resource, args.amount or 0, now)
        except ValueError as error:
            print(f"verify approval: {error}")
            return deny("approval not valid")
        print(f"verify approval: ok (approved_by={approver})")
        delegator_attributes.append({"name": "approved_by", "type": "string", "value": approver})
    delegator_check = is_allowed({
        "subject": {"principals": [{"type": "user", "name": claims["sub"]}]},
        "serviceName": service,
        "resource": args.resource,
        "action": args.action,
        "attributes": delegator_attributes,
    })
    print(f"check 2 delegator now ({claims['sub']}): {json.dumps(delegator_check)}")
    if delegator_check.get("allowed") is not True:
        return deny("delegator")
    print("ALLOW")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = parser.add_subparsers(dest="command", required=True)

    issue = sub.add_parser("issue", help="sign a demo delegation token (demo issuer)")
    issue.add_argument("--user", required=True, help="the delegating user (token sub)")
    issue.add_argument("--agent", required=True, help="the agent acting for the user (act.sub)")
    issue.add_argument("--actions", required=True, help="comma-separated actions in scope")
    issue.add_argument("--resources", required=True, help="comma-separated resources in scope")
    issue.add_argument("--ttl", type=int, default=300, help="lifetime in seconds (default 300)")
    issue.add_argument("--offset", type=int, default=0,
                       help="shift iat by this many seconds, e.g. -600 for an already expired token")
    issue.set_defaults(func=cmd_issue)

    approve = sub.add_parser("approve", help="sign a demo approval record (demo approval system)")
    approve.add_argument("--approver", required=True, help="the person who approved")
    approve.add_argument("--action", required=True)
    approve.add_argument("--resource", required=True)
    approve.add_argument("--amount", type=float, required=True, help="the largest amount approved")
    approve.add_argument("--ttl", type=int, default=900, help="lifetime in seconds (default 900)")
    approve.set_defaults(func=cmd_approve)

    check = sub.add_parser("check", help="enforce one agent request")
    check.add_argument("--pattern", type=int, choices=(1, 2), default=1)
    check.add_argument("--agent", required=True, help="the authenticated agent identity")
    check.add_argument("--token", required=True, help="the agent's delegation token")
    check.add_argument("--action", required=True)
    check.add_argument("--resource", required=True)
    check.add_argument("--amount", type=float, help="the refund amount, passed to check 2")
    check.add_argument("--approval", help="a signed approval record (Pattern 1)")
    check.set_defaults(func=cmd_check)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
