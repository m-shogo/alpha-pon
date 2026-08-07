# Handoff — Sanrio parity legacy human-review input compatibility

Status: `IMPLEMENTED_SYNTHETIC_VALIDATION_PENDING`
Updated: 2026-08-07 JST

## Problem found

The current local Human Review finalizer writes the canonical finalized file as:

```text
revision-human-review-decision-v1.<timestamp>.json
```

The local Sanrio parity workspace CLI still accepted only the older filename form:

```text
revision-human-review-record-v1.<timestamp>.json
```

That mismatch could block the real local pilot immediately after a successful human review even though the record contents were valid.

## Contract after this fix

The parity workspace accepts:

```text
revision-human-review-decision-v1.<timestamp>.json   # canonical current output
revision-human-review-record-v1.<timestamp>.json     # legacy compatibility only
```

It still rejects editable inputs, wrong schema versions, Markdown files, traversal-like names and unrelated files.

The current canonical path for new local runs is `decision-v1`. Do not rename a freshly finalized decision into the legacy `record-v1` shape merely to satisfy the parity CLI.

## Local sequence

1. Prepare/edit/finalize the remaining human review with:

```bash
bash scripts/run-sanrio-edinet-human-review-decision-local.sh \
  --inspection data/edinet/sanrio-acquisition.20260806T064708Z/revision-unmatched-anchor-inspection-v1.20260806T092942Z.json
```

2. After editing the generated `revision-human-review-input-v1.*.json`, finalize it with:

```bash
bash scripts/run-sanrio-edinet-human-review-decision-local.sh \
  --finalize data/edinet/sanrio-acquisition.<actual>/revision-human-review-input-v1.<actual>.json
```

3. Use the resulting canonical `revision-human-review-decision-v1.*.json` as `--legacy-review` for the parity workspace. Use only actual local filenames printed by the prior commands; never guess timestamps.

4. The other parity inputs remain the actual local green inventory audit and completed configured human comparison record.

## Safety

This compatibility fix changes filename acceptance only. It does not weaken content/hash/human-review validation, infer semantic equivalence, authorize replacement, authorize Foundation append, expose local files, change workflow/runners, or change any trading/Production behavior.
