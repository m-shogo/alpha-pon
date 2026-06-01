/* alpha-pon — generated data bridge for design mock */

function APGeneratedSummaryCard() {
  const generated = window.AP && window.AP.generated;
  if (!generated || !generated.generatedAt) return null;
  const reports = generated.reports || [];
  const available = reports.filter((r) => r.available).length;
  const roadmap = generated.summary?.roadmap || [];
  const refresh = generated.summary?.refresh || [];
  return (
    <Card pad={15} style={{ marginBottom: 12, border: "1px solid var(--accent-soft)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div style={{ width: 34, height: 34, borderRadius: 12, background: "var(--accent-soft)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon name="spark" size={18} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: "var(--display)", fontSize: 16, fontWeight: 700, color: "var(--ink)" }}>Pro司令塔</div>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--ink-3)", marginTop: 2 }}>generated: {generated.generatedAt} / reports {available}/{reports.length}</div>
        </div>
      </div>
      <div style={{ fontSize: 13, fontWeight: 650, color: "var(--ink)", lineHeight: 1.55, background: "var(--surface-2)", borderRadius: 14, padding: "10px 11px" }}>
        {generated.summary?.strategic || "司令塔レポート未生成"}
      </div>
      {(roadmap.length > 0 || refresh.length > 0) && (
        <div style={{ display: "grid", gap: 7, marginTop: 10 }}>
          {roadmap.slice(0, 2).map((item, i) => (
            <div key={`roadmap-${i}`} style={{ display: "flex", gap: 7, fontSize: 12.2, fontWeight: 650, color: "var(--ink-2)", lineHeight: 1.4 }}>
              <span style={{ color: "var(--accent)", flexShrink: 0 }}>改善</span><span>{item.replace(/^[-# ]+/, "")}</span>
            </div>
          ))}
          {refresh.slice(0, 1).map((item, i) => (
            <div key={`refresh-${i}`} style={{ display: "flex", gap: 7, fontSize: 12.2, fontWeight: 650, color: "var(--ink-2)", lineHeight: 1.4 }}>
              <span style={{ color: "var(--sky-deep)", flexShrink: 0 }}>更新</span><span>{item.replace(/^[-#| ]+/, "")}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

HomeScreen = function GeneratedHomeScreen({ onOpen, density }) {
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
  const generated = window.AP.generated;
  return (
    <>
      <AppHeader sub={`${generated?.generatedAt || "2026年5月29日"} ・ 朝のまとめ`} title="alpha-pon" accentTitle
        right={<div style={{ width: 38, height: 38, borderRadius: 12, background: "var(--accent-soft)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)" }}><Icon name="spark" size={20} /></div>} />
      <div style={{ padding: "16px 16px 0" }}>
        <APGeneratedSummaryCard />
        <div style={{ display: "flex", gap: 9 }}>
          {stat("urgent", counts.urgent)}{stat("daily", counts.daily)}{stat("log", counts.log)}
        </div>
        <SectionLabel icon={<Icon name="spark" size={15} />}>本日の調査候補（スコア順）</SectionLabel>
        {list.map((x) => <CandidateCard key={x.c.code} cand={x.c} onOpen={onOpen} density={density} />)}
        <p style={{ textAlign: "center", fontSize: 11.5, color: "var(--ink-3)", fontWeight: 600, margin: "14px 0 4px", lineHeight: 1.6 }}>
          スコア49点以下は通知されません。<br />Pro会議で証拠不足の場合は、調査候補へ格上げしません。
        </p>
      </div>
    </>
  );
};

const APOriginalDetailScreen = DetailScreen;
DetailScreen = function GeneratedSafeDetailScreen(props) {
  const cand = window.AP.candidates.find((c) => c.code === props.code);
  if (cand) {
    cand.priceLabel = cand.price == null ? "未取得" : `¥${Number(cand.price).toLocaleString()}`;
    cand.changePctLabel = cand.changePct == null ? "—" : `${cand.changePct >= 0 ? "+" : ""}${cand.changePct}%`;
    cand.drawdownLabel = cand.drawdownPct == null ? "未取得" : `${cand.drawdownPct}%`;
    if (cand.price == null) cand.price = 0;
    if (cand.changePct == null) cand.changePct = 0;
    if (cand.drawdownPct == null) cand.drawdownPct = 0;
  }
  return <APOriginalDetailScreen {...props} />;
};
