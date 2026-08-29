import type { ReactNode } from 'react'
import HistoricalAnalogVerification from '@/components/HistoricalAnalogVerification'
import ResearchHistoryMap from '@/components/ResearchHistoryMap'
import ResearchStudyMap from '@/components/ResearchStudyMap'

export default function ResearchLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <>
      {children}
      <div id="knowledge-map" style={{ scrollMarginTop: 118 }}>
        <ResearchHistoryMap />
        <HistoricalAnalogVerification />
        <ResearchStudyMap />
      </div>
    </>
  )
}
