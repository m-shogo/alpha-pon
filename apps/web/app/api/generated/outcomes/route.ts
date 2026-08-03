import { readGeneratedJson } from '../_helper'

export const dynamic = 'force-static'

export function GET() {
  return readGeneratedJson('outcomes.json', {"outcomes":[]})
}
