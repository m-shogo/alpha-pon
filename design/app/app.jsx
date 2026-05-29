/* alpha-pon — app shell, navigation, theming, tweaks */

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "dark": false,
  "accent": "#FF7EA6",
  "scoreVariant": "ring",
  "density": "regular"
}/*EDITMODE-END*/;

function apRgba(hex, a) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function buildTheme(dark, accent) {
  const base = dark ? {
    "--bg": "#211922", "--surface": "#2C2230", "--surface-2": "#372B3C",
    "--ink": "#FBEFF4", "--ink-2": "#C6AAB9", "--ink-3": "#8C7585",
    "--line": "rgba(255,255,255,0.07)", "--line-strong": "rgba(255,255,255,0.13)", "--card-line": "rgba(255,255,255,0.06)",
    "--header-bg": "rgba(33,25,34,0.82)", "--shadow": "0 8px 22px rgba(0,0,0,0.38)",
    "--disc-bg": "#2C2230", "--disc-line": "rgba(255,255,255,0.08)", "--disc-ink": "#C6AAB9",
    "--mint": "#7FE0BA", "--mint-deep": "#52D3A6", "--mint-soft": "rgba(82,211,166,0.18)",
    "--amber": "#F5B25A", "--amber-soft": "rgba(245,178,90,0.18)",
    "--sky": "#8FD3EC", "--sky-deep": "#67C2E6", "--sky-soft": "rgba(103,194,230,0.18)",
    "--lavender": "#C5B4F0", "--lavender-deep": "#A893E8", "--lavender-soft": "rgba(168,147,232,0.20)",
    "--butter": "#FFD877", "--urgent": "#FF7AA4", "--urgent-soft": "rgba(255,122,164,0.18)",
  } : {
    "--bg": "#FFF7F2", "--surface": "#FFFFFF", "--surface-2": "#FBEFF2",
    "--ink": "#43303B", "--ink-2": "#8A7681", "--ink-3": "#BCABB3",
    "--line": "rgba(67,48,59,0.07)", "--line-strong": "rgba(67,48,59,0.11)", "--card-line": "rgba(67,48,59,0.05)",
    "--header-bg": "rgba(255,247,242,0.82)", "--shadow": "0 6px 20px rgba(255,126,166,0.10), 0 1px 4px rgba(67,48,59,0.04)",
    "--disc-bg": "#FFFFFF", "--disc-line": "rgba(67,48,59,0.08)", "--disc-ink": "#8A7681",
    "--mint": "#6FD3AC", "--mint-deep": "#2FA579", "--mint-soft": "rgba(79,201,154,0.14)",
    "--amber": "#E0902F", "--amber-soft": "rgba(224,144,47,0.15)",
    "--sky": "#7EC8E3", "--sky-deep": "#2E9AC9", "--sky-soft": "rgba(126,200,227,0.16)",
    "--lavender": "#B6A4E6", "--lavender-deep": "#7A63C9", "--lavender-soft": "rgba(182,164,230,0.18)",
    "--butter": "#F2B945", "--urgent": "#FF4D86", "--urgent-soft": "rgba(255,77,134,0.13)",
  };
  return {
    ...base,
    "--accent": accent,
    "--accent-soft": apRgba(accent, dark ? 0.22 : 0.13),
    "--accent-shadow": apRgba(accent, dark ? 0.45 : 0.32),
  };
}

const TABS = [
  { key: "home", label: "ホーム", icon: "home" },
  { key: "watch", label: "ウォッチ", icon: "watch" },
  { key: "feed", label: "通知", icon: "bell" },
  { key: "report", label: "レポート", icon: "doc" },
];

function TabBar({ tab, onTab }) {
  return (
    <div style={{
      display: "flex", padding: "8px 8px 24px", background: "var(--header-bg)",
      backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
      borderTop: "1px solid var(--line)",
    }}>
      {TABS.map((t) => {
        const on = tab === t.key;
        return (
          <button key={t.key} onClick={() => onTab(t.key)} style={{
            flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
            border: "none", background: "transparent", cursor: "pointer", padding: "4px 0",
            color: on ? "var(--accent)" : "var(--ink-3)", fontFamily: "var(--ui)",
          }}>
            <Icon name={t.icon} size={24} strokeWidth={on ? 2.4 : 2} />
            <span style={{ fontSize: 10.5, fontWeight: on ? 800 : 600 }}>{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [tab, setTab] = React.useState("home");
  const [detail, setDetail] = React.useState(null);
  const [reportCode, setReportCode] = React.useState("285A");
  const scrollRef = React.useRef(null);

  const resetScroll = () => { if (scrollRef.current) scrollRef.current.scrollTop = 0; };
  React.useEffect(resetScroll, [tab, detail]);

  const openDetail = (code) => setDetail(code);
  const goTab = (k) => { setDetail(null); setTab(k); };
  const openReport = (code) => { setReportCode(code); setDetail(null); setTab("report"); };

  const theme = buildTheme(t.dark, t.accent);

  let screen;
  if (detail) screen = <DetailScreen code={detail} onBack={() => setDetail(null)} scoreVariant={t.scoreVariant} onReport={openReport} />;
  else if (tab === "home") screen = <HomeScreen onOpen={openDetail} density={t.density} />;
  else if (tab === "watch") screen = <WatchlistScreen onOpen={openDetail} />;
  else if (tab === "feed") screen = <FeedScreen onOpen={openDetail} />;
  else screen = <ReportScreen code={reportCode} onOpen={openDetail} />;

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, boxSizing: "border-box", background: "var(--page-bg)" }}>
      <IOSDevice dark={t.dark}>
        <div style={{ ...theme, height: "100%", display: "flex", flexDirection: "column", background: "var(--bg)", fontFamily: "var(--ui)", color: "var(--ink)" }}>
          <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
            {screen}
            <div style={{ height: 24 }} />
          </div>
          <DisclaimerBar />
          {!detail && <TabBar tab={tab} onTab={goTab} />}
          {detail && <div style={{ height: 0 }} />}
        </div>
      </IOSDevice>

      <TweaksPanel>
        <TweakSection label="スコアの見せ方" />
        <TweakSelect label="詳細スコア" value={t.scoreVariant}
          options={[
            { value: "ring", label: "リング / ゲージ" },
            { value: "number", label: "大きな数字" },
            { value: "bars", label: "カテゴリ内訳バー" },
            { value: "radar", label: "レーダー（6軸）" },
          ]}
          onChange={(v) => setTweak("scoreVariant", v)} />
        <TweakSection label="レイアウト" />
        <TweakRadio label="カード密度" value={t.density}
          options={[{ value: "compact", label: "密" }, { value: "regular", label: "標準" }, { value: "comfy", label: "ゆとり" }]}
          onChange={(v) => setTweak("density", v)} />
        <TweakSection label="ビジュアル" />
        <TweakToggle label="ダークモード" value={t.dark} onChange={(v) => setTweak("dark", v)} />
        <TweakColor label="アクセント" value={t.accent}
          options={["#FF7EA6", "#2E9AC9", "#8A6FE0", "#2FA579", "#F2954A"]}
          onChange={(v) => setTweak("accent", v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
