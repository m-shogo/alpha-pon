'use client'

import { useEffect } from 'react'

export function PwaRegistrar() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    if (process.env.NODE_ENV !== 'production') return
    navigator.serviceWorker.register('/sw.js').catch((error: unknown) => {
      console.warn('Alpha Pon service worker registration failed', error)
    })
  }, [])
  return null
}
