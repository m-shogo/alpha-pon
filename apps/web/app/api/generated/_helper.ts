import { existsSync } from 'fs'
import { join } from 'path'
import { NextResponse } from 'next/server'
import { readCanonicalGeneratedJsonFile } from '../../../lib/generated-api-file'

export function readGeneratedJson(filename: string, fallback: unknown = { data: [] }) {
  const p = join(process.cwd(), 'public', 'generated', filename)
  if (!existsSync(p)) return NextResponse.json(fallback)
  try {
    return NextResponse.json(readCanonicalGeneratedJsonFile(p))
  } catch {
    return NextResponse.json(fallback)
  }
}
