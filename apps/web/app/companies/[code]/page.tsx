import { redirect } from 'next/navigation'

type Props = {
  params: Promise<{ code: string }>
}

// /companies/[code] は廃止導線。/stocks/[code] に統一。
export default async function CompanyRedirectPage({ params }: Props) {
  const { code } = await params
  redirect(`/stocks/${code}`)
}
