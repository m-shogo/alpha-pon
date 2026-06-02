/* alpha-pon — IPO screen, Backtest screen, Status bottom sheet */

// ── Status picker bottom sheet ──────────────────────────────
const STATUS_OPTS = ["candidate", "research", "watch", "active", "ignore", "expired"];
const STATUS_DESC = {
  candidate: "自動で見つけただけ",
  research: "調べる価値あり",
  watch: "買い場を監視中",
  active: "保有中 or 本命",
  ignore: "除外",
  expired: "期限切れ",
};
function StatusSheet({ cand, onPick, onClose }) {
  if (!cand) return null;
  return (
    <div onClick={onClose} style={{ position: "absolute", inset: 0, zIndex: 90, display: "flex", flexDirection: "column", justifyContent: "flex-end", background: "rgba(40,25,38,0.4)", backdropFilter: "blur(2px)" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--bg)", borderRadius: "26px 26px 0 0", padding: "10px 16px 30px", boxShadow: "0 -10px 40px rgba(0,0,0,0.2)", animation: "apSheet .26s cubic-bezier(.2,1,.3,1)" }}>
        <div style={{ width: 40, height: 5, borderRadius: 99, background: "var(--line-strong)", margin: "0 auto 12px" }} />
        <div style={{ display: "flex", alignItems: "baseline", gap: 7, padding: "0 4px 8px" }}>
          <span style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 17, color: "var(--ink)" }}>{cand.name}</span>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--ink-3)" }}>{cand.code}</span>
          <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: "var(--ink-3)" }}>status を変更</span>
        </div>
        {STATUS_OPTS.map((s) => {
          const m = AP_status[s], on = cand.status === s;
          return (
            <button key={s} onClick={() => onPick(s)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 12px", borderRadius: 14, border: "1px solid " + (on ? m.color : "transparent"), background: on ? m.soft : "transparent", cursor: "pointer", marginBottom: 2, textAlign: "left" }}>
              <span style={{ width: 12, height: 12, borderRadius: 99, background: m.color, flexShrink: 0 }} />
              <span style={{ flex: 1 }}>
                <span style={{ display: "block", fontSize: 14.5, fontWeight: 800, color: "var(--ink)" }}>{m.jp}</span>
                <span style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: "var(--ink-2)" }}>{STATUS_DESC[s]}</span>
              </span>
              {on && <span style={{ color: m.color, display: "flex" }}><Icon name="check" size={18} strokeWidth={2.8} /></span>}
            </button>
          );
        })}
        <p style={{ textAlign: "center", fontSize: 11, color: "var(--ink-3)", fontWeight: 600, margin: "8px 0 0" }}>削除ではなく status を変える設計です。</p>
      </div>
    </div>
  );
}

// ── IPO auto-detect screen ──────────────────────────────────
function IpoBadge({ score }) {
  const lvl = score >= 22 ? "var(--mint-deep)" : score >= 14 ? "var(--amber)" : "var(--ink-3)";
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 2 }}>
      <span style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 26, lineHeight: 0.9, color: lvl }}>{score}</span>
      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-3)" }}>/25</span>
    </div>
  );
}
function IpoScreen({ onBack, onOpen, addedCodes, onAdd }) {
  const pool = window.AP.ipo;
  const factors = window.AP.ipoFactors;
  return (
    <>
      <div style={{ position: "sticky", top: 0, zIndex: 8, padding: "50px 14px 12px", background: "var(--header-bg)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={onBack} style={{ width: 38, height: 38, borderRadius: 12, border: "1px solid var(--card-line)", background: "var(--surface)", color: "var(--ink)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><Icon name="back" size={20} /></button>
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--accent)" }}>v0.2 自動追加</div>
          <div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 20, color: "var(--ink)", lineHeight: 1 }}>IPO自動検出</div>
        </div>
      </div>
      <div style={{ padding: "14px 16px 0" }}>
        <p style={{ fontSize: 12.5, color: "var(--ink-2)", fontWeight: 600, lineHeight: 1.6, margin: "0 4px 6px" }}>
          JPX新規上場情報から、IPO後の売り圧力終了ルール（25点満点）で自動検出した銘柄です。ウォッチに追加すると status「候補」で監視を開始します。
        </p>
        {pool.map((c) => {
          const score = window.AP.ipoScore(c);
          const added = addedCodes.includes(c.code);
          return (
            <Card key={c.code} style={{ marginBottom: 12 }} pad={15}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }} onClick={() => onOpen(c.code)}>
                <Prio p={c.priority} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 16, color: "var(--ink)" }}>{c.name}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--ink-3)" }}>{c.code}</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--ink-2)", fontWeight: 600, marginTop: 2 }}>上場 {c.listingDate} ・ {c.daysSinceListing}日経過</div>
                </div>
                <IpoBadge score={score} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "12px 0" }}>
                {factors.map((f) => {
                  const ok = f.test(c);
                  return (
                    <div key={f.key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 600, color: ok ? "var(--ink)" : "var(--ink-3)" }}>
                      <span style={{ width: 18, height: 18, borderRadius: 6, background: ok ? "var(--mint-soft)" : "var(--surface-2)", color: ok ? "var(--mint-deep)" : "var(--ink-3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        {ok ? <Icon name="check" size={12} strokeWidth={3} /> : <span style={{ width: 5, height: 1.6, background: "var(--ink-3)", borderRadius: 9 }} />}
                      </span>
                      <span style={{ flex: 1 }}>{f.label}</span>
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: ok ? "var(--mint-deep)" : "var(--ink-3)" }}>+{ok ? f.pts : 0}</span>
                    </div>
                  );
                })}
              </div>
              <button disabled={added} onClick={() => onAdd(c.code)} style={{ width: "100%", height: 44, borderRadius: 13, border: added ? "1px solid var(--card-line)" : "none", background: added ? "var(--surface-2)" : "var(--accent)", color: added ? "var(--ink-2)" : "#fff", fontSize: 13.5, fontWeight: 800, fontFamily: "var(--ui)", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, cursor: added ? "default" : "pointer", boxShadow: added ? "none" : "0 5px 14px var(--accent-shadow)" }}>
                <Icon name={added ? "check" : "watch"} size={17} />{added ? "ウォッチに追加済み" : "ウォッチに追加"}
              </button>
            </Card>
          );
        })}
      </div>
    </>
  );
}

// ── Backtest screen ─────────────────────────────────────────
function Pct({ v, big }) {
  const c = v >= 0 ? "var(--mint-deep)" : "var(--urgent)";
  return <span style={{ color: c, fontWeight: 700, fontSize: big ? 15 : 12.5 }}>{v >= 0 ? "+" : ""}{v}%</span>;
}
function BacktestScreen({ onBack }) {
  const bt = window.AP.backtest;
  const kpi = (label, val, sub) => (
    <div style={{ flex: 1, background: "var(--surface)", borderRadius: 16, padding: "12px 12px", border: "1px solid var(--card-line)", boxShadow: "var(--shadow)" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-2)" }}>{label}</div>
      <div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 23, color: "var(--ink)", marginTop: 2 }}>{val}</div>
      {sub && <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--ink-3)" }}>{sub}</div>}
    </div>
  );
  return (
    <>
      <div style={{ position: "sticky", top: 0, zIndex: 8, padding: "50px 14px 12px", background: "var(--header-bg)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={onBack} style={{ width: 38, height: 38, borderRadius: 12, border: "1px solid var(--card-line)", background: "var(--surface)", color: "var(--ink)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><Icon name="back" size={20} /></button>
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--accent)" }}>{bt.period}</div>
          <div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 20, color: "var(--ink)", lineHeight: 1 }}>バックテスト</div>
        </div>
      </div>
      <div style={{ padding: "14px 16px 0" }}>
        <div style={{ display: "flex", gap: 9 }}>
          {kpi("通知数", bt.summary.total, "件")}
          {kpi("勝率", bt.summary.win + "%", "6ヶ月")}
          {kpi("平均6ヶ月", "+" + bt.summary.avgM6 + "%", "リターン")}
        </div>
        <SectionLabel icon={<Icon name="arc" size={15} />}>ルール別の実績（通知後リターン）</SectionLabel>
        {bt.rules.map((r) => (
          <Card key={r.key} style={{ marginBottom: 11 }} pad={15}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: "var(--ink)", flex: 1 }}>{r.label}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-3)" }}>{r.n}件 ・ 勝率{r.win}%</span>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 11 }}>
              {[["1ヶ月", r.m1], ["3ヶ月", r.m3], ["6ヶ月", r.m6]].map(([lb, v]) => (
                <div key={lb} style={{ flex: 1, background: "var(--surface-2)", borderRadius: 11, padding: "8px 8px", textAlign: "center" }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--ink-3)" }}>{lb}</div>
                  <div style={{ marginTop: 2 }}><Pct v={v} big /></div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 9, fontSize: 11.5, fontWeight: 700 }}>
              <span style={{ color: "var(--ink-2)" }}>最大下落 <span style={{ color: "var(--urgent)" }}>{r.maxDD}%</span></span>
              <span style={{ color: "var(--ink-2)" }}>最大上昇 <span style={{ color: "var(--mint-deep)" }}>+{r.maxUp}%</span></span>
            </div>
          </Card>
        ))}
        <SectionLabel icon={<Icon name="check" size={15} />}>直近通知のその後</SectionLabel>
        <Card pad={6}>
          <div style={{ display: "flex", padding: "8px 12px", fontSize: 10.5, fontWeight: 800, color: "var(--ink-3)" }}>
            <span style={{ flex: 1 }}>銘柄</span><span style={{ width: 48, textAlign: "right" }}>1M</span><span style={{ width: 48, textAlign: "right" }}>3M</span><span style={{ width: 48, textAlign: "right" }}>6M</span>
          </div>
          {bt.outcomes.map((o, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", padding: "9px 12px", borderTop: "1px solid var(--line)" }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 99, background: o.ok ? "var(--mint-deep)" : "var(--urgent)", flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.name}</span>
                </span>
                <span style={{ fontSize: 10.5, fontWeight: 600, color: "var(--ink-3)", marginLeft: 13 }}>{o.rule}</span>
              </span>
              <span style={{ width: 48, textAlign: "right" }}><Pct v={o.m1} /></span>
              <span style={{ width: 48, textAlign: "right" }}><Pct v={o.m3} /></span>
              <span style={{ width: 48, textAlign: "right" }}><Pct v={o.m6} /></span>
            </div>
          ))}
        </Card>
        <p style={{ textAlign: "center", fontSize: 11.5, color: "var(--ink-3)", fontWeight: 600, margin: "12px 0 4px", lineHeight: 1.6 }}>
          過去データでの検証結果です。将来の成果を保証するものではありません。
        </p>
      </div>
    </>
  );
}

Object.assign(window, { StatusSheet, STATUS_OPTS, STATUS_DESC, IpoScreen, BacktestScreen, Pct });
