# Disclosure Bundle Decomposition Guard

Status: `SHADOW_RESEARCH`
Production use: `REQUIRED_BEFORE_PROMOTION`
Last updated: 2026-08-03 JST

## Research advance

Japanese misconduct events are often disclosed as a bundle rather than a single clean catalyst. A company may publish an investigation report, prior-period corrections, guidance changes, management sanctions, director resignations, financing actions, and remediation measures on the same date or within a narrow window.

Attributing the subsequent return to only one label such as `third-party report`, `formal event`, or `exchange sanction` creates false causal confidence. This guard requires event bundles to be decomposed before Known-Bad Event Repricing, Exchange Sanction Ladder, Remediation Clock Surprise, or any reaction-to-news Edge can be promoted.

## Core rule

No event-window return may be assigned to a single catalyst when multiple economically relevant disclosures became public before the executable entry.

Bundled disclosures must be represented as a set of components with separate novelty, direction, materiality, and timestamp fields. If the components cannot be separated, the row remains usable for discovery but is excluded from single-cause Edge estimation.

## Why this matters

Official JPX chronologies show that enforcement steps often follow issuer disclosures that already contained the investigation findings and financial corrections. For example:

- KDDI disclosed a special investigation report and prior-period corrections before JPX later requested an improvement report and imposed a listing-agreement penalty.
- nms Holdings disclosed an investigation report and then multiple corrections before JPX later requested an improvement report and public measure.

A return around the issuer disclosure date may reflect the accounting correction, loss magnitude, governance findings, management consequences, or guidance revision rather than the formal investigation milestone itself. A later JPX action may likewise overlap with earnings, capital actions, or previously scheduled corporate events.

## Dataset contract

Each event bundle should include:

- `issuer`, `code`, `event_bundle_id`,
- `component_id`, `component_type`,
- `published_at_local`, `timestamp_precision`,
- `earliest_executable_entry`,
- `new_information_flag`,
- `direction` (`negative`, `positive`, `mixed`, `neutral`),
- `economic_materiality`,
- `governance_materiality`,
- `accounting_materiality`,
- `cash_flow_materiality`,
- `management_change_flag`,
- `guidance_change_flag`,
- `capital_action_flag`,
- `sanction_or_regulatory_flag`,
- `uncertainty_reduction_flag`,
- `known_before_bundle_flag`,
- `source_type`, `source_key`,
- `confounder_group`,
- `single_cause_eligible`,
- `exclusion_reason`.

## Component taxonomy

At minimum separate:

1. misconduct facts,
2. actor identity and responsibility,
3. financial restatement or correction,
4. cash loss or provision,
5. earnings or guidance revision,
6. resignation, dismissal, compensation reduction, or other personnel action,
7. third-party committee launch or completion,
8. remediation and internal-control measures,
9. exchange or regulator action,
10. financing, dividend, buyback, TOB, MBO, or other capital action,
11. litigation or criminal-process update,
12. explicit resolution signal such as investigation completion or loss-cap confirmation.

## Attribution policy

### Clean single-component event

A row may enter a single-cause event study when only one material component was public before the executable entry and no same-window confounder is present.

### Multi-component same timestamp

Use a bundle-level outcome. Do not label the return as caused by only the preferred Edge component.

### Staggered components

If official timestamps prove sequential availability and the market had a tradable interval between components, separate event windows may be studied. Otherwise retain one bundle.

### Previously known component

A formally repeated fact should be marked `known_before_bundle=true`; its marginal information content is zero unless the formal state transition itself changes probabilities or constraints.

## Estimation approach

Single-cause promotion requires one or more of:

- matched clean-event samples,
- component-level cross-sectional variation,
- bundle fixed effects,
- leave-one-component-out sensitivity analysis,
- a Counterfactual Twin with similar financial correction but no formal event,
- a Counterfactual Twin with similar formal event but no financial correction,
- sufficiently large samples for multivariate controls.

Do not infer component coefficients from a small, highly collinear sample.

## Confounders and falsification

Downgrade or reject an Edge if:

- apparent alpha is concentrated in bundles containing earnings or guidance revisions,
- the effect disappears in clean-event samples,
- financial correction magnitude explains returns better than the formal event label,
- management resignation or financing action is the dominant explanatory component,
- official timestamps do not permit component ordering,
- manual narratives disagree materially across reviewers,
- bundle composition differs between training and holdout samples.

## Net Alpha consequences

Bundle decomposition can reduce sample size and apparent significance. That is preferable to promoting a non-causal signal. Execution assumptions must use the first entry after all components classified as known at decision time. If a later component arrives before the planned exit, treat it as a new event or censor the window.

## Application to current research

This guard applies immediately to:

- Sanrio Known-Bad Event Repricing calibration,
- KDDI, nms Holdings, and eMnet Japan sanction/remediation cohorts,
- audit-opinion and special-attention cohorts,
- any third-party committee report paired with earnings corrections,
- all event rows where issuer and JPX releases occur in the same trading window.

Existing rows should not be deleted. Mark them `bundle_review_required` until the official disclosure chronology and component timestamps are reconstructed.

## Promotion gate

No reaction-to-news Edge may be promoted unless:

- material bundles are decomposed,
- single-cause estimates exclude unresolved mixed bundles,
- the result survives clean-event and bundle-aware specifications,
- holdout bundle composition is comparable,
- realistic entry timing and transaction costs remain positive,
- no one component or issuer dominates PnL.

## Current assessment

`METHODOLOGY GUARD`, not a trading signal.

The immediate value is preventing Known-Bad Event Repricing and exchange-sanction research from mistaking bundled accounting or guidance news for an independent formal-event effect.

## Primary-source grounding

Used:

- JPX KDDI improvement-report request and listing-agreement penalty chronology,
- JPX KDDI improvement-report submission chronology,
- JPX nms Holdings improvement-report request/public-measure chronology,
- JPX nms Holdings improvement-report submission chronology,
- JPX improvement-report and improvement-status-report issuer list.

## Source policy audit

Used: JPX official enforcement pages and issuer disclosure chronology.

Not used: SNS, forums, influencers, anonymous posts, or social sentiment.
