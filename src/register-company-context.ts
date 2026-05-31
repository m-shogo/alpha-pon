import { mkdirSync, appendFileSync, writeFileSync } from "fs";
import { join } from "path";
import { todayJst } from "./date.js";

type CompanyContextRegistration = {
  date: string;
  code: string;
  name: string;
  categoryId: string;
  categoryLabel: string;
  role: string;
  status: "active" | "watch" | "stale" | "retired";
  socialContext: string[];
  upsideHypothesis: string;
  noMoveHypothesis: string;
  downsideHypothesis: string;
  notGoodWhen: string[];
  relatedCompanies: string[];
  evidenceToCheck: string[];
  nonMoveReasonCandidates: string[];
  network: {
    peers: Array<{ code: string; name: string; relation: string }>;
    customerOrDemandDrivers: string[];
    betterPeerRisk: string[];
    evidenceChecks: string[];
  };
  finalLabel: "調査候補" | "保留" | "証拠不足" | "避ける" | "追わない/保留";
  sourcePolicy: string[];
  notes: string[];
};

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function argValue(name: string): string | null {
  const prefix = `${name}=`;
  const found = process.argv.find(arg => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function sanrioSample(date: string): CompanyContextRegistration {
  return {
    date,
    code: "8136",
    name: "サンリオ",
    categoryId: "global_ip_character",
    categoryLabel: "グローバルIP・キャラクター",
    role: "キャラクターIP・ライセンス・体験消費",
    status: "active",
    socialContext: [
      "日本発IPの海外展開需要",
      "円安/インバウンド/海外消費の追い風と逆風を両方見る",
      "高バリュエーション銘柄は金利・期待先行・決算ハードル上昇に弱い",
      "SNS・若年層トレンドは強みだが、人気ピークアウトも早い",
      "ライセンス型は利益率が高くなりやすい一方、成長鈍化時は倍率調整されやすい",
    ],
    upsideHypothesis: "海外ライセンス成長、複数キャラクター展開、体験消費/コラボ拡大により高利益率成長が続く可能性。",
    noMoveHypothesis: "良い会社でも市場期待が高く、決算サプライズや海外成長の加速がないと上がりにくい。",
    downsideHypothesis: "海外成長鈍化、人気ピークアウト、ライセンス先の在庫調整、高PER調整で下落する可能性。",
    notGoodWhen: [
      "海外ライセンス成長率が鈍化",
      "営業利益率が悪化",
      "決算前に期待が上がりすぎ",
      "短期で急騰済み",
      "主要IPの検索/SNS/販売トレンドが弱い",
    ],
    relatedCompanies: [
      "7974 任天堂",
      "7832 バンダイナムコHD",
      "4661 オリエンタルランド",
      "7867 タカラトミー",
      "9766 コナミG",
    ],
    evidenceToCheck: [
      "海外売上/地域別売上",
      "ライセンス収入と物販の構成比",
      "営業利益率",
      "IP別トレンド/キャラクター分散",
      "決算説明資料の中期計画進捗",
      "PER/PBRの過去レンジ",
    ],
    nonMoveReasonCandidates: [
      "already_priced_in",
      "expectation_too_high",
      "theme_right_timing_wrong",
      "better_peer_exists",
      "growth_deceleration",
    ],
    network: {
      peers: [
        { code: "7974", name: "任天堂", relation: "日本発IP・海外展開・ゲーム/映画/テーマパーク" },
        { code: "7832", name: "バンダイナムコHD", relation: "キャラクター/玩具/ゲームIP" },
        { code: "4661", name: "オリエンタルランド", relation: "体験型IP/テーマパーク" },
        { code: "7867", name: "タカラトミー", relation: "玩具/キャラクター商品" },
      ],
      customerOrDemandDrivers: [
        "海外ライセンス需要",
        "若年層・SNS経由のIP消費",
        "インバウンド/観光消費",
        "コラボ/アパレル/雑貨需要",
        "中国・アジア・北米のキャラクター消費",
      ],
      betterPeerRisk: [
        "IPテーマの資金が任天堂/バンナムなど大型IP銘柄へ流れる可能性",
        "サンリオ単独より、テーマパーク/ゲーム/映像化を持つ企業が選ばれる局面がある",
        "短期でサンリオが上がりすぎた場合、同テーマの出遅れ銘柄に資金が移る可能性",
      ],
      evidenceChecks: [
        "海外ライセンス売上",
        "地域別成長率",
        "営業利益率",
        "IP別売上/人気分散",
        "コラボ案件の継続性",
      ],
    },
    finalLabel: "保留",
    sourcePolicy: [
      "公式IR/決算説明資料を最優先",
      "ニュースは補助情報扱い",
      "SNSトレンドは仮説に留め、一次情報で裏取りする",
      "買い推奨にしない",
    ],
    notes: [
      "サンプル登録。既存YAML本体を自動破壊しないため、まずregistry JSONLとpreview reportに残す。",
      "既にcompany-hypotheses.yml/company-network.ymlに8136は存在するため、差分レビュー対象にする。",
      "良い会社判定と良い投資タイミング判定を分ける。",
    ],
  };
}

function toMarkdown(item: CompanyContextRegistration): string {
  const lines: string[] = [];
  lines.push("# alpha-pon company context registration preview");
  lines.push("");
  lines.push(`date: ${item.date}`);
  lines.push("");
  lines.push("> 銘柄・社会情勢・反証条件を登録するためのプレビューです。買い推奨ではありません。");
  lines.push("");
  lines.push(`## ${item.code} ${item.name}`);
  lines.push("");
  lines.push(`- category: ${item.categoryId} / ${item.categoryLabel}`);
  lines.push(`- role: ${item.role}`);
  lines.push(`- status: ${item.status}`);
  lines.push(`- finalLabel: ${item.finalLabel}`);
  lines.push("");
  lines.push("## social context");
  lines.push("");
  item.socialContext.forEach(value => lines.push(`- ${value}`));
  lines.push("");
  lines.push("## hypotheses");
  lines.push("");
  lines.push(`- upside: ${item.upsideHypothesis}`);
  lines.push(`- noMove: ${item.noMoveHypothesis}`);
  lines.push(`- downside: ${item.downsideHypothesis}`);
  lines.push("");
  lines.push("## not good when");
  lines.push("");
  item.notGoodWhen.forEach(value => lines.push(`- ${value}`));
  lines.push("");
  lines.push("## related companies");
  lines.push("");
  item.relatedCompanies.forEach(value => lines.push(`- ${value}`));
  lines.push("");
  lines.push("## evidence to check");
  lines.push("");
  item.evidenceToCheck.forEach(value => lines.push(`- ${value}`));
  lines.push("");
  lines.push("## network");
  lines.push("");
  lines.push("### peers");
  item.network.peers.forEach(peer => lines.push(`- ${peer.code} ${peer.name}: ${peer.relation}`));
  lines.push("");
  lines.push("### demand drivers");
  item.network.customerOrDemandDrivers.forEach(value => lines.push(`- ${value}`));
  lines.push("");
  lines.push("### better peer risk");
  item.network.betterPeerRisk.forEach(value => lines.push(`- ${value}`));
  lines.push("");
  lines.push("## non move reason candidates");
  lines.push("");
  item.nonMoveReasonCandidates.forEach(value => lines.push(`- ${value}`));
  lines.push("");
  lines.push("## source policy");
  lines.push("");
  item.sourcePolicy.forEach(value => lines.push(`- ${value}`));
  lines.push("");
  lines.push("## notes");
  lines.push("");
  item.notes.forEach(value => lines.push(`- ${value}`));
  lines.push("");
  lines.push("---");
  lines.push(`*alpha-pon company context registration | ${item.date} | ※買い推奨ではありません*`);
  return lines.join("\n");
}

function main() {
  const date = todayJst();
  const sample = argValue("--sample");
  const write = hasFlag("--write");

  if (sample !== "sanrio") {
    console.error("usage: node --import tsx/esm src/register-company-context.ts --sample=sanrio [--write]");
    process.exitCode = 1;
    return;
  }

  const item = sanrioSample(date);
  mkdirSync("reports", { recursive: true });
  writeFileSync(join("reports", "company_context_registration_preview_latest.md"), toMarkdown(item), "utf-8");

  if (write) {
    mkdirSync("data", { recursive: true });
    appendFileSync(join("data", "company_context_registry.jsonl"), `${JSON.stringify(item)}\n`, "utf-8");
    console.log(`company context registered: ${item.code} ${item.name}`);
  } else {
    console.log(`company context preview generated: ${item.code} ${item.name}`);
  }
}

main();
