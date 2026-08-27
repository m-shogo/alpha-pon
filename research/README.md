# research/ — Research OS の正本データ

ここが研究の**唯一の正本**です。GitHub にあるものが真実で、会話や記憶は正本ではありません。

- 仕様: [../docs/research/research-os-spec.md](../docs/research/research-os-spec.md)
- 毎時プロンプト: [../docs/prompts/hourly-research.md](../docs/prompts/hourly-research.md)
- 現在の全体ロードマップ: [../docs/roadmaps/alpha-pon-current-roadmap-2026-08-05.md](../docs/roadmaps/alpha-pon-current-roadmap-2026-08-05.md)
- Research OSロードマップ: [../docs/roadmaps/research-os-roadmap.md](../docs/roadmaps/research-os-roadmap.md)
- エージェント役割分担: [../docs/operations/agent-work-routing.md](../docs/operations/agent-work-routing.md)
- Claude Code / Codex引き継ぎテンプレート: [../docs/prompts/code-agent-handoff-template.md](../docs/prompts/code-agent-handoff-template.md)

## 研究状況を読む場所

研究を「結果だけ」ではなく途中経過から確認したい場合は、次の順で見る。

1. **[dashboard/dashboard.generated.md](dashboard/dashboard.generated.md)** — 全Edgeの現在地、優先順位、Confidence、Gate、Sample数、次に研究するものを一覧で確認する入口。
2. **[research_log/](research_log/)** — 毎回の研究で何を調べ、何が分かり、何が未確定だったかを時系列で確認する。
3. **[checkpoint/latest.json](checkpoint/latest.json)** — 最新の停止位置、今回行った研究、不足データ、次候補を確認する。
4. **[edge_registry/edges/](edge_registry/edges/)** — 各Edgeの仮説、因果機序、entry/exit、反証条件、必要データ、Promotion Gateの詳細を確認する。
5. **[historical/analogs/](historical/analogs/)** — 過去事例を確認する。成功例だけでなく失敗・非回復例も同じ基準で保存する。
6. **[reports/](reports/)** — Backtest / Net Alphaなど、生成済みの検証結果を確認する。

### 読み方

- `Research` = 仮説を検証中。まだ売買判断へ使えるとは限らない。
- `Shadow` = 検証が進み、実運用へ影響させず観察する段階。
- `Production` = Promotion Gateを通過したEdge。ただし自動売買を意味しない。
- `Sample 0/N` = 仮説は登録済みだが、Research OS正本へ正式な実サンプルがまだ入っていない。
- `Gate 0/11` = 不合格という意味ではなく、未検証のGateが多い状態を含む。

現在はGitHub内のResearch Dashboardが正本。Owner向けWeb UIでも同じ内容を見られるようにすることを別途改善対象とする。

## ディレクトリ

| パス | 中身 | 書き込みルール |
| --- | --- | --- |
| `edge_registry/edges/` | Edge 1件 = 1ファイル | 作成・更新可。`id` / `hypothesis` / `createdAt` は immutable |
| `edge_registry/index.generated.json` | 索引 | **生成物**（手編集禁止） |
| `historical/analogs/` | 過去事例 | 作成のみ。**作成後は変更禁止** |
| `counterfactual/counterfactuals.jsonl` | 反実仮想 | **末尾追記のみ** |
| `confounder/confounders.jsonl` | 交絡因子 | **末尾追記のみ** |
| `research_log/YYYY-MM.jsonl` | 毎時の研究ログ | **末尾追記のみ** |
| `checkpoint/latest.json` | 次回の出発点 | 上書き可（唯一） |
| `checkpoint/history/` | Checkpoint スナップショット | 作成のみ。**変更禁止** |
| `holdout/` | Holdout Vault | [holdout/README.md](holdout/README.md) 参照 |
| `queue/queue.generated.json` | VOI ランキング | **生成物** |
| `queue/weights.yml` | VOI の重み | 変更時は理由を research_log に残す |
| `dashboard/dashboard.generated.md` | 一覧 | **生成物** |
| `schemas/` | JSON Schema（契約の正本） | 変更時は型・テストも同時に更新 |
| `fixtures/` | テスト用の合成データ | 実在の銘柄・実際の投資判断ではない |
| `reports/` | Backtest / Net Alpha の出力 | **生成物** |

## 検証

```bash
pnpm research:check
```

CI（`.github/workflows/research-os.yml`）でも同じものが走ります。
CI が落ちる主な原因は「Append Only 違反」「根拠のない Gate pass」「PIT 違反」「重複 Edge」です。
