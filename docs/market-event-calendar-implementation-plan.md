# Alpha Pon 重要イベントカレンダー実装計画

Status: `PLANNING_APPROVED_FOR_PROTOTYPE`
Last updated: 2026-08-03 JST
Scope: 日本株を主対象とする重要イベントの事前把握・当日監視・通過後レビュー

## 0. 結論

Alpha Ponには、ニュース一覧とは別に **重要イベント専用カレンダー** が必要。

最初から独自のiPhoneネイティブアプリやWidgetKitウィジェットは作らない。まず次の二層で実現する。

1. **Alpha Pon Web内**
   - `/calendar` のスマホ向け予定一覧・月表示
   - ホーム画面に「次の重要イベント」カード
   - PWAとしてホーム画面へ追加できるようにする
2. **iPhoneホーム画面・ロック画面**
   - 専用のGoogleカレンダー `Alpha Pon Market Events` へ予定を同期
   - iPhone標準カレンダーにGoogleアカウントを追加
   - Apple標準カレンダーウィジェットで直近イベントを表示

この構成なら、専用サーバーを常時運用せず、既存のNext.js、生成JSON、GitHub、Google Calendar、iPhone標準ウィジェットを再利用できる。

PWA単体ではiOSの本物のWidgetKitホーム画面ウィジェットは作れない。PWAは「アプリアイコン・フルスクリーン表示・キャッシュ」の役割とし、OSウィジェットは既存カレンダーを使う。

---

## 1. 目的

### 1.1 投資研究上の目的

イベント発生後に調べ始めるだけでなく、次に何が起きるかを事前に把握し、以下を実行する。

- 会見・総会・決算・調査報告などの重要日を見逃さない
- イベント前に確認項目と仮説を準備する
- 当日に一次情報を優先監視する
- 通過後に「既知情報」と「新たに判明した事実」を分離する
- 株価反応を当日・翌営業日・1週間後に答え合わせする
- Personal Shock、Known-Bad Event Repricing、Corporate Structure、Future Demand等のEdge研究へ接続する

### 1.2 UI上の目的

スマホで3秒以内に次を把握できる状態を目指す。

- 今日の重要イベント
- 7日以内の重要イベント
- 次に監視すべき会社
- イベントまでの日数
- 何を確認するか
- 通過後に何が変わったか

### 1.3 非目的

- カレンダー掲載だけで売買判断を出さない
- イベント日だけで機械的に売買しない
- SNSの話題量や噂を予定登録根拠にしない
- 将来日が未確定なのに正確な日時を捏造しない
- 独自ネイティブアプリを最初から作らない

---

## 2. 入れる項目

### 2.1 P0: 必須イベント

#### 不祥事・ガバナンス

- 記者会見・社長会見
- 株主総会・継続会
- 第三者委員会・特別調査委員会の中間報告・最終報告
- 調査開始・調査範囲拡大・調査完了
- 役員辞任・解任・処分の効力日
- 行政処分・規制当局発表
- 訂正決算・訂正有報・内部統制報告
- 監査意見・レビュー結論の公表
- JPX改善報告書・改善状況報告書
- 特別注意銘柄・監理銘柄・上場維持関連期限
- 訴訟・判決・和解・課徴金等の重要予定

#### 決算・業績

- 決算発表日
- 決算説明会
- 業績修正発表
- 有価証券報告書・四半期報告の提出期限
- 重要顧客・親会社・子会社の決算日
- 不祥事関連損失や業績影響が数値化される可能性がある発表日

#### Corporate Structure / Special Situation

- TOB開始・終了・決済開始
- MBO・株式交換・完全子会社化の基準日・効力発生日
- 親子上場解消関連日
- 子会社上場日
- スピンオフ・会社分割・事業譲渡の効力日
- PEファンド・親会社・大株主の売出し
- ロックアップ解除
- 株主総会の承認日
- 指数採用・除外・リバランス日

### 2.2 P1: 重要な将来需要イベント

- 政府予算・補助金・入札・契約・採択結果
- 製品認証・型式承認・量産認定
- 大型設備投資の稼働開始
- 顧客の発注・量産・サービス開始
- 衛星打ち上げ・地上局稼働・通信サービス開始
- 法令施行・規制期限・強制更新期限
- 展示会・技術説明会のうち一次情報が出る可能性が高いもの

### 2.3 P2: 研究補助イベント

- Historical Analogの過去イベント記念日ではなく、検証期限
- 1週間・1か月・3か月・6か月のoutcome review日
- 改善策の実装期限
- 会社が自ら約束した確認日・マイルストーン
- Alpha Ponの再調査期限

---

## 3. 優先順位

優先度は会社の知名度やニュース量ではなく、**投資判断を変える可能性 × 時間感応度 × 情報確度**で決める。

### S0: 即時通知

- 新規不祥事の公式確認
- CEO・社長・創業者・重要役員の辞任、解任、逮捕、起訴
- 会計不正・訂正決算・監査意見・上場維持リスク
- 調査報告で新しい重大事実が判明
- 行政処分・免許・認可・安全性に関する重大発表
- 既存WATCHがBLOCKまたはBUY WATCH方向へ大きく変化

### S1: 当日高監視

- 会見、総会、継続会、調査報告、決算
- TOB期限、完全子会社化、ロックアップ解除等の執行日
- 重要顧客の決算や発注発表
- 不祥事の損失上限・影響軽微・調査完了が確認され得る日

### A: 7日以内に準備

- 日程が確定している重要イベント
- JPX改善状況報告の予想ウィンドウ
- 法令期限、認証期限、契約期限

### B: 研究予定

- 日程が概算・月単位
- 経済影響がまだ不明
- 一次情報確認待ち

### C: 記録のみ

- 投資判断を変えにくい定例行事
- 再報道のみ
- 根拠がSNS・匿名情報だけ

---

## 4. 通知ルール

### 4.1 新規登録・変更通知

次の状態変化があった場合だけ通知する。

- 新規S0/S1イベント登録
- 日程確定
- 日時変更・延期・中止
- 重要度上昇
- 新しい一次情報追加
- 通過後の結果で仮説・判定が変化

同じ内容の再取得では通知しない。

### 4.2 予定イベントの通知タイミング

#### S1

- T-7日: 事前調査開始
- T-1営業日 18:00: 明日の重要イベント
- 当日 07:30: 今日の監視項目
- 時刻確定時は30分前
- 終了・資料公開後: 新事実があれば即時
- 翌営業日: 株価反応・confounder確認
- D+5: 短期反応レビュー

#### A

- T-3日またはT-1営業日
- 当日朝
- 通過後に重要な状態変化があった場合のみ

#### B/C

- 原則通知しない
- 週次レビューへまとめる

### 4.3 不祥事速報

完全分析を待たず、まず次を通知する。

1. 会社名・コード
2. 何が起きたか
3. 誰の問題か
4. confirmed / reported
5. 当日株価とTOPIX・業種相対
6. なぜ今知らせるか
7. HIGH / WATCH / BLOCK / INFO
8. 次に確認する一次情報

### 4.4 通知経路の役割分担

- **Google / Apple Calendar**: 予定されたイベント、事前リマインダー、ホーム画面ウィジェット
- **Alpha Pon / LINE**: 突発不祥事、新事実、判定変更、イベント通過後の速報
- **Webホームカード**: 今日と7日以内の一覧

カレンダー通知だけで突発速報を代替しない。

---

## 5. データ構造

### 5.1 正本

既存Alpha Ponのappend-only + latest方式に合わせる。

- `data/market_events.jsonl`
  - append-onlyの履歴正本
  - 登録、変更、延期、完了、取消、結果更新をイベントとして追記
- `data/market_events_latest.json`
  - 現在状態のmaterialized view
- `apps/web/public/generated/alpha-pon-events.json`
  - Web表示用の生成物
- `apps/web/public/generated/alpha-pon-events.ics`
  - 読み取り専用のカレンダー購読・バックアップ用

`latest.json`を直接手編集せず、JSONLから再生成できるようにする。

### 5.2 Event schema v1

```ts
type MarketEvent = {
  id: string
  version: 1

  companyCode: string | null
  companyName: string
  market: 'JP' | 'US' | 'GLOBAL'

  title: string
  eventType:
    | 'MISCONDUCT_DISCLOSURE'
    | 'PRESS_CONFERENCE'
    | 'SHAREHOLDER_MEETING'
    | 'CONTINUATION_MEETING'
    | 'INVESTIGATION_REPORT'
    | 'REGULATORY_ACTION'
    | 'EARNINGS'
    | 'EARNINGS_BRIEFING'
    | 'CORRECTED_FINANCIALS'
    | 'AUDIT_OPINION'
    | 'JPX_REMEDIATION_REPORT'
    | 'TOB_DEADLINE'
    | 'STRUCTURE_EFFECTIVE_DATE'
    | 'LOCKUP_EXPIRY'
    | 'INDEX_REBALANCE'
    | 'PROCUREMENT_AWARD'
    | 'CERTIFICATION'
    | 'CAPACITY_START'
    | 'OUTCOME_REVIEW'
    | 'OTHER'

  status:
    | 'DISCOVERED'
    | 'TENTATIVE'
    | 'CONFIRMED'
    | 'IN_PROGRESS'
    | 'COMPLETED'
    | 'POSTPONED'
    | 'CANCELLED'
    | 'SUPERSEDED'

  priority: 'S0' | 'S1' | 'A' | 'B' | 'C'
  relatedEdges: string[]

  timezone: 'Asia/Tokyo'
  allDay: boolean
  startsAt: string | null
  endsAt: string | null
  expectedWindowStart: string | null
  expectedWindowEnd: string | null
  dateCertainty: 'EXACT' | 'DATE_ONLY' | 'WINDOW' | 'ESTIMATED' | 'UNKNOWN'

  announcedAt: string
  confirmedAt: string | null
  completedAt: string | null
  firstExecutableAt: string | null

  sourceEvidence: Array<{
    sourceType: 'COMPANY_IR' | 'TDNET' | 'JPX' | 'EDINET' | 'REGULATOR' | 'COURT' | 'GOVERNMENT' | 'MAJOR_MEDIA'
    title: string
    url: string
    publishedAt: string
    retrievedAt: string
    isPrimary: boolean
  }>

  whyItMatters: string
  preEventChecks: string[]
  postEventChecks: string[]
  expectedStateChanges: string[]
  invalidationConditions: string[]

  watchlist: boolean
  notificationPolicy: {
    immediateOnDiscovery: boolean
    remindersMinutesBefore: number[]
    notifyOnCompletion: boolean
    notifyOnMaterialChange: boolean
  }

  result: {
    newFacts: string[]
    previouslyKnownFacts: string[]
    assumptions: string[]
    opinion: string[]
    stateBefore: 'BUY_WATCH' | 'WATCH' | 'WAIT' | 'BLOCK' | 'ABSTAIN' | null
    stateAfter: 'BUY_WATCH' | 'WATCH' | 'WAIT' | 'BLOCK' | 'ABSTAIN' | null
    materialChange: boolean
  } | null

  createdAt: string
  updatedAt: string
  dedupeKey: string
}
```

### 5.3 日時の重要ルール

以下を混同しない。

- 資料に書かれた日付
- 資料が公開された時刻
- イベント開催時刻
- 市場が初めて売買可能になった時刻
- Alpha Ponが初めて取得した時刻

バックテストと通知では `publishedAt <= decisionCheckpoint` を必須とし、未来情報を使わない。

未確定日時を正午や15時として埋めない。日付のみなら `allDay=true`、月単位ならwindowを使う。

### 5.4 Google Calendar同期用ID

Google Calendar event IDはAlpha Pon event IDから決定的に生成する。

- 再実行しても重複作成しない
- 日程変更は同一イベントを更新
- 取消は削除ではなく取消状態を反映して履歴を残す
- Google Calendar側の手編集を正本へ逆流させない

---

## 6. 運用フロー

### 6.1 新規イベント登録

```text
公式・公的情報を検知
  ↓
会社・イベント・日時・確度をnormalize
  ↓
dedupe / 既存イベント照合
  ↓
priorityと関連Edgeを判定
  ↓
market_events.jsonlへappend
  ↓
latest / Web JSON / ICSを再生成
  ↓
Google Calendarへupsert
  ↓
S0/S1なら速報・リマインダー設定
```

### 6.2 イベント前

- 一次資料URLの生存確認
- 日時・配信先・資料公開場所の確認
- 事前仮説を固定
- 何が出たらBUY WATCH / WAIT / BLOCKへ変わるかを事前記録
- 同日決算・マクロ・資本政策等のconfounderを確認

### 6.3 イベント当日

- 開始前に高監視へ昇格
- 公式資料を優先取得
- 速報では完全分析を待たない
- 既知 / 新事実 / 推測 / 意見を分離
- 当日株価反応を取得可能な範囲で記録

### 6.4 イベント通過後

- resultを追記
- 状態遷移を判定
- `firstExecutableAt`以降の価格で反応測定
- 翌営業日、D+5、1m、3mのreview eventを自動作成
- Historical Analogへ接続

### 6.5 日程変更

- 古いイベントを削除しない
- `POSTPONED` / `SUPERSEDED`をappend
- 新日程を同一論理IDの新revisionとして登録
- 変更がS1以上なら即時通知

---

## 7. 何で作るか — 選択肢評価

### 7.1 独自Next.jsカレンダー

**できること**

- Alpha Pon内で今日・7日・月表示
- 会社、Edge、重要度、状態遷移を詳細表示
- ホーム画面内の次イベントカード

**弱点**

- これだけではiPhoneの本物のホーム画面ウィジェットにならない
- 外出先から見るにはWeb公開先が必要

**判定**: 必須。既存Next.jsへ実装する。

### 7.2 PWA

**できること**

- Safariからホーム画面へ追加
- アプリアイコンからAlpha Ponを起動
- standalone表示、基本キャッシュ
- 将来Web Pushへ拡張可能

**弱点**

- iOSのWidgetKitウィジェットではない
- Web Pushには送信側の仕組みが必要

**判定**: 実装するが、ウィジェットの代替とは扱わない。

### 7.3 ICS購読

**できること**

- `.ics` URLをApple Calendarへ照会登録
- 読み取り専用のバックアップ・他カレンダー互換

**弱点**

- 更新間隔を完全に制御できない
- 公開URLが必要になりやすい
- 即時通知の主経路には向かない

**判定**: export / fallbackとして実装。主同期には使わない。

### 7.4 Google Calendar API同期

**できること**

- 専用カレンダーへイベント作成・更新
- 標準の通知・色分け・繰り返し・ウィジェットを利用
- iPhone標準カレンダーにGoogleアカウントを追加して表示可能
- Alpha Pon専用ネイティブアプリ不要

**弱点**

- 初回OAuthまたはservice account設定が必要
- API資格情報を安全に保管する必要がある

**判定**: OSウィジェット・通知の推奨経路。

### 7.5 独自iOS WidgetKit

**できること**

- 完全に独自デザインのホーム画面・ロック画面ウィジェット
- Live Activity等への発展

**弱点**

- SwiftUI / WidgetKit / Xcode / 署名 / 配布が必要
- Web版とは別プロジェクトになる
- 更新にはtimelineやAPNs等の設計が必要

**判定**: Phase 5以降。既存カレンダーウィジェットで不足が明確になった時だけ検討。

---

## 8. サーバーを使わず無料に近づける構成

### 推奨構成

```text
公式情報・Alpha Pon研究
  ↓
repo内 JSONL 正本
  ↓
TypeScript generator
  ├─ Web JSON
  ├─ ICS
  └─ Google Calendar sync

Next.js static build
  ↓
Cloudflare Pages等の静的ホスティング

Google Calendar
  ↓
iPhone Apple Calendar
  ↓
ホーム画面 / ロック画面の標準カレンダーウィジェット
```

### 実行場所

優先順:

1. **既存Mac + launchd**
   - 現在のAlpha Pon運用と整合
   - 無料
   - OAuth資格情報をローカル保存
   - Macが停止・スリープ中は同期が遅れる
2. **GitHub Actionsをevent file変更時だけ実行**
   - 常時サーバー不要
   - `data/market_events*`変更時のみ同期し、毎時空実行を避ける
   - private repoの無料Actions枠とSecrets管理を監査
3. **Google Apps Script**
   - Google Calendarとの相性は良い
   - repoとの正本同期が複雑になるため初期採用しない

### Web公開先

第一候補: **Cloudflare Pagesの静的配信**

- private GitHub repoを接続可能
- static asset配信は無料枠で扱いやすい
- Freeは月500 buildsのため、研究コミットごとにbuildしない
- Web UIまたは生成データに実変更がある場合だけdeployする
- 金融研究データを公開したくない場合はAccess等の認証を別途検証する

GitHub Pagesはprivate repo利用にGitHub plan条件があり、公開範囲にも注意が必要。第一候補にはしない。

---

## 9. スマホUI仕様

### 9.1 Webホームカード

ホーム上部に次を表示する。

- `今日 S1 2件`
- `次の重要イベントまで 1日`
- 直近3件
- 会社名、コード、イベント、時刻、重要度
- 「見るべきこと」1行
- `/calendar`へのリンク

### 9.2 `/calendar`

初期版は月グリッドより **agenda優先**。

- 今日
- 明日
- 7日以内
- 今月
- 日程未確定window
- 完了・結果待ち

フィルタ:

- watchlistのみ
- 不祥事
- 決算
- Corporate Structure
- Future Demand
- S0/S1のみ

### 9.3 イベント詳細

- 何が起きるか
- なぜ重要か
- 事前確認
- 結果確認
- 一次資料
- 既知 / 新事実 / 推測 / 意見
- event前後の判定
- Historical Analog

### 9.4 PWA

- manifest
- 192 / 512 icon
- `display: standalone`
- theme color
- calendar shortcut
- generated JSONのread-only cache
- 古いデータを最新と誤認しないstale banner

---

## 10. 実装ロードマップ

### Phase 0 — 契約固定

- [ ] Event schema v1
- [ ] eventType / status / priority enum
- [ ] PIT日時ルール
- [ ] dedupe / revision契約
- [ ] notification policy契約
- [ ] fixturesとvalidator

### Phase 1 — データ正本とCLI

- [ ] `data/market_events.jsonl`
- [ ] latest builder
- [ ] audit CLI
- [ ] 手動登録CLI
- [ ] update / postpone / complete CLI
- [ ] JSON / ICS generator
- [ ] unit tests

### Phase 2 — Web UI

- [ ] generated-data型へevents追加
- [ ] `/calendar` agenda
- [ ] ホームの次イベントカード
- [ ] event detail
- [ ] mobile 390px QA
- [ ] stale / missing / unknown表示

### Phase 3 — Google Calendar同期

- [ ] 専用secondary calendar作成
- [ ] OAuthまたはservice account方式の比較PoC
- [ ] deterministic event ID
- [ ] upsert / postpone / cancel
- [ ] notification reminder同期
- [ ] dry-run
- [ ] readback audit
- [ ] iPhone標準カレンダー表示確認
- [ ] ホーム画面・ロック画面ウィジェット確認

### Phase 4 — PWA / 静的公開

- [ ] Next.js static export可否確認
- [ ] manifest / icon / standalone
- [ ] service worker最小実装
- [ ] Cloudflare Pages PoC
- [ ] private access方針
- [ ] deployを実変更時のみに制限
- [ ] オフライン時のstale警告

### Phase 5 — 自動収集統合

- [ ] 決算日取得
- [ ] TDnet / EDINET / JPX日程抽出
- [ ] 不祥事案件から自動follow-up event生成
- [ ] 改善報告書6か月window
- [ ] Special Situation期限
- [ ] Kioxia型 / Starlink型イベント
- [ ] D+1 / D+5 / 1m / 3m review生成

### Phase 6 — 独自iOS widget再評価

標準カレンダーウィジェットで次が不足した時のみ実施。

- Edge別色分けが不十分
- Alpha Pon判定を直接表示したい
- Live Activityが必要
- one-tapで詳細へdeep linkしたい

---

## 11. 完成条件

### Calendar MVP Ready

- 正本JSONLからlatest / JSON / ICSを決定的に再生成できる
- 日程未確定を捏造しない
- `/calendar`がスマホで読める
- ホームに直近イベントが出る
- S0/S1通知が重複しない
- Google Calendarへdry-run可能

### Mobile Calendar Ready

- 専用Google Calendarへ同期成功
- iPhone標準カレンダーで表示
- ホーム画面またはロック画面ウィジェットで直近予定を確認可能
- 日程変更・延期・取消が正しく反映
- 重要イベントのリマインダーが動作

### Research-Integrated Ready

- event通過後にresultとstate transitionを記録
- D+1 / D+5 / 1m / 3mレビュー生成
- Historical Analog / Edgeへ接続
- PIT / confounder / executable timestamp監査が通る

---

## 12. 重要な安全策

- SNS・掲示板・匿名投稿は根拠にしない
- カレンダー登録は売買推奨ではない
- 日程と情報確度を分離
- Google資格情報をrepoへcommitしない
- WebクライアントへGoogle Calendar書込秘密鍵を置かない
- event historyを削除せずrevisionで残す
- 同期失敗時もrepo正本を壊さない
- Mac停止中・CI失敗中は「同期遅延」を明示
- 静的Webのデータ生成時刻を常に表示

---

## 13. 初期採用判断

採用:

- repo内append-only event registry
- Next.js `/calendar`
- ホームの次イベントカード
- PWAホーム画面追加
- Google Calendar専用カレンダー同期
- Apple標準Calendar widget
- ICS export
- static hosting

保留:

- 独自iOSアプリ
- WidgetKit
- APNs /独自Push server
- 常時稼働DB
- 常時稼働API server

次の実装開始点は **Phase 0: Event schema v1 + validator + fixtures** とする。
