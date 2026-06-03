// Pro委員会 型定義
// 買い推奨ではありません。調査・検証・反証・学習用。

export type ProStance =
  | "調査候補"
  | "保留"
  | "証拠不足"
  | "注意"
  | "避ける";

export type AgreementLevel = "full_agree" | "mostly_agree" | "mixed" | "conflict";

export type ProVerdict = {
  agentId: string;
  agentLabel: string;
  stance: ProStance;
  points: string[];
  isBlock: boolean;       // stance === "避ける" (強い反対)
  isEvidenceGap: boolean; // stance === "証拠不足" (情報不足。悪い銘柄ではない)
  isCautious: boolean;    // stance === "注意" || stance === "保留"
};

export type ProDisagreement = {
  topic: string;
  agents: string[];
  stances: string[];
  description: string;
};

export type ProDecision = {
  code: string;
  name: string;
  originalFinalLabel: string; // 安全ルール適用前のラベル (多数決・平均)
  finalLabel: string;         // 安全ルール適用後のラベル (blockがあれば"避ける"に倒す)
  finalScore: number;         // 0.0 - 1.0
  proScore: number;           // 0.0 - 1.0 (エージェント評価スコア)
  verdicts: ProVerdict[];     // 全エージェントの判定
  legendVerdicts: ProVerdict[]; // 優先エージェント (legend tier) の判定
  legendWarnings: string[];   // legendエージェントからの警告メッセージ
  consensus: AgreementLevel;  // 合意レベル
  disagreements: ProDisagreement[]; // 食い違いの詳細
  nextActions: string[];      // 次に確認すること
  blockers: string[];         // ブロック理由
  missingEvidence: string[];  // 不足情報
};

export type ProCommitteeReport = {
  generatedAt: string;
  decisions: ProDecision[];
};
