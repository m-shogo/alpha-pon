import { existsSync, readFileSync } from "fs";

function readJson(path: string): unknown {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8")) as unknown;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

{
  const data = readJson("reports/stock_pro_committee_latest.json");
  if (data !== null) {
    assert(isObject(data), "stock_pro_committee_latest.json は object である必要があります");
    assert(Array.isArray(data.decisions), "stock_pro_committee_latest.json.decisions は配列である必要があります");
    for (const decision of data.decisions) {
      assert(isObject(decision), "decision は object である必要があります");
      assert(typeof decision.code === "string", "decision.code は string である必要があります");
      assert(typeof decision.name === "string", "decision.name は string である必要があります");
      assert(typeof decision.finalLabel === "string", "decision.finalLabel は string である必要があります");
      assert(Array.isArray(decision.verdicts), "decision.verdicts は配列である必要があります");
      if ("legendVerdicts" in decision) assert(Array.isArray(decision.legendVerdicts), "decision.legendVerdicts は配列である必要があります");
      if ("disagreements" in decision) assert(Array.isArray(decision.disagreements), "decision.disagreements は配列である必要があります");
      if ("consensus" in decision && decision.consensus !== null) assert(isObject(decision.consensus), "decision.consensus は object である必要があります");
    }
  }
}

{
  const data = readJson("apps/web/public/generated/alpha-pon-data.json");
  if (data !== null) {
    assert(isObject(data), "alpha-pon-data.json は object である必要があります");
    if ("legendProCommittee" in data) {
      const committee = data.legendProCommittee;
      assert(isObject(committee), "legendProCommittee は object である必要があります");
      assert(Array.isArray(committee.decisions), "legendProCommittee.decisions は配列である必要があります");
      for (const decision of committee.decisions) {
        assert(isObject(decision), "legendProCommittee decision は object である必要があります");
        assert("finalLabel" in decision, "legendProCommittee decision は finalLabel を持つ必要があります");
        assert("legendVerdicts" in decision, "legendProCommittee decision は legendVerdicts を持つ必要があります");
        if ("disagreements" in decision) assert(Array.isArray(decision.disagreements), "legendProCommittee.disagreements は配列である必要があります");
      }
    }
    assert("ipoThemeWatch" in data, "alpha-pon-data.json は ipoThemeWatch を必ず持つ必要があります");
    const watch = data.ipoThemeWatch;
    assert(isObject(watch), "ipoThemeWatch は object である必要があります");
    assert(Array.isArray(watch.rules), "ipoThemeWatch.rules は配列である必要があります");
    assert(watch.rules.length > 0, "ipoThemeWatch.rules は1件以上必要です");
    assert(Array.isArray(watch.phases), "ipoThemeWatch.phases は配列である必要があります");
    assert(watch.phases.length > 0, "ipoThemeWatch.phases は1件以上必要です");
    assert(Array.isArray(watch.outcomeStats), "ipoThemeWatch.outcomeStats は配列である必要があります");
    for (const rule of watch.rules) {
      assert(isObject(rule), "ipoThemeWatch rule は object である必要があります");
      assert(typeof rule.id === "string", "ipoThemeWatch.rules[].id は string である必要があります");
      assert(typeof rule.defaultAction === "string", "ipoThemeWatch.rules[].defaultAction は string である必要があります");
      assert(Array.isArray(rule.relatedCompanies), "ipoThemeWatch.rules[].relatedCompanies は配列である必要があります");
    }
  }
}

console.log("pro generated data shape tests passed");
