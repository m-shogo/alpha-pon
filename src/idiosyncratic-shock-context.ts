// 企業固有ショックの「国だけでは説明できない」文脈モデル。
// 20点scoreとは分離し、事件帰属・類似比較・通知confidenceのために使う。

import { inferShockJurisdictionGroup, normalizeShockCountry } from "./idiosyncratic-shock-jurisdiction.js";

export type ShockIncidentGeography = "domestic" | "foreign" | "multi_country" | "unknown";
export type ShockIncidentScope = "individual" | "site" | "subsidiary" | "multi_unit" | "group_wide" | "unknown";
export type ShockStakeholder = "employee" | "customer" | "investor" | "supplier" | "regulator" | "public" | "mixed" | "unknown";
export type ShockConfounderStatus = "clear" | "possible" | "major" | "unknown";
export type ShockSectorRiskClass = "general" | "trust_critical" | "safety_critical" | "license_critical";

export type ShockContextInput = {
  issuerCountry?: string | null;
  incidentCountry?: string | null;
  market?: string | null;
  sector?: string | null;
  stakeholder?: ShockStakeholder | null;
  incidentScope?: ShockIncidentScope | null;
  confounderStatus?: ShockConfounderStatus | null;
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
  const blockers: string[] = [];
  const reviewNotes: string[] = [];

  // 不祥事と同時に決算悪化・guidance・M&A・資本政策等が出ている場合、株価下落を不祥事へ帰属できない。
  if (confounderStatus === "major" || confounderStatus === "unknown") {
    blockers.push(`confounderStatus=${confounderStatus}; event-attribution review required`);
  }
  if (confounderStatus === "possible") reviewNotes.push("同時材料があるため、短いevent window / peer comparisonで寄与を分離する");

  if (incidentGeography === "foreign") {
    reviewNotes.push("本社国外の事件。issuer国だけでなく事件発生国の規制・報道・顧客反応を確認する");
  } else if (incidentGeography === "unknown") {
    reviewNotes.push("事件発生国が未確定。多国籍企業ではissuer国とincident国を分離して記録する");
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
    blockers,
    reviewNotes,
  };
}
