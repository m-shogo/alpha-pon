/* alpha-pon — shared UI components */

// ── meta maps ───────────────────────────────────────────────
const AP_alert = {
  urgent: { jp: "即通知", en: "urgent", color: "var(--urgent)", soft: "var(--urgent-soft)" },
  daily:  { jp: "朝まとめ", en: "daily", color: "var(--amber)", soft: "var(--amber-soft)" },
  log:    { jp: "ログ",   en: "log",   color: "var(--sky-deep)", soft: "var(--sky-soft)" },
  ignore: { jp: "無視",   en: "ignore", color: "var(--ink-3)", soft: "rgba(0,0,0,0.04)" },
};
function apLevel(total) {
  if (total >= 85) return "urgent";
  if (total >= 70) return "daily";
  if (total >= 50) return "log";
  return "ignore";
}
const AP_status = {
  candidate: { jp: "候補",     color: "var(--sky-deep)", soft: "var(--sky-soft)" },
  research:  { jp: "調査",     color: "var(--lavender-deep)", soft: "var(--lavender-soft)" },
  watch:     { jp: "監視",     color: "var(--accent)", soft: "var(--accent-soft)" },
  active:    { jp: "本命",     color: "var(--mint-deep)", soft: "var(--mint-soft)" },
  ignore:    { jp: "除外",     color: "var(--ink-3)", soft: "rgba(0,0,0,0.04)" },
  expired:   { jp: "期限切れ", color: "var(--ink-3)", soft: "rgba(0,0,0,0.04)" },
};
const AP_prio = {
  S: { color: "#fff", bg: "var(--urgent)" },
  A: { color: "#fff", bg: "var(--accent)" },
  B: { color: "#fff", bg: "var(--sky-deep)" },
  C: { color: "var(--ink-2)", bg: "var(--line-strong)" },
};

// ── icons ───────────────────────────────────────────────────
function Icon({ name, size = 22, color = "currentColor", strokeWidth = 2 }) {
  const p = { fill: "none", stroke: color, strokeWidth, strokeLinecap: "round", strokeLinejoin: "round" };
  const paths = {
    home: <path {...p} d="M3 10.5 12 3l9 7.5M5 9.5V20h5v-6h4v6h5V9.5" />,
    watch: <g {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></g>,
    bell: <path {...p} d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6M10 21h4" />,
    doc: <g {...p}><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4M9 12h6M9 16h6" /></g>,
    chevron: <path {...p} d="m9 5 7 7-7 7" />,
    back: <path {...p} d="m15 5-7 7 7 7" />,
    check: <path {...p} d="m4 12 5 5L20 6" />,
    alert: <g {...p}><path d="M12 4 2 20h20z" /><path d="M12 10v5M12 18h.01" /></g>,
    spark: <path {...p} d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" />,
    copy: <g {...p}><rect x="8" y="8" width="12" height="12" rx="2.5" /><path d="M4 16V5a1 1 0 0 1 1-1h11" /></g>,
    up: <path {...p} d="m6 14 6-6 6 6" />,
    down: <path {...p} d="m6 10 6 6 6-6" />,
    filter: <path {...p} d="M3 5h18M6 12h12M10 19h4" />,
    sun: <g {...p}><circle cx="12" cy="12" r="4.2" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" /></g>,
    dot: <circle cx="12" cy="12" r="4" fill={color} stroke="none" />,
    arc: <path {...p} d="M4 18a8 8 0 1 1 16 0" />,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "block" }}>{paths[name]}</svg>;
}

// ── small pieces ────────────────────────────────────────────
function Badge({ children, color, soft, solid }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "3px 10px", borderRadius: 999, fontSize: 12.5, fontWeight: 700,
      color: solid ? "#fff" : color, background: solid ? color : soft,
      whiteSpace: "nowrap",
    }}>{children}</span>
  );
}
function AlertBadge({ level, dot }) {
  const a = AP_alert[level];
  return <Badge color={a.color} soft={a.soft}>
    {dot && <span style={{ width: 6, height: 6, borderRadius: 99, background: a.color }} />}
    {a.jp}
  </Badge>;
}
function StatusPill({ status }) {
  const s = AP_status[status];
  return <Badge color={s.color} soft={s.soft}>{s.jp}</Badge>;
}
function Prio({ p }) {
  const m = AP_prio[p];
  return <span style={{
    width: 22, height: 22, borderRadius: 7, background: m.bg, color: m.color,
    fontSize: 12.5, fontWeight: 800, display: "inline-flex", alignItems: "center",
    justifyContent: "center", flexShrink: 0,
  }}>{p}</span>;
}
function Tag({ children }) {
  return <span style={{
    fontSize: 11.5, fontWeight: 600, color: "var(--ink-2)",
    background: "var(--surface-2)", borderRadius: 7, padding: "3px 8px",
  }}>{children}</span>;
}

// ── sparkline ───────────────────────────────────────────────
function Sparkline({ data, w = 64, h = 24, color = "var(--accent)" }) {
  const min = Math.min(...data), max = Math.max(...data), rng = max - min || 1;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, h - ((v - min) / rng) * (h - 4) - 2]);
  const d = pts.map((pt, i) => (i ? "L" : "M") + pt[0].toFixed(1) + " " + pt[1].toFixed(1)).join(" ");
  const up = data[data.length - 1] >= data[0];
  const c = color === "auto" ? (up ? "var(--mint-deep)" : "var(--urgent)") : color;
  return (
    <svg width={w} height={h} style={{ display: "block", overflow: "visible" }}>
      <path d={d} fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.4" fill={c} />
    </svg>
  );
}

// ── score visualizations ────────────────────────────────────
function ScoreNumber({ total, level, big = false }) {
  const a = AP_alert[level];
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 2 }}>
        <span style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: big ? 88 : 40, lineHeight: 0.9, color: a.color }}>{total}</span>
        <span style={{ fontSize: big ? 22 : 14, fontWeight: 700, color: "var(--ink-3)" }}>/100</span>
      </div>
      <AlertBadge level={level} dot />
    </div>
  );
}

function ScoreRing({ total, level, size = 168 }) {
  const a = AP_alert[level];
  const r = size / 2 - 12, c = 2 * Math.PI * r, off = c * (1 - total / 100);
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--line-strong)" strokeWidth="12" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={a.color} strokeWidth="12"
          strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset .7s cubic-bezier(.3,1,.4,1)" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2 }}>
        <span style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: size * 0.34, lineHeight: 0.9, color: a.color }}>{total}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-3)", marginTop: -2 }}>/ 100</span>
        <div style={{ marginTop: 4 }}><AlertBadge level={level} /></div>
      </div>
    </div>
  );
}

function ScoreBars({ score, total, level }) {
  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 11 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 2 }}>
        <span style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 38, lineHeight: 1, color: AP_alert[level].color }}>{total}</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--ink-3)" }}>/100</span>
        <span style={{ marginLeft: "auto" }}><AlertBadge level={level} dot /></span>
      </div>
      {window.AP.CATS.map((cat) => {
        const v = score[cat.key];
        return (
          <div key={cat.key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 78, fontSize: 12.5, fontWeight: 600, color: "var(--ink-2)", flexShrink: 0 }}>{cat.label}</span>
            <div style={{ flex: 1, height: 9, borderRadius: 99, background: "var(--line-strong)", overflow: "hidden" }}>
              <div style={{ width: `${(v / cat.max) * 100}%`, height: "100%", borderRadius: 99, background: cat.color, transition: "width .6s cubic-bezier(.3,1,.4,1)" }} />
            </div>
            <span style={{ width: 42, textAlign: "right", fontSize: 12, fontWeight: 700, color: "var(--ink)", flexShrink: 0 }}>{v}<span style={{ color: "var(--ink-3)", fontWeight: 600 }}>/{cat.max}</span></span>
          </div>
        );
      })}
    </div>
  );
}

function ScoreRadar({ score, total, level, size = 200 }) {
  const cats = window.AP.CATS;
  const cx = size / 2, cy = size / 2, R = size / 2 - 28, n = cats.length;
  const ang = (i) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const pt = (i, f) => [cx + Math.cos(ang(i)) * R * f, cy + Math.sin(ang(i)) * R * f];
  const grid = (f) => cats.map((_, i) => pt(i, f).join(",")).join(" ");
  const poly = cats.map((c, i) => pt(i, score[c.key] / c.max).join(",")).join(" ");
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <svg width={size} height={size} style={{ overflow: "visible" }}>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <polygon key={f} points={grid(f)} fill="none" stroke="var(--line-strong)" strokeWidth="1" />
        ))}
        {cats.map((_, i) => { const [x, y] = pt(i, 1); return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--line-strong)" strokeWidth="1" />; })}
        <polygon points={poly} fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth="2.4" strokeLinejoin="round" />
        {cats.map((c, i) => { const [x, y] = pt(i, score[c.key] / c.max); return <circle key={i} cx={x} cy={y} r="3" fill={c.color} />; })}
        {cats.map((c, i) => {
          const [x, y] = pt(i, 1.22);
          return <text key={i} x={x} y={y} textAnchor="middle" dominantBaseline="middle"
            style={{ fontSize: 10.5, fontWeight: 700, fill: "var(--ink-2)", fontFamily: "var(--ui)" }}>{c.label}</text>;
        })}
      </svg>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 30, color: AP_alert[level].color }}>{total}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-3)" }}>/100</span>
        <span style={{ marginLeft: 4 }}><AlertBadge level={level} /></span>
      </div>
    </div>
  );
}

function ScoreViz({ variant, cand }) {
  const total = window.AP.total(cand.score);
  const level = apLevel(total);
  if (variant === "ring") return <ScoreRing total={total} level={level} />;
  if (variant === "bars") return <ScoreBars score={cand.score} total={total} level={level} />;
  if (variant === "radar") return <ScoreRadar score={cand.score} total={total} level={level} />;
  return <ScoreNumber total={total} level={level} big />;
}

// ── disclaimer (fixed) ──────────────────────────────────────
function DisclaimerBar() {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
      padding: "7px 14px", background: "var(--disc-bg)", borderTop: "1px solid var(--disc-line)",
    }}>
      <span style={{ color: "var(--accent)", display: "flex" }}><Icon name="alert" size={14} strokeWidth={2.2} /></span>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--disc-ink)", letterSpacing: 0.2 }}>
        買い推奨ではありません ・ これは調査候補です
      </span>
    </div>
  );
}

Object.assign(window, {
  AP_alert, apLevel, AP_status, AP_prio,
  Icon, Badge, AlertBadge, StatusPill, Prio, Tag, Sparkline,
  ScoreNumber, ScoreRing, ScoreBars, ScoreRadar, ScoreViz, DisclaimerBar,
});
