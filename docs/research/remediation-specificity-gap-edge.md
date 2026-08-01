# Remediation Specificity Gap Edge

Status: `SHADOW_RESEARCH`
Priority: `MEDIUM`
Production use: `PROHIBITED_UNTIL_VALIDATED`
Last updated: 2026-08-01 JST

## Research question

After a Japanese listed company is required to submit an improvement report, does the *specificity and testability* of its remediation plan predict later governance outcomes, disclosure quality, financing stress, or abnormal returns around the improvement-status report?

This is not a language-sentiment edge. It is a structured official-disclosure quality edge using only company and exchange documents.

## Candidate mechanism

JPX generally requires an improvement-status report roughly six months after an improvement report. That creates a semi-calendarable verification point. Companies can therefore be separated before the follow-up event into:

- measurable remediation plans with owners, deadlines, controls, audit evidence and completion criteria,
- broad policy promises without operational milestones,
- plans dependent on one executive or external adviser,
- plans whose key actions are deferred beyond the expected follow-up window.

A low-specificity plan may indicate that remediation is ceremonial rather than operational. The market may initially treat submission itself as resolution, while the later status report, auditor interaction, filing delay or repeated incident reveals the gap.

## Proposed features

Extract only from official improvement reports, improvement-status reports, investigation reports and company disclosures:

- `action_count`: distinct remediation actions,
- `owner_coverage`: share of actions with a named accountable function,
- `deadline_coverage`: share with a dated deadline,
- `evidence_coverage`: share with an observable completion artifact,
- `control_mapping`: whether actions map to identified root causes and control failures,
- `board_oversight_frequency`: stated monitoring cadence,
- `internal_audit_testing`: whether design and operating-effectiveness testing are specified,
- `subsidiary_scope`: whether domestic and overseas subsidiaries are explicitly covered,
- `system_dependency`: whether ERP, approval workflow or access-control changes are required,
- `people_dependency`: reliance on executive replacement, training or ethics statements without process change,
- `deferred_action_share`: actions scheduled after the expected six-month follow-up,
- `repeat_failure_fingerprint`: overlap with earlier incidents or earlier remediation promises,
- `external_assurance`: independent review, auditor involvement or third-party validation,
- `status_report_variance`: promised versus completed actions at follow-up.

Create a `Remediation Specificity Index` separately from misconduct severity. Do not allow a strong remediation score to erase accounting, solvency, delisting or legal Hard Blockers.

## Initial hypotheses

### H1: Low specificity predicts adverse follow-up

Issuers with low owner, deadline and evidence coverage are more likely to show incomplete remediation, repeated disclosure problems, filing delays or escalation at the later status-report stage.

### H2: Submission-day relief can reverse

Improvement-report submission without materially worse facts may produce uncertainty relief. If the submitted plan is low-specificity, part of that relief may reverse as the verification window approaches or when the status report exposes incomplete execution.

### H3: Root-cause mapping matters more than document length

Long reports are not necessarily better. Incremental prediction should come from action-to-root-cause mapping and verifiable controls, not page count or generic compliance vocabulary.

### H4: Subsidiary-control cases require scope evidence

Where misconduct arose in a subsidiary, plans that only strengthen parent-level policy without subsidiary data access, approval controls, internal audit coverage and escalation channels should score poorly.

### H5: Repeat offenders have asymmetric downside

A low-specificity plan following an earlier remediation cycle may carry more downside than the same plan for a first-time issuer because the recurrence fingerprint reduces the credibility of management assurances.

## Event design

Anchor dates:

1. investigation report,
2. earnings correction,
3. JPX improvement-report request,
4. company improvement-report submission,
5. expected six-month verification window,
6. actual improvement-status report,
7. later repeated incident, sanction escalation, auditor modification or resolution.

Measure benchmark- and sector-adjusted returns at D0, D+1, D+3 and D+5 for stages 3, 4 and 6. Also test medium-window drift from submission to the expected status-report window.

Execution must use publication timestamps and next executable opens. No prior-close fill is permitted when documents were published after market close.

## Historical analog seed set

Use multiple enforcement and issuer classes rather than pooling immediately:

- KDDI (9433): large Prime issuer, material historical correction, strong balance-sheet control group,
- nms Holdings (2162): subsidiary loss-recognition and concentrated authority case,
- eMnet Japan (7036): Growth-market accounting/control case,
- Advance Create (8798): improvement report followed by improvement-status reporting,
- ENECHANGE (4169): former executive involvement and consolidation/SPV governance issues,
- older executive-control and repeated-remediation cases from JPX archives.

The first build should manually label a small gold set before introducing automated extraction.

## Confounders

Control or exclude:

- concurrent earnings and guidance,
- financing announcements and covenant events,
- auditor changes or opinion modifications already known,
- delisting or Special Attention state changes,
- generic distress momentum,
- market-cap, liquidity and segment,
- document publication timing,
- report length and issuer disclosure verbosity,
- root-cause severity and accounting correction magnitude.

## Falsification

Reject or downgrade if:

- specificity features do not predict status-report variance or recurrence,
- results disappear after controlling for issuer size, distress and misconduct severity,
- page length or generic disclosure style explains the signal,
- returns occur before the official document is publicly available,
- one or two distressed microcaps dominate,
- realistic spreads, borrow cost and gap execution remove Net Alpha,
- an untouched holdout fails,
- automated extraction cannot reproduce manual labels reliably.

## Entry / exit candidates

This is initially a ranking and risk-filter Edge, not an automatic short signal.

Potential uses after validation:

- downgrade apparent uncertainty-resolution events when remediation specificity is weak,
- rank follow-up risk before the expected improvement-status window,
- avoid BUY WATCH promotion despite a superficially reassuring submission,
- combine with Exchange Sanction Ladder only if incremental information survives controls.

No production trade until borrow feasibility, execution cost and holdout performance are proven.

## Promotion gate

Require all of:

- independent issuers across Prime, Standard and Growth,
- manually validated labels with stable inter-rater rules,
- incremental prediction beyond misconduct severity, distress and report length,
- PIT-safe timestamps,
- positive Net Alpha or meaningful drawdown reduction after costs,
- untouched holdout pass,
- no single issuer or incident class dominates,
- demonstrated value beyond the existing Response Quality Signal and Exchange Sanction Ladder.

## Current assessment

`RESEARCH CANDIDATE`, not a trading signal.

The promising feature is the semi-calendarable six-month verification cycle: official remediation claims can be scored at submission and compared with actual completion at follow-up. The next step is to create a manually labelled gold dataset from JPX-listed improvement reports and their corresponding status reports, then test whether specificity predicts completion variance before testing returns.

## Source policy audit

Used: JPX rules and official improvement-report / improvement-status-report listings; company official reports planned.

Not used: SNS, forums, influencers, anonymous posts, social sentiment.
