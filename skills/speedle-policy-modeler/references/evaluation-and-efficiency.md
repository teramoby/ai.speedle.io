# Evaluation and efficiency

Sources: `teramoby/speedle-plus` master at commit
`490a21a0ea87d80b244db8435a25314b6a24cfbc` (2026-11-06). Line numbers are from that
commit. The goal is a model whose hot paths use the evaluator's indexes instead of scanning
policies or running expensive conditions on every request.

## 1. What happens to one authorization request

`InternalIsAllowed` is at `pkg/eval/evaluator.go:304-353`:

1. Look up the service in the runtime cache (`:469-474`).
2. Build the request context: server time, subject users/groups/entities and customer
   attributes (`:204-297`).
3. If the service has no cached policy at all, return `NO_APPLICABLE_POLICIES`
   (`:334-336`).
4. Resolve roles for this request and append them to the subject's principals
   (`:342-346`, `:476-491`).
5. Collect candidate authorization policies for the subject principals and request resource
   (`:346-349`; `:1020-1062`).
6. Evaluate conditions on the candidates, split them into granted and denied
   (`:1029-1060`).
7. Apply deny-over-grant (`pkg/eval/evaluator_utils.go:62-88`).

The two expensive phases are role resolution (step 4) and candidate collection plus
condition evaluation (steps 5–6). The model's shape controls both.

## 2. How the policy cache indexes policies

`convertService` builds the runtime service and compiles every policy condition once
(`pkg/eval/runtimeservice.go:273-292`). `AddPolicyToCache`
(`pkg/eval/policycache.go:33-75`) then stores the policy under:

- **Every principal** in the policy, in `PrincipalToPolicies` (`:60-74`). The cache does not
  distinguish AND from OR here; a policy is indexed under each principal it names, and the
  full principal match is re-checked later.
- **No principal**: `NilPrincipalToPolicies` (`:50-53`). SPDL cannot express a policy with
  no principal, but JSON can. Such a policy is considered for every request.
- **Each permission's resource** in a `ResourceToPolicyMap` (`:77-118`):
  - exact resource name → `ResourceToPolicies` (hash map);
  - resource expression → classified by shape in
    `AddPolicyToResourceExpressionCache` (`pkg/eval/basepolicycache.go:102-162`):
    - `^prefix.*` / `^prefix.*$` → prefix radix tree (`:103-121`); the prefix must match
      `[\w/]+` (letters, digits, underscore, `/`). A prefix containing a hyphen or dot falls
      through to the general-regex map, so keep resource identifiers to that character set
      when a prefix index matters;
    - `^.*suffix` / `^.*suffix$` → reversed suffix radix tree (`:122-139`); the suffix has the
      same `[\w/]+` restriction;
    - `^.*$` or `.*` → `NilResourceToPolicies`, considered for every resource (`:140-144`);
    - anything else → `ResourceExpressionToPolicies`, a plain map that is scanned one
      expression at a time (`:145-161`).

Role policies use the same structure (`pkg/eval/rolepolicycache.go:34-105`,
`:180-257`). A role policy with no resource is stored under `NilResourceToPolicies` and is
considered for every resource (`:74-82`, `:202-209`).

## 3. How candidates are collected

`GetRelatedPolicyMap` (`pkg/eval/policycache.go:195-214`):

1. Add the nil-principal policies (if any).
2. For each subject principal, look up its `ResourceToPolicyMap` and add:
   - nil-resource policies;
   - exact-resource policies for the request resource;
   - prefix/suffix radix matches (`WalkPath`);
   - `.*` policies;
   - every general expression, each with a regex match
     (`pkg/eval/policycache.go:216-315`; `pkg/eval/expressioncache.go:45-59`).

Only then does `getPolicyList` re-check principals, resource/action and conditions
(`pkg/eval/evaluator.go:1024-1043`). Consequences:

- The principal index is a hard filter. A policy under a principal the subject does not have
  is never considered, even if its resource matches.
- The resource index is a hard filter too. A policy whose exact resource or expression does
  not match the request resource is not considered.
- Conditions are **not** a filter on candidate collection. They run after the candidate set
  is built, one condition per candidate. A narrow principal/resource is what keeps the
  number of condition evaluations small.
- General regexes make collection proportional to the number of distinct general
  expressions under the matched principals. Prefix/suffix expressions use a radix tree and
  scale with the resource string, not with the number of policies.

## 4. How roles are resolved

`resolveSubject` calls `getGrantedRolesFromService` on every request
(`pkg/eval/evaluator.go:476-491`, `:569-681`):

1. Find direct role policies for the subject principals and the request resource
   (`:585`; `getDirectRolePolicesInService` at `:513-554`).
2. Add each granted role's principal (`role:<name>`) and query role policies for the newly
   granted roles (`:608-625`). Repeat until a round grants no new role.
3. Apply deny role policies and clean the related-role map (`:627-674`).
4. Return the final granted roles; the caller appends them to the subject principals.

There is no role-result cache in this path. The cost grows with the number of role policies
that match the subject and resource, and with the depth of the inheritance graph. The direct
role-policy lookup uses the same principal + resource index as authorization policies, so the
same design rules apply: exact/prefix resources and narrow principals.

## 5. Cost model

| Construct | Cost at request time | Design rule |
| --- | --- | --- |
| Exact resource name | O(1) hash-map lookup | Prefer it for hot, stable resources |
| `expr:^prefix.*$` | Radix walk, O(prefix length + matches) | Use it for families such as `/hr/employees/...` |
| `expr:^.*suffix$` | Reversed radix walk | Use it for file-like suffixes |
| `expr:^.*$` | Always in the candidate set | Avoid; it is a catch-all |
| General regex | One `MatchString` per distinct expression per request | Split alternations into prefix rules; avoid lookaround |
| Condition | Compiled once; evaluated per candidate | Attach to narrow policies; keep functions cheap |
| Custom function | HTTP call, default 5 s timeout; optional cache | Use only when built-ins cannot express the rule |
| Role inheritance | Extra role-policy rounds until fixed point | Keep the graph shallow, acyclic and non-redundant |
| Broad role (`everyone_role`) | Principal match for every request | Use explicit cohorts; test the broad rule |

Citations: exact and expression maps `pkg/eval/policycache.go:216-315`; classification
`pkg/eval/basepolicycache.go:102-162`; compiled expressions
`pkg/eval/expressioncache.go:24-59`; conditions compiled at cache build
`pkg/eval/runtimeservice.go:282-289` and evaluated per candidate
`pkg/eval/evaluator.go:1029-1043`; custom function timeout and cache
`pkg/eval/evaluator_custom_function.go:23-32`, `:64-89`, `:122-180`; role resolution
`pkg/eval/evaluator.go:569-681`; deny precedence
`pkg/eval/evaluator_utils.go:62-88`.

## 6. Rules to design by

### 6.1 Principal rules

- Put a policy under the narrowest principal that the clause names. A policy under
  `role:hr_manager` is never considered for other employees.
- Avoid `role everyone_role` unless the clause really applies to every request. It is a
  principal match for every subject (`pkg/eval/evaluator_utils.go:90-109`).
- Prefer roles for job functions and groups for IdP cohorts. A role can inherit; a group
  is just a principal. Do not keep both if they duplicate the same membership.
- AND principals (parentheses) are supported for authorization policies, but the cache
  indexes the policy under every principal in the group, so each member principal still
  produces a candidate lookup. Use AND only when the rule requires it
  (`pkg/eval/policycache.go:60-74`; `pkg/eval/evaluator_utils.go:217-256`).

### 6.2 Resource rules

- Prefer exact resource names for singleton resources (`/hr/handbook`).
- Model families as a prefix (`/hr/employees/...`, `/hr/salary/...`) and use
  `expr:^/hr/employees/.*$`. Move a sub-resource to its own namespace when a nested path
  forces a general regex. For example, `/hr/salary/<id>` is a prefix; the nested
  `/hr/employees/<id>/salary` is a general regex because `.*` is not at the end.
- Anchor expressions with `^` and usually `$`. `MatchString` matches anywhere, so an
  unanchored expression can allow unintended resources
  (`pkg/eval/expressioncache.go:45-59`).
- Split alternations into separate prefix rules:
  `expr:^/data/(public|internal)/.*$` is a general regex; two rules
  `expr:^/data/public/.*$` and `expr:^/data/internal/.*$` are prefix radix entries.
- Avoid `expr:^.*$`. It is a catch-all candidate for every resource and forces every
  condition on it to run.
- Go's RE2 has no lookaround. Express exclusions with explicit denies or separate prefixes.

### 6.3 Condition rules

- A condition is cheap only after the candidate set is narrow. A condition on a policy that
  matches every resource does not reduce the work; it adds to it.
- Keep conditions to comparisons on attributes the PEP already sends. Avoid arithmetic
  chains and custom functions unless the clause requires them.
- Ensure the PEP sends every attribute the condition reads. A missing attribute makes the
  condition false and silently denies that policy
  (`pkg/eval/evaluator_utils.go:178-186`).
- Use `request_year`, `request_month`, `request_day`, `request_hour` and `request_weekday`
  for calendar rules. `request_time` is populated as Unix seconds in this implementation
  (`pkg/eval/evaluator.go:230`).
- Do not use a condition to encode a resource hierarchy that a prefix expression can
  express; the expression is indexed, the condition is not.

### 6.4 Role rules

- Keep inheritance shallow: `executive -> manager -> employee` costs two extra role-policy
  rounds per request. A wide graph with redundant edges costs more.
- Give each role one purpose. If two roles always appear together, collapse them; if a role
  has two scopes, split it and use resource-scoped assignments.
- Use `on expr:` to scope a role to a department or resource family instead of duplicating
  the permission policy for each department. The role policy is indexed under the principal
  and resource, so it is not a scan.
- Avoid cycles: the evaluator detects some unsafe cycles and returns an evaluation error
  (`pkg/eval/evaluator.go:1000-1015`). Keep the graph acyclic by construction.
- Global roles are for cross-service assignments only. Do not put ordinary service roles in
  `global` to make them easier to find.

### 6.5 Deny rules

- Use a targeted deny for a real exception (`contractors cannot read confidential data`),
  not as a substitute for a narrow grant.
- A deny does not prevent the evaluator from collecting and evaluating the other candidates;
  it wins after evaluation (`pkg/eval/evaluator.go:1020-1062`;
  `pkg/eval/evaluator_utils.go:62-88`). Keep the deny's principal/resource narrow so it does
  not add work to every request.
- Prefer denying a role or a resource family over denying individual users; individual
  denies are hard to review.
- Do not write a deny that duplicates a grant condition. It adds a candidate and tells the
  reader nothing.

## 7. Worked example: the Northstar Health model

`examples/en/policies.spdl` and `examples/zh/policies.spdl` use:

- exact resources `/hr/handbook` and `/hr/directory`;
- prefix expressions for `/hr/employees/...`, `/hr/salary/...`, `/data/public/...`,
  `/data/internal/...`, `/data/internal/confidential/...`, `/expenses/...`,
  `/expenses/engineering/...`, `/finance/reports/department/...`,
  `/finance/reports/executive/...`, `/security/audit/...` and `/hr/payroll/...`;
- no general regex and no `expr:^.*$`;
- conditions only on policies that are already narrowed by role and resource.

That means each request's candidate set is built from hash-map and radix lookups; no regex
is scanned per request. `examples/en/model.md` records the per-policy index type and the
reason. When you generate a model, include the same table: it makes an expensive pattern
visible during review.

## 8. Anti-patterns

| Anti-pattern | Why it costs | Fix |
| --- | --- | --- |
| `grant role employee read expr:^.*$ if ...` | Every request considers it and evaluates the condition | Name the resource families and use prefixes |
| `expr:^/data/(public|internal)/.*$` | General regex scanned per request | Split into two prefix rules |
| A policy for `role everyone_role` on a hot resource | Every request matches the principal | Use an explicit cohort or a narrower role |
| A role per department plus a global permission per role | Deep graph and duplicate role policies | One role with `on expr:` scoped assignments |
| A condition on `department == request_resource` | String comparison cannot extract a path segment; usually wrong | Use separate resource prefixes or a PEP-supplied attribute |
| A custom function on a broad policy | Remote call for every candidate | Narrow the policy first; cache only safe results |
| Denying every action then granting a few | Deny candidate for every request; deny wins | Grant the few actions directly |
| Missing an attribute in the PEP | Silent denial or noisy logs | Document required attributes and test them |
