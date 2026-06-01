import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import type { AlphaPonGeneratedData } from './types'

const FALLBACK: AlphaPonGeneratedData = {
  generatedAt: null,
  headline: 'alpha-pon Pro Dashboard',
  summary: { strategic: '', pipeline: '', committee: '', roadmap: [], refresh: [] },
  reports: [],
  candidates: [],
}

export function loadGeneratedData(): AlphaPonGeneratedData {
  const filePath = join(process.cwd(), 'public', 'generated', 'alpha-pon-data.json')
  if (!existsSync(filePath)) return FALLBACK
  try {
    const raw = readFileSync(filePath, 'utf-8')
    return JSON.parse(raw) as AlphaPonGeneratedData
  } catch {
    return FALLBACK
  }
}
