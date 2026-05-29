// EDINET API v2（無料・APIキー不要）
// https://disclosure2.edinet-fsa.go.jp/weee0010.aspx

const BASE_URL = "https://disclosure.edinet-fsa.go.jp/api/v2";

type EdinetDocListResponse = {
  metadata: {
    message: string | null;
    resultset: { count: number };
  };
  results: EdinetDoc[];
};

export type EdinetDoc = {
  seqNumber: number;
  docID: string;
  edinetCode: string;
  secCode: string;
  JCN: string;
  filerName: string;
  fundCode: string;
  ordinanceCode: string;
  formCode: string;
  docTypeCode: string;
  periodStart: string;
  periodEnd: string;
  submitDateTime: string;
  docDescription: string;
  issuerEdinetCode: string;
  subjectEdinetCode: string;
  subsidiaryEdinetCode: string;
  currentReportReason: string;
  parentDocID: string;
  opeDateTime: string;
  withdrawalStatus: string;
  docInfoEditStatus: string;
  disclosureStatus: string;
  xbrlFlag: string;
  pdfFlag: string;
  attachDocFlag: string;
  englishDocFlag: string;
  csvFlag: string;
  legalStatus: string;
};

// 重要開示の形式コード
const IMPORTANT_FORM_CODES = new Set([
  "030000", // 有価証券報告書
  "043000", // 臨時報告書（重要事象）
  "050000", // 大量保有報告書
]);

// 構造イベントを示すキーワード（臨時報告書の事由欄をチェック）
export const STRUCTURAL_KEYWORDS = [
  "スピンオフ",
  "パーシャルスピンオフ",
  "会社分割",
  "吸収分割",
  "新設分割",
  "子会社株式の譲渡",
  "上場準備",
  "新規上場申請",
  "事業ポートフォリオ",
  "MBO",
  "TOB",
  "公開買付",
];

export async function fetchEdinetDocList(date: string): Promise<EdinetDoc[]> {
  const url = `${BASE_URL}/documents.json?date=${date}&type=2`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`EDINET APIエラー: ${res.status}`);
  }
  const data = (await res.json()) as EdinetDocListResponse;
  return data.results ?? [];
}

export function filterBySecCode(docs: EdinetDoc[], secCode: string): EdinetDoc[] {
  // secCodeは5桁（例: "28500"）、銘柄コードは4桁（例: "285A"）
  // EDINETのsecCodeは末尾0を含む場合がある
  const normalized = secCode.replace(/[A-Z]/g, "0").padEnd(5, "0");
  return docs.filter(d => d.secCode === normalized || d.secCode === secCode);
}

export function findStructuralEvents(docs: EdinetDoc[]): EdinetDoc[] {
  return docs.filter(doc => {
    const text = `${doc.docDescription} ${doc.currentReportReason}`;
    return STRUCTURAL_KEYWORDS.some(kw => text.includes(kw));
  });
}

export function findImportantDocs(docs: EdinetDoc[]): EdinetDoc[] {
  return docs.filter(d => IMPORTANT_FORM_CODES.has(d.formCode));
}

// 有価証券報告書（formCode "030000"）に絞り込む
export function findAnnualReports(docs: EdinetDoc[]): EdinetDoc[] {
  return docs.filter(d => d.formCode === "030000" && d.pdfFlag === "1");
}

// secCode（5桁）でフィルタ、複数コード対応
export function filterBySecCodes(docs: EdinetDoc[], secCodes: string[]): EdinetDoc[] {
  const normalized = new Set(
    secCodes.map(c => c.replace(/[A-Z]/g, "0").padEnd(5, "0"))
  );
  return docs.filter(d => normalized.has(d.secCode));
}

// EDINETドキュメントのPDF URLを生成
export function buildPdfUrl(docID: string): string {
  return `https://disclosure.edinet-fsa.go.jp/api/v2/documents/${docID}?type=1`;
}

// 企業コード（4桁）→ EDINETのsecCode（5桁）に変換
export function toSecCode(code: string): string {
  return code.replace(/[A-Z]/g, "0").padEnd(5, "0");
}

// 過去N日分のEDINET開示を取得してスクリーニング
export async function scanEdinetDays(
  days: number
): Promise<Map<string, EdinetDoc[]>> {
  const result = new Map<string, EdinetDoc[]>();

  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    // 土日スキップ
    if (d.getDay() === 0 || d.getDay() === 6) continue;

    const dateStr = d.toISOString().split("T")[0];
    try {
      const docs = await fetchEdinetDocList(dateStr);
      const structural = findStructuralEvents(docs);
      if (structural.length > 0) {
        for (const doc of structural) {
          const code = doc.secCode;
          if (!result.has(code)) result.set(code, []);
          result.get(code)!.push(doc);
        }
      }
      // レートリミット対策
      await new Promise(r => setTimeout(r, 300));
    } catch {
      // 一日分のエラーは無視して続行
    }
  }

  return result;
}
