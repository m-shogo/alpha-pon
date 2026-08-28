# Alpha Pon Research Knowledge Architecture v1

Status: `APPROVED_FOR_SCHEMA_DESIGN`
Baseline main: `0fcb894b6019f0dcdff415b30f300f663f6dc263`
Scope: Research Knowledge / Research Catalog / Research Graph / long-lived research memory
Production trading authorization: `NONE`

## 1. Purpose

Alpha Pon is not an Edge list and not an automatic BUY generator. It is a long-lived market research system that must preserve how a research idea was discovered, what was asked, what mechanisms were considered, what cases and studies were used, what was rejected, what became a formal Edge, how that Edge was applied to a live opportunity, and what was learned later.

The durable loop is:

```text
market/world
-> Event
-> Observation
-> ResearchItem
-> ResearchQuestion / Unknown
-> competing Mechanisms
-> Case / Study / Negative Knowledge
-> Edge Candidate
-> Formal Edge
-> Opportunity
-> Evidence Package
-> Hypothesis / Scenario
-> Council / Recommendation
-> Outcome / Learning
-> Research Process Learning
```

The architecture must remain usable when research grows from tens of records to thousands or tens of thousands and when source vendors, file paths, company names, market structure, schemas, LLMs and infrastructure change.

## 2. Constitution

These principles are above implementation details.

1. **Past must stay past.** Future Evidence or later conclusions must never rewrite historical Evidence, Claims, research decisions or Recommendations.
2. **Evidence is not interpretation.** Raw/normalized Evidence and the conclusions drawn from it are separate authorities.
3. **Research conclusions are not new primary Evidence.** A prior Alpha Pon conclusion may be cited as research provenance, but material claims must remain traceable to original Evidence.
4. **Unknown is a valid state.** Missing confidence, samples, causal attribution or event timing must not be fabricated merely to satisfy a schema.
5. **Discovery does not authorize promotion.** Observation, ResearchItem and Edge Candidate creation never authorizes Shadow/Production promotion or trading behavior.
6. **Failure is knowledge.** Rejected mechanisms, failed studies, counterexamples, negative controls, false analogies and non-executable effects are preserved.
7. **Identity outlives naming and paths.** Titles, aliases, company names and file paths may change without changing the stable identity.
8. **Current state is a projection of history.** Semantic lineage is preserved and the current Read Model is derived from canonical records.
9. **Generated output is never authority.** Dashboard JSON, generated Markdown, search indexes, embeddings and AI summaries are read models only.
10. **One authority per concept.** A single physical directory is not required; each semantic concept has exactly one canonical authority.
11. **Edge is a research result.** A theme, event name, interesting stock move or file named `*-edge.md` is not automatically a formal Edge.
12. **Theme is not Edge or Family.** AI, semiconductors, space, geopolitics and similar labels are orthogonal context/exposure.
13. **Case is not Company.** One issuer may have multiple distinct research episodes and one Case may participate in multiple research questions.
14. **Observation is not Event.** An Event is what happened; an Observation is that a human or system noticed a phenomenon.
15. **Correlation is not causality.** Study results distinguish observed effect from causal identification quality.
16. **Statistical Edge is not executable Edge.** Spread, slippage, reaction speed, liquidity, suspension, borrow and capacity can eliminate an apparent edge.
17. **AI proposes; governance decides.** AI may propose duplicate, merge, split, orphan, mechanism and Edge candidates, but cannot automatically merge, delete or promote them.
18. **Knowledge ages.** Edges, mechanisms, institutional rules and market structure require revalidation rather than permanent truth status.
19. **The research process is itself measurable.** Alpha Pon must evaluate research-source bias, false discovery, duplicate work and coverage gaps.
20. **Portability beats infrastructure lock-in.** Canonical metadata must remain exportable and reconstructable if GitHub, Cloudflare, a database, a provider or a model changes.

## 3. Authority model

| Concept | Canonical authority |
| --- | --- |
| issuer/security identity | Security / Entity Master |
| market/company event | Event domain/store |
| Evidence | Bitemporal Evidence Store |
| factual/assumption/forecast interpretation | Claim Graph |
| research identity and relationships | Research Catalog |
| reusable market mechanism | Mechanism Library within Research Catalog |
| research case | Case Registry within Research Catalog |
| study design/result metadata | Study Registry within Research Catalog |
| formal investable/research Edge | existing Edge Registry |
| hypothesis/scenario | existing Hypothesis/Scenario ledgers |
| Recommendation | Recommendation store |
| Outcome/Learning | existing governed outcome/learning lineage |
| Watch execution rules | existing Watch config |
| implementation | source code |
| Company Memory | issuer-centric derived read model |
| Research Graph | derived projection from Research Catalog |
| Dashboard / owner UI | Research Read Model only |
| full-text/vector search | derived index only |

The previous wording that `research/` is the single physical source of truth should evolve into **one authoritative source per concept**. Existing authorities are not collapsed into one universal graph.

## 4. Separate graph responsibilities

### 4.1 Entity Graph

Answers who/what is related in the real world: company, security, parent, subsidiary, fund, PE owner, supplier, customer, person, regulator, exchange, product, technology and geography.

### 4.2 Claim Graph

Answers what propositions are supported, contradicted, corrected, invalidated or superseded. The existing Claim Graph remains separate from Research Knowledge.

### 4.3 Research Graph

Answers what Alpha Pon is researching, why, with which mechanisms/cases/studies, and how research objects relate. It is a **logical projection**, not a new graph database.

### 4.4 Decision/Learning Lineage

Answers what Alpha Pon hypothesized, recommended, observed and learned. Existing governed Hypothesis/Scenario/Recommendation/Outcome records remain their own authority.

## 5. Research Catalog v1 entities

Only concepts with durable identity become first-class entities.

### ResearchItem

The central research identity. It may exist with sample count zero, unknown confidence and no known mechanism. A user idea such as "why did Kioxia rerate after IPO?" should be preservable immediately without creating a fake formal Edge.

Lifecycle:

```text
captured -> triage -> investigating -> synthesized -> resolved
                       \-> parked
resolved/parked -> archived
```

Resolution may be `existing_edge`, `component_candidate`, `new_edge_candidate`, `case_only`, `theme_context`, `infrastructure`, `not_repeatable`, `invalid_premise`, `insufficient_evidence` or `duplicate`.

### ResearchQuestion

A concrete question inside research. One ResearchItem may have multiple questions and questions may remain open even when other parts are resolved.

Lifecycle: `open | partially_answered | answered | blocked | obsolete`.

### Observation

A record that a person or system noticed something. Origin must be explicit, such as `user`, `world_scan`, `company_watch`, `document_diff`, `agent_discovery`, `orphan_detection`, `outcome_learning`, `manual_research` or `external_news_discovery`.

Observation must not contain a disguised causal conclusion.

### Mechanism

A reusable causal building block such as forced selling, limited attention, lock-up supply, governance discount, information delay, inventory cycle or structural discount removal. Mechanism is not a theme.

### ResearchFamily

A high-level causal-mechanism family, not a sector/theme bucket. Examples may include temporary supply-demand dislocation, misconduct/remediation repricing, corporate-structure rerating, information timing/microstructure, industry-cycle repricing and technology-commercialization repricing.

An Edge should normally have one primary Family for machine semantics; additional contextual relationships may be represented separately.

### ResearchComponent

A non-Edge research component with `kind`:

```text
phase | subsignal | filter | cohort | calibration | guard | fixture
```

This prevents every useful note or sub-pattern from becoming another Edge. A truly cross-cutting guard should instead remain infrastructure and be referenced, not copied under each Edge.

### Case

A bounded real-world research episode, not an issuer identity. `Kioxia IPO/post-IPO rerating` is a Case; Kioxia is the issuer. A Case may be reused by multiple studies and research items.

Case usage roles belong on relationships or study sample manifests: `seed`, `supporting_sample`, `negative_control`, `near_miss`, `contradictory`, `confounded`, `calibration`, `holdout`, `out_of_sample`.

### Study

A specific research design used to test a Question or Edge. It is different from the Edge itself and from a Recommendation Outcome.

Study modes:

```text
exploratory | calibration | confirmatory | holdout | out_of_sample | revalidation
```

A Study owns an immutable sample manifest that records inclusion/exclusion decisions and selection cutoff before applicable outcome inspection.

### StudyResult

The result of a Study. It is not the Outcome of an individual Recommendation. StudyResult records effect summary, uncertainty/limitations, causal-identification quality and exploitability assessment without rewriting the Study design.

### Opportunity

A live/current instance where an existing Edge may apply. It bridges formal Edge knowledge to Evidence Package/Hypothesis/Decision without conflating a general Edge with one live company/event episode.

Lifecycle:

```text
detected -> screening -> evidence_building -> hypothesis_ready -> decisioned
                                 \-> invalidated
any nonterminal -> expired
```

## 6. Concepts that are not first-class entities in v1

The following are structured assessments/child records rather than top-level graph nodes unless future use proves otherwise:

- Research Gap / Unknown register
- Applicability Profile
- Market Regime context
- causal Identification Quality
- Exploitability
- Edge Health / decay state
- multidimensional confidence
- Stop Reason
- Negative Knowledge finding

This prevents ontology growth from becoming the product.

## 7. Event and Event Chain

Event is a separate world-domain identity. The same Event may be discovered by multiple Watch rules, documents or humans. Research Catalog references it; it does not own the event truth.

A Case may reference a sequence of Events forming an Event Chain, e.g. incident -> investigation -> sanction -> remediation -> verification. This is particularly important for misconduct research.

## 8. Alternative explanations

A ResearchQuestion may consider multiple competing Mechanisms, including a null explanation. The relation carries stance such as:

```text
candidate | primary | secondary | competing | weakened | rejected
```

This is required to reduce confirmation bias. The first plausible mechanism must not silently become the only explanation.

## 9. Study and sample integrity

A Study should define, before confirmatory interpretation where applicable:

- research question / target Edge
- study mode
- population
- inclusion/exclusion rules
- sample selection cutoff
- metrics / benchmarks
- confounder and counterfactual policy
- holdout/out-of-sample role
- execution assumptions

The immutable Sample Manifest records included cases and excluded cases with reasons. Case roles cannot be retroactively changed to make results look stronger.

## 10. Exploration Ledger and false-discovery control

Exploratory research may try many horizons, filters, sectors or subgroups. Those attempts must remain visible enough to distinguish a preregistered result from a condition selected after seeing outcomes.

Formal Edge promotion must account for exploration history and require confirmatory/holdout evidence when discovery involved broad search. This extends the existing Edge `falseDiscoveryGuard` rather than replacing it.

## 11. Edge identity and merge rules

Formal Edge Registry remains canonical for formal Edges. Edge identity is compared using a causal signature:

1. Event population
2. affected entity population
3. market mechanism
4. reacting/constrained market participant
5. PIT information timeline
6. entry information set
7. unit of analysis
8. primary outcome/horizon
9. counterfactual
10. regime boundary when materially necessary

If these are substantially the same, prefer Component/Phase/Filter/Subsignal/Study rather than another Edge.

`merged` is not an Edge maturity status. A merged Edge remains `deprecated` with semantic lineage such as `merged_into` and explicit disposition metadata. Splits are equally important: one historical Edge may later split into multiple distinct causal mechanisms.

## 12. Research relations v1

Keep the ontology intentionally small.

Semantic relations:

```text
observes_event
addresses
member_of
part_of
considers_mechanism
studies
used_in
documents
operationalizes
implements
applies_edge
triggered_by
depends_on
```

Lineage relations are separate append-only semantic history:

```text
derived_from
merged_into
split_into
supersedes
reclassified_as
```

Do not persist inverse pairs such as both `parent_of` and `child_of`; derive the inverse. Do not use a generic `related_to` relation for machine decisions.

Relationship roles carry detail rather than creating dozens of relation types, for example `used_in(role=negative_control)` or `considers_mechanism(role=competing)`.

## 13. Identity contract

Every new Research Catalog entity has a stable immutable `id`, plus mutable display fields such as title and aliases. Renaming a title or moving a file never regenerates an identity.

File path is not identity. Existing Edge IDs are grandfathered and are not mass-renamed merely to match a new convention.

## 14. Temporal and semantic history

Evidence time remains owned by the existing Bitemporal Evidence Store. Research Catalog does not duplicate `publishedAt/retrievedAt/firstExecutableAt` semantics.

Research metadata uses only the time needed for its own semantics, such as `createdAt`, `recordedAt`, `informationCutoff`, `lastReviewedAt`, `effectiveFrom/effectiveTo` where relevant.

Cosmetic/descriptive changes can rely on Git history. Semantic events must be append-only lineage, including merge, split, reclassification, material status transition and mechanism rejection.

The long-term target is an `as-of` Research Read Model capable of answering what Alpha Pon knew/believed at a historical cutoff without hindsight mutation.

## 15. Knowledge aging and resurrection

Knowledge is not permanently current. Edges and mechanisms may have review/validation dates and can become weakening, crowded, regime-broken or dead. Historical records are not deleted.

A dead/deprecated Edge may later receive a new `revalidation` Study under a changed regime. The old death/deprecation reason remains intact.

## 16. Investigation trace and absence claims

A research process must distinguish:

- evidence was searched and absent;
- only partial sources were searched;
- a source was unavailable;
- the source was never searched.

Investigation traces should therefore preserve source coverage and search completeness. Alpha Pon should say "not found in the searched scope" rather than "does not exist" unless the evidence actually supports absence.

## 17. Negative Knowledge and Anti-Edge

Negative knowledge is preserved as Study/Research findings, including `wrong_mechanism`, `already_priced_in`, `no_effect`, `inverse_effect`, `confounded`, `not_executable`, `regime_dependent`, `data_artifact`, `false_analogy`, `selection_bias` and `insufficient_sample`.

There is no separate canonical Anti-Edge database in v1. An Anti-Edge view is generated from rejected candidates, failed Studies and negative findings.

## 18. Research portfolio and self-evaluation

VOI should not simply reward the easiest available data. Research prioritization should consider importance, uncertainty reduction, reuse value, Edge potential, timeliness, coverage value and research cost.

Meta Research should expose concentration and process bias such as Family/sector/market-cap/country/long-short/origin coverage and Data Availability Bias.

Alpha Pon should evaluate its own research origins (user observation, world scan, agent discovery, orphan detection, company watch, outcome learning) for duplicate rate, useful negative knowledge, holdout failure and later research reuse. Edge count or hit rate alone must not become the optimization target.

## 19. Research Catalog, Graph and Read Model

```text
Research Catalog = canonical metadata and semantic relations
Research Graph   = logical projection of Catalog
Research Library = original Markdown/reports/documents
Research Read Model = generated cross-store current/as-of view
Search/Embedding = derived retrieval indexes
```

Dashboard and Research Agent should ultimately consume the Research Read Model rather than treating the existing Edge-only `loadResearchState()` as the complete research universe.

## 20. Existing repository boundaries

- Existing Edge Registry remains authoritative for formal Edges.
- Existing Claim Graph remains authoritative for Claim/Evidence epistemic relationships.
- Existing Evidence Store remains authoritative for bitemporal Evidence.
- Existing Hypothesis/Scenario/Recommendation/Outcome contracts remain intact.
- `research/edge_catalog/technology-supply-chain-families.yml` is a candidate research catalog, not an active Edge registry. Its future contents should be classified into ResearchItem/Family/Mechanism concepts rather than being treated as a second formal Edge registry.
- `research/intake-inventory-orphan-guard` consolidation map remains a migration/classification worksheet, not the final ontology.
- Company Memory remains an issuer-centric derived reflection/read model, not primary Evidence or Research Catalog truth.
- World Impact is primarily a discovery engine; its generated inference is not canonical Evidence.
- Watch rules operationalize research but are not Edges.
- Source code implements research/watch behavior but is not research identity.

## 21. Orphan detection

Discovery should be staged:

1. deterministic structured scan;
2. explicit ID/reference resolution;
3. heuristic lexical candidate detection;
4. semantic/AI candidate review.

AI may classify a candidate as `existing_research_link_missing`, `component_candidate`, `new_edge_candidate`, `case_candidate`, `infrastructure`, `duplicate_candidate`, `not_research` or `unclassified`, but may not auto-register/merge a formal Edge.

Generated UI/read-model files must not become a source for discovering new canonical research, avoiding self-reference loops.

## 22. Human vs automated intake

An explicit human research idea may create a ResearchItem immediately, even when sample count and confidence are unknown.

Automated discovery should normally create an Observation/discovery candidate for triage first, preventing automated scans from flooding canonical ResearchItem storage.

## 23. Storage and evolution

Git + sharded YAML/JSONL remains appropriate for canonical research metadata while writes are low-frequency and human-reviewable. Do not move to a graph database merely because the model is graph-shaped.

Database migration should be triggered by measured operational pain such as concurrent writers, expensive graph traversal/compilation, transactional needs, external writers or hundreds of thousands of frequently-mutated relations.

If storage moves to a database later, a portable canonical export remains mandatory.

`schemaVersion` and `ontologyVersion` are separate concepts. Schema version changes syntax/shape; ontology version changes meaning. Existing enum meanings must not silently change under the same ontology version.

## 24. Hot/Warm/Cold knowledge

Preservation does not mean loading everything into every Agent context.

```text
HOT  = active research/live opportunities
WARM = resolved/recent reusable research
COLD = historical/archived knowledge
```

Cold knowledge remains searchable and linkable but should not dominate normal Agent context.

## 25. Backup and portability

A backup is not proven until restore + validation succeeds. Canonical metadata should support reproducible export, hash validation and restore drills independent of UI/generated artifacts.

## 26. Research Debt read model

Research Debt is derived, not separately authored. Examples include untriaged observations, stale questions, orphan documents, missing negative controls, unresolved contradictions, duplicate candidates, stale Edge reviews, missing outcomes and old unresolved unknowns.

## 27. Schema design slice

The first implementation slice is intentionally contract-only. It defines schemas for:

- ResearchItem
- ResearchQuestion
- Observation
- Mechanism
- ResearchFamily
- ResearchComponent
- Case
- Study
- StudySampleManifest
- StudyResult
- Opportunity
- ResearchRelation
- ResearchLineage

It does **not** yet add canonical data rows, persistence writers, loaders, dashboard integration, Queue mutation, Edge promotion or production behavior.

The schemas must explicitly preserve these boundaries:

- ResearchItem can exist without sample/confidence/Edge fields;
- no generic `related_to`, `parent_of` or `child_of` machine relation;
- `merged` is not a maturity status;
- Study mode and sample selection cutoff are explicit;
- excluded Cases require reasons;
- Lineage is separate from ordinary semantic relations;
- unknown/negative findings do not force Edge creation;
- Opportunity is separate from Edge and Recommendation.

## 28. Migration order

1. architecture and constitution;
2. schema contracts + tests;
3. relation/lineage semantic validation;
4. minimal Catalog overlay with a few known examples;
5. orphan detection warning-only;
6. legacy research classification without mass file moves;
7. generated Research Read Model;
8. owner Dashboard integration;
9. ResearchWork queue;
10. full-text search;
11. semantic duplicate/case similarity;
12. Opportunity/Event bridge;
13. storage migration only if measured pain exists.

## 29. Non-goals and safety boundary

This architecture work does not authorize or modify:

- BUY/SELL rules;
- automatic trading;
- position sizing;
- LINE delivery;
- Production/Shadow Edge promotion;
- portfolio mutation;
- Cloudflare/D1 production mutation;
- fabricated real Evidence, samples or backtest results;
- licensed data committed to Git.

## 30. Definition of Done for architecture v1

Architecture v1 is considered stable enough for Catalog persistence only when:

- Constitution and authority matrix are committed;
- entity definitions and lifecycle boundaries are committed;
- Relation v1 and Lineage v1 are schema-tested;
- identity and ontology-version contracts are schema-tested;
- Study/Sample/Result boundaries are schema-tested;
- Opportunity is distinct from Edge/Recommendation;
- existing Edge/Claim/Evidence/Hypothesis authorities remain unchanged;
- Kioxia, Misconduct/Known-Bad, Ex-rights, REVOLUTION and Technology Catalog examples can be represented without semantic contradiction;
- no schema requires invented confidence/sample/Gate values merely to preserve an early idea;
- repository tests and CI are green for the exact branch HEAD.

The core principle is:

> Alpha Pon is not a database of answers. It is a durable record of what was observed, what was questioned, what was tested, what failed, what changed our mind, and why.
