import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { load } from "js-yaml";
import { todayJst } from "./date.js";

type ScenarioConfig = {
  scenarios: Record<string, {
    label: string;
    description: string;
    watch_themes: string[];
    avoid_or_caution: string[];
    non_move_reasons: string[];
    evidence_checks: string[];
  }>;
};

type WorldReflection = {
  date?: string;
  title?: string;
  category?: string;
  tags?: string[];
  riskLevel?: string;
};

const scenarioKeywords: Record<string, string[]> = {
  pandemic: ["感染", "パンデミック", "医療", "ワクチン", "人流", "在宅"],
  earthquake_disaster: ["地震", "震災", "災害", "復旧", "津波", "台風", "洪水"],
  climate_heat_water: ["猛暑", "温暖化", "水不足", "干ばつ", "電力不足", "冷却", "気候"],
  war_geopolitics: ["戦争", "地政学", "防衛", "制裁", "海峡", "ミサイル", "サイバー", "資源"],
  migration_labor_shortage: ["移民", "人手不足", "賃上げ", "労働", "介護", "省人化"],
  food_security: ["食糧", "農業", "肥料", "飼料", "小麦", "米", "価格転嫁"],
  financial_crisis_rate_shock: ["金利", "金融不安", "銀行", "信用", "為替", "不動産", "債券"],
};

function readYaml<T>(path: string): T {
  return load(readFileSync(path, "utf-8")) as T;
}

function readReflections(): WorldReflection[] {
  const path = "data/world_event_reflections.json";
  if (!existsSync(path)) return [];
  try {
    const value = JSON.parse(readFileSync(path, "utf-8")) as unknown;
    return Array.isArray(value) ? value as WorldReflection[] : [];
  } catch {
    return [];
  }
}

function scoreScenario(id: string, reflections: WorldReflection[]): { score: number; hits: string[] } {
  const keywords = scenarioKeywords[id] ?? [];
  const hits: string[] = [];
  for (const reflection of reflections.slice(-80)) {
    const text = [reflection.title, reflection.category, ...(reflection.tags ?? [])].filter(Boolean).join(" ");
    if (keywords.some(keyword => text.includes(keyword))) {
      hits.push(reflection.title ?? reflection.category ?? id);
    }
  }
  return { score: hits.length, hits: hits.slice(-8) };
}

function main() {
  const date = todayJst();
  const config = readYaml<ScenarioConfig>("config/regime-scenarios.yml");
  const reflections = readReflections();
  const ranked = Object.entries(config.scenarios)
    .map(([id, scenario]) => ({ id, scenario, ...scoreScenario(id, reflections) }))
    .sort((a, b) => b.score - a.score);

  const lines: string[] = [];
  lines.push("# alpha-pon 時代変化シナリオレポート");
  lines.push("");
  lines.push(`生成日: ${date}`);
  lines.push("");
  lines.push("> コロナ、震災、温暖化、戦争、移民、食糧、金融不安など、時代変化に合わせて見るテーマを切り替えるためのレポートです。買い推奨ではありません。");
  lines.push("");

  lines.push("## 優先して見るシナリオ");
  lines.push("");
  for (const item of ranked.slice(0, 5)) {
    const active = item.score > 0 ? "⚠️" : "🔎";
    lines.push(`### ${active} ${item.scenario.label} (${item.id})`);
    lines.push(`- score: ${item.score}`);
    lines.push(`- 説明: ${item.scenario.description}`);
    lines.push(`- 見るテーマ: ${item.scenario.watch_themes.join(" / ")}`);
    lines.push(`- 注意: ${item.scenario.avoid_or_caution.join(" / ")}`);
    lines.push(`- 外れたら疑う理由DB: ${item.scenario.non_move_reasons.join(" / ")}`);
    lines.push(`- 確認: ${item.scenario.evidence_checks.join(" / ")}`);
    if (item.hits.length > 0) {
      lines.push("- 反応した最近の材料:");
      for (const hit of item.hits) lines.push(`  - ${hit}`);
    }
    lines.push("");
  }

  lines.push("## 運用ルール");
  lines.push("");
  lines.push("- scoreが高いシナリオは、見るテーマを切り替える候補");
  lines.push("- ただし、シナリオ名だけで銘柄を選ばない。一次情報・財務・価格を必ず見る");
  lines.push("- 具体銘柄が不要な局面では、無理に銘柄化せず、保留・監視に切り替える");
  lines.push("- 外れたら non-move reasons に分類し、次の仮説に反映する");
  lines.push("");
  lines.push("---");
  lines.push(`*alpha-pon regime scenarios | ${date} | ※買い推奨ではありません*`);

  mkdirSync("reports", { recursive: true });
  writeFileSync(join("reports", "regime_scenarios_latest.md"), lines.join("\n"), "utf-8");
  writeFileSync(join("reports", "regime_scenarios_latest.json"), JSON.stringify(ranked, null, 2), "utf-8");
  console.log(`regime scenarios: ${ranked.length}`);
}

main();
