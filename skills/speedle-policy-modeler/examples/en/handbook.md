# Northstar Health — Employee Handbook

**Synthetic sample.** Northstar Health is a fictional company. The people, departments,
locations and rules in this document exist only to exercise the Speedle policy modeler. Do
not use real employee data in a policy example.

**Document owner:** People Operations
**Version:** 3.2 (synthetic)
**Applies to:** the `northstar_hr` application

## 1. Purpose and scope

1.1 This handbook states who may access Northstar Health's people, finance and security
systems, and what they may do with that access. It covers employees, contractors and service
accounts.

1.2 This edition applies to the `northstar_hr` application. Access to other applications,
production infrastructure, physical premises and third-party services is out of scope.

1.3 Where this handbook conflicts with a legal or regulatory requirement, the legal
requirement wins. Exceptions are handled under section 9.

## 2. Organization

2.1 Northstar Health has five departments: People Operations (HR), Finance, Engineering,
Security and the Executive Office.

2.2 Job levels run from L1 to L6. L1–L3 are individual contributors, L4 is a manager, L5 is
a senior manager or director, and L6 is an executive.

2.3 Northstar Health has offices in London, Berlin and New York. An employee's location is
recorded in the identity provider.

2.4 Every employee is a member of the `all_staff` group. Contractors are members of the
`contractors` group and may also appear in `all_staff` so that they are visible in the
directory.

## 3. Identity and role assignment

3.1 Every employee is assigned the `employee` role.

3.2 People Operations staff are assigned the `hr_specialist` role. The HR lead is assigned
the `hr_manager` role in addition to `hr_specialist`.

3.3 Finance staff are assigned the `finance_analyst` role. Members of the payroll team are
assigned the `payroll_admin` role in addition to `finance_analyst`.

3.4 Security staff are assigned the `security_officer` role.

3.5 An engineering manager is assigned the `manager` role for the Engineering department
only. The assignment does not apply to other departments.

3.6 The Chief Executive and the direct reports to the Chief Executive are assigned the
`executive` role.

3.7 Contractors are assigned the `contractor` role. For the purpose of ordinary staff
resources, the contractor role includes the employee role. Section 4.3 states the exception
for confidential data.

3.8 Role hierarchy: `hr_manager` includes `hr_specialist`; `hr_specialist`,
`finance_analyst`, `payroll_admin`, `security_officer`, `manager` and `contractor` include
`employee`; `executive` includes `manager`. A person with a role also has the permissions of
the roles it includes.

## 4. Data classification and access

4.1 Northstar Health uses four data classes: Public, Internal, Confidential and Restricted.
The class is recorded with each resource.

4.2 Employees may read Public and Internal data.

4.3 Contractors may read Public data. They may not read Internal data that is marked
Confidential. This is an explicit exception to the employee access in 4.2 and overrides it.

4.4 HR specialists may read employee records at their own location. They may not read a
record marked Restricted. "At their own location" means the location recorded on the employee
record matches the HR specialist's location.

4.5 HR managers may read all employee records, including records marked Restricted. They may
update employee records other than Restricted records. They may read salary data.

4.6 Payroll administrators may read and update salary data.

4.7 Salary data is not part of the ordinary employee record for access purposes. It is a
separate salary resource for each employee.

## 5. Employee records and privacy

5.1 An employee may read their own employee record. An employee may not read another
employee's record unless another section of this handbook grants that access.

5.2 The employee directory is available to all employees.

5.3 This handbook is available to all employees.

## 6. Approvals and spending

6.1 A department manager may approve expenses in their own department up to and including
5,000.

6.2 A finance analyst may approve expenses from 5,000.01 through 25,000 inclusive.

6.3 An executive may approve expenses above 25,000.

6.4 A department manager's approval authority is limited to their own department. Finance
and executive approval authority is company-wide.

## 7. Finance and security reporting

7.1 Finance analysts may read department financial reports.

7.2 Executives may read executive financial reports.

7.3 Security officers may read audit logs.

## 8. Service accounts

8.1 The `payroll_sync` service account may read and update payroll runs. No human employee
is assigned this access.

## 9. Exceptions and review

9.1 An explicit denial in an access policy overrides any grant in this handbook.

9.2 Exceptions to this handbook require written approval from the Head of People and the
Chief Security Officer. Every exception must be time-limited and recorded in the access
review log.

9.3 Access is reviewed quarterly by the system owner. The review is a process, not an
authorization rule.

## 10. Acceptance examples

These examples are illustrative, not exhaustive. The authorization model is expected to
satisfy all of them.

10.1 A London HR specialist may read a London employee record marked Internal. The same
specialist may not read a Berlin record or a Restricted record.

10.2 A manager may approve an Engineering expense of 4,000. The same manager may not approve
a Sales expense or an Engineering expense of 6,000.

10.3 A finance analyst may approve 6,000 but not 30,000. An executive may approve 30,000.

10.4 A contractor may read the handbook but may not read Internal Confidential data.

10.5 The `payroll_sync` service account may read a payroll run. An employee may not.

10.6 An HR manager may read salary data. An HR specialist may not.
