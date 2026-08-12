// Research OS CLI 共通ユーティリティ。

import type { Issue } from "../edge-registry.js";

export function parseArgs(argv: string[] = process.argv.slice(2)): {
  flags: Set<string>;
  options: Map<string, string>;
  positional: string[];
} {
  const flags = new Set<string>();
  const options = new Map<string, string>();
  const positional: string[] = [];

  for (const arg of argv) {
    if (arg.startsWith("--")) {
      const [key, ...rest] = arg.slice(2).split("=");
      if (rest.length > 0) options.set(key, rest.join("="));
      else flags.add(key);
    } else {
      positional.push(arg);
    }
  }
  return { flags, options, positional };
}

export function todayJst(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** JST のタイムゾーン付き ISO 8601（例: 2026-08-04T09:00:00.123+09:00）。 */
export function nowJstIso(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(now);
  const milliseconds = String(now.getUTCMilliseconds()).padStart(3, "0");
  return `${parts.replace(" ", "T")}.${milliseconds}+09:00`;
}

export function printIssues(title: string, issues: Issue[]): { errors: number; warnings: number } {
  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");

  console.log(`\n[${title}] エラー ${errors.length} 件 / 警告 ${warnings.length} 件`);
  for (const issue of [...errors, ...warnings]) {
    const mark = issue.severity === "error" ? "ERROR" : "WARN ";
    console.log(`  ${mark} ${issue.code} — ${issue.target}: ${issue.message}`);
  }
  return { errors: errors.length, warnings: warnings.length };
}

export function fail(message: string): never {
  console.error(`\n✗ ${message}`);
  process.exit(1);
}
