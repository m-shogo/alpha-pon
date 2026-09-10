// J-Quants 接続の診断（判定ロジック）。
//
// 目的:
//   毎朝の daily が空レポートになる原因を、推測ではなく切り分ける。
//
// なぜ必要か:
//   2026-09-10 時点で /v2/listed/info が HTTP 403 を返し、
//   全銘柄の株価取得が失敗して確定 outcome が0件のまま止まっている。
//   このときログの先頭には「J-Quants が未設定です」という
//   **キー設定前の古い行**が残っており、現在の症状と取り違えやすかった。
//
//   「未設定」「キーが無効」「プランの範囲外」「ネットワーク」を
//   区別できないと、直しようがない。
//
// 判断は純関数にする。ネットワーク呼び出しは呼び出し側が行い、
// ここは観測結果を分類するだけにする（テスト可能にするため）。

export const JQUANTS_DIAGNOSES = [
  "not_configured",
  "credential_rejected",
  "plan_not_entitled",
  "rate_limited",
  "network_unreachable",
  "server_error",
  "reachable",
] as const;

export type JQuantsDiagnosis = (typeof JQUANTS_DIAGNOSES)[number];

export interface JQuantsProbe {
  /** 叩いたパス。鍵の値は含めない。 */
  path: string;
  /** HTTP ステータス。到達しなかった場合は null。 */
  status: number | null;
  /** 応答本文の message（あれば）。 */
  message?: string;
  /** 応答までのミリ秒。到達判定に使う。 */
  elapsedMs: number;
  /** 例外が出た場合の分類（タイムアウト等）。 */
  transportError?: "timeout" | "dns" | "connection" | "unknown";
}

export interface JQuantsDiagnosisInput {
  /** JQUANTS_API_KEY が設定されているか。値は渡さない。 */
  hasApiKey: boolean;
  /** JQUANTS_EMAIL / PASSWORD が両方設定されているか。 */
  hasEmailPassword: boolean;
  probes: readonly JQuantsProbe[];
}

export interface JQuantsDiagnosisResult {
  diagnosis: JQuantsDiagnosis;
  /** 何が起きているか。 */
  summary: string;
  /** 次に何をすればよいか。人間の作業なら明示する。 */
  nextAction: string;
  /** 人間しかできない作業か。 */
  requiresHuman: boolean;
  details: string[];
}

/**
 * 観測結果から原因を分類する。
 *
 * 「未設定」を最初に切る。設定されていないのに「キーが無効」と言わない。
 */
export function diagnoseJQuants(input: JQuantsDiagnosisInput): JQuantsDiagnosisResult {
  const details: string[] = [];
  details.push(
    `認証情報: API キー ${input.hasApiKey ? "あり" : "なし"} / `
    + `メール+パスワード ${input.hasEmailPassword ? "あり" : "なし"}`,
  );
  for (const probe of input.probes) {
    details.push(
      `${probe.path}: ${probe.status === null ? `到達せず(${probe.transportError ?? "unknown"})` : `HTTP ${probe.status}`}`
      + ` / ${probe.elapsedMs}ms`
      + (probe.message ? ` / ${probe.message}` : ""),
    );
  }

  if (!input.hasApiKey && !input.hasEmailPassword) {
    return {
      diagnosis: "not_configured",
      summary: "J-Quants の認証情報が設定されていません",
      nextAction: ".env に JQUANTS_API_KEY、または JQUANTS_EMAIL と JQUANTS_PASSWORD を設定する",
      requiresHuman: true,
      details,
    };
  }

  if (input.probes.length === 0) {
    return {
      diagnosis: "network_unreachable",
      summary: "API へ1度も到達を試みていません",
      nextAction: "診断スクリプトを --execute 付きで実行する",
      requiresHuman: false,
      details,
    };
  }

  const reached = input.probes.filter((probe) => probe.status !== null);
  if (reached.length === 0) {
    const transport = input.probes[0].transportError ?? "unknown";
    return {
      diagnosis: "network_unreachable",
      summary: `API へ到達できません（${transport}）`,
      nextAction: "ネットワーク接続とプロキシ設定を確認する。認証情報の問題ではありません",
      requiresHuman: true,
      details,
    };
  }

  if (reached.some((probe) => probe.status === 200)) {
    return {
      diagnosis: "reachable",
      summary: "API へ到達し、認証も通っています",
      nextAction: "pnpm daily を実行して全銘柄の株価が入ることを確認する",
      requiresHuman: false,
      details,
    };
  }

  if (reached.some((probe) => probe.status === 429)) {
    return {
      diagnosis: "rate_limited",
      summary: "レート制限に当たっています",
      nextAction: "JQUANTS_V2_REQUEST_INTERVAL_MS を広げて時間をおいて再実行する",
      requiresHuman: false,
      details,
    };
  }

  if (reached.some((probe) => probe.status !== null && probe.status >= 500)) {
    return {
      diagnosis: "server_error",
      summary: "J-Quants 側でエラーが返っています",
      nextAction: "時間をおいて再実行する。こちら側の設定の問題ではありません",
      requiresHuman: false,
      details,
    };
  }

  const unauthorized = reached.filter(
    (probe) => probe.status === 401 || probe.status === 403,
  );
  if (unauthorized.length > 0) {
    // 応答が速い＝到達している。ネットワークではなく認証・権限の問題。
    const fastest = Math.min(...unauthorized.map((probe) => probe.elapsedMs));
    details.push(`最速の拒否応答: ${fastest}ms（到達しているのでネットワークの問題ではありません）`);

    // 401 は資格情報そのもの、403 は権限。全経路で拒否ならキー側とみなす。
    const allRejected = unauthorized.length === reached.length;
    if (allRejected) {
      return {
        diagnosis: "credential_rejected",
        summary: "認証情報が拒否されています（無効・期限切れ・権限不足のいずれか）",
        nextAction:
          "J-Quants のマイページで API キーの有効性を確認し、必要なら再発行して .env を更新する。"
          + "または JQUANTS_EMAIL / JQUANTS_PASSWORD を設定して v1 経路へ切り替える",
        requiresHuman: true,
        details,
      };
    }
    return {
      diagnosis: "plan_not_entitled",
      summary: "一部のエンドポイントだけ拒否されています。契約プランの範囲外の可能性があります",
      nextAction: "拒否されたエンドポイントが契約プランに含まれるかを確認する",
      requiresHuman: true,
      details,
    };
  }

  return {
    diagnosis: "server_error",
    summary: `想定外の応答です（${reached.map((probe) => probe.status).join(", ")}）`,
    nextAction: "応答内容を確認する",
    requiresHuman: true,
    details,
  };
}

export function formatJQuantsDiagnosis(result: JQuantsDiagnosisResult): string {
  const lines = [
    `J-Quants 診断: ${result.diagnosis}`,
    `  ${result.summary}`,
    "",
    "観測:",
    ...result.details.map((one) => `  - ${one}`),
    "",
    `次の作業${result.requiresHuman ? "（人間）" : ""}: ${result.nextAction}`,
  ];
  return lines.join("\n");
}
