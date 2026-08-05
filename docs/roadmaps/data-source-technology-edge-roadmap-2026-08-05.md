# Data Source & Technology Edge Roadmap — 2026-08-05

Status: `ACTIVE_SUPPORTING_ROADMAP`
Parent: `docs/roadmaps/alpha-pon-current-roadmap-2026-08-05.md`
Protected concurrent work: LINE consolidated notification PR #34

This supporting roadmap does not replace the current P0-P6 order. It defines where the new data-source registry and technology/supply-chain Edge work fits without interrupting the current LINE -> PIT Price Store -> first Edge evidence sequence.

## Placement in the current roadmap

```text
P1 LINE consolidated notification
  -> keep separate; no source/Edge changes in PR #34

P2 PIT Price Store
  -> promote J-Quants Free to a PIT-safe provider
  -> keep Standard as a one-month validation sprint option

P2.5 Data Source Registry & Evidence Intake
  -> validate source catalog and rights/PIT/adoption gates
  -> migrate EDINET Version 2 auth safely
  -> normalize EDINET/TDnet/company IR evidence

P3 First Known-Bad Evidence Package
  -> event timeline before price testing
  -> new/known/assumption/opinion separation
  -> first executable timestamp

P4 Signal Store / Event Study
  -> optional JPX short-selling and macro confounders only when required

P5 Research Scale-up
  -> Technology Commercialization Graph
  -> technology/supply-chain Edge family catalog
  -> activate one family at a time

P6 Shadow / Holdout
  -> no technology Edge promotion without independent samples and net alpha
```

## Track 1 — Source governance

### DS-01 Catalog contracts

Artifacts:

- `research/data_sources/catalog.yml`
- `research/schemas/data-source.schema.json`
- `docs/research/data-source-and-technology-edge-foundation.md`

Next implementation:

- schema validation;
- duplicate IDs;
- discovery-only cannot be evidence;
- rights fields mandatory;
- PIT/revision policy mandatory;
- core/pilot requires blockers and next action;
- catalog entries do not alter active Edge counts.

Milestone: `DATA_SOURCE_REGISTRY_CONTRACT_GREEN`

### DS-02 EDINET Version 2 migration

The existing EDINET client is outdated and must not remain the long-term evidence collector.

Required:

- current official API endpoint;
- API key handling;
- credentials-missing safe state;
- secret redaction;
- checkpoint, retry and rate control;
- correction/re-correction/withdrawal chain;
- source health;
- deterministic tests.

Milestone: `EDINET_V2_AUTH_MIGRATION_GREEN`

### DS-03 J-Quants PIT provider

Required:

- Free/Standard capabilities under one provider contract;
- delayed-data labelling;
- adjusted/unadjusted prices;
- corporate actions;
- benchmark and sector series;
- local-only/license boundary;
- no licensed raw data in Git.

Milestones:

- `PIT_PRICE_STORE_CONTRACT_GREEN`
- `PIT_PRICE_FIRST_REAL_SERIES_VALIDATED`

### DS-04 Official-source pilots

Order:

1. one JPX listed-company measure dataset;
2. JPX short-selling/margin only if it improves Known-Bad confounder handling;
3. gBizINFO for a small government-demand/supplier pilot;
4. macro sources only when an Edge requires them.

Every pilot ends with one state:

- adopt;
- keep as pilot;
- catalog only;
- reject.

## Track 2 — Technology commercialization

### TE-01 Edge family catalog

Artifacts:

- `research/edge_catalog/technology-supply-chain-families.yml`
- `research/schemas/edge-family.schema.json`

The catalog is intentionally broad; all entries initially remain `catalog`.

Milestone: `TECH_EDGE_CANDIDATE_CATALOG_GREEN`

### TE-02 Commercialization evidence graph

Stages:

```text
research
-> reproduction
-> grant
-> patent family
-> joint R&D
-> standardization
-> prototype
-> customer sample
-> certification / qualification
-> pilot line
-> capex
-> supply contract
-> volume production
-> revenue / profit
```

The graph must preserve source transitions and timestamps. A paper, patent or grant alone is not a stock signal.

Milestone: `TECH_COMMERCIALIZATION_GRAPH_GREEN`

### TE-03 Beneficiary and supplier map

Map each technology to:

- final product;
- platform;
- Tier 1/2/3;
- materials;
- equipment;
- inspection;
- infrastructure;
- integration;
- maintenance;
- services.

Required checks:

- target business share of company revenue;
- customer concentration;
- capacity and yield;
- qualification/replaceability;
- pricing power;
- alternative technologies;
- entity confidence.

Milestone: `TECH_BENEFICIARY_MAP_GREEN`

### TE-04 First activation

Candidate order:

1. Bottleneck Migration
2. Supplier Qualification Moat
3. Research-to-Capex
4. Regulatory Forced Demand

Only one should be promoted to `active-research` first.

Milestone: `FIRST_TECH_COMMERCIALIZATION_EDGE_ACTIVATED`

## Strongest new research ideas

### Commercialization transition velocity

Measure the time between evidence stages, not merely the presence of stages. Faster independent transitions may be more informative than a distant company target date.

### Evidence-density divergence

Use abundant papers/patents/PR without samples/capex/contracts as a negative control for hype and stalled commercialization.

### Specification tightening

Find suppliers that remain qualified when purity, heat, error tolerance, speed or safety specifications become stricter.

### Customer qualification topology

Prefer independent multi-customer, multi-site and multi-use adoption over one famous customer announcement.

### Second-source qualification

Track sample -> audit -> qualification -> production orders after supply-chain or geopolitical shocks.

### Failure-analysis picks and shovels

New technologies create unknown defects and mandatory spending on analysis, inspection, traceability and maintenance.

### Upstream order sequence

Triangulate land/grid/building/utility/equipment/inspection/material orders to estimate future factory ramp.

### Installed-base maintenance

Separate cyclical new-equipment sales from recurring service, calibration, consumables and replacement revenue.

## Source activation order

### Core now

- J-Quants Free
- EDINET Version 2
- TDnet / company IR

### Pilot after first Edge package

- JPX official measures
- JPX short-selling/margin
- gBizINFO

### Catalog only until demanded by an Edge

- Bank of Japan API
- e-Stat
- FRED / ALFRED
- SEC EDGAR
- JPO patent data
- KAKEN / CiNii / J-STAGE
- JST Grants
- objective traffic/search/booking/POS data

### Discovery only

- social networks
- developer communities
- GitHub/OSS/MCP listings

Discovery-only material cannot become financial evidence without official-source verification.

## Milestone order

1. `LINE_CONSOLIDATED_NOTIFICATION_GREEN`
2. `DATA_SOURCE_REGISTRY_CONTRACT_GREEN`
3. `PIT_PRICE_STORE_CONTRACT_GREEN`
4. `EDINET_V2_AUTH_MIGRATION_GREEN`
5. `PIT_PRICE_FIRST_REAL_SERIES_VALIDATED`
6. `KNOWN_BAD_FIRST_ANALOG_PACKAGE`
7. `KNOWN_BAD_FIRST_EXECUTABLE_EVENT_STUDY`
8. `TECH_EDGE_CANDIDATE_CATALOG_GREEN`
9. `TECH_COMMERCIALIZATION_GRAPH_GREEN`
10. `TECH_BENEFICIARY_MAP_GREEN`
11. `FIRST_TECH_COMMERCIALIZATION_EDGE_ACTIVATED`
12. `FIRST_CONFIRMATORY_SAMPLE_READY`

Contract milestones may be built before live credentials. No live-data milestone may be marked green from fixtures or narrative alone.
