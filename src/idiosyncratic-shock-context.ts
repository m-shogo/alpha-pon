// 企業固有ショックの「国だけでは説明できない」文脈モデル。
// 20点scoreとは分離し、事件帰属・類似比較・通知confidenceのために使う。

import { inferShockJurisdictionGroup, normalizeShockCountry } from "./idiosyncratic-shock-jurisdiction.js";

export type ShockIncidentGeography = "domestic" | "foreign" | "multi_country" | "unknown";
export type ShockIncidentScope = "individual" | "site" | "subsidiary" | "multi_unit" | "group_wide" | "unknown";
export type ShockStakeholder = "employee" | "customer" | "investor" | "supplier" | "regulator" | "public" | "mixed" | "unknown";
export type ShockConfounderStatus = "clear" | "possible" | "major" | "unknown";
export type ShockInformationLeakStatus = "clear" | "possible" | "likely" | "unknown";
export type ShockSectorRiskClass = "general" | "trust_critical" | "safety_critical" | "license_critical";

export type ShockContextInput = {
  issuerCountry?: string | null;
  incidentCountry?: string | null;
  market?: string | null;
  sector?: string | null;
  stakeholder?: ShockStakeholder | null;
  incidentScope?: ShockIncidentScope | null;
  confounderStatus?: ShockConfounderStatus | null;
  informationLeakStatus?: ShockInformationLeakStatus | null;
  incidentRevenueExposurePct?: number | null;
  estimatedDirectCostPctMarketCap?: number | null;
  industryRelativeShockDrawdownPct?: number | null;
};

export type ShockContextReview = {
  issuerCountry: string | null;
  incidentCountry: string | null;
  issuerJurisdictionGroup: string;
  incidentJurisdictionGroup: string;
  incidentGeography: ShockIncidentGeography;
  sectorRiskClass: ShockSectorRiskClass;
  stakeholder: ShockStakeholder;
  incidentScope: ShockIncidentScope;
  confounderStatus: ShockConfounderStatus;
  informationLeakStatus: ShockInformationLeakStatus;
  incidentRevenueExposurePct: number | null;
  estimatedDirectCostPctMarketCap: number | null;
  industryRelativeShockDrawdownPct: number | null;
  blockers: string[];
  reviewNotes: string[];
};

export function inferIncidentGeography(
  issuerCountry?: string | null,
  incidentCountry?: string | null,
  market?: string | null,
): ShockIncidentGeography {
  const issuer = normalizeShockCountry(issuerCountry, market);
  const incident = normalizeShockCountry(incidentCountry, null);
  if (!issuer || !incident) return "unknown";
  if (incident.includes(",") || incident.includes("/") || incident === "MULTI") return "multi_country";
  return issuer === incident ? "domestic" : "foreign";
}

export function inferSectorRiskClass(sector?: string | null): ShockSectorRiskClass {
  const value = (sector ?? "").toLowerCase();
  if (!value) return "general";

  if (/bank|financial|insurance|broker|securities|payment|asset management/.test(value)) return "trust_critical";
  if (/health|pharma|drug|medical|food|restaurant|airline|aviation|rail|auto|automotive|chemical/.test(value)) return "safety_critical";
  if (/utility|energy|casino|gaming|telecom|defense|aerospace|nuclear/.test(value)) return "license_critical";
  return "general";
}

export function contextAnalogyPenalty(
  candidate: ShockContextInput,
  historical: ShockContextInput,
): number {
  let penalty = 0;
  const candidateGeography = inferIncidentGeography(candidate.issuerCountry, candidate.incidentCountry, candidate.market);
  const historicalGeography = inferIncidentGeography(historical.issuerCountry, historical.incidentCountry, historical.market);

  if (candidateGeography !== "unknown" && historicalGeography !== "unknown" && candidateGeography !== historicalGeography) {
    penalty += 1;
  }

  const candidateSector = inferSectorRiskClass(candidate.sector);
  const historicalSector = inferSectorRiskClass(historical.sector);
  if (candidateSector !== "general" && historicalSector !== "general" && candidateSector !== historicalSector) penalty += 2;

  if (candidate.stakeholder && historical.stakeholder && candidate.stakeholder !== "unknown" && historical.stakeholder !== "unknown" && candidate.stakeholder !== historical.stakeholder) {
    penalty += 1;
  }
  if (candidate.incidentScope && historical.incidentScope && candidate.incidentScope !== "unknown" && historical.incidentScope !== "unknown" && candidate.incidentScope !== historical.incidentScope) {
    penalty += 1;
  }
  return penalty;
}

export function buildShockContextReview(input: ShockContextInput): ShockContextReview {
  const issuerCountry = normalizeShockCountry(input.issuerCountry, input.market);
  const incidentCountry = normalizeShockCountry(input.incidentCountry, null);
  const incidentGeography = inferIncidentGeography(issuerCountry, incidentCountry, input.market);
  const sectorRiskClass = inferSectorRiskClass(input.sector);
  const stakeholder = input.stakeholder ?? "unknown";
  const incidentScope = input.incidentScope ?? "unknown";
  const confounderStatus = input.confounderStatus ?? "unknown";
  const informationLeakStatus = input.informationLeakStatus ?? "unknown";
  const incidentRevenueExposurePct = input.incidentRevenueExposurePct ?? null;
  const estimatedDirectCostPctMarketCap = input.estimatedDirectCostPctMarketCap ?? null;
  const industryRelativeShockDrawdownPct = input.industryRelativeShockDrawdownPct ?? null;
  const blockers: string[] = [];
  const reviewNotes: string[] = [];

  // 不祥事と同時に決算悪化・guidance・M&A・資本政策等が出ている場合、株価下落を不祥事へ帰属できない。
  if (confounderStatus === "major" || confounderStatus === "unknown") {
    blockers.push(`confounderStatus=${confounderStatus}; event-attribution review required`);
  }
  if (confounderStatus === "possible") reviewNotes.push("同時材料があるため、短いevent window / peer comparisonで寄与を分離する");

  // 公式発表前から異常下落している場合、event dateが遅すぎる可能性がある。
  if (informationLeakStatus === "likely") {
    blockers.push("informationLeakStatus=likely; re-anchor event window before attribution");
  } else if (informationLeakStatus === "possible" || informationLeakStatus === "unknown") {
    reviewNotes.push("発表前数営業日の異常リターンを確認し、情報漏れ/観測遅延がないか確認する");
  }

  if (incidentGeography === "foreign") {
    reviewNotes.push("本社国外の事件。issuer国だけでなく事件発生国の規制・報道・顧客反応を確認する");
    if (incidentRevenueExposurePct == null) {
      reviewNotes.push("事件国の売上/利益露出率が未確認。海外子会社事件の経済的重要度を補完する");
    }
  } else if (incidentGeography === "unknown") {
    reviewNotes.push("事件発生国が未確定。多国籍企業ではissuer国とincident国を分離して記録する");
  }

  if (incidentRevenueExposurePct != null && Number.isFinite(incidentRevenueExposurePct)) {
    if (incidentRevenueExposurePct >= 25) reviewNotes.push(`事件地域の売上露出が大きい (${incidentRevenueExposurePct}%)`);
    else if (incidentRevenueExposurePct <= 5) reviewNotes.push(`事件地域の売上露出は小さい (${incidentRevenueExposurePct}%)。見出しの大きさと経済的重要度を分ける`);
  }

  if (estimatedDirectCostPctMarketCap != null && Number.isFinite(estimatedDirectCostPctMarketCap)) {
    if (estimatedDirectCostPctMarketCap >= 5) reviewNotes.push(`直接損失見積りが時価総額比${estimatedDirectCostPctMarketCap}%でmaterial`);
    else if (estimatedDirectCostPctMarketCap < 0.5) reviewNotes.push(`直接損失見積りは時価総額比${estimatedDirectCostPctMarketCap}%未満。評判/二次影響を分けて評価する`);
  }

  // broad marketではなく同業も同時に落ちていれば、企業固有shockと断定しない。
  if (industryRelativeShockDrawdownPct != null && Number.isFinite(industryRelativeShockDrawdownPct)) {
    if (industryRelativeShockDrawdownPct > -2) {
      blockers.push(`industryRelativeShockDrawdownPct=${industryRelativeShockDrawdownPct.toFixed(1)}%; peer-adjusted company-specific shock too weak`);
    }
  } else {
    reviewNotes.push("可能なら業種/peer benchmarkでもabnormal returnを確認する。市場benchmarkだけでは業界共通材料を除けない");
  }

  if (sectorRiskClass === "trust_critical") {
    reviewNotes.push("信用中枢業種。個人1人の事件でも顧客資産・販売運用・監督当局への波及を軽視しない");
  } else if (sectorRiskClass === "safety_critical") {
    reviewNotes.push("安全中枢業種。品質・衛生・安全事故は局所事件でも本業へ直接波及し得る");
  } else if (sectorRiskClass === "license_critical") {
    reviewNotes.push("免許/規制依存業種。人物問題でもfit-and-proper・認可・契約への波及を確認する");
  }

  return {
    issuerCountry,
    incidentCountry,
    issuerJurisdictionGroup: inferShockJurisdictionGroup({ country: issuerCountry, market: input.market }),
    incidentJurisdictionGroup: inferShockJurisdictionGroup({ country: incidentCountry }),
    incidentGeography,
    sectorRiskClass,
    stakeholder,
    incidentScope,
    confounderStatus,
    informationLeakStatus,
    incidentRevenueExposurePct,
    estimatedDirectCostPctMarketCap,
    industryRelativeShockDrawdownPct,
    blockers,
    reviewNotes,
  };
}
