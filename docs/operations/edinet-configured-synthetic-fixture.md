# Configured EDINET synthetic pipeline fixture v1

Status: `SYNTHETIC_LOCAL_EXPORT_ONLY`
Updated: 2026-08-06 JST

## Purpose

Export the complete configured EDINET metadata pipeline as deterministic synthetic JSON, placeholder binary files, Markdown, and HTML without contacting EDINET or using a real issuer.

This makes the following contracts inspectable outside unit-test source code:

```text
configured issuer registry
→ inventory
→ review plan
→ acquisition plan
→ complete acquisition manifest
→ review workspace v2
→ configured pipeline dashboard
```

## Command

```bash
bash scripts/export-configured-edinet-synthetic-fixture.sh
```

Optional explicit output directory:

```bash
bash scripts/export-configured-edinet-synthetic-fixture.sh \
  --output-dir tmp/configured-edinet-synthetic-fixture-v1.manual
```

The output must be a new direct child of `tmp/` named `configured-edinet-synthetic-fixture-v1.*`. Existing directories are never overwritten.

## Output tree

```text
tmp/configured-edinet-synthetic-fixture-v1.<timestamp>/
├── README.md
├── synthetic-registry.json
├── fixture-bundle.json
├── fixture-manifest.md
└── data/
    └── edinet/
        ├── synthetic-co-edinet-inventory.fixture.json
        ├── synthetic-co-edinet-configured-review-plan-v1.fixture.json
        └── synthetic-co-acquisition.fixture/
            ├── acquisition-plan.json
            ├── S900*.synthetic.bin
            ├── S900*.synthetic.metadata.json
            ├── acquisition-manifest.json
            ├── configured-review-workspace-v2.json
            ├── configured-review-workspace-v2.md
            ├── configured-pipeline-dashboard-v1.json
            └── configured-pipeline-dashboard-v1.html
```

Directories are mode `0700`. Files are mode `0600`, exclusive, and durable with `fsync`.

## Determinism

The fixture uses fixed synthetic identifiers and timestamps:

```text
issuerKey: synthetic-co
legal name: 合成テスト株式会社
EDINET code: E90000
security code: 90000
docIDs: S900ROOT / S900CORR
```

Every stage hash and the final bundle hash are deterministic. Re-running the builder produces identical content and hashes, although the default outer output-directory timestamp changes.

## Synthetic binary boundary

The four acquisition payloads are plain UTF-8 text files with `.synthetic.bin` names. They explicitly contain:

```text
ALPHA PON SYNTHETIC EDINET FIXTURE
NOT AN OFFICIAL FILING
NO REAL ISSUER OR INVESTMENT FACTS
```

They are not ZIP or PDF files and must never be opened, parsed, or presented as official EDINET documents.

Their metadata uses synthetic docIDs and contains no API key. The EDINET endpoint string omits the subscription-key query parameter.

## Safety assertions

The bundle records:

```text
synthetic: true
networkUsed: false
credentialsRequired: false
realIssuerAuthorized: false
realFilingContentIncluded: false
foundationPreviewEligible: false
appendAuthorized: false
```

Tests reject accidental inclusion of:

- Sanrio EDINET/security identifiers;
- the Sanrio legal name;
- subscription-key/API-key names;
- portfolio or BUY data;
- unsafe file paths;
- descriptor/content hash mismatches;
- non-synthetic acquisition payload names.

## Inspection workflow

1. Open `fixture-manifest.md` to inspect file hashes and the pipeline hash chain.
2. Open `configured-pipeline-dashboard-v1.html` locally to inspect the five metadata stages.
3. Compare the individual JSON files with their documented schemas and safety boundaries.
4. Treat every placeholder acquisition as synthetic and non-semantic.

A green synthetic dashboard proves deterministic contract composition only. It does not validate the current EDINET API, a real issuer, a real filing, official PDF fidelity, accounting impact, or investment usefulness.

## Non-actions

The exporter performs no network request, credential read, EDINET download, real-issuer registration, filing parsing, Evidence/Foundation append, LINE send, BUY/order action, Cloudflare deploy, D1 write, Secret change, workflow change, or runner change.
