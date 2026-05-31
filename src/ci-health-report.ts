import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { todayJst } from "./date.js";

type CiHealth = {
  date: string;
  runId: string;
  runNumber: string;
  sha: string;
  ref: string;
  actor: string;
  workflow: string;
  eventName: string;
  repository: string;
  status: "generated";
};

function env(name: string): string {
  return process.env[name] ?? "local";
}

function main() {
  const date = todayJst();
  const health: CiHealth = {
    date,
    runId: env("GITHUB_RUN_ID"),
    runNumber: env("GITHUB_RUN_NUMBER"),
    sha: env("GITHUB_SHA"),
    ref: env("GITHUB_REF"),
    actor: env("GITHUB_ACTOR"),
    workflow: env("GITHUB_WORKFLOW"),
    eventName: env("GITHUB_EVENT_NAME"),
    repository: env("GITHUB_REPOSITORY"),
    status: "generated",
  };

  const lines: string[] = [];
  lines.push("# alpha-pon CI health report");
  lines.push("");
  lines.push(`date: ${health.date}`);
  lines.push("");
  lines.push("CI実行環境のメタ情報をArtifactに残します。CIの成否そのものはGitHub Actionsのstatusを正とします。");
  lines.push("");
  lines.push("## metadata");
  lines.push("");
  lines.push(`- repository: ${health.repository}`);
  lines.push(`- workflow: ${health.workflow}`);
  lines.push(`- event: ${health.eventName}`);
  lines.push(`- runId: ${health.runId}`);
  lines.push(`- runNumber: ${health.runNumber}`);
  lines.push(`- ref: ${health.ref}`);
  lines.push(`- sha: ${health.sha}`);
  lines.push(`- actor: ${health.actor}`);
  lines.push("");
  lines.push("## rule");
  lines.push("");
  lines.push("- このファイルはArtifactで保存するためのCIメモです");
  lines.push("- CIが失敗した場合はGitHub Actionsのjob/stepログを正とします");
  lines.push("- daily運用のsource healthとは分けて考えます");

  mkdirSync("reports", { recursive: true });
  writeFileSync(join("reports", "ci_health_latest.json"), JSON.stringify(health, null, 2), "utf-8");
  writeFileSync(join("reports", "ci_health_latest.md"), lines.join("\n"), "utf-8");
  console.log(`ci health report: ${health.runId}`);
}

main();
