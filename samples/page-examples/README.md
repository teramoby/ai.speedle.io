# Patterns page SPDL examples

This directory contains the seven SPDL blocks shown on the [English](https://ai.speedle.io/patterns/)
and [Chinese](https://ai.speedle.io/zh/patterns/) patterns pages. Each
`<name>/<name>.spdl` file is byte-identical to its decoded
`<pre data-spdl="<name>">` block, apart from the file's final newline.
`node scripts/check-seo.mjs` checks the files against the English patterns page
and checks that both patterns pages carry identical blocks. The home pages link
the full examples here and keep one representative rule per area.

| Example | Service | Cases |
| --- | --- | ---: |
| `training` | `ml-training` | 7 |
| `release` | `model-registry` | 6 |
| `rag` | `rag` | 6 |
| `agents` | `crm` | 9 |
| `mcp` | `mcp-gateway` | 6 |
| `a2a` | `a2a` | 5 |
| `zsp` | `zsp` | 8 |

Every directory has a `test-cases.json` in the policy-modeler schema, with allow
and deny decisions. The 47 cases cover explicit denies, condition boundaries,
missing attributes, and PEP attributes overriding built-ins. In particular, the
fixed `request_time` attributes make the delegation and ZSP cases deterministic.
A condition that references a missing attribute does not match; the tests do not
treat that as an engine error.

## Validate

Build `spctl`, `speedle-pms` and `speedle-ads` from a speedle-plus checkout, and
build the existing ZSP demo from this repository. Put all four binaries in one
scratch directory, then run the single validation entry point:

```bash
mkdir -p /tmp/speedle-page-examples
# From the speedle-plus checkout:
go build -o /tmp/speedle-page-examples/ ./cmd/spctl ./cmd/speedle-pms ./cmd/speedle-ads
# From this repository's root:
go -C samples/zsp build -o /tmp/speedle-page-examples/zsp-demo .
PATH=/tmp/speedle-page-examples:$PATH samples/page-examples/validate.sh
```

Alternatively, set `SPCTL`, `SPEEDLE_PMS`, `SPEEDLE_ADS` and `ZSP_DEMO` to the
binary paths. The script calls
`skills/speedle-policy-modeler/scripts/validate-model.sh` for every example.

The ZSP policy calls the custom `TokenUnused` function. Because that function is
defined in the policy store rather than in SPDL, the script starts the existing
`samples/zsp` demo, converts a scratch copy of the SPDL through PMS, registers
the function, and runs the same validation script against the resulting JSON
store. The checked-in SPDL is never modified. All servers listen on loopback
and are stopped when validation finishes.
