# Clarification playbook

The document is the source of truth, but handbooks and regulations leave gaps. A gap that
changes an authorization decision must become a question, not an assumption. Ask in the
order below; stop a batch as soon as the next modeling step is unblocked. At most three
numbered questions in one message. For each question give the reason and a recommended
default taken from the document.

## How to ask

Use this shape:

```text
Before I write the policies, three points from the handbook are ambiguous:

1. Clause 4.4 says HR specialists read records "at their own location". Should the check
   compare the record's location with the requester's location, or is the HR specialist's
   location the only input? This changes which attribute the PEP must send.
   Recommended: compare record `location` with `requester_location`; both are supplied by
   the HR system, not by the caller.

2. Clause 6.2 gives finance analysts 5,000.01–25,000. Is 5,000.01 a deliberate boundary,
   or should it be "more than 5,000"? The current text leaves a one-cent gap if a manager
   limit is 5,000.
   Recommended: manager `amount <= 5000`, finance `amount > 5000 && amount <= 25000`.

3. Clause 8.1 gives `payroll_sync` access to payroll runs. Is it a service account
   (entity), or a human operator using a shared account? This changes the principal type
   and the audit trail.
   Recommended: entity principal `payroll_sync`.
```

Rules:

- Number the questions. Keep them independent so the user can answer one and skip another.
- State the clause or the missing section that raises the question.
- Explain the policy consequence, not just the ambiguity.
- Recommend a default and say what happens if the user does not decide.
- Do not ask a question whose answer is in the document. Quote the clause instead.
- Do not ask more than three at once. If a batch has more, split it.
- Wait for the answer before generating the affected policies. You may continue inventory
  work that does not depend on it.
- Repeat the user's answer back in `clarifications.md`; do not paraphrase away a boundary
  (`<` vs `<=`) or a principal type.

## Batch P0 — Scope and identity

Ask when you cannot name the service, the subjects or the boundary of the model.

1. Which application or service will call Speedle, and what service name should the model
   use? This is the `serviceName` in every request and the `[service.NAME]` section.
2. Which subject types exist in the request: users, IdP groups, service accounts (entities),
   or a mix? Which groups are actually sent by the identity provider? A role assignment to a
   group that is never sent will never match.
3. What is explicitly out of scope: other services, non-production access, physical access,
   approval workflows that happen outside the application? This prevents inventing policies
   for rules the system does not enforce.

## Batch P1 — Resources and actions

Ask when a clause names an object but not a stable resource identifier, or uses a verb that
does not map to an action.

1. What resource identifier will the PEP send for "employee record", "salary", "expense" or
   the other protected objects? Is there an existing naming scheme?
2. Is there a hierarchy or a family? For example, is every expense under
   `/expenses/<department>/<id>`, or is the department only an attribute?
3. Which actions does the application expose, and how do they map to the document's verbs
   (view, edit, approve, export, delete)? Do not merge actions the application distinguishes.

## Batch P2 — Roles and inheritance

Ask when the document implies a role but does not say who gets it, or says "manager" without
saying manager of what.

1. Which roles does the business use, and who assigns each one? Is the assignment from the
   IdP group, from an HR system, or from a Speedle administrator?
2. Is a role company-wide or limited to a department, location or resource? If limited, what
   resource expression identifies the scope?
3. Which roles include another role's permissions? For example, does a manager also have all
   employee permissions? State the direction: the child role inherits the parent.

## Batch P3 — Attributes and conditions

Ask when a condition needs a value the request does not obviously carry.

1. Which attributes does the PEP send for this rule (department, location, classification,
   owner, amount, on-call status)? What are their types?
2. Where does each value come from, and can the caller influence it? An attribute taken from
   the request body without validation is not a trust boundary.
3. What should happen when an attribute is missing or malformed: deny this policy, reject the
   request, or fall back to a default? Speedle treats a missing attribute as a non-matching
   condition; confirm that is the intended behavior.

## Batch P4 — Exceptions and approvals

Ask when a clause says "except", "unless", "may approve", or gives a threshold.

1. What is the exact boundary: "up to and including 5,000" (`<= 5000`) or "below 5,000"
   (`< 5000`)? Is the next tier `> 5000` or `>= 5000`?
2. Is the authority scoped to the approver's department, location or cost centre? Does a
   finance or executive approval apply company-wide?
3. Is the exception permanent (a role or data class) or temporary (break-glass, delegated
   approval)? Temporary access needs an expiry or a process; a static policy cannot expire
   by itself.

## Batch P5 — Tests and operation

Ask when the model is ready but the acceptance criteria or deployment path is unclear.

1. Which decisions must the acceptance test prove? Give at least one allow and one deny per
   role, plus the boundary cases.
2. Which policy store is the target: a self-hosted `.spdl` file, a JSON file, etcd, MySQL or
   MongoDB? The `.spdl` path is read-only for management writes; a JSON or database store
   supports runtime changes.
3. Who operates the service, and how are policy changes reviewed and rolled out? This
   determines whether the model should include a change log and a reload procedure.

## Assumption log

When the user delegates a decision or cannot answer, record it in `clarifications.md` and in
`model.md`:

| ID | Question | Decision | Decided by | Date | Affects |
| --- | --- | --- | --- | --- | --- |
| A1 | Is `payroll_sync` an entity or a human? | Entity, per the integration owner | user | 2026-11-06 | P-17, T-24 |
| A2 | What happens if `classification` is missing? | Deny; PEP must send it | user | 2026-11-06 | P-04, T-27 |
| A3 | Is the approval boundary inclusive? | `<= 5000` for managers | modeler recommendation, not confirmed | — | P-12, T-33 |

An assumption with "not confirmed" is an open question; do not claim the model is complete
until the user resolves it or accepts the risk in writing.

## 中文提问模板

中文文档用中文提问，编号不超过三个，每个问题说明它影响哪条策略，并给出建议默认值。

```text
在生成策略前，手册里有三点需要确认：

1. 第 4.4 条写“HR 专员可以读取本工作地点的员工档案”。这里的“本工作地点”是比较
   档案上的 location 和请求人的 requester_location，还是只看请求人的地点？这决定
   PEP 需要传哪个属性。
   建议：比较档案的 location 与 requester_location，两个值都由 HR 系统提供，不能由
   调用方自行填写。

2. 第 6.2 条写财务分析师审批 5,000.01–25,000。5,000.01 是刻意设置的边界，还是想表达
   “超过 5,000”？如果经理上限是 5,000，按现在的写法会出现一分钱的空档。
   建议：经理 `amount <= 5000`，财务 `amount > 5000 && amount <= 25000`。

3. 第 8.1 条让 payroll_sync 读取薪资批次。它是服务账号（entity），还是共用人名的
   人工操作？这决定主体类型和审计方式。
   建议：使用 entity 主体 payroll_sync。
```

中文追问规则：

- 先问主体和范围，再问资源和动作，然后问角色、属性、例外和测试。
- 引用具体条款号，不要问手册已经写清楚的内容。
- 明确区分“包含边界”和“不包含边界”（`<=` 与 `<`）。
- 用户回答后，把原话和最终决定写进 `clarifications.md`；不要让“大概”“应该”变成
  策略里的确定规则。
- 用户无法回答时，写入“待确认问题”，不要自行补一条策略。
