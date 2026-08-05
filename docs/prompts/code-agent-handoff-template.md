# Alpha Pon Code-Agent Handoff Template

Use this template when work must move from ChatGPT or a Scheduled Task to Claude Code or Codex.

Replace every `<...>` placeholder before use. Keep the entire handoff in one copy-paste prompt.

---

You are the implementation executor for `m-shogo/alpha-pon`.

Executor: `<claude-code|codex>`
Repository: `https://github.com/m-shogo/alpha-pon`
Local checkout: `<absolute path or unknown>`
Base branch: `<branch>`
Measured base SHA: `<sha>`
Work branch: `<new branch name>`

## Goal

<One precise implementation goal.>

## Why this was handed off

<Explain which required capability is unavailable to ChatGPT/Scheduled Tasks: local uncommitted state, shell/tests, multi-file refactor, local DB, browser/dashboard, credentials, heavy computation, etc.>

## Current confirmed state

- <Measured fact 1>
- <Measured fact 2>
- <Unresolved blocker>

Do not treat conversation memory as authoritative. Re-measure repository and local state before editing.

## First commands

Run and preserve the output of:

```bash
git status --short --branch
git stash list
git log --oneline --decorate -20
git diff --stat
git diff
```

If the measured branch/SHA differs from the handoff, explain the difference and safely rebase the plan on current state. Do not discard work.

## Local-change protection

- Never run destructive `reset --hard`, `clean -fd`, broad `restore`, or checkout-overwrite commands on unknown changes.
- Protect uncommitted work on a dedicated branch before implementation.
- Keep existing stash entries until the replacement work is committed, pushed and CI is green.
- Inspect generated files and temporary directories before committing them.
- Do not expose secrets or credential values.

## Read before editing

- `docs/roadmaps/alpha-pon-current-roadmap-2026-08-05.md`
- `docs/operations/agent-work-routing.md`
- `research/README.md`
- `docs/research/research-os-spec.md`
- `docs/prompts/hourly-research.md`
- `<task-specific file 1>`
- `<task-specific file 2>`

## Scope

### Inspect and change

- `<path>`
- `<path>`

### Do not touch

- `<path or subsystem>`
- Production thresholds unless explicitly required.
- Secret values, D1 bootstrap/migrations/tokens, Access or billing as unrelated workarounds.
- Research Gate states without evidence.

## Required implementation sequence

1. <Step 1>
2. <Step 2>
3. <Step 3>
4. Add or update tests.
5. Run the required validation commands.
6. Review the final diff for scope, secrets, generated-file provenance and destructive changes.
7. Commit in small coherent slices and push the branch.
8. Open a PR with measured evidence and remaining blockers.

## Acceptance criteria

- [ ] <Functional criterion>
- [ ] <Failure-mode criterion>
- [ ] <Security/PIT/licensing criterion>
- [ ] <Compatibility criterion>
- [ ] No unrelated files changed.

## Required validation

Run at minimum:

```bash
<command 1>
<command 2>
<command 3>
```

Do not report a command as passed unless you ran it and captured the result.

## Boundaries

- No automatic live trading.
- No fabricated market results or deployment state.
- Separate new facts, known facts, assumptions and opinion.
- Do not commit licensed market data without redistribution rights.
- Do not use SNS, forums, anonymous posts, influencers or social sentiment as Research OS evidence.
- Stop only for a real external blocker such as missing credentials, inaccessible browser dashboard, unavailable local data or an explicit human decision.

## Final report format

Return exactly:

1. Start SHA / final SHA / branch / PR.
2. Changed files and purpose.
3. Commands run and exact pass/fail summary.
4. Bugs or risks found and how they were handled.
5. External actions still required.
6. Remaining blockers.
7. Exact next action for ChatGPT review.

Do not leave the work only in an uncommitted local state.