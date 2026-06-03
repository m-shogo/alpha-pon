// Pro委員会 食い違い検出ロジック
// 買い推奨ではありません。調査・検証・反証・学習用。

import type { ProVerdict, ProDisagreement, AgreementLevel } from "./pro-types.js";

/** 避ける判定 (強い反対理由がある時だけ) */
export function isBlock(v: { stance: string }): boolean {
  return v.stance === "避ける";
}

/**
 * 証拠不足判定 (情報が足りないだけ。悪い銘柄ではない)
 * 証拠不足は "避ける" と同扱いにしない。
 */
export function isEvidenceGap(v: { stance: string }): boolean {
  return v.stance === "証拠不足";
}

/** 慎重判定 (注意/保留) */
export function isCautious(v: { stance: string }): boolean {
  return v.stance === "注意" || v.stance === "保留";
}

/**
 * 合意レベルを計算する
 * - full_agree : 全員同じスタンス
 * - mostly_agree : 差異はあるがマイルド (block や conflict なし)
 * - mixed : 調査候補と保留/証拠不足が混在 (または block が 1 件)
 * - conflict : 避けると調査候補が同時に存在 (強い対立)
 */
export function detectAgreementLevel(verdicts: ProVerdict[]): AgreementLevel {
  const stances = verdicts.map(v => v.stance);
  const uniqueStances = new Set(stances);
  const hasBlock = stances.includes("避ける");
  const hasPositive = stances.includes("調査候補");

  if (uniqueStances.size === 1) return "full_agree";
  if (hasBlock && hasPositive) return "conflict";
  if (hasBlock) return "mixed";
  if (uniqueStances.size === 2) return "mostly_agree";
  return "mixed";
}

/**
 * 食い違いの詳細を検出する
 * - 避けるvs調査候補の対立
 * - 証拠不足vs調査候補の乖離
 */
export function detectDisagreements(verdicts: ProVerdict[]): ProDisagreement[] {
  const disagreements: ProDisagreement[] = [];

  const blockAgents = verdicts.filter(v => isBlock(v));
  const positiveAgents = verdicts.filter(v => v.stance === "調査候補");
  const evidenceGapAgents = verdicts.filter(v => isEvidenceGap(v));

  // 避けると調査候補の直接対立
  if (blockAgents.length > 0 && positiveAgents.length > 0) {
    disagreements.push({
      topic: "避けるvs調査候補の対立",
      agents: [...blockAgents.map(v => v.agentId), ...positiveAgents.map(v => v.agentId)],
      stances: [...blockAgents.map(v => v.stance), ...positiveAgents.map(v => v.stance)],
      description:
        `${blockAgents.map(v => v.agentLabel).join("・")} は"避ける"と判定するが、` +
        `${positiveAgents.map(v => v.agentLabel).join("・")} は"調査候補"と判定。` +
        "finalScore だけで判断せず disagreements を先に確認すること。",
    });
  }

  // 証拠不足と調査候補の乖離 (一次情報が足りていない可能性)
  if (evidenceGapAgents.length > 0 && positiveAgents.length > 0) {
    disagreements.push({
      topic: "証拠不足vs調査候補の乖離",
      agents: [...evidenceGapAgents.map(v => v.agentId), ...positiveAgents.map(v => v.agentId)],
      stances: [...evidenceGapAgents.map(v => v.stance), ...positiveAgents.map(v => v.stance)],
      description:
        `${evidenceGapAgents.map(v => v.agentLabel).join("・")} は情報不足を指摘するが、` +
        `${positiveAgents.map(v => v.agentLabel).join("・")} は調査候補とする。` +
        "要一次情報確認。証拠不足≠悪い銘柄。",
    });
  }

  return disagreements;
}

/**
 * 安全ルール: blockがあれば originalFinalLabel を"避ける"に上書きする
 * 証拠不足は"避ける"扱いにしない (情報が足りないだけ)
 */
export function applySafetyRule(
  originalLabel: string,
  verdicts: ProVerdict[]
): string {
  if (verdicts.some(v => isBlock(v))) return "避ける";
  return originalLabel;
}

/**
 * エージェント判定を ProScore に変換 (0.0 - 1.0)
 * 調査候補: 0.8 / 保留: 0.5 / 証拠不足: 0.4 / 注意: 0.35 / 避ける: 0.0
 *
 * 注意: 証拠不足は "避ける" に近づけない
 */
export function toProScore(verdicts: ProVerdict[]): number {
  if (verdicts.length === 0) return 0;
  const scoreMap: Record<string, number> = {
    "調査候補": 0.8,
    "保留": 0.5,
    "証拠不足": 0.4,
    "注意": 0.35,
    "避ける": 0.0,
  };
  const avg =
    verdicts.reduce((sum, v) => sum + (scoreMap[v.stance] ?? 0.4), 0) /
    verdicts.length;
  return Math.round(avg * 100) / 100;
}

/**
 * originalFinalLabel の導出 (安全ルール適用前)
 * - blockがある → "避ける"
 * - 証拠不足が過半数 → "証拠不足"
 * - 保留が複数 → "保留"
 * - 注意が 1 件以上 → "保留"
 * - それ以外 → "調査候補"
 */
export function deriveOriginalFinalLabel(verdicts: ProVerdict[]): string {
  const stances = verdicts.map(v => v.stance);
  if (stances.includes("避ける")) return "避ける";
  const evidenceGapCount = stances.filter(s => s === "証拠不足").length;
  if (evidenceGapCount >= Math.ceil(verdicts.length / 2)) return "証拠不足";
  if (stances.filter(s => s === "保留").length >= 2) return "保留";
  if (stances.includes("注意")) return "保留";
  return "調査候補";
}
