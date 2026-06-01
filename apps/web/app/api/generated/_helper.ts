import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { NextResponse } from 'next/server'

export function readGeneratedJson(filename: string, fallback: unknown = { data: [] }) {
  const p = join(process.cwd(), 'public', 'generated', filename)
  if (!existsSync(p)) return NextResponse.json(fallback)
  try {
    return NextResponse.json(JSON.parse(readFileSync(p, 'utf-8')))
  } catch {
    return NextResponse.json(fallback)
  }
}
