# EDINET local reviewed Foundation preview

Status: `LOCAL_PREVIEW_ONLY`
Production trading use: prohibited

## Purpose

Validate one human-reviewed EDINET manifest and generate deterministic Foundation candidate records without appending any governed runtime store.

## Input boundary

The input must be a direct JSON child of the ignored local directory:

```text
data/edinet/<name>.json
```

The schema is:

```text
research/schemas/edinet-reviewed-foundation-input.schema.json
```

The manifest must contain human confirmation, exact PIT timestamps, verified entity IDs, license/storage policy, source and normalized hashes, revision semantics, and normalized section hashes.

Do not place the API key, raw response URL with query credentials, document body, portfolio information, or brokerage data in the review manifest.

## Run

```bash
node --import tsx/esm src/research/cli/preview-reviewed-edinet.ts \
  --input data/edinet/sanrio-reviewed.json
```

Optional explicit output:

```bash
node --import tsx/esm src/research/cli/preview-reviewed-edinet.ts \
  --input data/edinet/sanrio-reviewed.json \
  --output data/edinet/sanrio-foundation-preview.json
```

Both files must be direct children of `data/edinet`.

## Output

The preview contains:

- deterministic Bitemporal Evidence candidate;
- optional deterministic Evidence Relation candidate;
- deterministic Document Revision candidate;
- `appendAuthorized=false`.

The CLI writes with exclusive creation and permission mode `0600`. Existing previews are never overwritten. Input symlinks and paths outside `data/edinet` are rejected.

## Important distinction

A successful preview means only that the reviewed manifest can be mapped into the current schema contracts. It does not prove:

- that the human review is correct;
- that Security Master local records actually exist;
- that the source license decision is legally sufficient;
- that a correction or withdrawal relation is factually correct;
- that the records were appended;
- that the Sanrio real pilot is complete;
- that BUY, LINE, order, or Production use is allowed.

## Next explicit boundary

A later governed append command must independently load the actual local Security Master, Evidence Store, and Document Revision repositories, validate the preview against those current objects, require an owner token, and preserve append-only journal semantics.

That append command is intentionally not part of this preview slice.
