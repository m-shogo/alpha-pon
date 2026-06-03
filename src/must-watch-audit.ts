import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs";
import { join } from "path";
import { load } from "js-yaml";
import { todayJst } from "./date.js";

type RequiredJapanLink = {
  code: string;
  name: string;
  reason: string;
};

type MustWatchTheme = {
  label: string;
  whyRequired: string;
  requiredEntities?: string[];
  requiredJapanLinks?: RequiredJapanLink[];
  requiredQuestions?: string[];
  evidenceFiles?: string[];
  safetyRules?: string[];
};

type Config = {
  mustWatchThemes?: Record<string, MustWatchTheme>;
};

type ThemeAudit = {
  themeId: string;
  label: string;
  whyRequired: string;
  checkedFiles: string[];
  missingEntities: string[];
  missingJapanLinks: RequiredJapanLink[];
  missingQuestions: string[];
  missingSafetyRules: string[];
  status: "ok" | "warning";
};

const CONFIG_PATH = "config/must-watch-themes.yml";

function readText(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf-8") : "";
}

function readYaml<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  return load(readFileSync(path, "utf-8")) as T;
}

function collectDocs(): string[] {
  if (!existsSync("docs")) return [];
  return readdirSync("docs")
    .filter(name => name.endsWith(".md"))
    .map(name => join("docs", name));
}

function includesAny(haystack: string, values: string[]): boolean {
  return values.some(value => value && haystack.includes(value));
}

function auditTheme(themeId: string, theme: MustWatchTheme): ThemeAudit {
  const checkedFiles = [...new Set([...(theme.evidenceFiles ?? []), ...collectDocs()])];
  const haystack = checkedFiles.map(readText).join("\n");
  const missingEntities = (theme.requiredEntities ?? []).filter(entity => !haystack.includes(entity));
  const missingJapanLinks = (theme.requiredJapanLinks ?? []).filter(link => !includesAny(haystack, [link.code, link.name]));
  const missingQuestions = (theme.requiredQuestions ?? []).filter(question => !haystack.includes(question));
  const missingSafetyRules = (theme.safetyRules ?? []).filter(rule => !haystack.includes(rule));
  const status = missingEntities.length === 0 && missingJapanLinks.length === 0 && missingQuestions.length === 0 ? "ok" : "warning";
  return { themeId, label: theme.label, whyRequired: theme.whyRequired, checkedFiles, missingEntities, missingJapanLinks, missingQuestions, missingSafetyRules, status };
}

function main() {
  const config = readYaml<Config>(CONFIG_PATH, { mustWatchThemes: {} });
  const audits = Object.entries(config.mustWatchThemes ?? {}).map(([themeId, theme]) => auditTheme(themeId, theme));
  const date = todayJst();
  const lines: string[] = [];

  lines.push("# must-watch theme audit", "", `date: ${date}`, "");
  lines.push("> ユーザーに言われてから追加するのではなく、必須監視テーマの抜けを検出するための監査です。買い推奨ではありません。", "");

  for (const audit of audits) {
    lines.push(`## ${audit.label} (${audit.themeId})`, "");
    lines.push(audit.whyRequired, "");
    lines.push(`- status: ${audit.status}`);
    lines.push(`- missingEntities: ${audit.missingEntities.length}`);
    lines.push(`- missingJapanLinks: ${audit.missingJapanLinks.length}`);
    lines.push(`- missingQuestions: ${audit.missingQuestions.length}`);
    lines.push(`- missingSafetyRules: ${audit.missingSafetyRules.length}`, "");

    if (audit.missingEntities.length > 0) {
      lines.push("### missing entities");
      audit.missingEntities.forEach(item => lines.push(`- ${item}`));
      lines.push("");
    }

    if (audit.missingJapanLinks.length > 0) {
      lines.push("### missing Japan links");
      audit.missingJapanLinks.forEach(item => lines.push(`- ${item.code} ${item.name}: ${item.reason}`));
      lines.push("");
    }

    if (audit.missingQuestions.length > 0) {
      lines.push("### missing questions");
      audit.missingQuestions.forEach(item => lines.push(`- ${item}`));
      lines.push("");
    }

    if (audit.missingSafetyRules.length > 0) {
      lines.push("### missing safety rules");
      audit.missingSafetyRules.forEach(item => lines.push(`- ${item}`));
      lines.push("");
    }

    lines.push("### checked files");
    audit.checkedFiles.forEach(file => lines.push(`- ${file}`));
    lines.push("");
  }

  mkdirSync("reports", { recursive: true });
  writeFileSync("reports/must_watch_audit_latest.md", lines.join("\n"), "utf-8");
  writeFileSync("reports/must_watch_audit_latest.json", JSON.stringify({ generatedAt: date, audits }, null, 2), "utf-8");
  console.log(`must-watch audit generated: ${audits.length}`);
}

main();
