import type { WatchlistStock } from './types'

export const WATCHLIST: WatchlistStock[] = [
  {
    code: '8136',
    name: 'サンリオ',
    theme: ['entertainment', 'ip_licensing', 'inbound'],
    watchPriceZones: [],
    dangerLines: [],
    memo: '',
    thesis: ['グローバルIPライセンス拡大', 'インバウンド消費回復', '直営店収益改善'],
    risks: ['IP人気の陳腐化', '為替リスク', '海外展開の不確実性'],
    nextDataNeeded: ['直近決算', '海外ライセンス収入比率', '入場者数推移'],
  },
  {
    code: '4661',
    name: 'オリエンタルランド',
    theme: ['entertainment', 'inbound', 'domestic_consumption'],
    watchPriceZones: [],
    dangerLines: [],
    memo: '',
    thesis: ['継続的な設備投資によるリピート誘引', 'インバウンド需要拡大', '独占的テーマパーク運営'],
    risks: ['入場者数の伸び悩み', '建設コスト増加', '景気後退による消費減退'],
    nextDataNeeded: ['入場者数', '客単価推移', '次期拡張計画'],
  },
  {
    code: '7974',
    name: '任天堂',
    theme: ['gaming', 'ip_licensing', 'global_consumer'],
    watchPriceZones: [],
    dangerLines: [],
    memo: '',
    thesis: ['次世代ハード移行期', 'IP展開の多様化', 'モバイル・映像化収益'],
    risks: ['ハード移行期の売上低迷', '競合プラットフォームの台頭', '円高リスク'],
    nextDataNeeded: ['Switch後継機発表', 'ソフト販売本数', 'IP映像収益'],
  },
  {
    code: '7011',
    name: '三菱重工業',
    theme: ['defense_space', 'energy', 'security_resilience'],
    watchPriceZones: [],
    dangerLines: [],
    memo: '',
    thesis: ['防衛費増額による受注拡大', '原発・エネルギー転換', '宇宙・防衛の長期受注'],
    risks: ['政策転換リスク', '受注の集中リスク', '大型案件の遅延'],
    nextDataNeeded: ['防衛受注残高', '原発再稼働動向', '宇宙事業進捗'],
  },
  {
    code: '5803',
    name: 'フジクラ',
    theme: ['ai_compute', 'data_center', 'semiconductor'],
    watchPriceZones: [],
    dangerLines: [],
    memo: '',
    thesis: ['AI/データセンター向け光ファイバー需要急拡大', '半導体関連ケーブル'],
    risks: ['データセンター投資の一巡', '競合他社の参入', '原材料コスト上昇'],
    nextDataNeeded: ['光ケーブル受注状況', '海外データセンター顧客動向', '設備投資計画'],
  },
  {
    code: '8306',
    name: '三菱UFJフィナンシャル・グループ',
    theme: ['finance', 'interest_rate', 'global_banking'],
    watchPriceZones: [],
    dangerLines: [],
    memo: '',
    thesis: ['金利上昇局面での利ザヤ改善', '海外収益拡大', 'ROE改善継続'],
    risks: ['信用コスト増加', '海外景気後退', '金融規制強化'],
    nextDataNeeded: ['NIM推移', '海外収益比率', '不良債権比率'],
  },
]

export function findWatchlistStock(code: StockCode): WatchlistStock | undefined {
  return WATCHLIST.find(s => s.code === code)
}

type StockCode = string
