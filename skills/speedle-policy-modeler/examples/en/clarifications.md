# Clarifications — English handbook run

The modeler reads the handbook first, then asks only the questions whose answers change a
policy decision. This file records the questions and the answers used for the synthetic run.
The answers are part of the sample input; a real run would get them from the document owner.

## Batch P0 — Scope and identity

1. Which service name should the model use, and which subject types does the application
   send?
   **Answer:** service `northstar_hr`; the request carries `user`, `group` and `entity`
   principals. The identity provider sends the groups `all_staff`, `hr`, `finance`,
   `security` and `contractors`.

2. Are the quarterly access review (9.3) and the written-exception process (9.2) enforced by
   this application?
   **Answer:** No. They are process controls. Record them as out of scope; do not encode
   them as policies.

3. Is `payroll_sync` a service account or a shared human login?
   **Answer:** A service account. Model it as the `entity` principal `payroll_sync`.

## Batch P1 — Resources and actions

1. What resource strings does the application send for the handbook, the directory, an
   employee record, salary data, an expense, a financial report, an audit log and a payroll
   run?
   **Answer:** `/hr/handbook`, `/hr/directory`, `/hr/employees/<id>`, `/hr/salary/<id>`,
   `/expenses/<department>/<id>`, `/finance/reports/department/<id>`,
   `/finance/reports/executive/<id>`, `/security/audit/<id>` and `/hr/payroll/<id>`. That is
   the complete set for this model.

2. Does the application distinguish `read`, `update` and `approve`, and are there other
   actions in scope?
   **Answer:** Yes. Those three are in scope. `create` and `delete` are out of scope for this
   model.

3. Is the employee record a parent of the salary resource?
   **Answer:** No. Salary is a separate resource (`/hr/salary/<id>`), not a child of the
   employee record. This is deliberate: salary has a narrower audience.

## Batch P2 — Roles and inheritance

1. Does the handbook's role hierarchy (3.8) apply literally, including `executive` including
   `manager` and `manager` including `employee`?
   **Answer:** Yes. Encode it as role inheritance, child first.

2. Is the engineering manager's `manager` role company-wide or limited to Engineering?
   **Answer:** Limited to Engineering (3.5 and 6.4). Use a resource-scoped role assignment
   for that user; do not create a second manager role.

3. Are the People Operations and Finance groups the source of the specialist roles, or are
   the roles assigned to named users?
   **Answer:** The groups are the source: `group hr` gets `hr_specialist` and `group finance`
   gets `finance_analyst`. Named users get the narrower additional roles (`hr_manager`,
   `payroll_admin`).

## Batch P3 — Attributes and conditions

1. Clause 4.4 says "at their own location". Should the check compare the employee record's
   `location` with the requester's `requester_location`, or only use the requester's
   location?
   **Answer:** Compare the record's `location` with `requester_location`. Both values come
   from the HR system, not from the caller.

2. Clause 5.1 says an employee may read their own record. How does the application identify
   "own"?
   **Answer:** The request includes an `owner` attribute for the record. The rule is
   `owner == request_user`. The application must derive `owner` from the record, not from the
   request body.

3. What should happen if an attribute such as `location`, `classification`, `owner` or
   `amount` is missing?
   **Answer:** The PEP rejects the request before calling ADS for actions that require the
   attribute. If a request reaches ADS without it, a silent denial is acceptable; the model
   does not define a fallback.

## Batch P4 — Exceptions and approvals

1. Clause 6.1 says "up to and including 5,000" and 6.2 says "5,000.01 through 25,000
   inclusive". Is 5,000.01 a literal boundary, or should the model use "more than 5,000"?
   **Answer:** Use manager `amount <= 5000`, finance `amount > 5000 && amount <= 25000`. The
   cent in the handbook is an artifact of the wording; the business boundary is 5,000.

2. Does the contractor exception in 4.3 apply to all Internal data or only the Confidential
   subset?
   **Answer:** Only the Internal data whose classification is Confidential. Contractors may
   still read Internal data that is not Confidential, and all Public data.

3. Are finance and executive approval authorities company-wide?
   **Answer:** Yes. Only the department manager's authority is department-scoped (6.4).

## Batch P5 — Tests and operation

1. What must the acceptance test prove?
   **Answer:** At least one allow and one deny per role, the location and classification
   branches, the approval boundaries (5,000 and 25,000), the contractor deny, the entity
   principal and the inheritance chains.

2. Which policy store is the target?
   **Answer:** The self-hosted `.spdl` file store. The file is the source of truth; runtime
   management writes are out of scope.

## Open questions

None. Every gap that could change a decision was answered above. The process controls in 9.2
and 9.3 remain out of scope by design, not by omission.
