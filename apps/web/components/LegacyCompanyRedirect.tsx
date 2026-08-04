'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export function LegacyCompanyRedirect({ code }: { code: string }) {
  const router = useRouter()
  const target = `/stocks/${encodeURIComponent(code)}`

  useEffect(() => {
    router.replace(target)
  }, [router, target])

  return (
    <div style={{ padding: '72px 20px 32px', textAlign: 'center' }}>
      <h1 style={{ margin: 0, fontSize: 20, color: 'var(--ink)' }}>銘柄ページへ移動します</h1>
      <p style={{ margin: '12px 0 20px', color: 'var(--ink-2)', fontSize: 13, lineHeight: 1.6 }}>
        旧URLです。自動で新しい銘柄ページへ移動します。
      </p>
      <Link href={target} style={{ color: 'var(--sky-deep)', fontWeight: 850 }}>
        移動しない場合はこちら
      </Link>
    </div>
  )
}
