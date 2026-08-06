# EDINET Foundation mapping template

Status: `LOCAL_NON_APPENDABLE_PREVIEW`
Updated: 2026-08-06 JST

## Purpose

Convert a completed, human-reviewed Sanrio impact checklist into explicit Security Master, point-in-time, section-hash, license, storage, and revision-lineage inputs for the existing reviewed EDINET Foundation preview contract.

This step does not infer the missing values. It creates an editable template, rejects incomplete or inconsistent input, and generates only a non-appendable preview.

## Prerequisite

A finalized impact review is required:

```text
revision-impact-review-final-v1.<timestamp>.json
```

The source must be:

```text
reviewStatus: complete_human_review
completedCandidateCount == candidateCount
foundationPreviewEligible: false
appendAuthorized: false
```

Its record and candidate decision hashes are revalidated before a mapping template is created.

## Create a mapping template

Use the newest complete impact review:

```bash
bash scripts/run-edinet-foundation-mapping-local.sh
```

Use a specific source:

```bash
bash scripts/run-edinet-foundation-mapping-local.sh \
  --impact data/edinet/sanrio-acquisition.20260806T064708Z/revision-impact-review-final-v1.<timestamp>.json
```

Outputs:

```text
revision-foundation-mapping-input-v1.<timestamp>.json
revision-foundation-mapping-input-v1.<timestamp>.md
```

Candidates are grouped by corrected `toDocID`. Source candidate IDs, candidate hashes, PublicDoc paths, logical roles, and after-text hashes are immutable.

## Required mapping fields

For each mapping, complete:

### Human review

```text
reviewer
reviewedAt
mappingComplete: true
```

### Security Master

```text
entityIds: one or more governed Security Master IDs
```

No company-name or ticker inference is performed. IDs must already exist in the governed Security Master.

### Document identity and source integrity

```text
chainRootDocID
documentTypeCode
sourceContentHash
normalizedStructureHash
```

`sourceContentHash` is the hash of the reviewed filing source artifact, not a section hash or local filename hash.

### Point-in-time timestamps

```text
publishedAt
observedAt
retrievedAt
effectiveFrom
firstExecutableAt
eventAtStatus
eventAt (only when eventAtStatus=known)
```

The existing Foundation contract enforces:

```text
publishedAt <= observedAt <= retrievedAt
observedAt <= firstExecutableAt
retrievedAt <= firstExecutableAt
reviewedAt >= observedAt and retrievedAt
```

A correction published after an earlier effective accounting period may use an earlier `effectiveFrom`, but the publication, observation, retrieval, and first-executable timestamps must preserve point-in-time availability.

### Reproducibility

```text
retrievalRunId
parserVersion
normalizationVersion
language
```

### Revision lineage

```text
revisionKind
revisionSequence
evidenceStatus
documentRevisionStatus
prior
```

For a correction, amendment, restatement, replacement, withdrawal, or periodic update, `prior` must identify the exact prior Evidence and Document Revision records.

Correction-compatible relation example:

```json
{
  "evidenceId": "evidence:edinet:<prior-doc>",
  "documentRevisionId": "document-revision:edinet:<prior-doc>",
  "documentRevisionRecordId": "document-revision:edinet:<prior-doc>:record:<id>",
  "relationType": "corrects",
  "supersessionStrength": "partial"
}
```

Do not invent prior IDs. They must resolve to governed records before any later append action.

### License and storage

```text
license: metadata_only | local_only
storagePolicy: metadata_only | hash_only | local_only_content
```

Choose these from the actual reviewed acquisition and storage policy. Official disclosure availability does not automatically authorize raw-content Git storage.

### Sections

Each immutable source section requires human-supplied:

```text
sectionId
ordinal
titleHash
```

The source candidate ID, source candidate hash, logical role, PublicDoc path, and section content hash must not be changed.

## Finalize and generate previews

After editing the JSON:

```bash
bash scripts/run-edinet-foundation-mapping-local.sh \
  --finalize data/edinet/sanrio-acquisition.20260806T064708Z/revision-foundation-mapping-input-v1.<timestamp>.json
```

The CLI re-hashes the edited input internally. The user does not need to calculate `recordHash` manually.

Finalization then:

1. rebuilds the template from the completed impact review;
2. compares every immutable source field;
3. validates Security Master IDs and all required fields;
4. enforces PIT ordering;
5. validates section and normalized-structure hashes;
6. validates revision sequence, status, and prior relation;
7. invokes the existing reviewed EDINET Foundation preview builder;
8. writes preview JSON and Markdown.

Outputs:

```text
revision-foundation-preview-final-v1.<timestamp>.json
revision-foundation-preview-final-v1.<timestamp>.md
```

## Final boundary

A successful result means the deterministic Foundation preview was generated. It still remains:

```text
reviewStatus: complete_foundation_preview
previewGenerated: true
foundationPreviewEligible: false
appendAuthorized: false
```

Every embedded Evidence/Relation/Document Revision preview also has `appendAuthorized=false`.

The wording `foundationPreviewEligible=false` is intentional: this workflow has already generated a preview, but it cannot authorize a governed store mutation.

## Non-actions

This command does not append Evidence, Evidence Relations, or Document Revision records; resolve missing Security Master IDs; create portfolio or recommendation records; send LINE; create BUY/orders; deploy Cloudflare; write D1; modify Secrets; or alter workflows/runners.
