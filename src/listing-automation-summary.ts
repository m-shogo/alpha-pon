import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { todayJst } from "./date.js";
import { parseListingAutomationCheckInput } from "./listing-automation-summary-input.js";
import { parseListingEventMessageInput } from "./listing-event-message-preview-input.js";

type Status = "ok" | "warning" | "fail" | "missing" | "unknown";

type SummaryItem = {
  id: string;
  status: Status;
  label: string;
  detail: string;
  reportPath?: string;
};

function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

function existsReport(path: string): boolean {
  return existsSync(path);
}

function countBy<T extends Record<string, unknown>>(items: T[], key: keyof T, value: unknown): number {
  return items.filter(item => item[key] === value).length;
}

function readinessItem(): SummaryItem {
  const path = "reports/listing_automation_readiness_latest.json";
  if (!existsReport(path)) return { id: "readiness", status: "missing", label: "Readiness", detail: "readiness report missing", reportPath: path };
  const input = parseListingAutomationCheckInput(readFileSync(path, "utf-8"));
  if (input.invalid) {
    return { id: "readiness", status: "warning", label: "Readiness", detail: `invalid input (${input.reason})`, reportPath: path };
  }
  const missing = countBy(input.checks, "status", "missing");
  const warning = countBy(input.checks, "status", "warning");
  return { id: "readiness", status: missing > 0 ? "warning" : "ok", label: "Readiness", detail: `missing=${missing}, warning=${warning}`, reportPath: path };
}

function smokeItem(): SummaryItem {
  const path = "reports/listing_automation_smoke_audit_latest.json";
  if (!existsReport(path)) return { id: "smoke", status: "missing", label: "Smoke audit", detail: "smoke audit report missing", reportPath: path };
  const input = parseListingAutomationCheckInput(readFileSync(path, "utf-8"));
  if (input.invalid) {
    return { id: "smoke", status: "warning", label: "Smoke audit", detail: `invalid input (${input.reason})`, reportPath: path };
  }
  const fail = countBy(input.checks, "status", "fail");
  const warning = countBy(input.checks, "status", "warning");
  return { id: "smoke", status: fail > 0 ? "fail" : warning > 0 ? "warning" : "ok", label: "Smoke audit", detail: `fail=${fail}, warning=${warning}`, reportPath: path };
}

function jpxItem(): SummaryItem {
  const path = "reports/jpx_listing_sync_latest.json";
  if (!existsReport(path)) return { id: "jpx", status: "missing", label: "JPX sync", detail: "JPX sync report missing", reportPath: path };
  const json = readJson<{ parsed?: unknown[]; appendable?: unknown[]; error?: string; sourceUrl?: string }>(path, {});
  const parsed = json.parsed?.length ?? 0;
  const appendable = json.appendable?.length ?? 0;
  const status: Status = json.error ? "warning" : parsed > 0 ? "ok" : json.sourceUrl ? "warning" : "missing";
  return { id: "jpx", status, label: "JPX sync", detail: `parsed=${parsed}, appendable=${appendable}${json.error ? `, error=${json.error}` : ""}`, reportPath: path };
}

function alertsItem(): SummaryItem {
  const path = "reports/listing_event_alerts_latest.json";
  if (!existsReport(path)) return { id: "alerts", status: "missing", label: "Listing alerts", detail: "alerts report missing", reportPath: path };
  const input = parseListingEventMessageInput(readFileSync(path, "utf-8"));
  const priority = input.alerts.filter(alert => alert.effectiveNotificationLevel === "priority").length;
  const missingDate = input.alerts.filter(alert => alert.alertType === "missing_date").length;
  const invalid = input.warnings.length > 0;
  return {
    id: "alerts",
    status: invalid || priority > 20 ? "warning" : "ok",
    label: "Listing alerts",
    detail: `alerts=${input.alerts.length}, priority=${priority}, missingDate=${missingDate}${invalid ? `, input=${input.warnings.join(";")}` : ""}`,
    reportPath: path,
  };
}

function priceItem(): SummaryItem {
  const path = "reports/jquants_listing_review_prices_latest.json";
  if (!existsReport(path)) return { id: "jquants", status: "missing", label: "J-Quants prices", detail: "J-Quants report missing", reportPath: path };
  const json = readJson<{ results?: { price?: number | null; source?: string }[]; setupError?: string | null; targets?: unknown[] }>(path, {});
  const results = json.results ?? [];
  const missing = results.filter(r => r.price == null).length;
  const status: Status = json.setupError ? "warning" : results.length === 0 ? "warning" : missing > 0 ? "warning" : "ok";
  return { id: "jquants", status, label: "J-Quants prices", detail: `targets=${json.targets?.length ?? 0}, results=${results.length}, missing=${missing}${json.setupError ? `, setup=${json.setupError}` : ""}`, reportPath: path };
}

function topixItem(): SummaryItem {
  const path = "reports/listing_topix_relative_latest.json";
  if (!existsReport(path)) return { id: "topix", status: "missing", label: "TOPIX relative", detail: "TOPIX report missing", reportPath: path };
  const json = readJson<{ rows?: { topixRelativeReturn?: number | null }[] }>(path, {});
  const rows = json.rows ?? [];
  const missing = rows.filter(row => row.topixRelativeReturn == null).length;
  return { id: "topix", status: rows.length === 0 || missing > 0 ? "warning" : "ok", label: "TOPIX relative", detail: `rows=${rows.length}, missing=${missing}`, reportPath: path };
}

function main() {
  const generatedAt = todayJst();
  const items = [readinessItem(), smokeItem(), jpxItem(), alertsItem(), priceItem(), topixItem()];
  const fail = items.filter(item => item.status === "fail").length;
  const warning = items.filter(item => item.status === "warning" || item.status === "missing").length;
  const lines: string[] = [];

  lines.push("# listing automation summary", "", `date: ${generatedAt}`, "");
  lines.push("> 上場イベント自動化の運用サマリーです。買い推奨ではありません。", "");
  lines.push(`- fail: ${fail}`);
  lines.push(`- warningOrMissing: ${warning}`, "");
  for (const item of items) {
    lines.push(`## ${item.label}`, "");
    lines.push(`- status: ${item.status}`);
    lines.push(`- detail: ${item.detail}`);
    if (item.reportPath) lines.push(`- report: ${item.reportPath}`);
    lines.push("");
  }

  lines.push("## next actions", "");
  for (const item of items.filter(i => i.status !== "ok")) {
    lines.push(`- ${item.label}: ${item.detail} を確認してください。`);
  }
  if (items.every(i => i.status === "ok")) lines.push("- 主要チェックはOKです。実データの内容確認へ進んでください。");

  mkdirSync("reports", { recursive: true });
  writeFileSync("reports/listing_automation_summary_latest.md", lines.join("\n"), "utf-8");
  writeFileSync("reports/listing_automation_summary_latest.json", JSON.stringify({ generatedAt, items }, null, 2), "utf-8");
  console.log(`listing automation summary generated: fail=${fail}, warning=${warning}`);
}

main();
