# Sanrio real local pilot — resume checklist

Status: `WAITING_FOR_USER_LOCAL_ACCESS`
Updated: 2026-08-07 JST
Canonical preflight: `scripts/run-sanrio-real-pilot-preflight-local.sh`

## Purpose

Use this checklist when local Mac access becomes available again. Do not memorize or guess timestamped EDINET filenames. The canonical preflight inspects the actual local lineage and emits at most one mutating-stage `nextCommand`. After completed parity, it may separately emit one explicitly labelled read-only Foundation readiness audit advisory.

GitHub/CI implementation is intentionally complete only up to the real-evidence boundary. Local EDINET records, PDF/API payloads, licensed data, and human decisions remain local-only.

## Resume procedure

1. Open the local repository:

```bash
cd /Users/m-shogo/Developer/personal/alpha-pon
```

2. Check the worktree before updating `main`:

```bash
git status --short --branch
```

Do not discard uncommitted work. If the worktree is clean and the current branch can be safely updated, bring it to current `main` with the normal non-destructive fast-forward workflow used for this repository.

3. Run the canonical read-only preflight:

```bash
bash scripts/run-sanrio-real-pilot-preflight-local.sh
```

4. Save/paste the complete preflight output into the Alpha Pon chat. It intentionally prints only stage, filenames/metadata, warnings, safe command metadata and safety flags; it does not print filing source text, confirmed facts, or exact amounts.

5. If `nextCommand` is present, run exactly that command. Do not substitute guessed timestamps or rename an artifact to make it match another stage.

6. Re-run the canonical preflight after every successful mutating-stage command:

```bash
bash scripts/run-sanrio-real-pilot-preflight-local.sh
```

Continue only with the command it emits.

## Human-review stage

If preflight reports `human_review_template_required`, run its generated command. It creates the editable human-review input and checklist for the remaining official-PDF review.

The known measured legacy state before local work resumes is historical context only, not proof of the current local state:

- selected API/PDF anchors: 21
- matched: 20
- unmatched: 1
- pending machine anchors: 0
- diagnostic PDF contexts for the remaining anchor: 8
- human review still required at that measurement point
- Foundation append not authorized

For the remaining anchor, the human reviewer must inspect the official EDINET PDF and explicitly record only what is actually supported, including as applicable:

- reviewer and reviewed timestamp;
- equivalence decision;
- selected diagnostic context and/or manually verified PDF page;
- PDF visual confirmation;
- newly confirmed facts;
- previously known facts;
- assumptions/inference;
- opinions;
- exact amount / currency / period / recipient / payer only when confirmed;
- correction scope;
- financial-statement impact;
- internal-control impact;
- audit-opinion impact;
- reviewer notes;
- completed flag.

Do not fill unknown fields by inference merely to unblock the pipeline.

After editing the human input, run preflight again. It will emit the canonical finalize command for the actual local filename.

## Parity stage

After the legacy human review is finalized, keep using preflight. Depending on the actual local files, it will either surface missing parity inputs or emit the correct command for:

1. legacy/configured parity workspace generation;
2. parity human-review template generation;
3. parity human-review finalization.

During parity human review, explicitly:

- confirm the inventory audit;
- decide each legacy-to-configured evidence mapping;
- disposition each configured coverage item;
- record human notes when evidence is inconsistent or insufficient;
- record the replacement recommendation and rationale.

A recommendation such as `recommend_configured_replacement` is still only a human recommendation. It does not authorize replacement, legacy entry-point mutation, Foundation append, or Production use.

The Foundation-readiness boundary now revalidates the finalized parity record instead of trusting hash presence alone. It rejects count drift, source-lineage drift, invalid decision enums, inconsistent mapping/coverage choices, false aggregate counts, and replacement recommendations that contradict blocking/insufficient decisions.

## Mandatory Foundation stop condition

When preflight reports:

```text
parity_complete_foundation_gate_pending
```

STOP any Foundation mapping, preview, append, replacement, legacy-entry-point mutation, or other mutating progression.

`nextCommand` must remain `null` at this boundary.

If the exact completed parity record passed the Integrity Gate, current preflight may additionally display:

```text
readOnlyFollowUpPurpose: foundation_readiness_evidence_gap_audit
readOnlyFollowUpCommand:
...
foundationGateStillPending: true
```

This advisory is optional and read-only with respect to the governed Foundation store. It performs no network request and writes only local `configured-foundation-readiness-audit-v1.*` artifacts. If present, it is the only additional local command allowed at this stop boundary without a new human-reviewed Foundation mapping decision.

After running that read-only audit, preserve its terminal output and paste it into the Alpha Pon chat together with the preflight output. A successful audit execution does **not** mean the Foundation pilot is green.

Do not manually create a Foundation append, mutate the legacy entry point, rename/re-hash records, or synthesize missing Security Master/PIT/license/revision evidence. The next mutating step must be assessed from the real completed parity/readiness evidence.

## Integrity-failure procedure

The canonical preflight verifies deterministic content hashes and parent-hash lineage before it prints a next-stage command or read-only readiness advisory.

If it exits with an integrity/hash/lineage mismatch:

1. do not edit the hash;
2. do not rename the finalized file to bypass the check;
3. do not delete the local evidence;
4. preserve the files as-is;
5. paste the error/output into the Alpha Pon chat.

The affected upstream stage should be traced or regenerated rather than bypassed.

## Known fallback only if canonical preflight is unavailable

The previously measured inspection can still be addressed directly with:

```bash
bash scripts/run-sanrio-edinet-human-review-decision-local.sh \
  --inspection data/edinet/sanrio-acquisition.20260806T064708Z/revision-unmatched-anchor-inspection-v1.20260806T092942Z.json
```

Prefer the canonical preflight whenever available because it resolves the actual current local lineage and avoids stale timestamp assumptions.

For a completed parity record, the Foundation readiness audit also has a documented explicit fallback command, but prefer the preflight `readOnlyFollowUpCommand` because it uses the exact selected local parity filename.

## Do not do

- Do not commit `data/edinet/**`.
- Do not commit real Recommendation/Outcome/Learning runtime JSONL.
- Do not expose EDINET/J-Quants/API credentials in Git, Actions, Issues, PRs, logs, or chat.
- Do not treat synthetic CI fixtures as real parity/Foundation evidence.
- Do not auto-promote facts, Edge stages, or Production Gates from this pilot.
- Do not send a real BUY/order/LINE action from this workflow.
- Do not change runners/workflows/cost controls to bypass a research-data gate.
- Do not treat a read-only readiness audit as Foundation mapping authorization.

## Handoff after local work

The useful handoff back to ChatGPT is the complete output of:

```bash
bash scripts/run-sanrio-real-pilot-preflight-local.sh
```

plus any integrity/finalization error printed by the command it instructed you to run, and—only when the read-only advisory was actually executed—the terminal summary from the Foundation readiness audit. Do not paste raw EDINET filing text unless it is specifically needed for a human evidence decision.
