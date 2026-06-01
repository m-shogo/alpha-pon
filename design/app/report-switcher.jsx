/* alpha-pon — generated report switcher
 * Report画面で生成レポートをタップして要約切替する。
 */

const AlphaPonPreviousReportScreen = ReportScreen;

function ReportExcerptCard({ report }) {
  const lines = report && Array.isArray(report.excerpt) ? report.excerpt : [];
  return (
    <Card pad={14} style={{ marginTop: 12, background: "linear-gradient(135deg, var(--surface), var(--surface-2))" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
        <div>
          <div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 16, color: "var(--ink)" }}>{report ? report.label : "レポート"}</div>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--ink-3)", marginTop: 2 }}>{report ? report.path : "未選択"}</div>
        </div>
        <Tag>{report && report.available ? "ok" : "missing"}</Tag>
      </div>
      {lines.length > 0 ? lines.map((line, i) => (
        <div key={i} style={{ display: "flex", gap: 8, padding: "7px 0", borderTop: i === 0 ? "1px solid var(--line)" : "none" }}>
          <span style={{ color: "var(--accent)", fontWeight: 800 }}>•</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-2)", lineHeight: 1.5 }}>{line}</span>
        </div>
      )) : (
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-3)", lineHeight: 1.5 }}>要約はまだ生成されていません。</div>
      )}
    </Card>
  );
}

ReportScreen = function GeneratedReportSwitcherScreen({ code, onOpen }) {
  const [raw, setRaw] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const g = window.AP && window.AP.generated;
  const reports = (g && Array.isArray(g.reports)) ? g.reports : [];
  const [selectedKey, setSelectedKey] = React.useState((reports[0] && reports[0].key) || "strategic");
  const selected = reports.find((r) => r.key === selectedKey) || reports[0];
  const md = window.AP.report285A;
  const copy = () => {
    const text = selected && selected.excerpt ? `${selected.label}\n\n${selected.excerpt.join("\n")}` : md;
    try { navigator.clipboard.writeText(text); } catch (e) {}
    setCopied(true); setTimeout(() => setCopied(false), 1600);
  };

  return (
    <>
      <AppHeader sub="reports / generated" title="レポート"
        right={<div style={{ display: "flex", gap: 6, background: "var(--surface-2)", borderRadius: 11, padding: 3 }}>
          {["preview", "raw"].map((m) => {
            const on = (m === "raw") === raw;
            return <button key={m} onClick={() => setRaw(m === "raw")} style={{ padding: "6px 11px", borderRadius: 8, border: "none", background: on ? "var(--surface)" : "transparent", color: on ? "var(--ink)" : "var(--ink-3)", fontSize: 12, fontWeight: 700, fontFamily: "var(--ui)", cursor: "pointer", boxShadow: on ? "var(--shadow)" : "none" }}>{m === "raw" ? "Raw" : "要約"}</button>;
          })}
        </div>} />
      <div style={{ padding: "16px 16px 0" }}>
        <SectionLabel icon={<Icon name="doc" size={15} />}>生成レポート一覧</SectionLabel>
        <Card pad={6}>
          {reports.length > 0 ? reports.map((r, i) => {
            const active = r.key === selectedKey;
            return (
              <div key={r.key || i} onClick={() => setSelectedKey(r.key)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderBottom: i < reports.length - 1 ? "1px solid var(--line)" : "none", cursor: "pointer", background: active ? "var(--accent-soft)" : "transparent", borderRadius: active ? 12 : 0 }}>
                <span style={{ width: 22, height: 22, borderRadius: 8, background: r.available ? "var(--mint-soft)" : "var(--surface-2)", color: r.available ? "var(--mint-deep)" : "var(--ink-3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon name={r.available ? "check" : "alert"} size={13} strokeWidth={2.6} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 800, color: "var(--ink)" }}>{r.label}</div>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--ink-3)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.path}</div>
                </div>
                <Tag>{active ? "表示中" : r.available ? "ok" : "missing"}</Tag>
              </div>
            );
          }) : (
            <div style={{ padding: 12, fontSize: 13, fontWeight: 600, color: "var(--ink-3)" }}>生成レポートはまだありません。</div>
          )}
        </Card>

        {raw ? (
          <>
            <SectionLabel icon={<Icon name="spark" size={15} />}>Markdown</SectionLabel>
            <Card pad={0}><pre style={{ margin: 0, padding: 16, fontFamily: "ui-monospace, Menlo, monospace", fontSize: 11.5, lineHeight: 1.7, color: "var(--ink-2)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{md}</pre></Card>
          </>
        ) : (
          <>
            <SectionLabel icon={<Icon name="spark" size={15} />}>選択中の要約</SectionLabel>
            <ReportExcerptCard report={selected} />
          </>
        )}

        <button onClick={copy} style={{ width: "100%", height: 52, marginTop: 14, borderRadius: 15, border: "none", background: copied ? "var(--mint-deep)" : "var(--accent)", color: "#fff", fontSize: 14.5, fontWeight: 700, fontFamily: "var(--ui)", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer", boxShadow: "0 6px 16px var(--accent-shadow)", transition: "background .2s" }}>
          <Icon name={copied ? "check" : "copy"} size={18} />{copied ? "コピーしました" : "選択中の要約をコピー"}
        </button>
        <p style={{ textAlign: "center", fontSize: 11.5, color: "var(--ink-3)", fontWeight: 600, margin: "12px 0 4px", lineHeight: 1.6 }}>
          Pro会議・改善ロードマップ・データ信頼度を見てから深掘りします。
        </p>
      </div>
    </>
  );
};
