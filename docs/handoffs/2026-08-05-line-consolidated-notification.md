# LINE Consolidated Notification Handoff

Status: `PENDING_MANUAL_LAUNCH`
Owner: `claude-code`
Reviewer: `chatgpt`
Created: 2026-08-05 JST

Copy the prompt below into Claude Code after opening the Mac-local Alpha Pon checkout.

---

You are the implementation executor for `m-shogo/alpha-pon`.

Executor: `claude-code`
Repository: `https://github.com/m-shogo/alpha-pon`
Local checkout: `/Users/m-shogo/Developer/personal/alpha-pon`
Remote main measured at handoff creation: `61c505d386fcabc2f0fa0187b9ffdfa91bbda89a`
Target work branch: `feat/line-consolidated-notification`

## Goal

Protect the existing Mac-local uncommitted notification changes, determine their intended design, and finish the LINE consolidated-notification implementation with tests and a reviewable PR.

Normal morning output should be sent as one consolidated message. Only genuinely urgent events may be delivered immediately. Notification failure must not break the full daily pipeline.

## Why this was handed off

The relevant implementation and stash state exist only in the Mac-local checkout and are not visible through the GitHub connector. Safe work requires local `git status`, `git diff`, stash inspection, shell commands, tests and potentially multiple-file edits.

ChatGPT must not overwrite or reconstruct these local changes from remote GitHub state.

## Current confirmed remote state

- Remote main at handoff creation: `61c505d386fcabc2f0fa0187b9ffdfa91bbda89a`.
- Calendar/D1 status documents and the first Research OS Edge are already merged.
- The repository has a current roadmap in `docs/roadmaps/alpha-pon-current-roadmap-2026-08-05.md`.
- Agent routing policy is `docs/operations/agent-work-routing.md`.
- Local changes were previously reported around:
  - `src/send-consolidated-line.ts`
  - `src/notify.ts`
  - `scripts/run-daily.sh`
  - `scripts/run-daily-complete.sh`
  - generated JSON under `apps/web/public/generated/`
  - `tmp/`
- A safety stash was previously reported with a name similar to `current-local-changes-before-restoring-cloudflare-stash-2026-08-05`.
- Treat every local-state statement above as a lead only. Re-measure before acting.

## First commands

Run and preserve the output of:

```bash
cd /Users/m-shogo/Developer/personal/alpha-pon
git status --short --branch
git stash list
git log --oneline --decorate -20
git diff --stat
git diff
```

Also inspect untracked files without deleting them:

```bash
find tmp -maxdepth 2 -type f 2>/dev/null | sort | sed -n '1,200p'
```

If local main is behind remote, do not pull/rebase over uncommitted work. Protect the current state first.

## Local-change protection

- Do not use `git reset --hard`, `git clean -fd`, broad `git restore`, or checkout commands that overwrite unknown work.
- Do not drop or pop existing stash entries at the start.
- Create a dedicated safety branch from the current local commit before editing.
- If needed, make an additional named stash including untracked files, but do not replace the existing stash as the only backup.
- Generated JSON and `tmp/` must not be committed until provenance and necessity are verified.
- Keep the original stash entries until the final implementation is committed, pushed and CI is green.

## Read before editing

- `docs/roadmaps/alpha-pon-current-roadmap-2026-08-05.md`
- `docs/operations/agent-work-routing.md`
- `docs/prompts/code-agent-handoff-template.md`
- `src/send-consolidated-line.ts` if present
- `src/notify.ts`
- `src/pipeline-message.ts`
- daily/morning summary and notification dedupe code found by repository search
- `scripts/run-daily.sh`
- `scripts/run-daily-complete.sh`
- relevant tests and `package.json` scripts

## Scope

### Inspect and change

- `src/send-consolidated-line.ts`
- `src/notify.ts`
- `src/pipeline-message.ts` only when necessary to remove duplicated responsibility
- `scripts/run-daily.sh`
- `scripts/run-daily-complete.sh`
- focused notification tests and fixtures
- minimal documentation/runbook needed for dry-run operation

### Do not touch without a direct requirement

- Research OS schemas, Edge Gate states or production thresholds
- D1 schema/bootstrap/migrations or Cloudflare tokens
- Cloudflare Access, billing or credit-card settings
- market-event public API contract
- licensed market data
- generated web JSON unrelated to the notification implementation
- unrelated formatting or broad refactors

## Required implementation sequence

1. Reconstruct the intent of every local diff before changing it.
2. Protect the local state on a dedicated branch or additional safety stash.
3. Map all current notification entrypoints and identify duplicate sends between pipeline summary, stock summary, urgent notifications and Mac notifications.
4. Define one explicit responsibility model:
   - normal daily findings accumulate into one consolidated morning LINE message;
   - urgent events bypass the batch only when an explicit urgency rule passes;
   - the same logical item cannot be sent through both paths;
   - no-op days do not send meaningless empty messages unless existing product requirements explicitly require a heartbeat.
5. Implement or complete a deterministic message builder with safe ordering, section limits and truncation behavior.
6. Add a dry-run/mock transport that cannot call the real LINE API.
7. Make notification transport failure non-fatal to the rest of the daily pipeline while preserving a visible error/result record.
8. Ensure access tokens, user IDs and secret values never appear in logs, thrown errors, snapshots or generated artifacts.
9. Add tests for:
   - zero items;
   - one normal item;
   - many normal items and character/section limits;
   - urgent-only;
   - mixed urgent and normal items;
   - duplicate logical item across sources;
   - partial transport failure;
   - missing credentials in dry-run/off mode;
   - ordering determinism.
10. Verify whether generated JSON changes are a canonical generator result. Revert or exclude accidental generated noise without losing intentional source changes.
11. Run validation, inspect the final diff, commit in small coherent slices, push and open a PR.

## Acceptance criteria

- [ ] Normal morning information is delivered through one consolidated LINE message path.
- [ ] Only explicit urgent events use the immediate path.
- [ ] Duplicate content is suppressed across pipeline/stock/urgent paths.
- [ ] Empty, one-item and large-item inputs are deterministic and safe.
- [ ] LINE character/section limits are handled without malformed output or silent loss of all remaining content.
- [ ] Real network delivery is not required for tests; dry-run/mock is available.
- [ ] LINE failure does not abort unrelated daily pipeline work.
- [ ] No secret values appear in output, errors, tests or committed files.
- [ ] Local pre-existing work and stash are preserved until the branch is safely pushed and green.
- [ ] No unrelated Research OS, D1 or Cloudflare changes are included.

## Required validation

Run the canonical repository commands that cover the changed files. At minimum attempt:

```bash
pnpm typecheck
pnpm typecheck:tests
pnpm test
```

Add and run focused notification tests explicitly. Run `pnpm check` if the local environment can complete it without real notification delivery or external credentials. Use notification-off/mock/dry-run mode for every validation command.

Do not report a command as passed unless it was actually run. If a broad command fails for an unrelated pre-existing reason, preserve the log, isolate the failure and still run the focused checks.

## Boundaries

- No real LINE send during development or CI.
- No automatic live trading or changes to investment thresholds.
- No fabricated test, CI or delivery results.
- Separate new facts, known facts, assumptions and opinion in user-facing stock content.
- Stop only for a real external blocker such as inaccessible local files, missing required credentials for a non-mock verification, or a human product decision that changes notification semantics.

## Commit and PR strategy

Prefer small coherent commits such as:

1. `chore: protect and document local notification state` only if documentation is necessary.
2. `refactor: consolidate LINE notification orchestration`.
3. `test: cover consolidated and urgent LINE delivery`.
4. `docs: document LINE dry-run and failure behavior`.

Do not commit temporary backups, secret-bearing files, arbitrary generated JSON or `tmp/` contents.

## Final report format

Return exactly:

1. Measured start SHA / final SHA / branch / PR.
2. Original local changes and how they were protected.
3. Changed files and purpose.
4. Notification responsibility model after the change.
5. Commands run and exact pass/fail summary.
6. Bugs/risks found and how they were handled.
7. External actions still required.
8. Remaining blockers.
9. Exact next action for ChatGPT PR review.

Do not leave the finished work only in an uncommitted local state.
