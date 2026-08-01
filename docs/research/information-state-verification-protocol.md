# Point-in-Time Information-State Verification Protocol

Status: `CURRENT_AUTHORITY`
Applies to: all Alpha Pon company-event, misconduct, governance, earnings, litigation, regulatory, and trade-timing research
Effective: 2026-08-01 JST

## Purpose

A stale fact, a previously known fact mislabeled as new, or an inference presented as confirmed can directly cause an incorrect trade. This is a capital-safety issue, not a wording issue.

No company-event conclusion or buy/sell timing recommendation may be produced until the information state has been reconstructed at the answer timestamp.

## Mandatory four-way classification

Every material statement must be assigned to exactly one class:

1. `NEW_CONFIRMED_FACT` — newly disclosed in the current event/window and confirmed by a primary source.
2. `PREVIOUSLY_KNOWN_FACT` — public before the current event/window; the original publication timestamp must be retained.
3. `INFERENCE_OR_UNCONFIRMED_REPORT` — analysis, inference, or reporting not yet confirmed by a primary source.
4. `OPINION_OR_TRADE_DECISION` — valuation view, scenario judgment, or trade action derived from the evidence.

These classes must never be collapsed into one narrative.

## Required source order

Before stating that an event created, resolved, worsened, or did not worsen a company-specific problem, check in this order:

1. company IR and official releases,
2. TDnet / JPX,
3. EDINET and statutory filings where relevant,
4. regulator, court, ministry, exchange, or other public authority,
5. multiple reliable major news organizations,
6. market price, volume, benchmark, sector, margin, and short-sale data.

Social media, message boards, anonymous posts, and influencer commentary are prohibited as factual evidence.

## Freshness gate

For any current or recent event, the researcher must:

- search again at the time of analysis rather than rely on prior chat context,
- record the answer timestamp in JST,
- confirm the latest official disclosure timestamp,
- distinguish the event date from the publication date,
- check for post-event corrections or follow-up releases,
- verify the current and event-window market data independently.

If the latest official state cannot be verified, the conclusion must be labeled `UNVERIFIED` and no confident trade recommendation may be issued.

## Incremental-information test

For each event, create a fact ledger with:

- fact description,
- first-public timestamp,
- source,
- status before the event,
- status after the event,
- whether it is materially decision-changing,
- confidence level.

A formal meeting, press conference, final report, lawsuit, sanction, corrected filing, or resignation is not automatically a new negative fact. The analysis must identify the incremental information introduced by that event.

If no materially worse fact was introduced, write explicitly:

> No materially decision-changing new negative fact was identified in the reviewed event materials as of the analysis timestamp.

Do not shorten this to “new scandal” or “additional misconduct” unless the evidence supports that exact claim.

## Trade-recommendation gate

A buy/sell timing recommendation requires all of the following:

- current price and recent price path,
- upcoming official catalysts and dates,
- valuation or expectation context,
- downside scenarios,
- explicit separation of confirmed facts from inference,
- acknowledgement when data is incomplete,
- position-sizing or staged-entry logic rather than false precision.

A recommendation must not be driven by a misclassified information state.

## Sanrio calibration lesson

For Sanrio continuation-meeting analysis, the known governance/remuneration issue and any newly disclosed facts at the continuation meeting must be treated separately. The existence of a previously reported issue must never be restated as though the continuation meeting revealed a new scandal.

The Sanrio case remains a calibration example for the Known-Bad Event Repricing Edge and for this verification protocol. It is not proof of an edge and not permission to reuse stale conclusions.

## Failure handling

If a classification error is found:

1. retract the affected conclusion,
2. identify the exact known/new/inference boundary that failed,
3. re-run the latest primary-source and market-data checks,
4. reassess the trade conclusion from zero,
5. update the repository protocol or tests when the failure mode is reusable.

## Non-negotiable rule

When facts are uncertain, say they are uncertain. Never fill an evidence gap with a plausible story, especially when the output may influence a real-money trade.
