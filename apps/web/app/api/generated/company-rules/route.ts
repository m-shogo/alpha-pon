import { readGeneratedJson } from '../_helper'

export const dynamic = 'force-dynamic'

export function GET() {
  return readGeneratedJson('company-rules.json', {"rules":[]})
}
