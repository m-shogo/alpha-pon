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
