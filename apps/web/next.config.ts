import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // public/generated/*.json を静的ファイルとしてホスト
  // 将来 API Route に移行する場合はここを変更する
  output: undefined,
}

export default nextConfig
