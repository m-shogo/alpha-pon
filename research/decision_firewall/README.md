# Alpha Pon Decision Firewall

This directory stores local append-only DecisionFirewallRecord JSONL data.
Only this README and the nested `.gitignore` are tracked. Real records, locks,
portfolio suitability details and pinned local hashes are not committed.

## Position in the decision path

```text
Raw Source
-> Normalized Evidence
-> Claim / Contradiction Graph
-> Evidence Package
-> Testable Hypothesis
-> Scenario
-> Council Replay
-> Decision Firewall
-> Recommendation Candidate
-> Personal Suitability
-> Explicit Human Order
```

A valid Council Replay does not automatically become a Recommendation.
Decision Firewall independently checks:

- Evidence Package readiness;
- claim, contradiction and correction-chain completeness;
- PIT issuer/TOPIX/sector price snapshot;
- executable route and market-calendar version;
- Security Master and Evidence Store versions;
- all required Unknown Budget categories;
- binding veto state;
- stock-thesis eligibility;
- personal portfolio suitability as a separate decision.

## Unknown Budget

Every record includes exactly one entry for:

```text
entity
time
license
source
evidence_gap
execution
confounder
counterfactual
valuation
liquidity
portfolio_exposure
```

A blocking unknown prevents progression. `portfolio_exposure` is separated so a
stock thesis may remain research-eligible while the user-specific action remains
WAIT/not-assessed.

## Eligibility

Two outputs are preserved:

- `stockRecommendationCandidateEligible`
- `personalRecommendationCandidateEligible`

The second can never be true while the first is false. Neither output is a BUY
recommendation, target price or order authorization.

## Persistence

- append-only JSONL;
- deterministic SHA-256 content hash;
- revisions use `supersedesFirewallId`;
- candidate ID cannot change inside a revision chain;
- issue time and information cutoff cannot regress;
- one candidate has one active head;
- owner-token single-writer lock;
- partial final lines block use;
- append followed by `fsync`.

## Validation

```bash
node --import tsx/esm src/research/cli/validate-decision-firewall.ts
pnpm research:validate
pnpm research:test
```

No local record means the contract exists, but the Decision Firewall milestone
remains unproven.
