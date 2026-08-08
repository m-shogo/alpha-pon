# J-Quants Free Local Price Store Audit

Status: `READ_ONLY_LOCAL_AUDIT_CANONICAL_RUNBOOK`
Updated: 2026-08-08 JST

## Purpose

実J-Quants価格はlocal-onlyです。raw OHLCV、raw JSONL、contentHash、absolute local pathをGitHub / Actions / chatへ出さずに、ローカルPrice Storeの安全性・欠損・coverageを確認するためのread-only監査です。

この監査は価格の正しさや投資判断を保証しません。Foundation pilot、Recommendation、Quantitative Outcome、BUY判断を承認するものでもありません。

## Canonical command

repo rootから実行します。

```bash
bash scripts/run-jquants-free-price-store-audit-local.sh
```

既定root:

```text
research/prices/jquants-free
```

別rootを明示する場合:

```bash
bash scripts/run-jquants-free-price-store-audit-local.sh /path/to/local/jquants-free
```

このrunnerはnetwork fetchを行わず、既存local fileをread-onlyで監査します。

## Status interpretation

### `no_local_price_files`

- 対象local storeがまだ存在しない、または安全に監査できるprice JSONLが0件。
- エラーではありません。
- real J-Quants fetchを実行済みと推測しないでください。

### `ok`

- 読み込めたlocal JSONLがcanonical Price Store / hardening validatorを通過。
- filesystem safety issueなし。
- ただしreal market completeness、TOPIX/sector benchmark、Corporate Action Clearance、Foundation readinessを意味しません。

### `issues_found`

fail-closedです。先に問題を診断し、価格fileを編集・rename・hash書換えして通そうとしないでください。

代表的なfilesystem issue:

```text
unsafe_root
unsafe_price_file
hard_linked_price_file
oversized_price_file
invalid_price_jsonl
nested_price_directory
unsafe_non_price_entry
too_many_price_files
```

## Output safety

reportは次を明示的にfalseへ固定します。

```text
rawValuesIncluded: false
rawLinesIncluded: false
absolutePathsIncluded: false
automaticTradingAuthorized: false
```

出力対象はmetadata中心です。

- fileCount
- recordCount
- seriesCount
- errorCount / warningCount
- issue code counts
- security / benchmark identity
- market / source / provider plan
- earliest / latest trading date
- traded / suspended / no_trade / missing count
- missingReason counts
- revision count

raw OHLCV、raw JSONL line、contentHash、absolute filesystem pathは出しません。

## Filesystem boundary

監査はprovider root直下だけを対象にします。再帰探索しません。

安全条件:

- rootはreal directoryでsymlinkではない
- JSONLはregular file
- hard linkではない (`nlink === 1`)
- 1 file <= 16 MiB
- 最大128 JSONL
- nested directoryは監査対象外に隠せるためissue
- non-price symlinkもissue

unsafe fileは可能な限りread前に拒否します。

## Local sequence with fetch

### 1. Audit current store first

```bash
bash scripts/run-jquants-free-price-store-audit-local.sh
```

### 2. Check J-Quants runner without network

```bash
bash scripts/run-jquants-free-price-provider-local.sh
```

### 3. Real fetch is explicit only

real credentialsがlocalにあり、実取得を行う時だけ`--execute-fetch`を使います。

```bash
bash scripts/run-jquants-free-price-provider-local.sh \
  --execute-fetch \
  --code 8136 \
  --from YYYY-MM-DD \
  --to YYYY-MM-DD \
  --first-executable-at "$FIRST_EXECUTABLE_AT"
```

`FIRST_EXECUTABLE_AT`は明示timezone付きISO instantが必要です。network開始前だけでなく、actual fetch completion後の`retrievedAt`以上でなければmappingは拒否されます。

### 4. Append is separate opt-in

永続化する時だけ`--append-local`を追加します。real price fileはgitignored/local-onlyです。

### 5. Audit again

```bash
bash scripts/run-jquants-free-price-store-audit-local.sh
```

実取得後は必ずauditを再実行し、`issues_found`を無視しないでください。

## Do not do

- real J-Quants JSONLをcommitしない
- raw price dataをPR/Issue/Actions artifact/chatへ貼らない
- auditを通すためにhashを書き換えない
- unsafe fileをrenameして問題を隠さない
- nested directoryへ価格fileを逃がさない
- `issues_found`のままRecommendation / Outcomeへ進めない
- J-Quants FreeにないTOPIX/sector benchmarkを捏造しない
- local audit greenを投資判断greenと解釈しない

## Remaining real gates

このauditがgreenでも、real Foundation pilotには別途必要です。

1. real Sanrio EDINET human review / parity
2. verified Security Master identity
3. rights-verified issuer price / TOPIX / sector benchmark
4. Corporate Action Evidence / Clearance
5. complete Evidence Package
6. falsifiable Hypothesis / Scenarios
7. deterministic Council replay / Foundation Decision
8. Evidenceが本当に支持する場合だけreal governed Recommendation
9. 後日のQuantitative Outcome / Semantic Review

Synthetic fixturesやmetadata-only auditだけでは上記を完了扱いにしません。
