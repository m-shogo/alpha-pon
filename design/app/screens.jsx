/* alpha-pon — screens */

// ── layout helpers ──────────────────────────────────────────
function AppHeader({ title, sub, right, accentTitle }) {
  return (
    <div style={{
      position: "sticky", top: 0, zIndex: 8,
      padding: "52px 20px 12px", background: "var(--header-bg)",
      backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
      borderBottom: "1px solid var(--line)",
    }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
        <div>
          {sub && <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--accent)", letterSpacing: 0.3, marginBottom: 2 }}>{sub}</div>}
          <h1 style={{ margin: 0, fontFamily: "var(--display)", fontWeight: 700, fontSize: 27, color: accentTitle ? "var(--accent)" : "var(--ink)", letterSpacing: 0.2 }}>{title}</h1>
        </div>
        {right}
      </div>
    </div>
  );
}

function Card({ children, onClick, style, pad = 16 }) {
  return (
    <div onClick={onClick} style={{
      background: "var(--surface)", borderRadius: 20, padding: pad,
      boxShadow: "var(--shadow)", border: "1px solid var(--card-line)",
      cursor: onClick ? "pointer" : "default", transition: "transform .12s ease",
      ...style,
    }}
    onMouseDown={onClick ? (e) => e.currentTarget.style.transform = "scale(.985)" : undefined}
    onMouseUp={onClick ? (e) => e.currentTarget.style.transform = "scale(1)" : undefined}
    onMouseLeave={onClick ? (e) => e.currentTarget.style.transform = "scale(1)" : undefined}>
      {children}
    </div>
  );
}

function SectionLabel({ children, icon }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, margin: "22px 4px 11px" }}>
      {icon && <span style={{ color: "var(--ink-3)", display: "flex" }}>{icon}</span>}
      <span style={{ fontSize: 13, fontWeight: 800, color: "var(--ink-2)", letterSpacing: 0.4 }}>{children}</span>
    </div>
  );
}

// ── candidate card ──────────────────────────────────────────
function StatusPillBtn({ cand, onStatus }) {
  if (!onStatus) return <StatusPill status={cand.status} />;
  return (
    <button onClick={(e) => { e.stopPropagation(); onStatus(cand.code); }}
      style={{ border: "none", background: "transparent", padding: 0, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 3 }}>
      <StatusPill status={cand.status} />
      <Icon name="down" size={13} color="var(--ink-3)" />
    </button>
  );
}

function CandidateCard({ cand, onOpen, density = "regular", onStatus }) {
  const total = window.AP.total(cand.score);
  const level = apLevel(total);
  const a = AP_alert[level];
  const compact = density === "compact";
  const comfy = density === "comfy";
  return (
    <Card onClick={() => onOpen(cand.code)} pad={compact ? 13 : comfy ? 18 : 15} style={{ marginBottom: compact ? 9 : 11 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Prio p={cand.priority} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 16, color: "var(--ink)" }}>{cand.name}</span>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--ink-3)" }}>{cand.code}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
            <StatusPillBtn cand={cand} onStatus={onStatus} />
            <span style={{ fontSize: 11.5, color: "var(--ink-2)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cand.triggeredRule}</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 1 }}>
            <span style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 30, lineHeight: 0.9, color: a.color }}>{total}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-3)" }}>/100</span>
          </div>
          <AlertBadge level={level} dot />
        </div>
      </div>
      {!compact && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, flex: 1 }}>
            {cand.tags.slice(0, comfy ? 3 : 2).map((t) => <Tag key={t}>{t}</Tag>)}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <Sparkline data={cand.sparkline} color="auto" />
            <span style={{ fontSize: 12, fontWeight: 700, color: cand.changePct >= 0 ? "var(--mint-deep)" : "var(--urgent)" }}>
              {cand.changePct >= 0 ? "+" : ""}{cand.changePct}%
            </span>
          </div>
        </div>
      )}
      {comfy && (
        <div style={{ marginTop: 11, display: "flex", flexDirection: "column", gap: 5 }}>
          {cand.reasons.slice(0, 2).map((r, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "var(--ink-2)", fontWeight: 600 }}>
              <span style={{ color: "var(--mint-deep)", display: "flex" }}><Icon name="check" size={13} strokeWidth={2.6} /></span>{r}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ── HOME ────────────────────────────────────────────────────
function HomeScreen({ onOpen, density, candidates, onStatus, onIpo, onBacktest, ipoCount }) {
  const list = candidates
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
      <AppHeader sub="2026年5月29日（金）・ 朝のまとめ" title="alpha-pon" accentTitle
        right={<div style={{ width: 38, height: 38, borderRadius: 12, background: "var(--accent-soft)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)" }}><Icon name="spark" size={20} /></div>} />
      <div style={{ padding: "16px 16px 0" }}>
        <div style={{ display: "flex", gap: 9 }}>
          {stat("urgent", counts.urgent)}{stat("daily", counts.daily)}{stat("log", counts.log)}
        </div>
        <div style={{ display: "flex", gap: 9, marginTop: 9 }}>
          <button onClick={onIpo} style={{ flex: 1, display: "flex", alignItems: "center", gap: 9, padding: "12px 13px", borderRadius: 16, border: "1px solid var(--card-line)", background: "var(--surface)", boxShadow: "var(--shadow)", cursor: "pointer", textAlign: "left" }}>
            <span style={{ width: 32, height: 32, borderRadius: 10, background: "var(--sky-soft)", color: "var(--sky-deep)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon name="spark" size={17} /></span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 13, fontWeight: 800, color: "var(--ink)" }}>IPO候補</span>
              <span style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--sky-deep)" }}>自動検出 {ipoCount}件</span>
            </span>
          </button>
          <button onClick={onBacktest} style={{ flex: 1, display: "flex", alignItems: "center", gap: 9, padding: "12px 13px", borderRadius: 16, border: "1px solid var(--card-line)", background: "var(--surface)", boxShadow: "var(--shadow)", cursor: "pointer", textAlign: "left" }}>
            <span style={{ width: 32, height: 32, borderRadius: 10, background: "var(--lavender-soft)", color: "var(--lavender-deep)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon name="arc" size={17} /></span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 13, fontWeight: 800, color: "var(--ink)" }}>バックテスト</span>
              <span style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--lavender-deep)" }}>ルール検証</span>
            </span>
          </button>
        </div>
        <SectionLabel icon={<Icon name="spark" size={15} />}>本日の調査候補（スコア順）</SectionLabel>
        {list.map((x) => <CandidateCard key={x.c.code} cand={x.c} onOpen={onOpen} density={density} onStatus={onStatus} />)}
        <p style={{ textAlign: "center", fontSize: 11.5, color: "var(--ink-3)", fontWeight: 600, margin: "14px 0 4px", lineHeight: 1.6 }}>
          スコア49点以下は通知されません。<br />同一銘柄・同一理由は3日以内は再通知を抑制します。
        </p>
      </div>
    </>
  );
}

// ── DETAIL ──────────────────────────────────────────────────
function DetailScreen({ code, onBack, scoreVariant, onReport, candidates, onStatus }) {
  const cand = (candidates || window.AP.candidates).find((c) => c.code === code);
  const [checked, setChecked] = React.useState({});
  if (!cand) return null;
  const total = window.AP.total(cand.score);
  const level = apLevel(total);
  return (
    <>
      <div style={{ position: "sticky", top: 0, zIndex: 8, padding: "50px 14px 12px", background: "var(--header-bg)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={onBack} style={{ width: 38, height: 38, borderRadius: 12, border: "1px solid var(--card-line)", background: "var(--surface)", color: "var(--ink)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}><Icon name="back" size={20} /></button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 19, color: "var(--ink)", lineHeight: 1 }}>{cand.name}</div>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--ink-3)", marginTop: 2 }}>{cand.code} ・ {cand.market}</div>
        </div>
        <Prio p={cand.priority} />
        <StatusPillBtn cand={cand} onStatus={onStatus} />
      </div>

      <div style={{ padding: "16px 16px 0" }}>
        {/* hero */}
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
                <span style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 22, color: "var(--ink)" }}>¥{cand.price.toLocaleString()}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: cand.changePct >= 0 ? "var(--mint-deep)" : "var(--urgent)" }}>{cand.changePct >= 0 ? "+" : ""}{cand.changePct}%</span>
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-2)", marginTop: 2 }}>高値から {cand.drawdownPct}%</div>
            </div>
            <div style={{ marginLeft: "auto" }}><Sparkline data={cand.sparkline} color="auto" w={120} h={40} /></div>
          </div>
        </Card>

        {/* 検出理由 */}
        <SectionLabel icon={<Icon name="check" size={15} />}>検出理由</SectionLabel>
        <Card pad={6}>
          {cand.reasons.map((r, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "9px 12px", borderBottom: i < cand.reasons.length - 1 ? "1px solid var(--line)" : "none" }}>
              <span style={{ width: 20, height: 20, borderRadius: 7, background: "var(--mint-soft)", color: "var(--mint-deep)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}><Icon name="check" size={13} strokeWidth={2.8} /></span>
              <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", lineHeight: 1.45 }}>{r}</span>
            </div>
          ))}
        </Card>

        {/* 注意点 */}
        <SectionLabel icon={<Icon name="alert" size={15} />}>注意点</SectionLabel>
        <Card pad={6}>
          {cand.negativeReasons.map((r, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "9px 12px", borderBottom: i < cand.negativeReasons.length - 1 ? "1px solid var(--line)" : "none" }}>
              <span style={{ width: 20, height: 20, borderRadius: 7, background: "var(--amber-soft)", color: "var(--amber)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}><Icon name="alert" size={13} strokeWidth={2.4} /></span>
              <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", lineHeight: 1.45 }}>{r}</span>
            </div>
          ))}
        </Card>

        {/* 次に見るもの */}
        <SectionLabel icon={<Icon name="doc" size={15} />}>次に見るもの</SectionLabel>
        <Card pad={6}>
          {cand.nextToSee.map((r, i) => {
            const on = checked[i];
            return (
              <div key={i} onClick={() => setChecked((s) => ({ ...s, [i]: !s[i] }))}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderBottom: i < cand.nextToSee.length - 1 ? "1px solid var(--line)" : "none", cursor: "pointer" }}>
                <span style={{ width: 20, height: 20, borderRadius: 99, border: on ? "none" : "2px solid var(--line-strong)", background: on ? "var(--accent)" : "transparent", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all .15s" }}>
                  {on && <Icon name="check" size={12} strokeWidth={3} />}
                </span>
                <span style={{ fontSize: 14, fontWeight: 600, color: on ? "var(--ink-3)" : "var(--ink)", textDecoration: on ? "line-through" : "none" }}>{r}</span>
              </div>
            );
          })}
        </Card>

        {/* meta */}
        <SectionLabel>銘柄メモ</SectionLabel>
        <Card>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
            {cand.tags.map((t) => <Tag key={t}>#{t}</Tag>)}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "var(--ink-2)", fontWeight: 600 }}>
            <span>最終通知</span><span style={{ color: "var(--ink)" }}>{cand.lastNotifiedAt}</span>
          </div>
        </Card>

        {/* actions */}
        <div style={{ display: "flex", gap: 10, margin: "18px 0 6px" }}>
          <button onClick={() => onReport(cand.code)} style={{ flex: 1, height: 50, borderRadius: 15, border: "1px solid var(--card-line)", background: "var(--surface)", color: "var(--ink)", fontSize: 14, fontWeight: 700, fontFamily: "var(--ui)", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, cursor: "pointer" }}><Icon name="doc" size={18} />レポート</button>
          <button style={{ flex: 1, height: 50, borderRadius: 15, border: "none", background: "var(--accent)", color: "#fff", fontSize: 14, fontWeight: 700, fontFamily: "var(--ui)", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, cursor: "pointer", boxShadow: "0 6px 16px var(--accent-shadow)" }}><Icon name="spark" size={18} />Codexで調査</button>
        </div>
      </div>
    </>
  );
}

// ── WATCHLIST ───────────────────────────────────────────────
const WL_ORDER = ["research", "watch", "candidate", "active", "ignore", "expired"];
function WatchlistScreen({ onOpen, candidates, onStatus }) {
  const [filter, setFilter] = React.useState("all");
  const all = candidates;
  const counts = {};
  all.forEach((c) => counts[c.status] = (counts[c.status] || 0) + 1);
  const shown = filter === "all" ? all : all.filter((c) => c.status === filter);
  const groups = WL_ORDER.filter((s) => shown.some((c) => c.status === s));
  const chip = (key, label, n) => {
    const on = filter === key;
    return (
      <button key={key} onClick={() => setFilter(key)} style={{
        padding: "7px 13px", borderRadius: 99, border: "1px solid " + (on ? "var(--accent)" : "var(--card-line)"),
        background: on ? "var(--accent)" : "var(--surface)", color: on ? "#fff" : "var(--ink-2)",
        fontSize: 12.5, fontWeight: 700, fontFamily: "var(--ui)", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
      }}>{label}<span style={{ opacity: 0.7, marginLeft: 5 }}>{n}</span></button>
    );
  };
  return (
    <>
      <AppHeader sub="status で銘柄を管理" title="ウォッチリスト"
        right={<div style={{ width: 38, height: 38, borderRadius: 12, background: "var(--surface)", border: "1px solid var(--card-line)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-2)" }}><Icon name="filter" size={19} /></div>} />
      <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "14px 16px 4px", scrollbarWidth: "none" }}>
        {chip("all", "すべて", all.length)}
        {WL_ORDER.filter((s) => counts[s]).map((s) => chip(s, AP_status[s].jp, counts[s]))}
      </div>
      <div style={{ padding: "8px 16px 0" }}>
        {groups.map((s) => (
          <div key={s}>
            <SectionLabel><span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}><span style={{ width: 8, height: 8, borderRadius: 99, background: AP_status[s].color }} />{AP_status[s].jp}</span></SectionLabel>
            {shown.filter((c) => c.status === s).map((c) => <CandidateCard key={c.code} cand={c} onOpen={onOpen} density="regular" onStatus={onStatus} />)}
          </div>
        ))}
        <p style={{ textAlign: "center", fontSize: 11.5, color: "var(--ink-3)", fontWeight: 600, margin: "10px 0 4px" }}>削除ではなく status を変える設計です。</p>
      </div>
    </>
  );
}

// ── FEED ────────────────────────────────────────────────────
function FeedScreen({ onOpen }) {
  const byDate = {};
  window.AP.feed.forEach((f) => { (byDate[f.date] = byDate[f.date] || []).push(f); });
  const dates = Object.keys(byDate);
  return (
    <>
      <AppHeader sub="urgent / daily / log" title="通知フィード"
        right={<div style={{ width: 38, height: 38, borderRadius: 12, background: "var(--accent-soft)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)" }}><Icon name="bell" size={19} /></div>} />
      <div style={{ padding: "10px 16px 0" }}>
        {dates.map((d) => (
          <div key={d}>
            <SectionLabel>{d === "2026-05-29" ? "今日" : d}</SectionLabel>
            {byDate[d].map((f, i) => {
              const a = AP_alert[f.level];
              return (
                <Card key={i} onClick={() => onOpen(f.code)} style={{ marginBottom: 10, opacity: f.suppressed ? 0.6 : 1 }} pad={14}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 4, alignSelf: "stretch", borderRadius: 99, background: a.color, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        <AlertBadge level={f.level} dot />
                        <span style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 15, color: "var(--ink)" }}>{f.name}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-3)" }}>{f.code}</span>
                        <span style={{ marginLeft: "auto", fontSize: 11.5, fontWeight: 700, color: "var(--ink-3)" }}>{f.time}</span>
                      </div>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-2)", marginTop: 5, lineHeight: 1.4 }}>{f.reason}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 7 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)" }}>スコア {f.score}</span>
                        {f.delta !== 0 && <span style={{ fontSize: 11.5, fontWeight: 700, color: f.delta > 0 ? "var(--mint-deep)" : "var(--ink-3)", display: "inline-flex", alignItems: "center" }}><Icon name={f.delta > 0 ? "up" : "down"} size={13} />{Math.abs(f.delta)}</span>}
                        {f.suppressed && <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-3)", background: "var(--surface-2)", borderRadius: 6, padding: "2px 7px" }}>再通知抑制</span>}
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        ))}
      </div>
    </>
  );
}

// ── tiny markdown renderer ──────────────────────────────────
function renderMarkdown(md) {
  const lines = md.split("\n");
  const out = [];
  let i = 0;
  const inline = (s) => {
    const parts = s.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((p, k) => p.startsWith("**") ? <strong key={k} style={{ fontWeight: 800, color: "var(--ink)" }}>{p.slice(2, -2)}</strong> : p);
  };
  while (i < lines.length) {
    let l = lines[i];
    if (l.startsWith("# ")) { out.push(<h1 key={i} style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 21, color: "var(--ink)", margin: "4px 0 10px" }}>{l.slice(2)}</h1>); i++; continue; }
    if (l.startsWith("## ")) { out.push(<h2 key={i} style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 16, color: "var(--accent)", margin: "18px 0 8px" }}>{l.slice(3)}</h2>); i++; continue; }
    if (l.startsWith("> ")) { out.push(<div key={i} style={{ borderLeft: "3px solid var(--accent)", background: "var(--accent-soft)", padding: "9px 12px", borderRadius: 8, fontSize: 13, fontWeight: 600, color: "var(--ink)", margin: "8px 0" }}>{inline(l.slice(2))}</div>); i++; continue; }
    if (l.startsWith("---")) { out.push(<hr key={i} style={{ border: "none", borderTop: "1px solid var(--line)", margin: "16px 0" }} />); i++; continue; }
    if (l.startsWith("- ")) {
      const items = [];
      while (i < lines.length && lines[i].startsWith("- ")) { items.push(lines[i].slice(2)); i++; }
      out.push(<ul key={i} style={{ margin: "4px 0", paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>{items.map((it, k) => <li key={k} style={{ display: "flex", gap: 8, fontSize: 13.5, color: "var(--ink)", fontWeight: 600 }}><span style={{ color: "var(--accent)" }}>•</span>{inline(it)}</li>)}</ul>);
      continue;
    }
    if (l.startsWith("|")) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith("|")) { rows.push(lines[i]); i++; }
      const cells = rows.filter((r) => !/^\|[\s|:-]+\|$/.test(r)).map((r) => r.split("|").slice(1, -1).map((c) => c.trim()));
      out.push(
        <table key={i} style={{ width: "100%", borderCollapse: "collapse", margin: "8px 0", fontSize: 13 }}>
          <tbody>{cells.map((row, r) => (
            <tr key={r}>{row.map((c, ci) => (
              <td key={ci} style={{ padding: "7px 10px", borderBottom: "1px solid var(--line)", fontWeight: r === 0 ? 800 : 600, color: r === 0 ? "var(--ink-2)" : "var(--ink)", textAlign: ci === 0 ? "left" : "right" }}>{c}</td>
            ))}</tr>
          ))}</tbody>
        </table>
      );
      continue;
    }
    if (l.trim() === "") { i++; continue; }
    out.push(<p key={i} style={{ fontSize: 13.5, color: "var(--ink)", fontWeight: 600, margin: "6px 0", lineHeight: 1.6 }}>{inline(l)}</p>);
    i++;
  }
  return out;
}

// ── REPORT ──────────────────────────────────────────────────
function ReportScreen({ code, onOpen }) {
  const [raw, setRaw] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const md = window.AP.report285A;
  const copy = () => {
    try { navigator.clipboard.writeText(md); } catch (e) {}
    setCopied(true); setTimeout(() => setCopied(false), 1600);
  };
  return (
    <>
      <AppHeader sub="reports / latest.md" title="レポート"
        right={
          <div style={{ display: "flex", gap: 6, background: "var(--surface-2)", borderRadius: 11, padding: 3 }}>
            {["preview", "raw"].map((m) => {
              const on = (m === "raw") === raw;
              return <button key={m} onClick={() => setRaw(m === "raw")} style={{ padding: "6px 11px", borderRadius: 8, border: "none", background: on ? "var(--surface)" : "transparent", color: on ? "var(--ink)" : "var(--ink-3)", fontSize: 12, fontWeight: 700, fontFamily: "var(--ui)", cursor: "pointer", boxShadow: on ? "var(--shadow)" : "none" }}>{m === "raw" ? "Raw" : "プレビュー"}</button>;
            })}
          </div>
        } />
      <div style={{ padding: "16px 16px 0" }}>
        <Card pad={raw ? 0 : 18}>
          {raw
            ? <pre style={{ margin: 0, padding: 16, fontFamily: "ui-monospace, Menlo, monospace", fontSize: 11.5, lineHeight: 1.7, color: "var(--ink-2)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{md}</pre>
            : <div>{renderMarkdown(md)}</div>}
        </Card>
        <button onClick={copy} style={{ width: "100%", height: 52, marginTop: 14, borderRadius: 15, border: "none", background: copied ? "var(--mint-deep)" : "var(--accent)", color: "#fff", fontSize: 14.5, fontWeight: 700, fontFamily: "var(--ui)", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer", boxShadow: "0 6px 16px var(--accent-shadow)", transition: "background .2s" }}>
          <Icon name={copied ? "check" : "copy"} size={18} />{copied ? "コピーしました" : "Markdownをコピー（AIに貼る）"}
        </button>
        <p style={{ textAlign: "center", fontSize: 11.5, color: "var(--ink-3)", fontWeight: 600, margin: "12px 0 4px", lineHeight: 1.6 }}>
          必要なものだけ ChatGPT / Codex に手動で投げて深掘りします。
        </p>
      </div>
    </>
  );
}

Object.assign(window, {
  AppHeader, Card, SectionLabel, CandidateCard, renderMarkdown,
  HomeScreen, DetailScreen, WatchlistScreen, FeedScreen, ReportScreen,
});
