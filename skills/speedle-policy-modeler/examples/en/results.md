# Validation results — English example

Run date: 2026-11-06
Speedle source: `teramoby/speedle-plus` master at
`490a21a0ea87d80b244db8435a25314b6a24cfbc`
Toolchain: `go1.27.3 darwin/arm64`; macOS 27.0.1
Model: `policies.spdl` (1 service, 18 authorization policies, 17 role policies)
Cases: `test-cases.json` (37 cases)

## Commands

```bash
# From this directory
spctl check -f policies.spdl

# Starts PMS and ADS on free loopback ports, runs all cases, stops both servers
../../scripts/validate-model.sh policies.spdl test-cases.json \
  --spctl /path/to/speedle-plus/bin/spctl \
  --pms /path/to/speedle-plus/bin/speedle-pms \
  --ads /path/to/speedle-plus/bin/speedle-ads
```

The validation script only reads the `.spdl` file. It is a file-store import, not a
management write. Both servers were stopped by the script's exit trap; no process was left
running.

## `spctl check` output

```text
policies.spdl: OK, 1 service(s), 18 policies, 17 role policies
```

## End-to-end output

```text
==> spctl check -f policies.spdl
policies.spdl: OK, 1 service(s), 18 policies, 17 role policies
==> starting PMS on 127.0.0.1:55583 and ADS on 127.0.0.1:55584
==> running test cases against ADS
service: northstar_hr
cases:   37
PASS T01 An employee reads the handbook
     expected allowed=true reason=GRANT_POLICY_FOUND (0); got allowed=true reason=GRANT_POLICY_FOUND (0)
PASS T02 An employee reads their own employee record
     expected allowed=true reason=GRANT_POLICY_FOUND (0); got allowed=true reason=GRANT_POLICY_FOUND (0)
PASS T03 An employee cannot read another employee's record
     expected allowed=false reason=NO_APPLICABLE_POLICIES (3); got allowed=false reason=NO_APPLICABLE_POLICIES (3)
PASS T04 An HR specialist reads a non-restricted record at their own location
     expected allowed=true reason=GRANT_POLICY_FOUND (0); got allowed=true reason=GRANT_POLICY_FOUND (0)
PASS T05 An HR specialist cannot read a record at another location
     expected allowed=false reason=NO_APPLICABLE_POLICIES (3); got allowed=false reason=NO_APPLICABLE_POLICIES (3)
PASS T06 An HR specialist cannot read salary data
     expected allowed=false reason=NO_APPLICABLE_POLICIES (3); got allowed=false reason=NO_APPLICABLE_POLICIES (3)
PASS T07 An HR manager reads salary data
     expected allowed=true reason=GRANT_POLICY_FOUND (0); got allowed=true reason=GRANT_POLICY_FOUND (0)
PASS T08 An HR manager updates a non-restricted record
     expected allowed=true reason=GRANT_POLICY_FOUND (0); got allowed=true reason=GRANT_POLICY_FOUND (0)
PASS T09 An HR manager cannot update a restricted record
     expected allowed=false reason=NO_APPLICABLE_POLICIES (3); got allowed=false reason=NO_APPLICABLE_POLICIES (3)
PASS T10 A payroll admin updates salary data
     expected allowed=true reason=GRANT_POLICY_FOUND (0); got allowed=true reason=GRANT_POLICY_FOUND (0)
PASS T11 A finance analyst reads a department report
     expected allowed=true reason=GRANT_POLICY_FOUND (0); got allowed=true reason=GRANT_POLICY_FOUND (0)
PASS T12 A finance analyst cannot read an executive report
     expected allowed=false reason=NO_APPLICABLE_POLICIES (3); got allowed=false reason=NO_APPLICABLE_POLICIES (3)
PASS T13 An executive reads an executive report
     expected allowed=true reason=GRANT_POLICY_FOUND (0); got allowed=true reason=GRANT_POLICY_FOUND (0)
PASS T14 A department manager approves an expense within their department and limit
     expected allowed=true reason=GRANT_POLICY_FOUND (0); got allowed=true reason=GRANT_POLICY_FOUND (0)
PASS T15 A department manager cannot approve another department's expense
     expected allowed=false reason=NO_APPLICABLE_POLICIES (3); got allowed=false reason=NO_APPLICABLE_POLICIES (3)
PASS T16 A department manager cannot approve above 5000
     expected allowed=false reason=NO_APPLICABLE_POLICIES (3); got allowed=false reason=NO_APPLICABLE_POLICIES (3)
PASS T17 A finance analyst approves between 5000 and 25000
     expected allowed=true reason=GRANT_POLICY_FOUND (0); got allowed=true reason=GRANT_POLICY_FOUND (0)
PASS T18 A finance analyst cannot approve above 25000
     expected allowed=false reason=NO_APPLICABLE_POLICIES (3); got allowed=false reason=NO_APPLICABLE_POLICIES (3)
PASS T19 An executive approves above 25000
     expected allowed=true reason=GRANT_POLICY_FOUND (0); got allowed=true reason=GRANT_POLICY_FOUND (0)
PASS T20 Explicit deny blocks a contractor from confidential internal data
     expected allowed=false reason=DENY_POLICY_FOUND (1); got allowed=false reason=DENY_POLICY_FOUND (1)
PASS T21 An employee reads confidential internal data
     expected allowed=true reason=GRANT_POLICY_FOUND (0); got allowed=true reason=GRANT_POLICY_FOUND (0)
PASS T22 A security officer reads audit logs through inherited employee status
     expected allowed=true reason=GRANT_POLICY_FOUND (0); got allowed=true reason=GRANT_POLICY_FOUND (0)
PASS T23 A security officer cannot read salary data
     expected allowed=false reason=NO_APPLICABLE_POLICIES (3); got allowed=false reason=NO_APPLICABLE_POLICIES (3)
PASS T24 The payroll sync entity reads a payroll run
     expected allowed=true reason=GRANT_POLICY_FOUND (0); got allowed=true reason=GRANT_POLICY_FOUND (0)
PASS T25 A human employee cannot read payroll runs
     expected allowed=false reason=NO_APPLICABLE_POLICIES (3); got allowed=false reason=NO_APPLICABLE_POLICIES (3)
PASS T26 An HR manager reads a record without location or classification conditions
     expected allowed=true reason=GRANT_POLICY_FOUND (0); got allowed=true reason=GRANT_POLICY_FOUND (0)
PASS T27 An HR specialist cannot read a restricted record
     expected allowed=false reason=NO_APPLICABLE_POLICIES (3); got allowed=false reason=NO_APPLICABLE_POLICIES (3)
PASS T28 Executive inherits manager and employee
     expected allowed=true reason=GRANT_POLICY_FOUND (0); got allowed=true reason=GRANT_POLICY_FOUND (0)
PASS T29 A contractor can read the handbook but not confidential data
     expected allowed=true reason=GRANT_POLICY_FOUND (0); got allowed=true reason=GRANT_POLICY_FOUND (0)
PASS T30 Another employee reads the handbook
     expected allowed=true reason=GRANT_POLICY_FOUND (0); got allowed=true reason=GRANT_POLICY_FOUND (0)
PASS T31 An employee reads public data
     expected allowed=true reason=GRANT_POLICY_FOUND (0); got allowed=true reason=GRANT_POLICY_FOUND (0)
PASS T32 A contractor reads public data
     expected allowed=true reason=GRANT_POLICY_FOUND (0); got allowed=true reason=GRANT_POLICY_FOUND (0)
PASS T33 A manager's approval limit includes 5000
     expected allowed=true reason=GRANT_POLICY_FOUND (0); got allowed=true reason=GRANT_POLICY_FOUND (0)
PASS T34 A manager cannot approve 5000.01
     expected allowed=false reason=NO_APPLICABLE_POLICIES (3); got allowed=false reason=NO_APPLICABLE_POLICIES (3)
PASS T35 A finance analyst's limit includes 25000
     expected allowed=true reason=GRANT_POLICY_FOUND (0); got allowed=true reason=GRANT_POLICY_FOUND (0)
PASS T36 A finance analyst cannot approve 25000.01
     expected allowed=false reason=NO_APPLICABLE_POLICIES (3); got allowed=false reason=NO_APPLICABLE_POLICIES (3)
PASS T37 An employee reads the employee directory
     expected allowed=true reason=GRANT_POLICY_FOUND (0); got allowed=true reason=GRANT_POLICY_FOUND (0)

37/37 cases passed
==> all checks passed
```

## Result

All 37 documented cases pass against a local PMS and ADS loaded from the same `.spdl` file.
`spctl check` exits 0. The two deny reasons are distinguishable: T20 returns
`DENY_POLICY_FOUND` (1) because the explicit contractor deny matched; the other denials return
`NO_APPLICABLE_POLICIES` (3) because no grant matched.
