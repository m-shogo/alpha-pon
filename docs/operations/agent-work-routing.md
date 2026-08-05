# Alpha Pon Agent Work Routing Policy

Status: `ACTIVE`
Updated: 2026-08-05 JST

This policy defines how work is divided between interactive ChatGPT, ChatGPT Scheduled Tasks, Claude Code and Codex. It applies to Alpha Pon planning, research, implementation, reviews and operational follow-up.

## 1. Core rules

1. GitHub is the source of truth. Conversation memory is not authoritative.
2. Use one owner per branch or mutable workstream. Do not let ChatGPT, Claude Code and Codex edit the same files concurrently.
3. Scheduled Tasks orchestrate research; they do not pretend to have run local commands or external code agents.
4. Work that requires local files, a shell, credentials, a browser dashboard, long-running execution, large refactors or heavy data must be handed to Claude Code or Codex.
5. Every handoff must be executable from one copy-paste prompt and must leave a Git checkpoint.
6. Never fabricate command output, CI state, market data, deployment state or completion.

## 2. Role matrix

| Actor | Primary responsibilities | Must not claim or do |
| --- | --- | --- |
| Interactive ChatGPT | GitHub orientation, roadmap, issue/PR triage, official-source research, architecture, review, small connector-backed edits, handoff generation | Local uncommitted-file inspection without a local tool, local builds/tests, browser-only Cloudflare log inspection, heavy backfills |
| ChatGPT Scheduled Tasks | Bounded P0 scan, read Queue/Checkpoint, advance one research slice, persist Research Log/Checkpoint, create/update a handoff when code execution is required, material notifications | Launch Claude Code/Codex automatically, run local shell work, silently repeat blocked work every hour |
| Claude Code | Mac-local repository work, stash/branch protection, multi-file implementation, tests/builds, local DB/archive work, scripts, self-hosted runner work, Cloudflare CLI where credentials exist | Change research conclusions or promote an Edge without evidence and human review |
| Codex | Scoped implementation, refactoring, tests, CI fixes, repository automation, PR-ready code changes; may substitute for Claude Code when it has the required checkout and tools | Work concurrently on the same branch/files as Claude Code; invent external execution results |
| GitHub Actions | Deterministic validation, generated artifacts, CI, safe scheduled collectors and resumable machine jobs | Create research hypotheses, make investment decisions or promote an Edge automatically |

Claude Code and Codex are implementation peers. Choose one executor for each handoff based on available environment, context window and repository access. The handoff contract is the same for both.

## 3. Mandatory routing triggers

Hand work to Claude Code or Codex when any condition below is true:

- The required state exists only on the Mac checkout, including uncommitted changes or stash contents.
- The task needs `git status`, `git diff`, shell commands, package installation, tests, build, lint or typecheck.
- The task changes multiple related implementation files or requires a refactor/migration.
- The task needs local database, archive, sidecar, licensed market data or self-hosted runner access.
- The task needs Cloudflare Dashboard/browser-only logs, local credentials or external interactive authentication.
- The task involves a heavy backfill, event study, historical join or long-running computation.
- The scheduled task has hit the same blocker twice without new evidence.
- Safe completion requires protecting local changes before editing.

Interactive ChatGPT may still define requirements, review the diff/PR and verify official evidence.

## 4. Scheduled-task behavior

Use one hourly ChatGPT research orchestrator, not one schedule per Edge.

When the cycle can be completed with available tools:

1. Read the latest Queue and Checkpoint.
2. Perform the bounded official-source scan.
3. Advance one research slice.
4. Persist Research Log and Checkpoint.
5. Notify only if material.

When the cycle requires unavailable execution:

1. Do not mark the task complete.
2. Do not claim Claude Code or Codex has been started.
3. Create or update a handoff using `docs/prompts/code-agent-handoff-template.md`.
4. Record the handoff path or GitHub Issue/PR reference in the Research Log/Checkpoint.
5. Set the next action to review the resulting commit/PR, not to restart the same implementation from scratch.
6. Notify the user only when the handoff requires manual launch, credentials, a dashboard action or a decision.

A Scheduled Task cannot directly launch external Claude Code or Codex in the current operating model. The durable bridge is GitHub plus a copy-paste handoff prompt.

## 5. Handoff contract

Every code-agent handoff must include:

- Repository and local checkout path.
- Exact base branch and measured base SHA.
- Goal and why the handoff is needed.
- Current confirmed state and unresolved blocker.
- Files/directories to inspect.
- Files/directories that must not be touched.
- Local-change and stash protection rules.
- Required implementation sequence.
- Acceptance criteria and required commands.
- Security, PIT, licensing and production boundaries.
- Commit strategy: small coherent commits.
- PR requirements and expected final report.
- Stop conditions limited to real external blockers.

The executor must finish by recording:

- start SHA and final SHA,
- branch and PR,
- changed files,
- tests/checks and exact results,
- unresolved blockers,
- next action,
- whether any external credential/dashboard action remains.

## 6. Concurrency and ownership

- One branch has one active code-agent owner.
- ChatGPT may review while Claude Code or Codex implements, but must not mutate overlapping files.
- Claude Code and Codex must never work concurrently on the same branch.
- Separate workstreams may run in parallel only when their mutable paths do not overlap and the dependency order is explicit.
- Generated files must be regenerated by the canonical command; do not hand-edit them unless the repository contract explicitly requires committing deterministic generated output.

Recommended labels in handoff text:

- `owner: chatgpt-scheduled`
- `owner: claude-code`
- `owner: codex`
- `reviewer: chatgpt`
- `blocked: external-action`

## 7. Executor selection

Prefer Claude Code when:

- The Mac-local checkout or stash is central.
- A long repository-wide implementation needs broad context.
- Local DB/archive/self-hosted runner operations are required.

Prefer Codex when:

- The task is a sharply scoped implementation or CI repair.
- Tests and code changes are well specified.
- A PR-ready patch can be produced without broad exploratory work.

Either is valid if it has the required environment. Do not duplicate the same handoff to both.

## 8. Review and merge policy

After Claude Code or Codex finishes:

1. ChatGPT reads the PR, diff, review comments and CI.
2. Verify the implementation against the handoff acceptance criteria.
3. Distinguish code correctness, data validity and external deployment state.
4. Do not merge with failing required checks.
5. Do not treat Cloudflare bot failure as equivalent to application-test failure without reading the relevant deployment log.
6. Merge only when scope is coherent and local-only secrets/data have not leaked.
7. Update roadmap/checkpoint and close or supersede the handoff.

## 9. Alpha Pon-specific safety boundaries

- No automatic live trading.
- No Edge promotion without all evidence-backed Production Gates and human approval.
- No SNS/forum/influencer evidence in Research OS.
- No secret values in Git, logs, reports or handoff prompts.
- No licensed market data in Git without redistribution rights.
- No reset/clean/restore of unknown local changes.
- No D1 bootstrap, migration, token recreation or Access/billing changes as an unrelated workaround.
- New facts, known facts, assumptions and opinion must remain separate.

## 10. Completion definition

The routing policy is working when:

- The schedule advances research without repeatedly stalling on implementation.
- Unavailable work becomes a precise Git handoff instead of an unsupported promise.
- Claude Code/Codex returns small tested commits and a PR.
- ChatGPT reviews and updates the canonical roadmap/checkpoint.
- No two agents overwrite the same mutable work.