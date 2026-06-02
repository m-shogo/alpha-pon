/* alpha-pon — desktop dashboard */

function DStatusSelect({ cand, onStatus }) {
  const m = AP_status[cand.status];
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 9px 4px 9px", borderRadius: 999, background: m.soft, color: m.color, fontSize: 12, fontWeight: 700, pointerEvents: "none" }}>
        <span style={{ width: 7, height: 7, borderRadius: 99, background: m.color }} />{m.jp}
        <Icon name="down" size={12} color={m.color} />
      </span>
      <select value={cand.status} onChange={(e) => onStatus(cand.code, e.target.value)}
        style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%" }}>
        {STATUS_OPTS.map((s) => <option key={s} value={s}>{AP_status[s].jp}</option>)}
      </select>
    </span>
  );
}

function DKpi({ label, value, sub, color }) {
  return (
    <div style={{ flex: 1, background: "var(--surface)", borderRadius: 18, padding: "16px 18px", border: "1px solid var(--card-line)", boxShadow: "var(--shadow)" }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink-2)" }}>{label}</div>
      <div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 32, color: color || "var(--ink)", marginTop: 4, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--ink-3)", marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function DCandRow({ c, onOpen, onStatus, showRule }) {
  const total = window.AP.total(c.score);
  const level = apLevel(total);
  return (
    <tr onClick={() => onOpen(c.code)} className="d-row" style={{ cursor: "pointer" }}>
      <td style={{ padding: "13px 10px 13px 18px" }}><Prio p={c.priority} /></td>
      <td style={{ padding: "13px 10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 15, color: "var(--ink)" }}>{c.name}</span>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--ink-3)" }}>{c.code}</span>
        </div>
        {showRule && <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--ink-2)", marginTop: 2 }}>{c.triggeredRule}</div>}
        <div style={{ display: "flex", gap: 5, marginTop: 5 }}>{c.tags.slice(0, 3).map((t) => <Tag key={t}>{t}</Tag>)}</div>
      </td>
      <td style={{ padding: "13px 10px" }} onClick={(e) => e.stopPropagation()}><DStatusSelect cand={c} onStatus={onStatus} /></td>
      <td style={{ padding: "13px 10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Sparkline data={c.sparkline} color="auto" w={64} h={24} />
          <span style={{ fontSize: 12, fontWeight: 700, color: c.changePct >= 0 ? "var(--mint-deep)" : "var(--urgent)" }}>{c.changePct >= 0 ? "+" : ""}{c.changePct}%</span>
        </div>
      </td>
      <td style={{ padding: "13px 18px 13px 10px", textAlign: "right" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10 }}>
          <AlertBadge level={level} dot />
          <span style={{ display: "flex", alignItems: "baseline", gap: 1 }}>
            <span style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 24, color: AP_alert[level].color }}>{total}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-3)" }}>/100</span>
          </span>
        </div>
      </td>
    </tr>
  );
}

function DTable({ children, head }) {
  return (
    <div style={{ background: "var(--surface)", borderRadius: 20, border: "1px solid var(--card-line)", boxShadow: "var(--shadow)", overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr style={{ background: "var(--surface-2)" }}>{head.map((h, i) => (
          <th key={i} style={{ padding: "10px 10px", fontSize: 11, fontWeight: 800, color: "var(--ink-3)", textAlign: h.r ? "right" : "left", paddingLeft: i === 0 ? 18 : 10, paddingRight: i === head.length - 1 ? 18 : 10 }}>{typeof h === "object" ? h.t : h}</th>
        ))}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function DSectionTitle({ children, sub }) {
  return (
    <div style={{ margin: "0 0 14px" }}>
      <h2 style={{ margin: 0, fontFamily: "var(--display)", fontWeight: 700, fontSize: 24, color: "var(--ink)" }}>{children}</h2>
      {sub && <p style={{ margin: "3px 0 0", fontSize: 13, fontWeight: 600, color: "var(--ink-2)" }}>{sub}</p>}
    </div>
  );
}

// ── sections ────────────────────────────────────────────────
function DDashboard({ candidates, onOpen, onStatus, scoreVariant }) {
  const ranked = candidates.map((c) => ({ c, total: window.AP.total(c.score) })).filter((x) => x.total >= 50).sort((a, b) => b.total - a.total);
  const counts = { urgent: 0, daily: 0, log: 0 };
  ranked.forEach((x) => counts[apLevel(x.total)]++);
  const top = ranked[0].c;
  const topIpo = window.AP.ipo.map((c) => ({ c, s: window.AP.ipoScore(c) })).sort((a, b) => b.s - a.s)[0];
  return (
    <>
      <DSectionTitle sub="2026年5月29日（金）・ 毎朝1回の自動チェック結果">朝のまとめ</DSectionTitle>
      <div style={{ display: "flex", gap: 14, marginBottom: 22 }}>
        <DKpi label="即通知 (urgent)" value={counts.urgent} sub="85点以上" color="var(--urgent)" />
        <DKpi label="朝まとめ (daily)" value={counts.daily} sub="70–84点" color="var(--amber)" />
        <DKpi label="ログ (log)" value={counts.log} sub="50–69点" color="var(--sky-deep)" />
        <DKpi label="ウォッチ銘柄" value={candidates.length} sub="監視中" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 22, alignItems: "start" }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: "var(--ink-2)", margin: "0 4px 11px" }}>本日の調査候補（スコア順）</div>
          <DTable head={[{ t: "" }, { t: "銘柄" }, { t: "status" }, { t: "株価" }, { t: "スコア", r: true }]}>
            {ranked.map((x) => <DCandRow key={x.c.code} c={x.c} onOpen={onOpen} onStatus={onStatus} showRule />)}
          </DTable>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ background: "var(--surface)", borderRadius: 20, border: "1px solid var(--card-line)", boxShadow: "var(--shadow)", padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 14 }}>
              <span style={{ width: 7, height: 7, borderRadius: 99, background: "var(--urgent)" }} />
              <span style={{ fontSize: 12.5, fontWeight: 800, color: "var(--ink-2)" }}>本日のトップ候補</span>
            </div>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
              <ScoreViz variant={scoreVariant === "bars" ? "ring" : scoreVariant} cand={top} />
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 18, color: "var(--ink)" }}>{top.name} <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{top.code}</span></div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-2)", marginTop: 3 }}>{top.triggeredRule}</div>
            </div>
            <button onClick={() => onOpen(top.code)} style={{ width: "100%", height: 42, marginTop: 14, borderRadius: 12, border: "none", background: "var(--accent)", color: "#fff", fontWeight: 800, fontSize: 13, fontFamily: "var(--ui)", cursor: "pointer", boxShadow: "0 5px 14px var(--accent-shadow)" }}>詳細を見る</button>
          </div>
          <div style={{ background: "var(--sky-soft)", borderRadius: 20, padding: 18, border: "1px solid var(--card-line)" }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: "var(--sky-deep)", marginBottom: 6 }}>IPO自動検出</div>
            <div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 15, color: "var(--ink)" }}>{topIpo.c.name} <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{topIpo.c.code}</span></div>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--ink-2)", marginTop: 3 }}>IPOスコア {topIpo.s}/25 ・ {window.AP.ipo.length}件を検出中</div>
          </div>
        </div>
      </div>
    </>
  );
}

function DWatchlist({ candidates, onOpen, onStatus }) {
  const [filter, setFilter] = React.useState("all");
  const counts = {};
  candidates.forEach((c) => counts[c.status] = (counts[c.status] || 0) + 1);
  const shown = filter === "all" ? candidates : candidates.filter((c) => c.status === filter);
  const chip = (key, label, n) => {
    const on = filter === key;
    return <button key={key} onClick={() => setFilter(key)} style={{ padding: "8px 15px", borderRadius: 999, border: "1px solid " + (on ? "var(--accent)" : "var(--card-line)"), background: on ? "var(--accent)" : "var(--surface)", color: on ? "#fff" : "var(--ink-2)", fontSize: 13, fontWeight: 700, fontFamily: "var(--ui)", cursor: "pointer" }}>{label}<span style={{ opacity: 0.7, marginLeft: 6 }}>{n}</span></button>;
  };
  return (
    <>
      <DSectionTitle sub="status で銘柄を管理 ・ 削除ではなく status を変える設計">ウォッチリスト</DSectionTitle>
      <div style={{ display: "flex", gap: 9, flexWrap: "wrap", marginBottom: 18 }}>
        {chip("all", "すべて", candidates.length)}
        {["research", "watch", "candidate", "active", "ignore", "expired"].filter((s) => counts[s]).map((s) => chip(s, AP_status[s].jp, counts[s]))}
      </div>
      <DTable head={[{ t: "" }, { t: "銘柄" }, { t: "status" }, { t: "株価" }, { t: "スコア", r: true }]}>
        {shown.map((c) => <DCandRow key={c.code} c={c} onOpen={onOpen} onStatus={onStatus} showRule />)}
      </DTable>
    </>
  );
}

function DIpo({ onOpen, addedCodes, onAdd }) {
  const factors = window.AP.ipoFactors;
  return (
    <>
      <DSectionTitle sub="JPX新規上場情報から、IPO後の売り圧力終了ルール（25点満点）で自動検出">IPO自動検出</DSectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(330px, 1fr))", gap: 16 }}>
        {window.AP.ipo.map((c) => {
          const score = window.AP.ipoScore(c);
          const added = addedCodes.includes(c.code);
          const lvl = score >= 22 ? "var(--mint-deep)" : score >= 14 ? "var(--amber)" : "var(--ink-3)";
          return (
            <div key={c.code} style={{ background: "var(--surface)", borderRadius: 20, border: "1px solid var(--card-line)", boxShadow: "var(--shadow)", padding: 20 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <div style={{ flex: 1, cursor: "pointer" }} onClick={() => onOpen(c.code)}>
                  <div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 17, color: "var(--ink)" }}>{c.name} <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{c.code}</span></div>
                  <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--ink-2)", marginTop: 2 }}>上場 {c.listingDate} ・ {c.daysSinceListing}日経過</div>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 2 }}>
                  <span style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 30, color: lvl }}>{score}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-3)" }}>/25</span>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7, margin: "14px 0" }}>
                {factors.map((f) => {
                  const ok = f.test(c);
                  return (
                    <div key={f.key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 600, color: ok ? "var(--ink)" : "var(--ink-3)" }}>
                      <span style={{ width: 18, height: 18, borderRadius: 6, background: ok ? "var(--mint-soft)" : "var(--surface-2)", color: ok ? "var(--mint-deep)" : "var(--ink-3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{ok ? <Icon name="check" size={12} strokeWidth={3} /> : <span style={{ width: 5, height: 1.6, background: "var(--ink-3)" }} />}</span>
                      <span style={{ flex: 1 }}>{f.label}</span>
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: ok ? "var(--mint-deep)" : "var(--ink-3)" }}>+{ok ? f.pts : 0}</span>
                    </div>
                  );
                })}
              </div>
              <button disabled={added} onClick={() => onAdd(c.code)} style={{ width: "100%", height: 44, borderRadius: 13, border: added ? "1px solid var(--card-line)" : "none", background: added ? "var(--surface-2)" : "var(--accent)", color: added ? "var(--ink-2)" : "#fff", fontSize: 13.5, fontWeight: 800, fontFamily: "var(--ui)", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, cursor: added ? "default" : "pointer" }}><Icon name={added ? "check" : "watch"} size={17} />{added ? "追加済み" : "ウォッチに追加"}</button>
            </div>
          );
        })}
      </div>
    </>
  );
}

function DBacktest() {
  const bt = window.AP.backtest;
  return (
    <>
      <DSectionTitle sub={bt.period + " ・ 過去データでルールを検証"}>バックテスト</DSectionTitle>
      <div style={{ display: "flex", gap: 14, marginBottom: 22 }}>
        <DKpi label="通知数" value={bt.summary.total} sub="件" />
        <DKpi label="勝率 (6ヶ月)" value={bt.summary.win + "%"} color="var(--mint-deep)" />
        <DKpi label="平均6ヶ月リターン" value={"+" + bt.summary.avgM6 + "%"} color="var(--mint-deep)" />
        <DKpi label="誤通知率" value={bt.summary.falseAlert + "%"} sub="要改善" color="var(--amber)" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16, marginBottom: 22 }}>
        {bt.rules.map((r) => (
          <div key={r.key} style={{ background: "var(--surface)", borderRadius: 20, border: "1px solid var(--card-line)", boxShadow: "var(--shadow)", padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: "var(--ink)", flex: 1 }}>{r.label}</span>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--ink-3)" }}>{r.n}件 ・ 勝率{r.win}%</span>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              {[["1ヶ月", r.m1], ["3ヶ月", r.m3], ["6ヶ月", r.m6]].map(([lb, v]) => (
                <div key={lb} style={{ flex: 1, background: "var(--surface-2)", borderRadius: 12, padding: "10px", textAlign: "center" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-3)" }}>{lb}</div>
                  <div style={{ marginTop: 3 }}><Pct v={v} big /></div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 11, fontSize: 12, fontWeight: 700 }}>
              <span style={{ color: "var(--ink-2)" }}>最大下落 <span style={{ color: "var(--urgent)" }}>{r.maxDD}%</span></span>
              <span style={{ color: "var(--ink-2)" }}>最大上昇 <span style={{ color: "var(--mint-deep)" }}>+{r.maxUp}%</span></span>
            </div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 13, fontWeight: 800, color: "var(--ink-2)", margin: "0 4px 11px" }}>直近通知のその後</div>
      <DTable head={[{ t: "銘柄" }, { t: "発火ルール" }, { t: "通知日" }, { t: "1ヶ月", r: true }, { t: "3ヶ月", r: true }, { t: "6ヶ月", r: true }]}>
        {bt.outcomes.map((o, i) => (
          <tr key={i}>
            <td style={{ padding: "12px 10px 12px 18px" }}><span style={{ display: "flex", alignItems: "center", gap: 7 }}><span style={{ width: 8, height: 8, borderRadius: 99, background: o.ok ? "var(--mint-deep)" : "var(--urgent)" }} /><span style={{ fontWeight: 700, fontSize: 13.5, color: "var(--ink)" }}>{o.name}</span><span style={{ fontSize: 11, color: "var(--ink-3)", fontWeight: 700 }}>{o.code}</span></span></td>
            <td style={{ padding: "12px 10px", fontSize: 12.5, fontWeight: 600, color: "var(--ink-2)" }}>{o.rule}</td>
            <td style={{ padding: "12px 10px", fontSize: 12.5, fontWeight: 600, color: "var(--ink-2)" }}>{o.at}</td>
            <td style={{ padding: "12px 10px", textAlign: "right" }}><Pct v={o.m1} /></td>
            <td style={{ padding: "12px 10px", textAlign: "right" }}><Pct v={o.m3} /></td>
            <td style={{ padding: "12px 18px 12px 10px", textAlign: "right" }}><Pct v={o.m6} /></td>
          </tr>
        ))}
      </DTable>
    </>
  );
}

function DReport() {
  const [copied, setCopied] = React.useState(false);
  const md = window.AP.report285A;
  const copy = () => { try { navigator.clipboard.writeText(md); } catch (e) {} setCopied(true); setTimeout(() => setCopied(false), 1600); };
  return (
    <>
      <DSectionTitle sub="reports / latest.md ・ 必要なものだけ AI に手動で投げる">レポート</DSectionTitle>
      <div style={{ maxWidth: 720, background: "var(--surface)", borderRadius: 22, border: "1px solid var(--card-line)", boxShadow: "var(--shadow)", padding: 36 }}>
        {renderMarkdown(md)}
        <button onClick={copy} style={{ height: 46, marginTop: 18, padding: "0 22px", borderRadius: 13, border: "none", background: copied ? "var(--mint-deep)" : "var(--accent)", color: "#fff", fontSize: 14, fontWeight: 800, fontFamily: "var(--ui)", display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer", boxShadow: "0 5px 14px var(--accent-shadow)" }}><Icon name={copied ? "check" : "copy"} size={18} />{copied ? "コピーしました" : "Markdownをコピー"}</button>
      </div>
    </>
  );
}

// ── desktop shell ───────────────────────────────────────────
const DESK_NAV = [
  { key: "dashboard", label: "ダッシュボード", icon: "home" },
  { key: "watchlist", label: "ウォッチリスト", icon: "watch" },
  { key: "ipo", label: "IPO検出", icon: "spark" },
  { key: "backtest", label: "バックテスト", icon: "arc" },
  { key: "report", label: "レポート", icon: "doc" },
];
function DesktopApp(props) {
  const { candidates, onOpen, onStatus, addedCodes, onAdd, scoreVariant, detail, onBack } = props;
  const [sec, setSec] = React.useState("dashboard");
  const lookup = [...candidates, ...window.AP.ipo];
  return (
    <div style={{ width: "min(1280px, 96vw)", height: "min(840px, 92vh)", display: "flex", background: "var(--bg)", borderRadius: 24, overflow: "hidden", boxShadow: "0 40px 90px rgba(120,60,90,0.22), 0 0 0 1px var(--card-line)", fontFamily: "var(--ui)", color: "var(--ink)" }}>
      {/* sidebar */}
      <div style={{ width: 232, flexShrink: 0, background: "var(--surface)", borderRight: "1px solid var(--line)", display: "flex", flexDirection: "column", padding: "22px 14px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "0 8px 22px" }}>
          <div style={{ width: 34, height: 34, borderRadius: 11, background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", boxShadow: "0 5px 14px var(--accent-shadow)" }}><Icon name="spark" size={19} /></div>
          <div>
            <div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 17, color: "var(--accent)", lineHeight: 1 }}>alpha-pon</div>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--ink-3)", marginTop: 2 }}>調査候補ファインダー</div>
          </div>
        </div>
        {DESK_NAV.map((n) => {
          const on = sec === n.key && !detail;
          return (
            <button key={n.key} onClick={() => { onBack(); setSec(n.key); }} style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 12px", borderRadius: 12, border: "none", background: on ? "var(--accent-soft)" : "transparent", color: on ? "var(--accent)" : "var(--ink-2)", fontSize: 13.5, fontWeight: on ? 800 : 600, fontFamily: "var(--ui)", cursor: "pointer", marginBottom: 2, textAlign: "left" }}>
              <Icon name={n.icon} size={19} strokeWidth={on ? 2.3 : 2} />{n.label}
            </button>
          );
        })}
        <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: 7, padding: "11px 12px", borderRadius: 12, background: "var(--accent-soft)" }}>
          <span style={{ color: "var(--accent)", display: "flex", flexShrink: 0 }}><Icon name="alert" size={15} /></span>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--disc-ink)", lineHeight: 1.4 }}>買い推奨ではありません。調査候補です。</span>
        </div>
      </div>
      {/* main */}
      <div style={{ flex: 1, overflowY: "auto", padding: "30px 34px 40px" }}>
        {detail ? <DDetail code={detail} onBack={onBack} onStatus={onStatus} scoreVariant={scoreVariant} lookup={lookup} />
          : sec === "dashboard" ? <DDashboard candidates={candidates} onOpen={onOpen} onStatus={onStatus} scoreVariant={scoreVariant} />
          : sec === "watchlist" ? <DWatchlist candidates={candidates} onOpen={onOpen} onStatus={onStatus} />
          : sec === "ipo" ? <DIpo onOpen={onOpen} addedCodes={addedCodes} onAdd={onAdd} />
          : sec === "backtest" ? <DBacktest />
          : <DReport />}
      </div>
    </div>
  );
}

// ── desktop detail ──────────────────────────────────────────
function DDetail({ code, onBack, onStatus, scoreVariant, lookup }) {
  const c = lookup.find((x) => x.code === code);
  const [checked, setChecked] = React.useState({});
  if (!c) return null;
  const total = window.AP.total(c.score), level = apLevel(total);
  const ReasonList = ({ items, tone }) => (
    <div style={{ background: "var(--surface)", borderRadius: 18, border: "1px solid var(--card-line)", boxShadow: "var(--shadow)", overflow: "hidden" }}>
      {items.map((r, i) => (
        <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 11, padding: "12px 16px", borderBottom: i < items.length - 1 ? "1px solid var(--line)" : "none" }}>
          <span style={{ width: 22, height: 22, borderRadius: 7, background: tone === "ok" ? "var(--mint-soft)" : "var(--amber-soft)", color: tone === "ok" ? "var(--mint-deep)" : "var(--amber)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}><Icon name={tone === "ok" ? "check" : "alert"} size={14} strokeWidth={2.6} /></span>
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", lineHeight: 1.45 }}>{r}</span>
        </div>
      ))}
    </div>
  );
  return (
    <>
      <button onClick={onBack} style={{ display: "inline-flex", alignItems: "center", gap: 6, border: "none", background: "transparent", color: "var(--ink-2)", fontSize: 13, fontWeight: 700, fontFamily: "var(--ui)", cursor: "pointer", marginBottom: 14, padding: 0 }}><Icon name="back" size={17} />戻る</button>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22 }}>
        <Prio p={c.priority} />
        <h2 style={{ margin: 0, fontFamily: "var(--display)", fontWeight: 700, fontSize: 26, color: "var(--ink)" }}>{c.name}</h2>
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-3)" }}>{c.code} ・ {c.market}</span>
        <span style={{ marginLeft: "auto" }} onClick={(e) => e.stopPropagation()}><DStatusSelect cand={c} onStatus={onStatus} /></span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 24, alignItems: "start" }}>
        <div style={{ background: "var(--surface)", borderRadius: 20, border: "1px solid var(--card-line)", boxShadow: "var(--shadow)", padding: 24 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}><ScoreViz variant={scoreVariant} cand={c} /></div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px", background: "var(--accent-soft)", borderRadius: 14, marginBottom: 14 }}>
            <span style={{ color: "var(--accent)", display: "flex", flexShrink: 0 }}><Icon name="spark" size={16} /></span>
            <div><div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--ink-3)" }}>発火ルール</div><div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>{c.triggeredRule}</div></div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div><div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-3)" }}>株価</div><div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 22, color: "var(--ink)" }}>¥{c.price.toLocaleString()} <span style={{ fontSize: 13, color: c.changePct >= 0 ? "var(--mint-deep)" : "var(--urgent)" }}>{c.changePct >= 0 ? "+" : ""}{c.changePct}%</span></div></div>
            <Sparkline data={c.sparkline} color="auto" w={110} h={40} />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 16 }}>{c.tags.map((t) => <Tag key={t}>#{t}</Tag>)}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "var(--ink-2)", display: "flex", alignItems: "center", gap: 6 }}><span style={{ color: "var(--mint-deep)", display: "flex" }}><Icon name="check" size={15} /></span>検出理由</div>
          <ReasonList items={c.reasons} tone="ok" />
          <div style={{ fontSize: 13, fontWeight: 800, color: "var(--ink-2)", margin: "10px 0 0", display: "flex", alignItems: "center", gap: 6 }}><span style={{ color: "var(--amber)", display: "flex" }}><Icon name="alert" size={15} /></span>注意点</div>
          <ReasonList items={c.negativeReasons} tone="warn" />
          <div style={{ fontSize: 13, fontWeight: 800, color: "var(--ink-2)", margin: "10px 0 0", display: "flex", alignItems: "center", gap: 6 }}><span style={{ color: "var(--ink-3)", display: "flex" }}><Icon name="doc" size={15} /></span>次に見るもの</div>
          <div style={{ background: "var(--surface)", borderRadius: 18, border: "1px solid var(--card-line)", boxShadow: "var(--shadow)", overflow: "hidden" }}>
            {c.nextToSee.map((r, i) => {
              const on = checked[i];
              return (
                <div key={i} onClick={() => setChecked((s) => ({ ...s, [i]: !s[i] }))} style={{ display: "flex", alignItems: "center", gap: 11, padding: "12px 16px", borderBottom: i < c.nextToSee.length - 1 ? "1px solid var(--line)" : "none", cursor: "pointer" }}>
                  <span style={{ width: 21, height: 21, borderRadius: 99, border: on ? "none" : "2px solid var(--line-strong)", background: on ? "var(--accent)" : "transparent", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{on && <Icon name="check" size={12} strokeWidth={3} />}</span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: on ? "var(--ink-3)" : "var(--ink)", textDecoration: on ? "line-through" : "none" }}>{r}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

Object.assign(window, { DesktopApp });
