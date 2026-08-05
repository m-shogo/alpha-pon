# Code-Agent Handoffs

This directory stores executable handoffs from ChatGPT or Scheduled Tasks to Claude Code or Codex.

## Naming

```text
YYYY-MM-DD-<workstream>-<short-task>.md
```

## Required status

Each handoff starts with one of:

- `PENDING_MANUAL_LAUNCH`
- `CLAUDE_CODE_ACTIVE`
- `CODEX_ACTIVE`
- `PR_OPEN`
- `BLOCKED_EXTERNAL_ACTION`
- `COMPLETED`
- `SUPERSEDED`

## Rules

- Use [../prompts/code-agent-handoff-template.md](../prompts/code-agent-handoff-template.md).
- One branch and mutable workstream has one active executor.
- Do not assign the same handoff to Claude Code and Codex simultaneously.
- Record base SHA, branch, acceptance criteria, commands and protected paths.
- Link the resulting PR and CI evidence.
- Mark old handoffs `SUPERSEDED` rather than silently duplicating them.
- Do not include secret values, licensed market data or unsupported claims of executed work.
