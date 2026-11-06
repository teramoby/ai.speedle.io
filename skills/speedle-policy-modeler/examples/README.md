# Examples

Two complete runs of the skill on synthetic employee handbooks: one English, one Chinese.
They use the same fictional company and the same model so the outputs can be compared, but
each run was driven by its own handbook and its own clarification record.

| Directory | Source | Model document | SPDL | Tests | Results |
| --- | --- | --- | --- | --- | --- |
| `en/` | `handbook.md` | `model.md` | `policies.spdl` | `test-cases.json` | `results.md` |
| `zh/` | `handbook.md` | `model.md` | `policies.spdl` | `test-cases.json` | `results.md` |

Each directory also has `clarifications.md`, the question-and-answer record used for that run.

## What the example demonstrates

- **RBAC:** a shallow role hierarchy (`executive -> manager -> employee`,
  `hr_manager -> hr_specialist -> employee`, `payroll_admin -> finance_analyst -> employee`,
  `security_officer -> employee`, `contractor -> employee`).
- **Resource-scoped roles:** the engineering manager gets `manager` only for
  `/expenses/engineering/...`, not for the whole company.
- **ABAC:** owner, location, classification and amount conditions, with missing-attribute
  behavior documented.
- **Explicit deny:** contractors inherit employee access, then a narrow deny removes Internal
  Confidential data.
- **Entity principals:** `payroll_sync` is a service account, not a human role.
- **Efficiency:** all resource expressions are exact names or prefix expressions; there is no
  general regex and no catch-all. The model document records the index type for every policy.
- **Executable evidence:** both runs pass `spctl check` and 37/37 end-to-end cases against a
  local PMS + ADS. The exact output is in each `results.md`.

## Reproduce a run

Build the Speedle binaries with the quick-start, or point the validator at an existing build:

```bash
git clone --depth 1 https://github.com/teramoby/speedle-plus.git
cd speedle-plus
mkdir -p bin
go build -o ./bin/ ./cmd/spctl ./cmd/speedle-pms ./cmd/speedle-ads
```

From either example directory:

```bash
spctl check -f policies.spdl
../../scripts/validate-model.sh policies.spdl test-cases.json \
  --spctl /path/to/speedle-plus/bin/spctl \
  --pms /path/to/speedle-plus/bin/speedle-pms \
  --ads /path/to/speedle-plus/bin/speedle-ads
```

The script picks free loopback ports, starts PMS and ADS against the same `.spdl` file, runs
every case, and stops both servers on exit. It never writes to the model.

## A note on language

The documents are written in the language of their source. The SPDL identifiers (service,
roles, resources, actions, attribute names and the `classification` values) stay in ASCII so
they survive quoting, clients and logs. The model documents explain those identifiers in the
document's language. This is the convention the skill recommends, not a limitation of SPDL.

## Synthetic data

Northstar Health, its people, departments and rules are fictional. Do not use real employee
data in a policy example. If you adapt these files, replace the principals and resource IDs
before sharing them.
