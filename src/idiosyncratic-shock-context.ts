// 企業固有ショックの「国だけでは説明できない」文脈モデル。
// 20点scoreとは分離し、事件帰属・類似比較・通知confidenceのために使う。

import { inferShockJurisdictionGroup, normalizeShockCountry } from "./idiosyncratic-shock-jurisdiction.js";

export type ShockIncidentGeography = "domestic" | "foreign" | "multi_country" | "unknown";
export type ShockIncidentScope = "individual" | "site" | "subsidiary" | "multi_unit" | "group_wide" | "unknown";
export type ShockStakeholder = "employee" | "customer" | "investor" | "supplier" | "regulator" | "public" | "mixed" | "unknown";
export type ShockConfounderStatus = "clear" | "possible" | "major" | "unknown";
export type ShockInformationLeakStatus = "clear" | "possible" | "likely" | "unknown";
export type ShockRecurrenceStatus = "first_known" | "repeat" | "systemic" | "unknown";
export type ShockRemediationStatus = "credible" | "partial" | "weak" | "unknown";
export type ShockSectorRiskClass = "general" | "trust_critical" | "safety_critical" | "license_critical";
export type ShockListingStructure = "single" | "adr" | "dual" | "secondary" | "unknown";
export type ShockOwnershipControl = "dispersed" | "founder_family" | "state_controlled" | "parent_controlled" | "other_concentrated" | "unknown";
export type ShockLiquidityStatus = "normal" | "thin" | "halted" | "limit_locked" | "unknown";
export type ShockIncidentClusterStatus = "single" | "related_multiple" | "cascade" | "unknown";
export type ShockDisclosureObservability = "high" | "medium" | "low" | "unknown";

export type ShockContextInput = {
  issuerCountry?: string | null;
  incidentCountry?: string | null;
  market?: string | null;
  sector?: string | null;
  stakeholder?: ShockStakeholder | null;
  incidentScope?: ShockIncidentScope | null;
  confounderStatus?: ShockConfounderStatus | null;
  informationLeakStatus?: ShockInformationLeakStatus | null;
  recurrenceStatus?: ShockRecurrenceStatus | null;
  remediationStatus?: ShockRemediationStatus | null;
  listingStructure?: ShockListingStructure | null;
  ownershipControl?: ShockOwnershipControl | null;
  liquidityStatus?: ShockLiquidityStatus | null;
  incidentClusterStatus?: ShockIncidentClusterStatus | null;
  disclosureObservability?: ShockDisclosureObservability | null;
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
  recurrenceStatus: ShockRecurrenceStatus;
  remediationStatus: ShockRemediationStatus;
  listingStructure: ShockListingStructure;
  ownershipControl: ShockOwnershipControl;
  liquidityStatus: ShockLiquidityStatus;
  incidentClusterStatus: ShockIncidentClusterStatus;
  disclosureObservability: ShockDisclosureObservability;
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

function comparableValue(value: string | null | undefined): value is string {
  return Boolean(value && value !== "unknown");
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

  if (comparableValue(candidate.stakeholder) && comparableValue(historical.stakeholder) && candidate.stakeholder !== historical.stakeholder) penalty += 1;
  if (comparableValue(candidate.incidentScope) && comparableValue(historical.incidentScope) && candidate.incidentScope !== historical.incidentScope) penalty += 1;
  if (comparableValue(candidate.recurrenceStatus) && comparableValue(historical.recurrenceStatus) && candidate.recurrenceStatus !== historical.recurrenceStatus) penalty += 1;
  if (comparableValue(candidate.ownershipControl) && comparableValue(historical.ownershipControl) && candidate.ownershipControl !== historical.ownershipControl) penalty += 1;
  if (comparableValue(candidate.listingStructure) && comparableValue(historical.listingStructure) && candidate.listingStructure !== historical.listingStructure) penalty += 1;
  if (comparableValue(candidate.incidentClusterStatus) && comparableValue(historical.incidentClusterStatus) && candidate.incidentClusterStatus !== historical.incidentClusterStatus) penalty += 2;
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
  const recurrenceStatus = input.recurrenceStatus ?? "unknown";
  const remediationStatus = input.remediationStatus ?? "unknown";
  const listingStructure = input.listingStructure ?? "unknown";
  const ownershipControl = input.ownershipControl ?? "unknown";
  const liquidityStatus = input.liquidityStatus ?? "unknown";
  const incidentClusterStatus = input.incidentClusterStatus ?? "unknown";
  const disclosureObservability = input.disclosureObservability ?? "unknown";
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

  if (recurrenceStatus === "systemic") {
    blockers.push("recurrenceStatus=systemic; isolated-dip thesis invalid until organizational scope is resolved");
  } else if (recurrenceStatus === "repeat") {
    reviewNotes.push("類似不祥事の再発。単発の個人切除型よりガバナンス再発確率を高く見る");
  } else if (recurrenceStatus === "unknown") {
    reviewNotes.push("過去5〜10年の類似不祥事・行政処分・内部統制問題の再発履歴を確認する");
  }

  if (remediationStatus === "weak") {
    blockers.push("remediationStatus=weak; recurrence-risk remains high");
  } else if (remediationStatus === "partial") {
    reviewNotes.push("再発防止策は部分的。責任者交代だけでなく統制・報酬・監督プロセスの変更を確認する");
  } else if (remediationStatus === "unknown") {
    reviewNotes.push("再発防止策の実装内容・責任者・期限・監査方法を確認する");
  }

  // 複数不祥事が連鎖している場合、最初の事件だけを孤立shockとして扱わない。
  if (incidentClusterStatus === "cascade") {
    blockers.push("incidentClusterStatus=cascade; resolve connected incidents before isolated-dip classification");
  } else if (incidentClusterStatus === "related_multiple") {
    reviewNotes.push("関連する複数事件あり。単一人物/単一拠点で切れるか、共通原因がないか確認する");
  } else if (incidentClusterStatus === "unknown") {
    reviewNotes.push("同時期の関連不祥事・内部告発・追加調査がないか確認する");
  }

  // 売買停止・値幅制限中は価格発見が終わっておらず「下落一巡」を判定できない。
  if (liquidityStatus === "halted" || liquidityStatus === "limit_locked") {
    blockers.push(`liquidityStatus=${liquidityStatus}; price discovery incomplete`);
  } else if (liquidityStatus === "thin") {
    reviewNotes.push("流動性が薄い。見かけの急落/反発を過大評価せず、出来高・スプレッドを確認する");
  } else if (liquidityStatus === "unknown") {
    reviewNotes.push("売買停止・値幅制限・極端な流動性低下がなかったか確認する");
  }

  // ADR/二重上場では、片方の価格だけでevent reactionを測らない。
  if (listingStructure === "adr" || listingStructure === "dual" || listingStructure === "secondary") {
    reviewNotes.push("ADR/二重・重複上場。primary listingの同日反応・取引時間差・為替を照合する");
  } else if (listingStructure === "unknown") {
    reviewNotes.push("ADR/二重上場/secondary listingの有無を確認し、価格反応の主市場を確定する");
  }

  // 支配株主の存在はactor separabilityや取締役会の独立性を変えるが、20点を恣意的に直接補正しない。
  if (ownershipControl === "founder_family") {
    reviewNotes.push("創業家支配。問題人物を退任させても議決権・ブランド・後継支配が残るか確認する");
  } else if (ownershipControl === "state_controlled") {
    reviewNotes.push("国有/政府支配。通常の株主価値最大化だけでなく政策・任命・行政介入を確認する");
  } else if (ownershipControl === "parent_controlled") {
    reviewNotes.push("親会社支配。子会社単独の是正より親会社統治・親子上場/取引条件への波及を確認する");
  } else if (ownershipControl === "other_concentrated") {
    reviewNotes.push("集中所有。支配株主が取締役交代・是正策を実質支配していないか確認する");
  } else if (ownershipControl === "unknown") {
    reviewNotes.push("創業家・政府・親会社などの支配株主有無を確認する");
  }

  // 国によって開示・報道の観測可能性が違う。情報が少ないこと自体を「事件が軽い」と解釈しない。
  if (disclosureObservability === "low") {
    reviewNotes.push("開示/報道観測性が低い市場。ニュース件数の少なさを無傷の証拠にせず、現地一次情報を追加確認する");
  } else if (disclosureObservability === "unknown") {
    reviewNotes.push("現地の開示制度・一次情報アクセス・報道カバレッジの十分性を確認する");
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
    recurrenceStatus,
    remediationStatus,
    listingStructure,
    ownershipControl,
    liquidityStatus,
    incidentClusterStatus,
    disclosureObservability,
    incidentRevenueExposurePct,
    estimatedDirectCostPctMarketCap,
    industryRelativeShockDrawdownPct,
    blockers,
    reviewNotes,
  };
}
