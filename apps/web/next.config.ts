import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Cloudflare Pagesへ追加adapterなしで配置できる静的export。
  // 最新イベントはブラウザからCloudflare Worker APIを読み、失敗時は
  // public/generated/*.json のlast-known-good snapshotへフォールバックする。
  output: 'export',
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
}

export default nextConfig
