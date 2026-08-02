# Official Publication Executability Guard

Status: `SHADOW_RESEARCH`
Production use: `REQUIRED_BEFORE_PROMOTION`
Last updated: 2026-08-03 JST

## Research advance

JPX enforcement pages and issuer chronology are useful for identifying event dates, but many archive pages expose only a calendar date in their visible summary. A date-only record is not sufficient to prove that a signal was executable at the same-day close or open.

This guard applies to Known-Bad Event Repricing, Exchange Sanction Ladder, Remediation Clock Surprise, and all reaction-to-news research.

## Core rule

No event may use an entry earlier than the first point-in-time reproducible public availability timestamp.

When the exact publication time cannot be proven, the default executable entry is the next regular-session open after the event date.

Same-day close, intraday, or prior-close entries are prohibited unless a timestamped official source proves availability before the chosen decision cutoff.

## Why this matters

A date-level event ledger can create false alpha by accidentally assuming knowledge before publication. This is especially dangerous for:

- JPX improvement-report requests,
- public measures and listing-agreement penalties,
- improvement-report submissions,
- special-attention designation, continuation, removal, or delisting decisions,
- issuer investigation reports and earnings corrections,
- press conferences or general meetings whose outcome becomes public during or after trading hours.

The bias can be large when an event causes a gap at the next open. Treating the prior close as an available entry converts an untradeable gap into artificial profit.

## Timestamp evidence hierarchy

Use the strongest available official evidence in this order:

1. timestamped TDnet or exchange feed record,
2. timestamped issuer IR release or official RSS/feed record,
3. timestamped regulator or exchange news item,
4. archived official page with trustworthy first-seen timestamp,
5. date-only official page.

A lower-ranked source may identify the event, but must not override a later proven availability time.

## Dataset fields

Every event row should include:

- `event_date_local`,
- `official_published_at_local`,
- `timestamp_precision` (`second`, `minute`, `date_only`, `unknown`),
- `timestamp_source_type`,
- `source_url_or_archive_key`,
- `first_seen_at_local`,
- `market_session_state_at_publication`,
- `earliest_executable_entry`,
- `entry_assumption_reason`,
- `timestamp_confidence`,
- `lookahead_risk_flag`.

## Entry policy

### Proven before market open

The same-day open may be tested only if publication and dissemination occurred before the strategy cutoff and realistic order placement was possible.

### Proven during market hours

Intraday entry may be studied separately, but must include reaction latency, spreads, halts, price limits, and data-feed delay. It must not be mixed with daily next-open research.

### Proven after market close

The next regular-session open is the earliest default entry.

### Date-only or unknown

The next regular-session open after the stated event date is mandatory. If the event date is a non-trading day, use the next trading-day open.

## Validation tests

- reject any row where `entry_time < official_published_at_local`,
- reject same-day-close entries for `date_only` or `unknown` precision,
- require exchange calendar normalization for weekends and holidays,
- preserve original timezone and convert only through explicit rules,
- flag amended or replaced disclosures without deleting the first-known timestamp,
- retain both event occurrence time and public availability time,
- detect pages whose visible date differs from first-seen publication date,
- prevent later archive metadata from being backfilled as contemporaneous evidence.

## Confounders

Publication timing must be separated from:

- concurrent earnings or guidance,
- trading halts and resumptions,
- overnight macro moves,
- weekend information accumulation,
- index rebalances or block trades,
- issuer releases that precede a later JPX enforcement page.

For sanction events, the issuer may disclose relevant facts before JPX formal action. The event study must distinguish first economic information from later formal state transition.

## Impact on current cohorts

The current KDDI, nms Holdings, eMnet Japan, Tokyo Koki, and other remediation/sanction cohorts may use official calendar dates for discovery, but any return calculation must be revalidated against point-in-time publication timestamps before promotion.

JPX official pages confirm the event sequence and dates, including improvement-report requests, public measures, penalties, and submissions. They do not by themselves justify prior-close or same-day-close execution when the visible record is date-only.

## Net Alpha consequence

This guard is expected to reduce apparent gross alpha in event studies that include overnight gaps. That reduction is desirable: only the residual after realistic first-executable entry, spread, borrow, slippage, price-limit, and exit-risk assumptions is eligible as Net Alpha.

## Falsification and promotion rule

An Edge is downgraded or rejected when:

- its effect disappears after shifting entries to the first provably executable time,
- most PnL comes from untradeable overnight gaps,
- timestamps cannot be reconstructed for a representative sample,
- holdout performance depends on weaker timestamp assumptions than training data.

No reaction-to-news Edge may be promoted while material rows retain `date_only` or `unknown` timestamps without next-open conservative treatment.

## Primary-source grounding

Used to anchor event chronology and date-level availability:

- JPX improvement-report and improvement-status-report issuer list,
- JPX KDDI improvement-report request and listing-agreement penalty notice dated 2026-04-30,
- JPX KDDI improvement-report public-inspection notice dated 2026-06-02,
- JPX nms Holdings improvement-report request/public-measure notice dated 2026-05-13,
- JPX nms Holdings improvement-report public-inspection notice dated 2026-06-05.

## Source policy audit

Used: JPX official enforcement pages and issuer chronology.

Not used: SNS, forums, influencers, anonymous posts, or social sentiment.
