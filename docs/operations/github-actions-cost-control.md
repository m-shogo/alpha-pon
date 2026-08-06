# GitHub Actions cost-control and runner-governance policy

Status: `ACTIVE_REQUIRED_POLICY`
Updated: 2026-08-06 JST

## Purpose

Keep CI trustworthy while avoiding repeated Linux runner work on the same commit. Public-repository minutes are not a reason to run redundant jobs: shorter feedback loops, lower queue pressure, clearer failures, and protection against future visibility/billing changes still matter.

This policy is enforced by:

```bash
node --import tsx/esm scripts/verify-github-actions-cost-control.ts
```

The guard runs inside `Check` for Draft, Ready, `main`, and manual executions. Workflow changes that violate the invariants must fail before expensive checks begin.

## 2026-08-06 incident record

Observed state before remediation:

- private-repository Linux usage reached approximately 2,008 minutes in the monthly cycle
- Actions Budget was `$0` with usage stopping at the paid-overage boundary
- multiple workflow paths could run for the same feature-branch commit
- `Check` was triggered by both unrestricted `push` and `pull_request`
- `CI` and `Check` repeated parts of the same validation ownership
- research/docs changes could invoke unrelated Cloudflare/static-build work
- successful PRs uploaded a large report artifact
- superseded runs were not consistently collapsed across event refs

Symptoms at the blocker boundary:

- jobs ended in a few seconds
- no runner steps or usable job logs
- `steps: []` / `steps: null`
- code and tests had not started

Remediation merged in PR #50:

- feature-branch `push`/`pull_request` duplicate execution removed
- workflow ownership separated
- Draft lightweight and Ready/full paths introduced
- PR-number-aware concurrency with `cancel-in-progress`
- Cloudflare CI path filtering
- successful-PR artifact suppression and seven-day diagnostic retention
- manual Research OS dispatch prevented from writing generated commits
- standard `ubuntu-latest` retained

The repository later became public, which restored standard public-repository runner execution without paid minute overage. The workflow optimizations remain mandatory even while usage is not billed.

## Workflow ownership

| Workflow | Responsibility | Draft pull request | Ready pull request / main |
| --- | --- | --- | --- |
| `Check` | Core TypeScript and application contracts | Actions guard, typecheck and hermetic core tests | Actions guard, full operational checks and report generation |
| `CI` | Cloudflare/D1/calendar/static build contracts | Skipped | Runs only when non-research files can affect the build |
| `Research OS` | Research schemas, PIT guards, history and generated indexes | Typecheck and research unit tests | Full validation, history/docs guards, fixture backtest and generated-file check |

A command has one canonical workflow owner.

- `pnpm check` belongs to `Check`.
- `CI` must not run `pnpm check` again.
- `Research OS` owns research-specific contracts and generated-index validation.
- Cloudflare deployment is not owned by GitHub `CI`; `CI` performs contract/build/dry-run validation only.

## Mandatory runner invariants

1. Feature branches must not receive both unrestricted `push` and `pull_request` runs.
2. Push-triggered full validation is restricted to `main`.
3. Every workflow uses PR-aware concurrency and `cancel-in-progress: true`.
4. Every job uses the standard `ubuntu-latest` runner.
5. Larger, GPU, macOS, Windows, custom-image, and special high-performance runners require:
   - a documented technical need
   - expected minute/cost impact
   - proof that standard Linux is insufficient
   - explicit human review
   - an isolated policy-change PR
6. Draft and Ready behavior remain separated.
7. `ready_for_review` and `converted_to_draft` transitions must trigger the appropriate boundary.
8. Research/docs-only changes must not invoke unrelated Cloudflare build CI.
9. Successful PR runs must not upload the large canonical report bundle.
10. Research generated commits are allowed only on `main` push, never manual dispatch or PR.

## Executable regression guard

`scripts/verify-github-actions-cost-control.ts` currently verifies:

- `push.branches` is exactly `main` for Check, CI, and Research OS
- all three retain a `pull_request` trigger
- PR-number-aware concurrency exists
- `cancel-in-progress` remains enabled
- all jobs use exactly `ubuntu-latest`
- Draft and Ready/full conditions remain present
- report artifacts remain failure/main-only with seven-day retention
- `pnpm check` does not leak into CI or Research OS
- CI ignores research/docs-only changes
- Ready/Draft transition events remain configured
- Research OS generated writes remain main-push-only

When a new workflow is added, extend the guard before merging that workflow. Do not bypass the guard by renaming commands or moving duplicate work into a shell wrapper.

## Push discipline

1. Run relevant local checks before pushing.
2. Group coherent fixes into a small number of commits, then push once after the local set is green.
3. Do not push every typo, intermediate compile error, or half-written fixture merely to obtain remote feedback.
4. When a newer push supersedes an older run, let `concurrency.cancel-in-progress` stop the older run.
5. Re-run only failed jobs when failure is transient; do not re-run successful jobs unnecessarily.
6. Do not repeatedly toggle Draft/Ready to obtain extra full runs.
7. Stacked PRs should update only the affected branch after its parent is stable.

## Draft and Ready policy

- Draft PRs are implementation workspaces. They receive lightweight type and hermetic unit-test feedback.
- Draft checks must not depend on generated reports that require the full pipeline.
- Marking a PR Ready triggers the full validation boundary once.
- Main receives the full validation boundary.
- A failed lightweight check is fixed before Ready.
- A Ready failure is classified as code, workflow, data, external service, or account blocker before rerunning.
- Research generated files are committed automatically only on a push to `main`; manual dispatch never writes commits.

## Artifact and storage policy

- Upload diagnostic reports when a run fails, so the failure remains inspectable.
- Upload the canonical report bundle on `main`.
- Successful PR runs do not upload the large report bundle.
- Diagnostic artifacts use seven-day retention unless a specific audit requires longer retention.
- D1 sync audit artifacts may retain their explicitly documented 14/30-day windows because they are production-change evidence.
- Do not use artifacts as a permanent database.
- Review artifact size and retention before adding new generated paths.

## Runner and billing interpretation

### Standard Linux

The project uses:

```yaml
runs-on: ubuntu-latest
```

No current Alpha Pon workflow requires a Larger runner or GPU.

### Visibility changes

Public standard-runner usage and private-account included-minute usage follow different billing treatment. Do not assume the current public configuration will remain unchanged forever. If the repository becomes private again:

- verify the current included allowance and billing cycle in GitHub Billing
- verify Gross, Included, and Billed usage separately
- remember that a `$0` Actions budget can block paid overage after included usage is exhausted
- do not raise a budget automatically

### Budget rule

A budget is a maximum authorization for paid overage, not prepaid credit. Changing a budget requires human approval. Workflow efficiency must be fixed before solving waste by increasing budget.

## Failure classification

### Runner/account startup failure

Typical signs:

- zero real steps
- `steps: []` or `steps: null`
- no checkout/install logs
- failure within seconds
- billing, spending-limit, payment, or runner-allocation annotation

Do not modify tests or application code to solve this class.

### Workflow/code failure

Typical signs:

- runner image shown
- checkout completed
- dependencies installed
- a named command or assertion failed

Inspect the exact failing step and logs. Fix the root cause without weakening tests.

### Superseded run

A cancelled older run after a newer push is expected and desirable. Do not rerun it.

## Cloudflare Build Token is a separate system

Cloudflare Git Builds and GitHub Actions runner allocation are independent.

The 2026-08-06 Cloudflare error was:

```text
The build token selected for this build has been deleted or rolled
```

Correct interpretation:

- Cloudflare build environment initialized
- selected Cloudflare Build Token was stale
- application build had not started
- GitHub Actions and its budget were not the cause

Recovery rule:

1. Select an existing valid Build Token in the Worker Build settings.
2. Create a new token only when no valid token is available.
3. Save and retry the Cloudflare build.
4. Never paste token values into chat, Git, issues, logs, or generated files.
5. Do not rotate tokens routinely; rotation requires updating every dependent integration.

A successful `wrangler deploy --dry-run` proves bundle/config validation only. It does not prove Cloudflare Git deployment succeeded.

## Workflow-change review checklist

Every change under `.github/workflows/**` must include:

1. Before/after trigger matrix.
2. Estimated increase/decrease in jobs per feature-branch push.
3. Command ownership table.
4. Runner label and expected technical need.
5. Path-filter impact.
6. Artifact paths, size expectation, and retention.
7. Local execution of the Actions cost-control guard.
8. Draft PR run with real checkout/install/guard steps.
9. Ready full run exactly once.
10. Confirmation that no deploy, D1 write, LINE send, BUY notification, order, secret, or billing change occurred unless separately authorized.

## Non-negotiable safety boundary

CI must not:

- deploy production implicitly
- change Cloudflare/D1 settings
- create or rotate tokens
- send LINE notifications
- generate or transmit BUY orders
- place trades
- commit real licensed market data
- expose secrets

Production deployment and writes remain separate, explicitly gated workflows or dashboard actions.
