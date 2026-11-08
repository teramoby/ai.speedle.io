# SPDL and import reference

Sources: `teramoby/speedle-plus` master at commit
`490a21a0ea87d80b244db8435a25314b6a24cfbc` (2026-11-06), the official docs under
`docs/hugo/content/docs/`, and the source files named below. Line numbers are from that
commit. If the repository has moved, use the same function names and re-check the lines.

## 1. Statement grammar

The grammar is published in `docs/hugo/content/docs/spdl.md:29-57`:

```text
POLICY = EFFECT SUBJECT ACTION RESOURCE [if CONDITION]
EFFECT = grant | deny
SUBJECT = AND_PRINCIPALS (, AND_PRINCIPALS)*
AND_PRINCIPALS = PRINCIPAL | \( PRINCIPAL_LIST \)
PRINCIPAL = user|group|entity|role PRINCIPAL_NAME [from IDD]
ACTION = ACTION_IDENTIFIER (, ACTION_IDENTIFIER)*
RESOURCE = RESOURCE_IDENTIFIER

ROLE_POLICY = EFFECT SUBJECT ROLE (on RESOURCE)? [if CONDITION]
ROLE = (role)? SUBJECT_IDENTIFIER
```

- `grant`, `deny`, `user`, `group`, `entity`, `role`, `from`, `on`, `if` and `in` are
  keywords in their syntax positions; keywords are case-insensitive
  (`docs/hugo/content/docs/spdl.md:21`).
- Principal, action and resource names are case-sensitive
  (`docs/hugo/content/docs/spdl.md:21`).
- The parser is `pkg/pdl/pdl.go`; `ParsePolicy` is at `:30-67` and `ParseRolePolicy` at
  `:70-111`. It rejects trailing text and unclosed names, so a successful parse is a
  complete statement (`pkg/pdl/pdl.go:55-57`, `:98-100`, `:518-543`).

### 1.1 Principals

- `getPrincipal` (`pkg/pdl/pdl.go:272-305`) encodes a principal as `type:name`, for example
  `user:alice`, `group:staff`, `role:manager`, `entity:payroll_sync`. An optional
  `from IDD` adds an identity-domain qualifier.
- In an authorization policy, a comma between principals is OR. Parentheses make an AND
  group: `grant (role designer, role dba) update db_design_doc` requires both roles
  (`docs/hugo/content/docs/pms/policy-mgmt.md:49-55`). The evaluator implements this in
  `matchPrincipals` (`pkg/eval/evaluator_utils.go:217-256`).
- In a role policy, the principal list is comma-separated and matched as OR by
  `matchRolePolicyPrincipals` (`pkg/eval/evaluator_utils.go:189-214`). AND groups are not
  supported; the evaluator says so explicitly at `pkg/eval/evaluator.go:566-568`.
- Built-in roles are added to every subject by `updateSubjectWithBuiltInRoles`
  (`pkg/eval/evaluator_utils.go:90-109`): `role:everyone_role` always;
  `role:authenticated_role` when the subject has at least one user, group or entity; and
  `role:anonymous_role` when it has none. The names are defined at
  `api/ads/types.go:90-92`.

### 1.2 Actions and resources

- An action is matched by exact string equality; there are no action wildcards
  (`pkg/eval/evaluator_utils.go:35-58`).
- A resource is either an exact name or `expr:<regular expression>`. The `expr:` prefix is
  stripped by `isResExpr` (`pkg/pdl/pdl.go:378-383`).
- `expr:` uses Go's standard `regexp` package, not shell globs
  (`docs/hugo/content/docs/spdl.md:122-128`; `pkg/eval/expressioncache.go:24-32`).
- Matching uses `Regexp.MatchString`, which reports a match **anywhere** in the string.
  Anchor with `^` and `$` when the whole identifier must match
  (`pkg/eval/expressioncache.go:45-59`; `docs/hugo/content/docs/pms/policy-mgmt.md:30`).
- There is no implicit hierarchy: a policy on `/orders` does not cover `/orders/1`. Use an
  expression such as `expr:^/orders/.*$`.
- A resource token is read by `getToken` (`pkg/pdl/pdl.go:518-543`), which stops at
  whitespace, comma or parentheses. Quote a token that contains spaces or parentheses:
  `expr:^/data/(public|internal)/.*$` must be written `"expr:^/data/(public|internal)/.*$"`.
  Go regexes do not support lookaround; avoid `(?=...)` and `(?!...)`.

## 2. Conditions

A condition is a Boolean expression evaluated only when the policy or role policy is
otherwise applicable (`docs/hugo/content/docs/spdl.md:59-69`). The parser validates it with
`condition.Check` (`pkg/pdl/pdl.go:424-457`; `pkg/eval/condition/condition.go:33-63`).

### 2.1 Types, operators and constants

`docs/hugo/content/docs/spdl.md:71-128` and `:246-290`:

| Type | Operators/comparators | Notes |
| --- | --- | --- |
| string | `+`, `==`, `!=`, `=~`, `>`, `>=`, `<`, `<=` | `+` concatenates; `=~` is Go regex matching |
| numeric | `+ - * / %`, `== != > >= < <=` | float64 |
| bool | `&& || !`, `== !=` | |
| datetime | `== != > >= < <=` | RFC3339 constants |
| array | `in` | left side is a single value, right side an array; `IsSubSet` also exists |

Constants: single-quoted strings, numbers, `true`/`false`, single-quoted RFC3339 datetimes
and parenthesized arrays (`docs/hugo/content/docs/spdl.md:246-290`).

Precedence, highest first: parentheses, function calls, unary `!`/`-`, `* / %`, `+ -`,
comparisons and `in`, `&&`, `||` (`docs/hugo/content/docs/spdl.md:365-379`). Use parentheses
for mixed `&&`/`||` conditions.

### 2.2 Built-in attributes

`docs/hugo/content/docs/spdl.md:136-219`; populated in
`pkg/eval/evaluator.go:229-289`:

| Attribute | Type | Source |
| --- | --- | --- |
| `request_user` | string | first user principal |
| `request_groups` | []string | group principal names |
| `request_entity` | string | first entity principal |
| `request_resource` | string | request resource |
| `request_action` | string | request action |
| `request_time` | number | `time.Now().Unix()` seconds (see note below) |
| `request_year`, `request_month`, `request_day`, `request_hour` | int | server clock |
| `request_weekday` | string | weekday name, for example `"Monday"` |

The docs table calls `request_time` a datetime, while the server stores `time.Now().Unix()`
(`pkg/eval/evaluator.go:230`). Comparisons with RFC3339 constants are covered by tests
(`pkg/eval/evaluator_condition_test.go:166-177`), but the calendar attributes
(`request_year`, `request_month`, `request_day`, `request_hour`, `request_weekday`) are
easier to read and to reason about. Avoid time-dependent test cases unless the test controls
the clock.

### 2.3 Customer attributes

- The PEP supplies them with the authorization request. In the Go API the value types are
  `string`, `bool`, `float64` (datetime as Unix seconds), and `[]interface{}` for arrays
  (`docs/hugo/content/docs/spdl.md:227-244`).
- In the REST API an attribute is `{"name": "...", "type": "...", "value": ...}`; `type` is
  `string`, `numeric`, `bool` or `datetime`, and `value` may be an array of one of those
  types (`pkg/svcs/adsrest/check.go:23-27`, `:156-167`, `:180-239`, `:241-259`).
- Prefer names matching `[A-Za-z][A-Za-z0-9_]*`. The REST layer accepts more characters, but
  simple names are portable (`docs/hugo/content/docs/spdl.md:221-225`).
- **Missing or ill-typed attributes make the condition non-matching.** `evaluateCondition`
  returns `false` on any evaluation error (`pkg/eval/evaluator_utils.go:178-186`), and
  `getPolicyList` ignores that error (`pkg/eval/evaluator.go:1041-1043`). Document every
  required attribute; a missing one silently removes the grant.
- A condition that fails to *compile* is different. At cache build the error is logged and
  the condition is omitted (`pkg/eval/runtimeservice.go:282-289`); if it is recompiled later,
  the failure becomes an evaluation error (`pkg/eval/evaluator.go:1034-1038`,
  `pkg/eval/runtimeservice.go:257-270`).

### 2.4 Functions

- Built-ins: `Sqrt`, `Max`, `Min`, `Sum`, `Avg`, `IsSubSet`
  (`docs/hugo/content/docs/spdl.md:296-358`). Numeric built-ins reject non-finite inputs and
  results; a failed function makes the condition non-matching
  (`docs/hugo/content/docs/spdl.md:358`).
- Custom functions call an external REST endpoint. Use them only when the built-ins cannot
  express the rule. Calls are made during evaluation, have a default 5-second timeout and can
  be cached by function configuration
  (`docs/hugo/content/docs/custom-function.md:14-18`;
  `pkg/eval/evaluator_custom_function.go:23-32`, `:64-89`, `:122-180`).
- `spctl check` cannot prove that a custom function is registered in the target store; it
  allows unknown function names. Confirm the function exists in PMS before shipping a model
  that calls it (`pkg/eval/condition/condition.go:33-37`).

## 3. Role policies, inheritance and scope

- A role policy grants or denies a role to principals:
  `grant user alan role manager` (global) or `grant user alan role manager on res1`
  (resource-scoped). Assigning a role alone grants no operation; an authorization policy
  must grant permissions to the role (`docs/hugo/content/docs/pms/policy-mgmt.md:32-41`).
- Role inheritance is a role policy whose principal is a role:
  `grant role manager role employee` gives the employee role to every subject that has the
  manager role. The evaluator treats the principal `role:manager` as a parent and adds
  `employee` to the granted set (`pkg/eval/evaluator.go:683-751`).
  Read the statement child-first: manager inherits employee.
- Role resolution runs for every authorization request before policy matching
  (`pkg/eval/evaluator.go:342-346`, `:476-491`). It starts from the subject principals (the
  evaluator assumes they contain no user-defined roles; the built-in roles are added by
  `updateSubjectWithBuiltInRoles`), follows role policies to a fixed point, and applies deny
  role policies (`pkg/eval/evaluator.go:569-681`). There is no role-result cache in this
  path; a deeper graph costs more per request.
- A resource-scoped role is granted only when the request resource matches the role
  policy's resource or expression (`pkg/eval/evaluator.go:513-553`). This is the right tool
  for "manager of engineering" without creating one permission policy per department:
  `grant user carol role manager on expr:^/expenses/engineering/.*$` plus
  `grant role manager approve expr:^/expenses/.*$ if amount <= 5000`.
- The service named exactly `global` holds cross-service **role** assignments. Global
  authorization policies are not supported; each service still defines its permissions
  (`docs/hugo/content/docs/pms/global-policy.md:14-19`; `pkg/eval/evaluator.go:216-219`).
- Deny role policies exist and participate in role resolution, but their interaction with
  inheritance is subtle (`pkg/eval/evaluator.go:753-819`, `:952-1015`). Use them only with
  explicit tests; prefer a targeted deny authorization policy for ordinary exceptions.

## 4. Decision semantics and reason codes

- Explicit deny overrides grant: `denyOverwriteCombiner` returns `false` as soon as a
  matching deny is present (`pkg/eval/evaluator_utils.go:62-88`).
- If no deny and at least one grant matches, the decision is allow. Otherwise no applicable
  policy denies (`pkg/eval/evaluator_utils.go:70-86`).
- Reason codes (`api/ads/types.go:80-115`):
  `0 GRANT_POLICY_FOUND`, `1 DENY_POLICY_FOUND`, `2 SERVICE_NOT_FOUND`,
  `3 NO_APPLICABLE_POLICIES`, `4 ERROR_IN_EVALUATION`.

## 5. The `.spdl` file store

The file store selects the SPDL parser by the `.spdl` suffix
(`pkg/store/file/fileStore.go:38-41`). The format is shown in
`docs/hugo/content/docs/deployment-embeded.md:49-58` and exercised by
`pkg/store/file/spdl_test.spdl:4-14`:

```spdl
# comment
[service.mysvc]
[policy]
grant user alice get res1
[rolepolicy]
grant user alice role reader
```

- Sections are `[service.NAME]`, `[policy]` and `[rolepolicy]`; section names are parsed in
  `processSection` (`pkg/store/file/spdl.go:190-203`).
- A `[policy]` or `[rolepolicy]` line is valid only after a `[service.NAME]` section; the
  parser rejects a policy in the root phase (`pkg/store/file/spdl.go:153-173`, `:225-235`).
- `#` starts a comment. The parser also tracks quotes so a `#` inside a quoted name or
  condition is not treated as a comment (`pkg/store/file/spdl.go:237-296`).
- `spctl check -f file.spdl` parses the whole file and reports every error without connecting
  to PMS (`cmd/spctl/command/check.go:14-70`, `:55-120`). Condition errors are validated by
  the parser.
- **The `.spdl` file store is a read-only import path.** `WritePolicyStore` always marshals
  the store as JSON (`pkg/store/file/fileStore.go:72-83`), and management operations such as
  `CreatePolicy` read, mutate and write the store (`pkg/store/file/fileStore.go:424-441`).
  Pointing PMS at a `.spdl` file and then using `spctl create`/`delete` rewrites that file as
  JSON, which the next `.spdl` read cannot parse. Treat the SPDL as source, edit it, and
  restart/reload; use a JSON file store if runtime management is required.

## 6. Running the model locally

Build the three binaries exactly as the quick start documents
(`docs/hugo/content/quick-start.md:34-43`):

```bash
git clone --depth 1 https://github.com/teramoby/speedle-plus.git
cd speedle-plus
mkdir -p bin
go build -o ./bin/ ./cmd/spctl ./cmd/speedle-pms ./cmd/speedle-ads
export SPEEDLE_SPCTL="$PWD/bin/spctl"
```

Use `"$SPEEDLE_SPCTL"` for CLI commands. This explicit path is required on macOS, where
`/usr/sbin/spctl` is Apple's Gatekeeper tool rather than the Speedle CLI.

Start PMS and ADS against the same file (`docs/hugo/content/quick-start.md:61-70`,
`:107-116`; use free ports for a scratch run):

```bash
./bin/speedle-pms --store-type file --filestore-loc ./policies.spdl \
  --endpoint 127.0.0.1:6733 --insecure=true
./bin/speedle-ads --store-type file --filestore-loc ./policies.spdl \
  --endpoint 127.0.0.1:6734 --insecure=true
```

`--insecure=true` is for loopback development only; see the security guide for production
transport. PMS and ADS watch the file; policy propagation is asynchronous. Stop both
servers when the tests finish.

## 7. REST request shape for tests

The ADS endpoint is `POST /authz-check/v1/is-allowed`. The request type is defined at
`pkg/svcs/adsrest/check.go:23-47` and converted at `:276-300`:

```json
{
  "subject": {
    "principals": [
      {"type": "user", "name": "alice"},
      {"type": "group", "name": "all_staff"}
    ]
  },
  "serviceName": "northstar_hr",
  "resource": "/hr/handbook",
  "action": "read",
  "attributes": [
    {"name": "location", "type": "string", "value": "London"},
    {"name": "amount", "type": "numeric", "value": 4000}
  ]
}
```

The response is `{"allowed": true|false, "reason": <code>}`; `ErrorMessage` is present when
the request failed (`pkg/svcs/adsrest/check.go:53-57`, `:316-353`). The service must exist in
the loaded store; otherwise the reason is `SERVICE_NOT_FOUND` (2).

## 8. JSON store and Cloud console

- The same file store also reads JSON policy stores; `spctl check -f` treats a non-`.spdl`
  file as JSON (`cmd/spctl/command/check.go:97-120`). The JSON shape is `pms.PolicyStore`
  (`api/pms`). JSON supports IDs and fields that SPDL does not expose, but it is more
  verbose and easier to get subtly wrong.
- The Cloud console's JSON import format is not documented in the public Speedle docs
  reviewed for this skill. Do not claim Cloud console import compatibility and do not invent
  a format. Target the self-hosted `.spdl` file store and `spctl` paths above.

## 9. Citation index

| Topic | Citation |
| --- | --- |
| SPDL grammar | `docs/hugo/content/docs/spdl.md:29-57` |
| Keywords and case | `docs/hugo/content/docs/spdl.md:21` |
| Condition types/operators | `docs/hugo/content/docs/spdl.md:71-128` |
| Built-in attributes | `docs/hugo/content/docs/spdl.md:136-219`; `pkg/eval/evaluator.go:229-289` |
| Customer attributes | `docs/hugo/content/docs/spdl.md:227-244`; `pkg/svcs/adsrest/check.go:23-27`, `156-259` |
| Functions | `docs/hugo/content/docs/spdl.md:296-358`; `pkg/eval/evaluator_custom_function.go:23-89` |
| Principal parsing | `pkg/pdl/pdl.go:272-305`; `pkg/eval/evaluator_utils.go:189-256` |
| Role inheritance | `pkg/eval/evaluator.go:683-751`, `569-681` |
| Resource-scoped roles | `pkg/eval/evaluator.go:513-553` |
| Global roles | `docs/hugo/content/docs/pms/global-policy.md:14-19` |
| Deny precedence | `pkg/eval/evaluator_utils.go:62-88` |
| Reason codes | `api/ads/types.go:80-115` |
| `.spdl` file format | `pkg/store/file/spdl.go:190-296`; `docs/hugo/content/docs/deployment-embeded.md:49-58` |
| `spctl check` | `cmd/spctl/command/check.go:14-120` |
| File store writes JSON | `pkg/store/file/fileStore.go:72-83`, `424-441` |
| Quick-start build/run | `docs/hugo/content/quick-start.md:34-43`, `61-70`, `107-116` |
| REST request | `pkg/svcs/adsrest/check.go:23-47`, `276-300` |
