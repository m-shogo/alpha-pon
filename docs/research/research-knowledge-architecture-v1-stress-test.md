# Research Knowledge Architecture v1 — Representability Stress Test

Status: `DESIGN_COMPANION`
Parent design: `docs/research/research-knowledge-architecture-v1.md`

This note records concrete representability checks performed before Research Catalog persistence is authorized. It exists to prevent the abstract ontology from being declared complete before known Alpha Pon research can actually be modeled without collapsing distinct authorities.

## 1. Identity and authority boundary amendment

Research-owned IDs use the Research Catalog ID contract. IDs owned by other authorities keep their own syntax and identity semantics.

Examples:

```text
ResearchItem ID   research-kioxia-post-ipo-rerating
Case ID           case-kioxia-ipo-rerating
Claim ID          claim:kioxia_rerating:structural_discount
Entity ID         issuer:jp:kioxia_holdings
```

Research Relation v1 directly references only the external authorities needed for the catalog's structural links, such as Event, Entity, Document, Watch and Implementation. Their endpoint IDs are opaque to Research Catalog and are not forced into Research Catalog kebab-case syntax.

Claim, Evidence and Outcome relationships are **not duplicated into Research Relation v1**. They remain canonical in the existing Claim Graph, Evidence Package/Store and Recommendation/Outcome lineage and are projected into the future Research Read Model. The Read Model must preserve those external IDs unchanged.

## 2. Case != Company stress test

A `Case` is a bounded episode. It therefore must not embed a ticker/company code as its identity merely to identify the issuer.

Required representation:

```text
Case(case-kioxia-ipo-rerating)
  --involves_entity-->
Entity(issuer:jp:kioxia_holdings)
```

This preserves both facts:

- the Case can survive ticker/name/security changes;
- one issuer can have multiple Cases and one Case can involve multiple entities.

`involves_entity` is therefore added to Research Relation v1.

## 3. Event Chain stress test

Misconduct/remediation research frequently contains an ordered chain:

```text
incident
-> company response
-> investigation
-> sanction
-> remediation
-> verification
```

The Case owns neither Event truth nor Event timestamps. It references canonical Event identities in order:

```text
Case
  --includes_event(order=0)--> Event A
  --includes_event(order=1)--> Event B
  --includes_event(order=2)--> Event C
```

`includes_event` and optional non-negative `order` are therefore added to Research Relation v1. The next semantic-validator slice must enforce the valid endpoint matrix and unique/contiguous ordering where an ordered Event Chain is declared.

## 4. Kioxia representability

The architecture can represent the Kioxia investigation without prematurely creating an Edge:

```text
Observation: post-IPO rerating noticed
ResearchItem: Kioxia post-IPO rerating investigation
ResearchQuestion: what caused the rerating?
Case: Kioxia IPO/post-IPO episode
EntityRef: Kioxia Holdings
Mechanism candidates:
  - structural discount removal
  - NAND/memory cycle recovery
  - AI/storage demand
  - PE exit / supply overhang
  - lock-up / IPO supply-demand
Family candidate: corporate-structure-rerating where appropriate
```

Competing explanations remain separate until Studies can identify contribution. Sample count and confidence are not fabricated at intake.

## 5. Misconduct / Known-Bad representability

The architecture preserves the current direction:

```text
Formal Edge: misconduct-overreaction-recovery
Component: phase3 formal-event repricing
Legacy Edge: known-bad-event-repricing
Lineage: known-bad-event-repricing --merged_into--> misconduct-overreaction-recovery
```

The old Edge remains historical/deprecated rather than being deleted. Formal-event repricing can be represented as a Component/phase and studied separately without creating a duplicate active Edge.

## 6. Ex-rights representability

`ex-rights-overreaction-recovery` remains a distinct Formal Edge because its causal signature differs materially from misconduct/remediation repricing. Cases may reference the relevant security entity and ex-rights Event while Studies test mechanical adjustment versus temporary supply/demand overreaction.

## 7. REVOLUTION representability

The existing REVOLUTION special-attention episode can be represented as a Case linked to its Security/Entity Master identity and relevant exchange Event(s). It can be reused as a seed/supporting/contradictory Case across multiple research questions without becoming a standalone Edge solely because it is interesting.

## 8. Technology Edge Catalog representability

`research/edge_catalog/technology-supply-chain-families.yml` is not treated as a second Formal Edge Registry. Its current entries can be classified during migration into combinations of:

- ResearchItem candidates;
- causal ResearchFamily candidates;
- Mechanism candidates;
- supporting Documents;
- future Studies.

No migration step should promote catalog entries to active Formal Edges merely because they are currently called `families` or `Edge` in prose.

## 9. Schema vs semantic-validator boundary

JSON Schema v1 owns shape, enum and local field constraints. It intentionally does not pretend to validate cross-record semantics that require the catalog as a whole.

The next semantic-validator slice must own at least:

- endpoint existence and allowed source/target matrix per relation type;
- no self relations where meaningless;
- duplicate semantic-relation detection independent of relation record ID;
- Research Lineage cycle detection;
- merge/split/supersede type compatibility;
- at most one active `merged_into` destination for one source;
- `part_of` parent rules for ResearchComponent;
- at most one primary Family where primary Family semantics are used;
- ordered `includes_event` validation;
- Study `registeredAt >= createdAt` and information-cutoff consistency;
- Study Sample Manifest belongs to the declared Study and role matches Study mode;
- included/excluded Case sets are disjoint and Cases exist;
- StudyResult points to its Study and matching Sample Manifest;
- Case `episodeEnd >= episodeStart` when both exist;
- Opportunity `applies_edge` boundary and no Recommendation decision encoded as Opportunity status;
- ResearchItem resolution/stop-state compatibility.

These constraints belong in deterministic semantic code and tests, not in unsupported or misleading JSON Schema conditionals.

## 10. Result

The v1 schema contract is considered representationally adequate for the first persistence-free slice only after these stress-test amendments and CI pass. Canonical Research Catalog rows remain intentionally deferred until semantic validation exists.
