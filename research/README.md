# research/ — Research OS の正本データ

ここが研究の**唯一の正本**です。GitHub にあるものが真実で、会話や記憶は正本ではありません。

- 仕様: [../docs/research/research-os-spec.md](../docs/research/research-os-spec.md)
- 毎時プロンプト: [../docs/prompts/hourly-research.md](../docs/prompts/hourly-research.md)
- 現在の全体ロードマップ: [../docs/roadmaps/alpha-pon-current-roadmap-2026-08-05.md](../docs/roadmaps/alpha-pon-current-roadmap-2026-08-05.md)
- Research OSロードマップ: [../docs/roadmaps/research-os-roadmap.md](../docs/roadmaps/research-os-roadmap.md)
- エージェント役割分担: [../docs/operations/agent-work-routing.md](../docs/operations/agent-work-routing.md)
- Claude Code / Codex引き継ぎテンプレート: [../docs/prompts/code-agent-handoff-template.md](../docs/prompts/code-agent-handoff-template.md)

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
