# Foundation Decision Integration v1 — 2026-08-06

Status: `CODE_AND_SYNTHETIC_VALIDATION_ONLY`
Branch: `feat/foundation-decision-integration-v1`
Base: main after PR #49

## Purpose

PR #43のCouncil側Decision Firewallを最終正本としてmergeせず、PR #49後の全Foundation stackを横断してactual repository objectへ解決する新しいDecision boundaryを作る。

## Exact object pins

- Security Master snapshot hash
- Bitemporal Evidence snapshot hash
- Claim Graph snapshot hash
- Document Revision / Diff snapshot hash
- Evidence Package ID/hash/status/completeness
- Testable Hypothesis ID/hash
- Scenario Set ID/hash
- downside/base/upside/null_hypothesis Scenario ID/hash
- Council Replay ID/run ID/Manifest hash/Result hash
- eligible calibration hashes
- issuer price object
- issuer benchmark object
- TOPIX benchmark object
- sector benchmark object
- issuedAt / informationCutoff / firstExecutableAt

Evidence Package repositoryがSecurity/Evidence/Claim/Document snapshotを実objectへ解決し、Decision repositoryがPackage/Hypothesis/Scenario/Replay/Calibration/Priceを実objectへ解決する。

## Fail-closed blockers

- missing object
- inactive/superseded head
- draft/incomplete package
- content hash mismatch
- candidate/security/cutoff mismatch
- future Evidence/calibration/price observation
- blocking unknown
- unresolved contradiction
- unregistered Hypothesis
- 4 Scenario不足
- required persona missing/abstain/veto
- binding veto
- packageとprice/benchmark pinの不一致
- firstExecutableAt不一致

## Local-only boundary

`research/foundation_decisions/`のruntime JSONLはGitへ保存しない。

- `price-snapshots.jsonl`
- `decisions.jsonl`

実価格、licensed payload、Evidence本文、portfolio情報、Secretはcommitしない。

## PR #43 reuse policy

PR #43は次の考え方の参考実装として残す。

- deterministic content hash
- append-only audit record
- replay result blocker propagation
- automatic trading false

ただし最終schema/runtimeとしてmergeしない。Evidence Package、Hypothesis、Scenario Set、Document Revision、Bitemporal Evidence、Security Masterのactual object pinが不足しているため。

## Current proof

Synthetic tests prove:

- local price object hash/time validation
- future price observation rejection
- hash文字列だけではeligibleにならない
- missing package/hypothesis/scenarios/replay/calibration/pricesをblockする
- blocker集合・status・eligibilityを再計算する

Synthetic tests do not prove:

- real Security Master identity
- real disclosure/correction replay
- real complete Evidence Package
- real preregistration
- real prices and benchmarks
- real Council replay
- real deterministic cross-stack result

`FOUNDATION_DECISION_INTEGRATION_V1_GREEN`はまだ未達。

## Next real pilot

Sanrio trackをlocal-onlyで1社完走する。

1. verified listed security / issuer / listing
2. primary disclosureとcorrection chain
3. correction前後Bitemporal replay
4. Claim Graph / Document Diff snapshots
5. issuer/TOPIX/sector price objects
6. complete Evidence Package
7. outcome前Hypothesis + 4 Scenario preregistration
8. deterministic Council Replay
9. Foundation Decision integration
10. same input → same hash、correction後もpast cutoff不変

## Safety

このPRはLINE、BUY通知、証券注文、Cloudflare deployment、D1 write、billing、token、Secret、実データを変更しない。
