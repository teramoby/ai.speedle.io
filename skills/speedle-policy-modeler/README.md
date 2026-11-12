# Install and use

Ask your agent:

```text
Install this skill for me: https://github.com/teramoby/ai.speedle.io/tree/main/skills/speedle-policy-modeler
```

Install the **entire** `skills/speedle-policy-modeler` directory from this
repository, including `SKILL.md`, `references/`, `templates/`, `scripts/`,
`examples/` and `tests/`. No files elsewhere in this repository are needed
for a direct skill install. Do not copy only `SKILL.md`.

| Agent | Destination | Invocation after installation |
| --- | --- | --- |
| Claude Code | `~/.claude/skills/speedle-policy-modeler/` | `/speedle-policy-modeler ./employee-handbook.md` |
| Codex | `~/.agents/skills/speedle-policy-modeler/` | `$speedle-policy-modeler ./employee-handbook.md` |

Restart the agent if the skill is not listed. These paths and invocations follow
[Claude Code skills](https://code.claude.com/docs/en/skills) and
[Codex skills](https://learn.chatgpt.com/docs/build-skills).

The skill itself needs no API key and does not install or configure an MCP
server. To validate generated policies, install Speedle's `spctl`, `speedle-pms`
and `speedle-ads`, plus Python 3. On macOS set `SPEEDLE_SPCTL` to the Speedle CLI
path so validation does not select Apple's `/usr/sbin/spctl`. See
[SKILL.md](SKILL.md) and [the validation reference](references/spdl-and-import.md)
for the workflow.

## Manual installation

Clone the repository, then copy the complete skill directory to the destination
above. For example, in Codex:

```sh
git clone --depth 1 https://github.com/teramoby/ai.speedle.io.git
mkdir -p ~/.agents/skills
cp -R ai.speedle.io/skills/speedle-policy-modeler ~/.agents/skills/
```

For Claude Code use `~/.claude/skills/` instead. Check for an existing
`speedle-policy-modeler` directory before copying; do not overwrite an existing
installation without reviewing it.

Alternatively, the Claude Code marketplace plugin installs both the skill and a
check MCP server. Its invocation is `/speedle:speedle-policy-modeler`, with the
plugin namespace. See the [repository README](../../README.md#install-in-claude-code)
for marketplace commands and `/plugin configure speedle@speedle`: configure the
ADS endpoint and service name, and set a bearer token only when ADS requires one.
The direct directory install above uses `/speedle-policy-modeler` and requires
no plugin configuration.
