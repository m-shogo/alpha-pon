# Known-Bad Event Repricing Edge

Status: `SHADOW_RESEARCH`
Priority: `HIGH`
Production use: `PROHIBITED_UNTIL_VALIDATED`
Initial case: Sanrio Co., Ltd. (`8136`)
Last updated: 2026-08-01 JST

## 1. Research question

Can a repeatable, executable Japanese-equity edge be extracted from cases where:

1. a corporate misconduct or governance problem is already substantially known,
2. a formal resolution event is scheduled,
3. no materially worse new fact is disclosed,
4. the stock still produces a negative abnormal return around the formal event?

The candidate mechanism is not "predicting hidden bad news." It is repricing of previously known bad news when an official event converts expectations, positions, or governance uncertainty into a tradable catalyst.

Working names:

- Known-Bad Event Repricing Edge
- 既知悪材料・正式イベント通過売りEdge

This is a supplementary Alpha Pon research track. It must not become a main production edge merely because one salient case worked.

## 2. Candidate mechanisms

The following mechanisms must be measured separately rather than collapsed into one narrative:

### 2.1 Resolution-expectation unwind

The market may buy ahead of a formal event in expectation of:

- no additional misconduct,
- a clean end to the investigation,
- a limited loss estimate,
- management reassurance,
- governance repair,
- short-covering after uncertainty is removed.

If the event contains no incremental positive information, those expectations can unwind even when no new negative fact appears.

### 2.2 Positioning and forced de-risking

Possible channels:

- elevated margin-buy balances,
- event-driven long positioning,
- profit-taking after a pre-event rebound,
- institutional risk rules that react to formal confirmation rather than initial reports,
- stop-loss cascades after the first negative price move.

### 2.3 Official-status transition

A known issue may change state at:

- shareholder meeting or continuation meeting,
- press conference,
- third-party committee final report,
- administrative disposition,
- lawsuit filing,
- corrected securities report or earnings release,
- resignation, dismissal, arrest, indictment, or final disciplinary action.

The information content may be low while the legal, governance, accounting, or portfolio-management status changes materially.

### 2.4 Pure confounding or coincidence

The hypothesis must be rejected where returns are better explained by:

- same-day earnings or guidance,
- market or sector drawdown,
- index rebalance or passive flow,
- block trade or shareholder sale,
- valuation compression,
- macro news,
- options or futures expiry,
- unrelated company-specific disclosure,
- pre-existing momentum reversal.

## 3. Initial case: Sanrio (8136)

Sanrio is retained as an initial calibration case, not proof.

Observed candidate pattern:

- the misconduct and inappropriate remuneration issue was already public,
- a formal continuation meeting was scheduled,
- the market had time to understand the core issue,
- no clearly decision-changing new misconduct fact was identified in the event itself at initial review,
- the stock fell materially on the event date,
- a large part of the decline appears to have occurred before the continuation meeting started,
- the stock had rebounded into the event and margin positioning may have been heavy.

Primary hypothesis for this case:

> The decline was more likely an unwind of resolution expectations and crowded positioning than a direct response to materially new information disclosed at the continuation meeting.

This remains provisional until timestamped disclosures, intraday prices, volume, margin data, benchmark returns, and all same-day confounders are reconstructed from primary and authoritative sources.

## 4. Event universe

Japanese listed-company cases should be collected from:

- shareholder meetings and continuation meetings,
- management press conferences,
- third-party or special investigation committee final reports,
- administrative sanctions and inspection results,
- lawsuit filings and damage claims,
- corrected annual securities reports and corrected earnings,
- audit opinion or internal-control updates,
- executive resignation, dismissal, arrest, indictment, or disciplinary action,
- formal investigation completion and loss-cap confirmation.

Information sources:

- company IR and official releases,
- TDnet,
- JPX,
- EDINET and securities reports,
- regulators, ministries, courts, municipalities, and other public authorities,
- reliable major reporting where primary documents are insufficient,
- market price, volume, benchmark, sector, short-sale, and margin-balance data.

Prohibited sources:

- social media,
- message boards,
- anonymous posts,
- influencer commentary,
- social-media sentiment or topic volume.

## 5. Inclusion criteria

A case can enter the core sample only when all conditions below are supportable with point-in-time evidence:

1. The principal negative fact was public before the event window.
2. A formal event date and, when relevant, event time are known.
3. The event does not introduce a clearly dominant new negative fact, or the incremental information can be separately classified.
4. Price and benchmark data are available.
5. Major confounders are identifiable.
6. The stock was executable for the tested entry route.

Cases with uncertain event timestamps may enter an auxiliary sample but not the strict intraday sample.

## 6. Required features

### 6.1 Information state

- initial incident timestamp,
- first company confirmation timestamp,
- investigation start,
- interim report,
- final report,
- loss estimate history,
- executive involvement history,
- accounting and internal-control impact,
- event type and timestamp,
- incremental information score,
- evidence confidence,
- confirmed versus reported state.

### 6.2 Price and positioning

- event-minus-20 to event-plus-20 daily returns,
- intraday return where timestamps are available,
- TOPIX-relative return,
- sector-relative return,
- beta-adjusted abnormal return,
- pre-event 5-day and 20-day abnormal return,
- rebound from post-incident low,
- volume and turnover percentile,
- margin-buy and margin-sell balances,
- lending availability,
- short-sale restriction status,
- reverse-premium or stock-borrow cost where available,
- free float and liquidity.

### 6.3 Business and valuation context

- valuation percentile,
- earnings revision trend,
- business momentum,
- founder or executive dependence,
- separability index,
- corporate contagion risk,
- resolution stage,
- recurrence fingerprint,
- response quality based only on official action, investigation, sanctions, remediation, and disclosure quality.

## 7. Outcome windows

At minimum calculate:

- previous close to event-day open,
- event-day open to close,
- event-day close to next-day open,
- event day,
- event plus 1 trading day,
- event plus 3 trading days,
- event plus 5 trading days,
- event plus 10 trading days.

Test entry variants separately:

- previous-day close,
- event-day open,
- first tradable price after the official disclosure,
- failed rebound entry after the first reaction.

Do not combine these routes because implementation feasibility and alpha decay differ materially.

## 8. Confounder controls

Each case requires an explicit confounder ledger covering:

- earnings, guidance, dividend, buyback, split, financing, or M&A,
- sector and index moves,
- major shareholder sales or ownership changes,
- passive-index changes,
- analyst rating or target-price clusters where timestamped and authoritative,
- macroeconomic or regulatory shocks,
- stock-specific technical events,
- price limit, trading halt, or restricted short selling.

A case cannot be labeled as supportive if a stronger same-window explanation remains unresolved.

## 9. Counterfactuals and analogs

For each event, construct:

- a sector and size-matched counterfactual twin without a misconduct event,
- an event analog with similar misconduct severity but no pre-event rebound,
- an analog with similar pre-event rebound but no formal misconduct-resolution event,
- a permanent-damage analog and a temporary-damage analog.

The edge must add explanatory power beyond simple short-term reversal, high valuation, or crowded margin buying.

## 10. Statistical and capital-survival gates

The edge may be promoted only after all gates pass.

### 10.1 Discovery controls

- preregister the strict inclusion rule,
- separate exploratory and confirmatory samples,
- maintain an untouched holdout vault,
- control multiple testing and specification search,
- report confidence intervals and base rates,
- retain failed and null cases.

### 10.2 Economic significance

Evaluate net rather than gross returns after:

- commissions and spread,
- slippage,
- stock-borrow fee,
- reverse premium,
- failed borrow or partial execution,
- price-limit and liquidity constraints,
- gap risk and forced exit risk.

### 10.3 Portfolio survival

- concentration by event type, year, sector, and market regime,
- correlation with other Alpha Pon edges,
- tail-loss distribution,
- short squeeze and overnight-gap scenarios,
- maximum realistic capacity,
- opportunity cost versus existing edges.

## 11. Promotion criteria

Do not promote based on hit rate alone.

Candidate promotion to a main edge requires:

1. a sufficiently broad Japanese-equity sample,
2. positive net abnormal return in the confirmatory sample,
3. positive net abnormal return in the untouched holdout,
4. stability across multiple event years and event types,
5. no dependence on one famous case, one sector, or one market regime,
6. robustness after excluding same-day earnings and ownership-flow events,
7. executable borrow and liquidity in a meaningful share of signals,
8. bounded tail risk under realistic stop and exit rules,
9. incremental value over generic short-term reversal and crowded-positioning models,
10. an explicit invalidation rule and decay monitor.

Until then, status remains `SHADOW_RESEARCH`.

## 12. Rejection criteria

Reject or demote the edge if any of the following holds:

- abnormal returns disappear after benchmark and confounder adjustment,
- the effect is explained by pre-event momentum reversal alone,
- the effect is concentrated in Sanrio or a few outliers,
- borrow and execution costs remove net alpha,
- event-day gaps consume nearly all theoretical return,
- holdout performance is null or negative,
- post-publication or recent-period decay is severe,
- the strategy creates unacceptable short-squeeze or overnight tail risk.

## 13. Immediate next research tasks

1. Reconstruct the Sanrio event timeline using point-in-time primary sources.
2. Confirm exact continuation-meeting start time and all relevant disclosure timestamps.
3. Calculate daily and intraday abnormal returns against TOPIX and sector benchmarks.
4. Reconstruct pre-event rebound, volume, margin balance, and short-sale feasibility.
5. Identify and resolve every same-day and previous-day confounder.
6. Build the first historical sample of Japanese continuation meetings, final investigation reports, administrative sanctions, lawsuits, and corrected filings.
7. Define a frozen v0.1 data contract before evaluating profitability.
8. Keep this research separate from the production 12/20 misconduct score and from Sanrio named-watch calibration.

## 14. Current decision

- Research value: `HIGH`
- Evidence level: `INSUFFICIENT`
- Production signal: `OFF`
- Main-edge promotion: `NOT APPROVED`
- Sanrio conclusion: `CANDIDATE SUPPORTING CASE, NOT PROOF`

The key unresolved question is whether formal-event repricing contains incremental, executable information after controlling for pre-event rebound, crowded positioning, and generic reversal effects.
