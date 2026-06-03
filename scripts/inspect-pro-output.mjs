#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";

const COMMITTEE_PATH = "reports/stock_pro_committee_latest.json";
const UI_DATA_PATH = "apps/web/public/generated/alpha-pon-data.json";

function readJson(path) {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8"));
}

function countBy(items, getKey) {
  const counts = new Map();
  for (const item of items) {
    const key = getKey(item) ?? "unknown";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
}

function uniqueFlat(items, getValues) {
  return [...new Set(items.flatMap(item => getValues(item) ?? []))].filter(Boolean);
}

function printSection(title) {
  console.log(`\n## ${title}`);
}

function main() {
  const committee = readJson(COMMITTEE_PATH);
  const uiData = readJson(UI_DATA_PATH);

  if (!committee) {
    console.error(`[missing] ${COMMITTEE_PATH}`);
    process.exitCode = 1;
    return;
  }

  const decisions = Array.isArray(committee.decisions) ? committee.decisions : [];
  printSection("stock pro committee summary");
  console.log(`decisions: ${decisions.length}`);
  console.log("finalLabel:", countBy(decisions, decision => decision.finalLabel));
  console.log("originalFinalLabel:", countBy(decisions, decision => decision.originalFinalLabel));
  console.log("agreementLevel:", countBy(decisions, decision => decision.consensus?.agreementLevel));

  const withDisagreements = decisions.filter(decision => Array.isArray(decision.disagreements) && decision.disagreements.length > 0);
  const changedLabel = decisions.filter(decision => decision.originalFinalLabel && decision.originalFinalLabel !== decision.finalLabel);
  printSection("safety changes");
  console.log(`decisions with disagreements: ${withDisagreements.length}`);
  console.log(`label adjusted by safety rule: ${changedLabel.length}`);
  for (const decision of changedLabel.slice(0, 10)) {
    console.log(`- ${decision.code} ${decision.name}: ${decision.originalFinalLabel} -> ${decision.finalLabel}`);
  }

  printSection("top missing / caution agents");
  const cautiousAgents = uniqueFlat(decisions, decision => decision.consensus?.cautiousAgents ?? []);
  const blockingAgents = uniqueFlat(decisions, decision => decision.consensus?.blockingAgents ?? []);
  console.log(`cautiousAgents(${cautiousAgents.length}): ${cautiousAgents.slice(0, 20).join(", ") || "none"}`);
  console.log(`blockingAgents(${blockingAgents.length}): ${blockingAgents.slice(0, 20).join(", ") || "none"}`);

  printSection("disagreement topics");
  const allDisagreements = decisions.flatMap(decision => decision.disagreements ?? []);
  console.log(countBy(allDisagreements, item => item.topic));

  if (!uiData) {
    console.warn(`\n[warn] ${UI_DATA_PATH} is missing. Run pnpm ui:data.`);
    return;
  }

  printSection("ui data check");
  const legendDecisions = uiData.legendProCommittee?.decisions ?? [];
  console.log(`legendProCommittee.decisions: ${legendDecisions.length}`);
  console.log(`has buffettQuality: ${Boolean(uiData.buffettQuality)}`);
  console.log(`has valuationSnapshots: ${Boolean(uiData.valuationSnapshots)}`);
  console.log(`has irEventEvidence: ${Boolean(uiData.irEventEvidence)}`);

  if (decisions.length !== legendDecisions.length) {
    console.warn(`[warn] committee decisions (${decisions.length}) and UI legendProCommittee decisions (${legendDecisions.length}) differ.`);
    process.exitCode = 1;
  }
}

main();
