# Foundation Decision Integration local store

このディレクトリは、Foundation全stackを横断するDecision integrationのlocal-only runtime storeです。

Gitへ保存するもの:

- このREADME
- `.gitignore`
- schema、validator、tests、runbook

Gitへ保存しないもの:

- `decisions.jsonl`
- `price-snapshots.jsonl`
- 実価格、benchmark値、provider record ID
- licensed raw payload
- Evidence本文、portfolio情報、Secret

## price-snapshots.jsonl

1行1objectで、次の4 roleを実objectとして保存します。

- `issuer_price`
- `issuer_benchmark`
- `topix_benchmark`
- `sector_benchmark`

単なる64文字hashのallow-listではなく、candidate/security/cutoff/observedAt/firstExecutableAt/provider/rawPayloadHash/valueを持つobjectへ解決します。

## decisions.jsonl

Decision recordは以下をexact ID/hashでpinします。

- Security Master snapshot
- Bitemporal Evidence snapshot
- Claim Graph snapshot
- Document Revision / Diff snapshot
- complete Evidence Package
- registered Testable Hypothesis
- registered four-scenario set
- downside/base/upside/null_hypothesis scenario
- Council Replay Manifest / Result
- eligible calibration records
- issuer price / issuer benchmark / TOPIX / sector benchmark object
- issuedAt / informationCutoff / firstExecutableAt

missing、draft、inactive/superseded、future leakage、identity/hash mismatch、incomplete package、blocking unknown、unregistered hypothesis、scenario不足、required persona abstain、binding vetoはfail-closed blockerになります。

## Activation boundary

schema、validator、synthetic fixtureだけでは `FOUNDATION_DECISION_INTEGRATION_V1_GREEN` にしません。

最低条件:

1. Sanrio等1社のlocal-only real Evidence Package
2. outcome前のregistered Hypothesisと4 Scenario
3. actual price/benchmark objects
4. deterministic Council Replay
5. 同一inputから同一Decision hash
6. correction後も過去cutoff結果が不変

このstoreはRecommendation候補の適格性までであり、BUY通知、LINE送信、証券注文、Cloudflare/D1書込みを許可しません。
