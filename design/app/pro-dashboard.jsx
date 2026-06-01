/* alpha-pon — Pro dashboard overlay
 * 既存デザインを壊さず、window.AP.generated がある時だけホームにPro司令塔カードを追加する。
 */

function ProDashboardCard() {
  const g = window.AP && window.AP.generated;
  if (!g) return null;
  const items = [
    { label: "司令塔", value: g.summary && g.summary.strategic },
    { label: "データ信頼度", value: g.summary && g.summary.pipeline },
    { label: "Pro会議", value: g.summary && g.summary.committee },
  ].filter((item) => item.value);
  const roadmap = ((g.summary && g.summary.roadmap) || []).slice(0, 3);
  const refresh = ((g.summary && g.summary.refresh) || []).slice(0, 2);
  if (items.length === 0 && roadmap.length === 0 && refresh.length === 0) return null;

  return (
    <>
      <SectionLabel icon={<Icon name="spark" size={15} />}>Pro司令塔</SectionLabel>
      <Card pad={15} style={{ marginBottom: 12, background: "linear-gradient(135deg, var(--surface), var(--surface-2))" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
          <div>
            <div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 16, color: "var(--ink)" }}>{g.headline || "alpha-pon Pro Dashboard"}</div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--ink-3)", marginTop: 2 }}>generated: {g.generatedAt || "未生成"}</div>
          </div>
          <div style={{ width: 36, height: 36, borderRadius: 13, background: "var(--accent-soft)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Icon name="doc" size={18} />
          </div>
        </div>
        {items.map((item, i) => (
          <div key={item.label} style={{ padding: "9px 0", borderTop: i === 0 ? "1px solid var(--line)" : "none", borderBottom: "1px solid var(--line)" }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "var(--accent)", marginBottom: 3 }}>{item.label}</div>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-2)", lineHeight: 1.45 }}>{item.value}</div>
          </div>
        ))}
        {roadmap.length > 0 && (
          <div style={{ marginTop: 11 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "var(--ink-3)", marginBottom: 6 }}>次に精度を上げる所</div>
            {roadmap.map((r, i) => <div key={i} style={{ fontSize: 12.2, fontWeight: 600, color: "var(--ink-2)", lineHeight: 1.45, marginTop: 4 }}>{r}</div>)}
          </div>
        )}
        {refresh.length > 0 && (
          <div style={{ marginTop: 11, display: "flex", flexWrap: "wrap", gap: 6 }}>
            {refresh.map((r, i) => <Tag key={i}>{String(r).replace(/^\|\s*/, "").slice(0, 28)}</Tag>)}
          </div>
        )}
      </Card>
    </>
  );
}

const AlphaPonBaseHomeScreen = HomeScreen;
HomeScreen = function HomeScreenWithProDashboard({ onOpen, density }) {
  const list = window.AP.candidates
    .map((c) => ({ c, total: window.AP.total(c.score) }))
    .filter((x) => x.total >= 50)
    .sort((a, b) => b.total - a.total);
  const counts = { urgent: 0, daily: 0, log: 0 };
  list.forEach((x) => counts[apLevel(x.total)]++);
  const stat = (level, n) => {
    const a = AP_alert[level];
    return (
      <div style={{ flex: 1, background: "var(--surface)", borderRadius: 16, padding: "12px 10px", border: "1px solid var(--card-line)", boxShadow: "var(--shadow)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 7, height: 7, borderRadius: 99, background: a.color }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-2)" }}>{a.jp}</span>
        </div>
        <div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 26, color: a.color, marginTop: 2 }}>{n}<span style={{ fontSize: 12, color: "var(--ink-3)", fontWeight: 700 }}> 件</span></div>
      </div>
    );
  };
  return (
    <>
      <AppHeader sub="Pro会議・改善ロードマップ連携" title="alpha-pon" accentTitle
        right={<div style={{ width: 38, height: 38, borderRadius: 12, background: "var(--accent-soft)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)" }}><Icon name="spark" size={20} /></div>} />
      <div style={{ padding: "16px 16px 0" }}>
        <div style={{ display: "flex", gap: 9 }}>
          {stat("urgent", counts.urgent)}{stat("daily", counts.daily)}{stat("log", counts.log)}
        </div>
        <ProDashboardCard />
        <SectionLabel icon={<Icon name="spark" size={15} />}>本日の調査候補（スコア順）</SectionLabel>
        {list.map((x) => <CandidateCard key={x.c.code} cand={x.c} onOpen={onOpen} density={density} />)}
        <p style={{ textAlign: "center", fontSize: 11.5, color: "var(--ink-3)", fontWeight: 600, margin: "14px 0 4px", lineHeight: 1.6 }}>
          スコア49点以下は通知されません。<br />重要判断はPro会議・IRイベント・決算/総会確認を優先します。
        </p>
      </div>
    </>
  );
};

function safeNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function SafeDetailScreen({ code, onBack, scoreVariant, onReport }) {
  const cand = window.AP.candidates.find((c) => c.code === code);
  const [checked, setChecked] = React.useState({});
  if (!cand) return null;
  const priceText = safeNumber(cand.price) ? `¥${cand.price.toLocaleString()}` : "未取得";
  const changeText = safeNumber(cand.changePct) ? `${cand.changePct >= 0 ? "+" : ""}${cand.changePct}%` : "--";
  const drawdownText = safeNumber(cand.drawdownPct) ? `高値から ${cand.drawdownPct}%` : "価格データ未取得";
  const total = window.AP.total(cand.score);
  return (
    <>
      <div style={{ position: "sticky", top: 0, zIndex: 8, padding: "50px 14px 12px", background: "var(--header-bg)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={onBack} style={{ width: 38, height: 38, borderRadius: 12, border: "1px solid var(--card-line)", background: "var(--surface)", color: "var(--ink)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}><Icon name="back" size={20} /></button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 19, color: "var(--ink)", lineHeight: 1 }}>{cand.name}</div>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--ink-3)", marginTop: 2 }}>{cand.code} ・ {cand.market}</div>
        </div>
        <Prio p={cand.priority} />
        <StatusPill status={cand.status} />
      </div>

      <div style={{ padding: "16px 16px 0" }}>
        <Card pad={18}>
          <div style={{ display: "flex", justifyContent: "center", padding: scoreVariant === "bars" ? 0 : "6px 0 10px" }}>
            <ScoreViz variant={scoreVariant} cand={cand} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 12px", marginTop: 8, background: "var(--accent-soft)", borderRadius: 14 }}>
            <span style={{ color: "var(--accent)", display: "flex", flexShrink: 0 }}><Icon name="spark" size={16} /></span>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-3)" }}>発火ルール</div>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink)" }}>{cand.triggeredRule}</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-3)" }}>株価</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 22, color: "var(--ink)" }}>{priceText}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: safeNumber(cand.changePct) && cand.changePct >= 0 ? "var(--mint-deep)" : "var(--ink-3)" }}>{changeText}</span>
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-2)", marginTop: 2 }}>{drawdownText}</div>
            </div>
            <div style={{ marginLeft: "auto" }}><Sparkline data={cand.sparkline || [100, 100]} color="auto" w={120} h={40} /></div>
          </div>
        </Card>

        <SectionLabel icon={<Icon name="check" size={15} />}>検出理由</SectionLabel>
        <Card pad={6}>{(cand.reasons || []).map((r, i) => (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "9px 12px", borderBottom: i < (cand.reasons || []).length - 1 ? "1px solid var(--line)" : "none" }}>
            <span style={{ width: 20, height: 20, borderRadius: 7, background: "var(--mint-soft)", color: "var(--mint-deep)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}><Icon name="check" size={13} strokeWidth={2.8} /></span>
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", lineHeight: 1.45 }}>{r}</span>
          </div>
        ))}</Card>

        <SectionLabel icon={<Icon name="alert" size={15} />}>注意点</SectionLabel>
        <Card pad={6}>{(cand.negativeReasons || []).map((r, i) => (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "9px 12px", borderBottom: i < (cand.negativeReasons || []).length - 1 ? "1px solid var(--line)" : "none" }}>
            <span style={{ width: 20, height: 20, borderRadius: 7, background: "var(--amber-soft)", color: "var(--amber)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}><Icon name="alert" size={13} strokeWidth={2.4} /></span>
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", lineHeight: 1.45 }}>{r}</span>
          </div>
        ))}</Card>

        <SectionLabel icon={<Icon name="doc" size={15} />}>次に見るもの</SectionLabel>
        <Card pad={6}>{(cand.nextToSee || []).map((r, i) => {
          const on = checked[i];
          return (
            <div key={i} onClick={() => setChecked((s) => ({ ...s, [i]: !s[i] }))} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderBottom: i < (cand.nextToSee || []).length - 1 ? "1px solid var(--line)" : "none", cursor: "pointer" }}>
              <span style={{ width: 20, height: 20, borderRadius: 99, border: on ? "none" : "2px solid var(--line-strong)", background: on ? "var(--accent)" : "transparent", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all .15s" }}>{on && <Icon name="check" size={12} strokeWidth={3} />}</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: on ? "var(--ink-3)" : "var(--ink)", textDecoration: on ? "line-through" : "none" }}>{r}</span>
            </div>
          );
        })}</Card>

        <SectionLabel>銘柄メモ</SectionLabel>
        <Card>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>{(cand.tags || []).map((t) => <Tag key={t}>#{t}</Tag>)}</div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "var(--ink-2)", fontWeight: 600 }}>
            <span>最終通知</span><span style={{ color: "var(--ink)" }}>{cand.lastNotifiedAt || "未通知"}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "var(--ink-2)", fontWeight: 600, marginTop: 8 }}>
            <span>暫定スコア</span><span style={{ color: "var(--ink)" }}>{total}/100</span>
          </div>
        </Card>

        <div style={{ display: "flex", gap: 10, margin: "18px 0 6px" }}>
          <button onClick={() => onReport(cand.code)} style={{ flex: 1, height: 50, borderRadius: 15, border: "1px solid var(--card-line)", background: "var(--surface)", color: "var(--ink)", fontSize: 14, fontWeight: 700, fontFamily: "var(--ui)", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, cursor: "pointer" }}><Icon name="doc" size={18} />レポート</button>
          <button style={{ flex: 1, height: 50, borderRadius: 15, border: "none", background: "var(--accent)", color: "#fff", fontSize: 14, fontWeight: 700, fontFamily: "var(--ui)", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, cursor: "pointer", boxShadow: "0 6px 16px var(--accent-shadow)" }}><Icon name="spark" size={18} />Codexで調査</button>
        </div>
      </div>
    </>
  );
}

DetailScreen = SafeDetailScreen;
