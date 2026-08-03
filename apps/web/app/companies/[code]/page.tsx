import { LegacyCompanyRedirect } from '@/components/LegacyCompanyRedirect'
import { loadGeneratedData } from '@/lib/generated-data'

type Props = {
  params: Promise<{ code: string }>
}

export const dynamicParams = false

export function generateStaticParams() {
  try {
    const data = loadGeneratedData()
    const codes = [
      ...data.candidates.map(item => item.code),
      ...(data.universeCandidates ?? []).map(item => item.code),
      ...(data.hypothesisPredictions ?? []).map(item => item.code),
      ...(data.hypothesisOutcomes ?? []).map(item => item.code),
      ...(data.specialSituationWatch?.candidates ?? []).map(item => item.code),
    ]
    return [...new Set(codes.filter(Boolean))].map(code => ({ code }))
  } catch {
    return []
  }
}

// /companies/[code] は廃止導線。静的ホストでも /stocks/[code] へ移動できるようにする。
export default async function CompanyRedirectPage({ params }: Props) {
  const { code } = await params
  return <LegacyCompanyRedirect code={code} />
}
