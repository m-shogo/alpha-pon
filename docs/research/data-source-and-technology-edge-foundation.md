# Data Source & Technology Edge Foundation v1

Status: `FOUNDATION_PROPOSED`

この文書は、Alpha PonへAPIや公開データを無制限に追加するための一覧ではない。
目的は、**Edgeごとに必要な最小データを選び、研究から商用化、供給網、価格反応までをPoint-in-Time安全に検証すること**である。

正本:

- データ源候補: `research/data_sources/catalog.yml`
- データ源契約: `research/schemas/data-source.schema.json`
- 技術・供給網Edge候補: `research/edge_catalog/technology-supply-chain-families.yml`
- Edge family契約: `research/schemas/edge-family.schema.json`
- active Edge: `research/edge_registry/edges/`

## 1. 最重要の設計判断

### 1.1 無料でも全部は採用しない

データ源は次の4状態で管理する。

| 状態 | 意味 |
| --- | --- |
| `core_now` | 現在のP2/P3に直接必要。最小範囲で正式実装する |
| `pilot_after_current_edge` | 有望だが、最初のKnown-Bad検証後に少数サンプルで価値を測る |
| `catalog_only` | 存在と条件を残す。必要なEdgeが生まれるまで接続しない |
| `reject` | 権利、信頼性、PIT、保守性の問題で採用しない |

無料という理由で接続すると、障害点・HTML変更・秘密管理・データ修正・ライセンス監査が増える。
追加の条件は「取れるか」ではなく、**既存Edgeの判別力または反証力を改善するか**である。

### 1.2 DiscoveryとEvidenceを分離する

```text
SNS / Qiita / Zenn / Reddit / note / GitHub / Hacker News
  -> API・OSS・MCP・公開データの候補を発見
  -> 運営元の公式サイト・公式docs・利用規約・licenseを確認
  -> 元データの作成主体まで追跡
  -> Data Source Adoption Gate
  -> 採用後も投資上の事実は一次資料で確定
```

一般SNS投稿は以下に使用しない。

- 株の事実
- Historical Analogの証拠
- Edgeスコア
- BUY判定
- sentiment特徴量
- 匿名リーク
- インフルエンサーの推奨

### 1.3 「公式アカウント」の認定ルール

名前、ロゴ、認証マーク、フォロワー数、プロフィール上の公式URLでは公式と判断しない。

公式認定は次を満たす場合に限る。

1. 企業・官公庁の公式Webサイトを確認する。
2. 公式WebサイトからSNSアカウントへのリンクを辿る。
3. リンク先の完全なアカウントURLが一致する。
4. 取得日時と公式サイトURLを記録する。

それでも、企業公式SNSは速報・発見補助である。重要な事実は企業IR、TDnet、EDINET、JPX、官公庁へ照合する。

## 2. データの6層

### Layer A — Discovery

新しい会社、イベント、API、OSS、技術テーマを知る入口。

- 企業公式サイト
- 官公庁・研究機関の新着
- 技術コミュニティから発見したAPI・OSS
- SNSは候補発見だけ

Discoveryの内容はFactへ直接昇格しない。

### Layer B — Evidence

イベントと状態変化の正本。

- EDINET
- TDnet
- 企業IR
- JPX上場会社措置
- 金融庁・各省庁・裁判・行政資料
- SEC EDGAR（将来の米国先行指標）

### Layer C — Market Reaction

公表後に実際に取引可能だった価格反応。

- J-Quants
- TOPIX・業種benchmark
- corporate actions
- 売買停止・値幅制限
- spread・volume・liquidity

### Layer D — Supply/Demand and Execution

Known-Badなどの需給交絡と実行可能性。

- JPX空売り・信用関連
- 貸株・逆日歩・borrow availability
- 大口売買・指数イベント

### Layer E — Macro and Objective Demand

企業固有要因と外部環境を分離する。

- 日銀API
- FRED / ALFRED
- e-Stat
- 交通量、乗降客、宿泊、検索、予約、POS等の客観データ

投稿数や感情ではなく、測定方法・母集団・revision・PITが確認できる実測または公式推計に限る。

### Layer F — Science to Commercialization

研究成果が商売になるまでの状態遷移を追う。

- KAKEN / CiNii / J-STAGE
- JST Grants / Project DB
- 特許庁
- gBizINFO
- 業界標準・認証
- 共同研究、pilot、capex、供給契約

## 3. Data Source Adoption Gate

新しいAPI・データ源は、次を全て記録してから採用する。

1. **運営元** — 公式、official aggregate、licensed、第三者、discovery only
2. **元データ** — 誰が作成し、どこで最初に公開したか
3. **用途** — discovery / evidence / price / supply-demand / confounder / commercialization
4. **認証** — API key、OAuth、申請、秘密値の扱い
5. **無料範囲** — 履歴、鮮度、rate limit、試用期限
6. **PIT** — eventAt、publishedAt、observedAt、retrievedAt、firstExecutableAt
7. **revision** — 訂正、撤回、再訂正、速報・確報、vintage
8. **権利** — raw保存、Git、公開表示、再配布
9. **entity mapping** — 証券コード、法人番号、EDINET code、CIK、特許出願人等
10. **障害分離** — 失敗時にdaily pipelineやLINEを止めない
11. **fallback** — 自動で低品質データへ切り替えず、unknownまたはmanual reviewにする
12. **Edge価値** — どの仮説の判別力・反証力が上がるか
13. **保守コスト** — 仕様変更、HTML parser、秘密管理、監視
14. **削除可能性** — providerを外しても他の研究を壊さない

採用スコアだけで自動決定しない。一次性・PIT・権利のどれかが不明なら本採用を保留する。

## 4. 現在の採用順

### 今のCore

1. J-Quants FreeをPIT Price Storeの正式providerへ昇格
2. EDINET Version 2を現行API key方式へ移行
3. TDnet・企業IRをEvidence Packageへ正規化
4. JPX公式措置をKnown-Badの補助ラベルとして限定pilot

### 最初のEdge後にPilot

- JPX空売り・信用関連
- gBizINFO
- JPX上場会社措置の追加カテゴリ

### Catalogに留める

- 日銀、e-Stat、FRED / ALFRED
- SEC EDGAR
- 特許庁
- KAKEN / CiNii / J-STAGE
- JST Grants
- 人流・検索・予約等の客観データ

接続順はデータの面白さではなく、現在のEdgeが必要とする順とする。

## 5. EDINETの即時修正対象

現行コードの `src/fetcher/edinet.ts` は、APIキー不要・旧base URLという前提になっている。
現行Version 2ではAPIキー方式へ移行しているため、次を別PRで実装する。

- `EDINET_API_KEY` を環境変数へ追加
- 現行公式base URLへ移行
- `Subscription-Key` をsecretとして送信
- secret未設定時は明確なskipまたはblocked結果を返す
- URL、ログ、例外、fixture、生成物へsecretを出さない
- timeout / retry / rate limit / checkpoint
- document ID / parentDocID / content hash
- withdrawal / correction / supersession chain
- source health
- deterministic fixture

認証だけを先に変更して、既存daily pipelineを壊す半端な変更はしない。
完了条件は `EDINET_V2_AUTH_MIGRATION_GREEN` とする。

## 6. Technology Commercialization Graph

研究・特許を単独シグナルにしない。
以下を状態遷移として記録する。

```text
research paper / research project
  -> independent reproduction
  -> patent family / legal state
  -> corporate joint R&D
  -> standardization activity
  -> prototype
  -> customer sample
  -> certification / qualification
  -> pilot line
  -> capex and equipment orders
  -> long-term supply agreement
  -> volume production
  -> revenue and profit contribution
```

各ノードには次を持たせる。

- entity
- technology
- stage
- eventAt
- publishedAt
- observedAt
- source
- sourceType
- confidence
- predecessor evidence
- successor evidence
- invalidation
- beneficiary layers

### Beneficiary layers

```text
final-product
platform
tier-1
tier-2
tier-3
material
equipment
inspection
infrastructure
integration
maintenance
service
```

主役企業だけでなく、量産を可能にする材料、設備、検査、電力、冷却、保守まで系統的に探す。

## 7. Edge lifecycle

```text
catalog
  -> candidate
  -> active-research
  -> shadow
  -> validated / rejected / dormant
```

### Catalog

0→1アイデアを広く保持する。価格検証やGate passを主張しない。

### Candidateへの昇格条件

- 因果メカニズムを説明できる
- 客観的triggerがある
- beneficiary layerとentity mappingの道筋がある
- 必要データ源を特定できる
- PIT timestampを取得できる見込みがある
- 反証条件を事前に書ける
- 類似Edgeと重複しない

### Active Researchへの昇格条件

- executable price routeがある
- historical sample pathがある
- data rightsを確認した
- confounderを列挙した
- discovery / confirmatory / holdoutを分離できる
- 同時active Edge数の上限内

Edgeを多く登録できても、active-researchは少数に制限する。

## 8. 個別テーマを乱立させない

次は独立Edgeではなく、上位familyの例として扱う。

| 個別テーマ | 上位Edge family |
| --- | --- |
| AI向け変圧器・電力接続 | Bottleneck Migration / Upstream Order Sequence |
| データセンター冷却 | Bottleneck Migration / Maintenance Installed-Base |
| HBM封止・接合・検査 | Enabling Material / Specification Tightening / Failure Analysis |
| 光配線・光電融合 | Bottleneck Migration / Standardization |
| 全固体電池材料 | Research-to-Commercialization / Supplier Qualification |
| 電池火災・安全設備 | Regulatory Forced Demand / Failure Analysis |
| ロボットSI | Supplier Cascade / Maintenance Installed-Base |
| インフラ点検robot | Regulatory Forced Demand / Installed-Base |
| 銅・希少金属代替 | Technology Substitution / Import Localization |

同じ事例を複数familyで説明できる場合は、どのmechanismを主検証するか先に固定する。

## 9. 今回追加した0→1アイデア

### 9.1 Commercialization Lag Compression

単に「次の段階へ進んだか」ではなく、研究→sample→pilot→量産の所要時間が過去案件より短くなっているかを見る。

市場は商用化予定日を追うが、Alpha Ponは**遷移速度の変化**を追う。
予定日の自己申告ではなく、独立した証拠の時刻差で測る。

### 9.2 Evidence Density Divergence

論文、特許、PRが増える一方で、sample、認証、capex、契約が増えない乖離をnegative controlとして使う。

```text
research evidence density up
commercial evidence density flat
  -> hype / stalled commercialization candidate
```

これを即shortシグナルにせず、商用化停滞の反証候補として使う。

### 9.3 Customer Qualification Topology

「大手に採用」より、独立した複数顧客・複数工場・複数用途へ認定が広がるネットワーク構造を重視する。
同一企業groupや同一distributor経由を重複顧客として数えない。

### 9.4 Specification Tightening Winner

新世代で純度、耐熱、誤差、安全基準が厳しくなるほど、supplier数が減り、認定済み企業へshareが集中する仮説。
性能PRではなく、仕様、評価、不合格、認定数、ASP、marginで確認する。

### 9.5 Failure-Analysis Picks-and-Shovels

新技術の量産初期は不良原因が未知で、製品需要より先に解析・検査・traceability支出が増える可能性がある。
事故や不良を当事者企業の悪材料として見るだけでなく、必須となる検査・計測・保守企業を探す。

### 9.6 Second-Source Qualification

地政学・供給途絶でsecond source評価が始まり、認定後に従来shareの小さい企業へ受注が移る仮説。
「国内回帰」という言葉ではなく、sample→監査→認定→量産発注を追う。

### 9.7 Yield Learning Curve

新工場の名目capacityより、歩留まり改善速度が利益転換を決める。
公開情報だけで直接yieldが取れない場合は、gross margin、scrap、output、warranty、cycle time等のproxyを事前定義する。

### 9.8 Maintenance Installed-Base

新規装置販売より、累積設置台数から生まれる点検、消耗品、校正、software、交換部品の継続収益を追う。
主役テーマが減速してもinstalled baseが残る点を検証する。

### 9.9 Upstream Order Sequence

工場建設では、用地・系統接続→建屋→utility→製造装置→検査→材料という発注順がある。
複数の上流受注をproject単位でtriangulateし、下流稼働時期を推定する。

### 9.10 Grant-to-Private-Capital Multiplier

公的助成の金額ではなく、その後に民間共同研究費、自己資金capex、顧客契約が何倍付いたかを見る。
補助金依存テーマと、自立的な商用化テーマを分離する。

## 10. Research Best Practices

### 10.1 時刻を分離する

```text
eventAt
publishedAt
discoveredAt
observedAt
firstExecutableAt
retrievedAt
```

公表前の価格を実行可能entryに使わない。
研究発表日、企業発表日、資料公開日、取引可能時刻を混同しない。

### 10.2 訂正を上書きしない

```text
original
  -> correction
  -> re-correction
  -> withdrawal
```

最新だけ残すと、過去時点で市場が見ていた情報を再現できない。

### 10.3 Entity resolutionを研究の中心に置く

技術研究では、研究者、大学、企業、子会社、共同出願人、装置supplier、顧客が別ID体系に分かれる。
最低限のcrosswalk候補:

- 証券コード
- 法人番号
- EDINET code
- issuer domain
- 特許出願人表記
- 研究機関ID
- CIK

自動一致のconfidenceが低い場合はmanual reviewへ送る。

### 10.4 Source transitionを保存する

同じ事実が次のように進む場合、それぞれを別証拠として保存する。

```text
research institute announcement
  -> company joint-development release
  -> patent publication
  -> standard body record
  -> capex disclosure
  -> supply contract
```

### 10.5 失敗した研究も消さない

- 接続したが鮮度が足りなかったAPI
- entity mappingできなかった案件
- 商用化へ進まなかった研究
- supplierへ波及しなかったテーマ
- 後から改定で消えたsignal

これらはrejection / dormant / data gapとして残す。

## 11. 実装順

1. LINE consolidated PRを別系統で完了する
2. PIT Price Store contract
3. Data Source Registry validator / audit CLI
4. EDINET Version 2 auth migration
5. Known-Bad最初のEvidence Package
6. J-Quants Standardを使う準備が整った時だけ1か月検証
7. JPX措置または空売りの一つだけpilot
8. 最初のEdgeがevent studyまで通った後、技術Edge familyを一つcandidate化
9. Technology Commercialization Graphのschemaとmanual fixture
10. 特許・研究APIはmanual fixtureで価値を証明してから接続

最初にcandidate化する技術Edgeは、データ入手性と日本企業への波及を考えると、`bottleneck-migration` または `supplier-qualification-moat` が有力である。

## 12. 完了条件

### `DATA_SOURCE_REGISTRY_CONTRACT_GREEN`

- catalogとschemaがvalidatorで検査される
- 重複IDを拒否する
- core sourceにrights/PIT/blocker/nextActionがある
- SNSはdiscovery onlyとして機械的に区別される
- secret値が存在しない

### `EDINET_V2_AUTH_MIGRATION_GREEN`

- 現行Version 2のauth方式
- credentials missingの安全なskip
- secret redaction
- checkpoint / dedupe / correction chain
- fixture tests
- source health

### `TECH_EDGE_CANDIDATE_CATALOG_GREEN`

- Edge family schemaとcatalogが検査される
- 全familyが反証条件を持つ
- 個別テーマを上位familyへ関連付けられる
- catalog登録がactive研究として数えられない

### `FIRST_TECH_COMMERCIALIZATION_EDGE_ACTIVATED`

- 一つのfamilyだけcandidateからactive-researchへ昇格
- objective trigger、entity map、PIT、data rights、sample pathがある
- discovery / confirmatory / holdoutが分離される
- 既存Edgeと同時に過剰な研究負荷を発生させない

## 13. 安全境界

- 自動売買しない
- 買い推奨を断定しない
- カタログ登録だけでEdgeが存在すると主張しない
- SNS・匿名投稿・sentimentを証拠にしない
- 特許件数や論文数だけで候補株にしない
- 補助金だけで需要を断定しない
- 契約・認定・量産を混同しない
- raw market dataを権利確認なしにGitまたは公開サイトへ保存しない
- API障害でLINEやdaily pipelineを止めない
