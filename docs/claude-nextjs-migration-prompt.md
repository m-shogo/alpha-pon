# Claude Code依頼プロンプト: alpha-pon Next.js化

## 目的

alpha-pon を、現在の `design/alpha-pon.html` サンプルUIから、実運用しやすい **Next.js + TypeScript アプリ**へ移行してください。

`design/alpha-pon.html` はあくまでデザイン参考です。既存の見た目・情報設計は参考にしつつ、実装はNext.jsとして作り直してください。

このアプリは買い推奨アプリではありません。目的は、長期投資向けに「調査候補」「保留」「証拠不足」「追わない理由」「上がらない理由」を整理し、Pro視点で見落としを減らすことです。

---

## 最重要方針

1. 買い推奨にしない
2. 重要判断では必ず Pro会議 / 品質監査 / 改善ロードマップ / IRイベント を見る
3. 決算・株主総会・配当・資本政策・自社株買い・バリュエーション・競合比較を落とさない
4. 良い会社・良い株価・良いタイミングを分ける
5. 上がる理由より先に、上がらない理由・下がる理由・証拠不足を出す
6. 株価・為替・金利・指数などの更新データは古くなる前提で扱う
7. AI/政治/戦争/宇宙/Starlink/気候/食糧/金利など、Proエージェントの知識も更新可能にする

---

## 推奨技術構成

### 今回作るもの

- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui 風のコンポーネント設計。ただし依存追加は最小限でOK
- データ入力は当面、既存の `reports/*.md` と `design/app/data.generated.js` 相当のJSONを読む形
- 将来的に API / DB / cron / realtime price に移行しやすい構造にする

### ディレクトリ案

```txt
apps/web/
  app/
    layout.tsx
    page.tsx
    report/page.tsx
    companies/[code]/page.tsx
  components/
    AppShell.tsx
    ProCommandCard.tsx
    CandidateCard.tsx
    ScoreBadge.tsx
    ReportSwitcher.tsx
    CompanyDetail.tsx
    RiskList.tsx
    NextActions.tsx
  lib/
    generated-data.ts
    report-loader.ts
    score.ts
    labels.ts
    types.ts
  public/
```

既存CLIやDBはルート直下のまま維持してください。

```txt
src/
config/
reports/
data/
design/   # サンプルとして残す
apps/web/ # 新しいNext.jsアプリ
```

---

## 既存資産

### デザイン参考

- `design/alpha-pon.html`
- `design/app/components.jsx`
- `design/app/screens.jsx`
- `design/app/pro-dashboard.jsx`
- `design/app/report-switcher.jsx`

これらは参考のみ。Next.js側へそのまま移植せず、React/TypeScriptとして整理してください。

### 生成データ

- `src/report-ui-data.ts`
- `design/app/data.generated.js`

これをNext.js向けにJSON出力へ変更、または `apps/web/lib/generated-data.ts` で読み込める形式にしてください。

理想は以下です。

```txt
public/generated/alpha-pon-data.json
```

生成元は以下。

```txt
reports/strategic_advice_latest.md
reports/pipeline_health_summary_latest.md
reports/stock_pro_committee_latest.md
reports/stock_pro_improvement_roadmap_latest.md
reports/pro_knowledge_refresh_latest.md
config/company-deep-dives.yml
```

---

## 画面要件

### 1. Home

目的: 朝一に見る画面。

表示内容:

- Pro司令塔カード
  - 今日まず見る穴
  - pipeline confidence
  - Pro会議の要約
  - 改善ロードマップ
  - Pro知識更新
- 調査候補リスト
  - サンリオ
  - 任天堂
  - OLC
  - 三菱重工
  - フジクラ
  - 三菱UFJ
- 各候補は以下を表示
  - 銘柄コード
  - 社名
  - 暫定ラベル
  - スコア
  - 検出理由
  - 注意点
  - 次に見るもの
  - 株価が未取得なら「未取得」と安全表示

### 2. Company Detail

目的: 1社を深く見る画面。

表示内容:

- 銘柄名 / コード
- 暫定スコア
- ラベル: 調査候補 / 保留 / 証拠不足 / 追わない / 避ける
- 今買う条件
- 決算後に見る条件
- 総会後に見る条件
- 買わない/追わない条件
- 上がらない理由
- 下がる理由
- 次に見るものチェックリスト
- Pro会議の判断
- 注意: 買い推奨ではない旨

### 3. Reports

目的: Pro系レポートを切り替えて確認する画面。

表示内容:

- 司令塔
- データ信頼度
- Pro会議
- 改善ロードマップ
- Pro知識更新

一覧をクリックすると要約切替。
Raw Markdown表示もあれば良い。

---

## データ設計

TypeScript型を必ず作ってください。

```ts
export type Candidate = {
  code: string;
  name: string;
  market: string;
  status: "research" | "watch" | "hold" | "blocked";
  priority: "S" | "A" | "B" | "C";
  tags: string[];
  price: number | null;
  changePct: number | null;
  drawdownPct: number | null;
  score: {
    structuralEvent: number;
    supplyDemand: number;
    valuation: number;
    theme: number;
    businessSafety: number;
    aiReview: number;
  };
  reasons: string[];
  negativeReasons: string[];
  nextToSee: string[];
  triggeredRule: string;
  lastNotifiedAt: string | null;
};

export type GeneratedReport = {
  key: string;
  label: string;
  path: string;
  available: boolean;
  excerpt: string[];
};

export type AlphaPonGeneratedData = {
  generatedAt: string | null;
  headline: string;
  summary: {
    strategic: string;
    pipeline: string;
    committee: string;
    roadmap: string[];
    refresh: string[];
  };
  reports: GeneratedReport[];
  candidates: Candidate[];
};
```

---

## 株価・レート更新について

今すぐリアルタイム化しなくてよいですが、設計は分離してください。

短期:

- daily実行で価格・指数・為替・金利を取得してJSONに保存
- UIは生成済みJSONを読む

中期:

- `data/market_snapshot.json` のようなファイルを作る
- `code -> price/changePct/drawdownPct` を持つ
- `src/report-ui-data.ts` またはNext.js側のloaderで候補にマージ

長期:

- DB化
- API Route / Server Action / Cronで更新
- Next.jsのISRやRoute Handlerで配信

重要:

- 株価や為替は古くなるので、必ず `asOf` を表示する
- 古いデータならUIで「価格データ古い/未取得」と出す
- 価格だけで買い判断しない

---

## package.json 方針

ルートは既存CLI維持。

追加候補:

```json
{
  "scripts": {
    "web:dev": "pnpm --dir apps/web dev",
    "web:build": "pnpm --dir apps/web build",
    "web:start": "pnpm --dir apps/web start",
    "web:data": "node --import tsx/esm src/report-ui-data.ts --json",
    "web:prepare": "pnpm ui:data && pnpm web:data"
  }
}
```

ただし既存の `pnpm ui:data` は壊さないでください。

---

## 実装ステップ

1. `apps/web` を作成
2. Next.js / TypeScript / Tailwind を設定
3. 既存デザインを参考にHome/Detail/Reportsを作る
4. `public/generated/alpha-pon-data.json` を読む仕組みを作る
5. `src/report-ui-data.ts` をJS生成だけでなくJSON生成にも対応させる
6. 価格nullでも落ちないUIにする
7. `pnpm web:dev` で起動できるようにする
8. `pnpm web:build` が通るようにする
9. READMEに使い方を追記
10. CIに `pnpm web:build` を追加できる状態にする

---

## 完了条件

- `pnpm ui:data` が既存通り動く
- `pnpm web:data` または同等のコマンドでJSON生成できる
- `pnpm web:dev` でNext.jsアプリが起動する
- HomeにPro司令塔と候補一覧が表示される
- Detailでサンリオなど候補詳細が表示される
- Reportsで各レポート要約を切り替えられる
- 株価nullでも落ちない
- 買い推奨表現がない
- READMEにローカル起動/デプロイ方針がある

---

## 注意

- 投資助言のような断定表現にしない
- 「買え」「売れ」「必ず上がる」は禁止
- 「調査候補」「保留」「証拠不足」「追わない理由」を中心にする
- 不明なデータは不明として表示する
- 価格データには必ず `asOf` を持たせる
- designフォルダは削除しない。サンプルとして残す
