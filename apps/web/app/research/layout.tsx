import type { ReactNode } from 'react'
import ResearchHistoryMap from '@/components/ResearchHistoryMap'

export default function ResearchLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <>
      {children}
      <div id="knowledge-map" style={{ scrollMarginTop: 118 }}>
        <ResearchHistoryMap />
      </div>
    </>
  )
}
