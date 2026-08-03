'use client'

import { useEffect, useState } from 'react'
import { normalizeMarketEventData, type WebMarketEventData } from './market-events'

export function useMarketEventData(fallback: WebMarketEventData): {
  data: WebMarketEventData
  delivery: 'api' | 'fallback'
  loading: boolean
} {
  const [data, setData] = useState(fallback)
  const [delivery, setDelivery] = useState<'api' | 'fallback'>('fallback')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 4_000)
    fetch('/api/market-events', {
      method: 'GET',
      cache: 'no-store',
      credentials: 'same-origin',
      signal: controller.signal,
      headers: { accept: 'application/json' },
    })
      .then(async response => {
        if (!response.ok) throw new Error(`market events API ${response.status}`)
        return response.json() as Promise<unknown>
      })
      .then(value => {
        setData(normalizeMarketEventData(value))
        setDelivery('api')
      })
      .catch(() => {
        setData(fallback)
        setDelivery('fallback')
      })
      .finally(() => {
        window.clearTimeout(timeout)
        setLoading(false)
      })

    return () => {
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [fallback])

  return { data, delivery, loading }
}
