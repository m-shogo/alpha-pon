// J-Quants 接続の診断。
//
//   node --env-file=.env --import tsx/esm scripts/diagnose-jquants.ts            （設定の確認のみ）
//   node --env-file=.env --import tsx/esm scripts/diagnose-jquants.ts --execute  （実際に叩く）
//
// 毎朝の daily が空レポートになったとき、原因が
// 「未設定」「キーが無効」「プランの範囲外」「ネットワーク」のどれかを切り分ける。
//
// 鍵の値は一切出力しない。設定の有無だけを扱う。

import {
  diagnoseJQuants,
  formatJQuantsDiagnosis,
  type JQuantsProbe,
} from "../src/execution/jquants-diagnosis.js";

const V1 = "https://api.jquants.com/v1";
const V2 = "https://api.jquants.com/v2";
const TIMEOUT_MS = 15_000;

function hasFlag(name: string): boolean {
  return process.argv.slice(2).includes(`--${name}`);
}

function classifyTransportError(error: unknown): JQuantsProbe["transportError"] {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  if (/timeout|abort/i.test(message)) return "timeout";
  if (/ENOTFOUND|EAI_AGAIN|dns/i.test(message)) return "dns";
  if (/ECONNREFUSED|ECONNRESET|EHOSTUNREACH|socket/i.test(message)) return "connection";
  return "unknown";
}

async function probe(path: string, headers: Record<string, string>): Promise<JQuantsProbe> {
  const startedAt = Date.now();
  try {
    const response = await fetch(path, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
    let message: string | undefined;
    try {
      const body = await response.json() as { message?: unknown };
      if (typeof body.message === "string") message = body.message;
    } catch {
      message = undefined;
    }
    return {
      path: path.replace(/^https:\/\/api\.jquants\.com/, ""),
      status: response.status,
      elapsedMs: Date.now() - startedAt,
      ...(message === undefined ? {} : { message }),
    };
  } catch (error) {
    return {
      path: path.replace(/^https:\/\/api\.jquants\.com/, ""),
      status: null,
      elapsedMs: Date.now() - startedAt,
      transportError: classifyTransportError(error),
    };
  }
}

async function main(): Promise<void> {
  const apiKey = process.env.JQUANTS_API_KEY;
  const email = process.env.JQUANTS_EMAIL;
  const password = process.env.JQUANTS_PASSWORD;
  const hasApiKey = Boolean(apiKey && apiKey.trim() !== "");
  const hasEmailPassword = Boolean(email && password && email.trim() !== "" && password.trim() !== "");

  if (!hasFlag("execute")) {
    console.log(formatJQuantsDiagnosis(diagnoseJQuants({ hasApiKey, hasEmailPassword, probes: [] })));
    console.log("");
    console.log("実際に API を叩くには --execute を付けてください。");
    return;
  }

  const probes: JQuantsProbe[] = [];
  if (hasApiKey) {
    const headers = { "x-api-key": apiKey!, "User-Agent": "alpha-pon/0.1" };
    probes.push(await probe(`${V2}/listed/info`, headers));
    probes.push(await probe(`${V2}/equities/bars/daily?code=13060&from=20240101&to=20240105`, headers));
  }
  if (hasEmailPassword) {
    const startedAt = Date.now();
    try {
      const response = await fetch(`${V1}/token/auth_user`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mailaddress: email, password }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      probes.push({ path: "/v1/token/auth_user", status: response.status, elapsedMs: Date.now() - startedAt });
    } catch (error) {
      probes.push({
        path: "/v1/token/auth_user",
        status: null,
        elapsedMs: Date.now() - startedAt,
        transportError: classifyTransportError(error),
      });
    }
  }

  const result = diagnoseJQuants({ hasApiKey, hasEmailPassword, probes });
  console.log(formatJQuantsDiagnosis(result));
  // daily を止めないための診断なので、原因が判明しても exit 0 で返す。
  // 呼び出し側が診断結果を見て判断する。
}

await main();
