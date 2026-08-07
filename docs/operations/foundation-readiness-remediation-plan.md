# Foundation readiness remediation plan v1

Status: `LOCAL_READ_ONLY_PLANNING_ONLY`

## Purpose

Consume a hash-verified Foundation readiness audit and turn its missing or partial evidence groups into a deterministic dependency-ordered work plan.

This planner does **not** collect evidence, synthesize missing values, open the Foundation mapping gate, create a Foundation preview, append governed stores, replace a legacy entry point, or authorize trading actions.

## Local command

```bash
bash scripts/run-foundation-readiness-remediation-plan-local.sh \
  --audit data/edinet/<issuerKey>-acquisition.<timestamp>/configured-foundation-readiness-audit-v1.<timestamp>.json \
  --execute-remediation-plan
```

The exact `--execute-remediation-plan` flag is mandatory.

## Dependency order

Known Foundation evidence groups are ordered as follows:

1. `security_master`
2. `document_metadata`
3. `pit_timestamps`
4. `retrieval_and_normalization`
5. `revision_chain`
6. `rights_and_storage`
7. `section_mapping`

Dependencies are recorded only when the prerequisite group is itself still pending. Unknown future groups remain supported and are placed after the known groups without inventing an action-specific semantic interpretation.

## Output

```text
foundation-readiness-remediation-plan-v1.<timestamp>.json
foundation-readiness-remediation-plan-v1.<timestamp>.md
```

Files are created exclusively with mode `0600`; the wrapper sets `umask 077`.

The plan contains:

- source audit filename/hash;
- issuer and registry lineage copied from the verified audit envelope;
- pending groups and fields;
- deterministic step order and dependencies;
- explicit action labels;
- `foundationMappingGateAuthorized=false`;
- `automaticFieldSynthesisAuthorized=false`;
- `automaticEvidenceCollectionAuthorized=false`;
- `replacementAuthorized=false`;
- `foundationPreviewEligible=false`;
- `appendAuthorized=false`.

## Interpretation boundary

A generated remediation plan is a work-order artifact only. It is not evidence that any missing field has been collected or validated.

Even when a readiness audit eventually has no missing/partial fields, the planner only returns:

```text
ready_for_separate_foundation_mapping_gate_review
```

A distinct reviewed Foundation mapping gate is still required.

## Safety

- no network access;
- no EDINET download;
- no source-text copying;
- no missing-value inference;
- no automatic Security Master/PIT/license/revision generation;
- no Evidence or Document Revision append;
- no legacy entry-point mutation;
- no BUY/order/LINE action;
- no Cloudflare production deploy or D1 write;
- no Secret/workflow/runner mutation.
