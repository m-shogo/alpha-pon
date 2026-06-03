import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { load } from "js-yaml";
import { todayJst } from "./date.js";

type WatchCompany = {
  code: string;
  name: string;
  role: string;
  whyWatch: string;
};

type WatchPhase = {
  label: string;
  action: string;
  doNotTouchReasons?: string[];
  evidenceNeeded?: string[];
  timingSignals?: string[];
};

type WatchRule = {
  label: string;
  description: string;
  defaultAction: string;
  neverTreatAs: string;
  phases?: Record<string, WatchPhase>;
  relatedJapanThemes?: Record<string, { label: string; watchCompanies?: WatchCompany[] }>;
  globalReferenceEvents?: string[];
  safetyRules?: string[];
};

type Config = {
  rules?: Record<string, WatchRule>;
};

const CONFIG_PATH = "config/ipo-theme-watch-rules.yml";

function readYaml<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  return load(readFileSync(path, "utf-8")) as T;
}

function list(lines: string[], items: string[] | undefined, indent = "- ") {
  for (const item of items ?? []) lines.push(`${indent}${item}`);
}

function main() {
  const config = readYaml<Config>(CONFIG_PATH, { rules: {} });
  const date = todayJst();
  const lines: string[] = [];

  lines.push("# IPO / AI / 宇宙 大型テーマ監視レポート", "", `date: ${date}`, "");
  lines.push("> 買い推奨ではありません。大型上場・AI/宇宙テーマを、待つ理由・確認すべき証拠・日本株への波及仮説として整理します。", "");

  for (const [ruleId, rule] of Object.entries(config.rules ?? {})) {
    lines.push(`## ${rule.label} (${ruleId})`, "");
    lines.push(rule.description, "");
    lines.push(`- defaultAction: ${rule.defaultAction}`);
    lines.push(`- neverTreatAs: ${rule.neverTreatAs}`, "");

    lines.push("### グローバル参照イベント", "");
    list(lines, rule.globalReferenceEvents);
    lines.push("");

    lines.push("### フェーズ別の見方", "");
    for (const [phaseId, phase] of Object.entries(rule.phases ?? {})) {
      lines.push(`#### ${phase.label} (${phaseId})`, "");
      lines.push(`- action: ${phase.action}`, "");
      lines.push("触らない/急がない理由:");
      list(lines, phase.doNotTouchReasons);
      lines.push("確認する証拠:");
      list(lines, phase.evidenceNeeded);
      lines.push("タイミング観察:");
      list(lines, phase.timingSignals);
      lines.push("");
    }

    lines.push("### 日本株への波及確認", "");
    for (const [themeId, theme] of Object.entries(rule.relatedJapanThemes ?? {})) {
      lines.push(`#### ${theme.label} (${themeId})`, "");
      for (const company of theme.watchCompanies ?? []) {
        lines.push(`- ${company.code} ${company.name} / ${company.role}`);
        lines.push(`  - 見る理由: ${company.whyWatch}`);
      }
      lines.push("");
    }

    lines.push("### 安全ルール", "");
    list(lines, rule.safetyRules);
    lines.push("");
  }

  mkdirSync("reports", { recursive: true });
  writeFileSync("reports/ipo_theme_watch_latest.md", lines.join("\n"), "utf-8");
  writeFileSync("reports/ipo_theme_watch_latest.json", JSON.stringify({ generatedAt: date, rules: config.rules ?? {} }, null, 2), "utf-8");
  console.log("ipo theme watch report generated");
}

main();
