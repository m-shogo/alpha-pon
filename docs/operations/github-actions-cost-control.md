# GitHub Actions cost-control policy

## Purpose

Keep CI trustworthy while avoiding repeated Linux runner work on the same commit.
Public repository minutes are not a reason to run redundant jobs: shorter feedback loops and lower queue pressure still matter.

## Workflow ownership

| Workflow | Responsibility | Draft pull request | Ready pull request / main |
| --- | --- | --- | --- |
| `Check` | Core TypeScript and application contracts | Typecheck and core tests | Full operational checks and report generation |
| `CI` | Cloudflare/D1/calendar/static build contracts | Skipped | Runs only when non-research files can affect the build |
| `Research OS` | Research schemas, PIT guards, history and generated indexes | Typecheck and research unit tests | Full validation, history/docs guards, fixture backtest and generated-file check |

A command should have one canonical workflow owner. `pnpm check` belongs to `Check`; `CI` must not run it again.

## Push discipline

1. Run the relevant local checks before pushing.
2. Group coherent fixes into a small number of commits, then push once after the local set is green.
3. Do not push every typo or intermediate compile failure merely to obtain remote feedback.
4. When a newer push supersedes an older run, rely on `concurrency.cancel-in-progress` rather than letting both complete.
5. Re-run only failed jobs when the failure is transient; do not re-run successful jobs unnecessarily.

## Draft and Ready policy

- Draft PRs are implementation workspaces. They receive lightweight type and unit-test feedback.
- Marking a PR Ready triggers the full validation boundary.
- Main receives the full validation boundary.
- Research generated files are committed automatically only on a push to `main`; manual dispatch never writes commits.

## Artifact policy

- Upload diagnostic reports when a run fails, so the failure remains inspectable.
- Upload the canonical report bundle on `main`.
- Successful PR runs do not upload the large report bundle.
- Diagnostic artifacts use a short retention period unless a specific audit requires longer retention.

## Runner policy

- Use the standard `ubuntu-latest` runner.
- Larger, GPU, macOS, and Windows runners require a documented technical need and an explicit review.
- CI must not deploy, change Cloudflare/D1 settings, send LINE notifications, or place orders. Deployment and production writes remain separate, explicitly gated workflows.
