# Data Source & Technology Edge Foundation Handoff

Status: `PLANNED_AFTER_LINE_AND_PIT_CONTRACT`
Created: 2026-08-05 JST
Base main: `c48a65bca348c68c69aed58bcd5d4403dd860bab`
Planning branch: `agent/data-source-technology-edge-foundation`
Protected concurrent work: PR #34 `feat/line-consolidated-notification`

## 1. Objective

Build a governed foundation for:

- selecting—not accumulating—APIs and public datasets;
- separating discovery sources from investment evidence;
- preserving PIT timestamps, revisions, rights and provenance;
- cataloging many technology/supply-chain Edge ideas without activating all of them;
- tracing research -> patent -> qualification -> capex -> volume production -> revenue;
- finding hidden beneficiaries in materials, equipment, inspection, infrastructure and maintenance.

This handoff does not authorize automatic trading, BUY recommendations or bulk ingestion of every cataloged source.

## 2. Canonical inputs

Read first:

1. `docs/roadmaps/alpha-pon-current-roadmap-2026-08-05.md`
2. `docs/research/data-source-and-technology-edge-foundation.md`
3. `research/data_sources/catalog.yml`
4. `research/schemas/data-source.schema.json`
5. `research/edge_catalog/technology-supply-chain-families.yml`
6. `research/schemas/edge-family.schema.json`
7. `docs/research/research-os-spec.md`
8. `research/edge_registry/edges/known-bad-event-repricing.yml`

## 3. Protected boundaries

Do not modify or merge into the LINE branch.

Protected paths unless the task explicitly requires them:

- `src/line-*`
- `src/send-consolidated-line.ts`
- `src/notify.ts`
- `src/emergency-disclosure-watch.ts`
- `scripts/run-daily*.sh`
- `tmp/`
- existing stash/local generated JSON
- Cloudflare/D1/Access/token/billing configuration

Do not use:

- `git reset --hard`
- `git clean`
- destructive restore
- stash deletion
- force push
- secret values in code, logs, fixtures or PR text

## 4. Work sequence

### Phase A — Registry validation

Implement deterministic validation for:

- `research/data_sources/catalog.yml`
- `research/edge_catalog/technology-supply-chain-families.yml`

Requirements:

- reuse the existing Research OS schema validator;
- reject duplicate IDs;
- reject invalid enum values;
- require blockers and nextAction for core/pilot sources;
- reject `mayUseAsEvidence: true` for `discovery_only` sources;
- require explicit rights fields;
- require at least one falsification rule per Edge family;
- require all new Edge families to remain `catalog` unless a separate activation PR supplies evidence;
- detect active Edge count inflation caused by catalog entries;
- add CLI scripts and deterministic fixture tests;
- include checks in `research:check` without changing generated active Edge counts.

Proposed scripts:

```text
research:validate:data-sources
research:validate:edge-families
research:catalog:check
```

Definition of done: `DATA_SOURCE_REGISTRY_CONTRACT_GREEN` and `TECH_EDGE_CANDIDATE_CATALOG_GREEN`.

### Phase B — EDINET Version 2 auth migration

Current issue:

- existing `src/fetcher/edinet.ts` documents API key as unnecessary;
- existing base URL is the previous endpoint;
- the current official Version 2 flow requires an API key.

Implement as a dedicated PR after registry validation.

Requirements:

- `EDINET_API_KEY` environment variable;
- current official API base URL;
- `Subscription-Key` handling;
- credentials missing returns an explicit non-fatal status;
- no secret in URL logs, exceptions, reports or fixtures;
- timeout, bounded retry and rate control;
- date checkpoint;
- docID and content hash dedupe;
- parentDocID, withdrawal and edit state;
- correction/re-correction/supersession chain;
- source health and parser isolation;
- deterministic fixtures for 200, 400/401, 429, 500, timeout, malformed and correction cases;
- no live API calls in CI.

Definition of done: `EDINET_V2_AUTH_MIGRATION_GREEN`.

### Phase C — PIT Price provider promotion

Promote the existing J-Quants client into the P2 PIT Price Store contract.

Requirements:

- Free and Standard use the same provider boundary;
- plan capability flags, not separate business logic;
- dataAsOf, observedAt, retrievedAt, delayDays and isDelayed;
- adjusted and unadjusted prices;
- adjustment factors and corporate actions;
- TOPIX and sector benchmark;
- suspension/no-trade/missing reason;
- content hash, ingestion run ID and supersession;
- license/local-only boundary;
- deterministic fixtures and PIT tests;
- no raw licensed history committed to Git.

Do not purchase Standard until the event timeline and validation queue are ready.

Definition of done: `PIT_PRICE_STORE_CONTRACT_GREEN`.

### Phase D — First official-source pilots

Only after the Known-Bad first evidence package is connected:

1. choose one JPX official measure dataset;
2. measure history, timestamp precision and parser stability;
3. compare incremental value over EDINET/TDnet;
4. retain or reject with a written reason;
5. only then pilot JPX short-selling/margin or gBizINFO.

Do not activate all pilots simultaneously.

### Phase E — Technology Commercialization Graph

Implement a separate schema and manual fixtures before any patent/research API collector.

Required stages:

```text
research
reproduction
grant
patent-family
joint-r-and-d
standardization
prototype
customer-sample
certification
pilot-line
capex
supply-contract
volume-production
revenue
```

Required fields:

- technology ID;
- entity references;
- stage;
- eventAt/publishedAt/observedAt/retrievedAt;
- source and source type;
- predecessor/successor evidence;
- confidence;
- invalidation;
- beneficiary layers;
- rights classification.

Create 3 synthetic fixtures and 1 manually sourced real example only after the schema is green.

### Phase F — First technology Edge activation

Do not activate all catalog entries.

Candidate order:

1. `bottleneck-migration`
2. `supplier-qualification-moat`
3. `research-to-capex`
4. `regulatory-forced-demand`

Activation requires:

- objective trigger;
- entity/supplier map;
- PIT-safe timestamps;
- data rights review;
- historical sample path;
- executable price route;
- confounders;
- precommitted falsification;
- discovery/confirmatory/holdout split;
- VOI comparison against the active Known-Bad work.

Definition of done: `FIRST_TECH_COMMERCIALIZATION_EDGE_ACTIVATED`.

## 5. Source policy

### Allowed discovery

- social networks;
- developer communities;
- GitHub repositories;
- technical articles;
- MCP directories.

They may reveal an API, OSS project or public dataset.

### Prohibited evidence use

- general social posts;
- anonymous claims;
- message-board sentiment;
- influencer recommendations;
- follower/like counts;
- unverified leaks.

### Official account verification

An account is not official because of its name, logo or verification badge.
Treat it as verified only when an official corporate/government website links to the exact account URL. Even then, material facts must be matched to IR, TDnet, EDINET, JPX or the relevant authority.

## 6. Tests

At minimum:

- valid and invalid source catalogs;
- valid and invalid Edge family catalogs;
- duplicate source/family IDs;
- discovery-only source cannot be evidence;
- missing rights classification;
- missing PIT/revision policy;
- active-research state blocked without activation package;
- no catalog item added to active Edge Registry counts;
- secret redaction;
- deterministic output;
- schema unsupported keyword failure;
- document link checks.

Run at the relevant milestones:

```bash
pnpm typecheck
pnpm typecheck:tests
pnpm research:test
pnpm research:check
pnpm check:all
```

## 7. Commit plan

Keep commits small:

```text
feat(research): validate data source catalog
feat(research): validate technology edge families
test(research): cover catalog adoption gates
fix(edinet): migrate v2 authentication safely
test(edinet): cover auth and correction lifecycle
feat(research): add commercialization evidence graph
docs(research): document source and edge activation runbook
```

## 8. Final report

Report:

- start/end branch and SHA;
- files changed;
- existing code reused;
- sources activated, piloted, cataloged or rejected;
- EDINET migration state;
- PIT and rights decisions;
- tests and results;
- commits and PR;
- human registration/API key actions;
- unresolved data gaps;
- next smallest task.

Do not report a live API success when credentials were unavailable or CI used fixtures only.
