import { lstatSync, readFileSync } from 'fs'

export function readCanonicalGeneratedJsonFile(path: string): unknown {
  const stat = lstatSync(path)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
    throw new Error(`generated JSON evidence must be a standalone regular file: ${path}`)
  }
  return JSON.parse(readFileSync(path, 'utf-8')) as unknown
}
