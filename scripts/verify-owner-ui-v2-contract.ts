import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function assertRule(source: string, selector: RegExp, declaration: RegExp, message: string): void {
  const match = source.match(selector);
  assert(match, `${message}: selector missing`);
  assert(declaration.test(match[0]), message);
}

function assertAnyRule(source: string, selector: RegExp, declaration: RegExp, message: string): void {
  const matches = [...source.matchAll(selector)];
  assert(matches.length > 0, `${message}: selector missing`);
  assert(matches.some((match) => declaration.test(match[0])), message);
}

const nav = read("apps/web/components/NavBar.tsx");
const globals = read("apps/web/app/globals.css");
const ownerQa = read("apps/web/app/owner-ui-qa.css");
const shell = read("apps/web/components/AppShell.tsx");
const layout = read("apps/web/app/layout.tsx");
const reportViewer = read("apps/web/components/ReportViewer.module.css");
const calendar = read("apps/web/components/MarketEventCalendar.tsx");
const calendarCss = read("apps/web/app/calendar/CalendarV2.module.css");

assert(
  nav.includes("['/', '/research', '/stocks', '/alerts']"),
  "mobile primary navigation must stay limited to four destinations plus More",
);
assert(
  nav.includes("['/calendar', '/actions', '/reports', '/ops']"),
  "secondary mobile destinations must stay under More",
);
assertRule(
  globals,
  /\.ap-mobile-nav\s*\{[^}]*\}/s,
  /grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)/,
  "mobile navigation must remain a five-column non-scrolling grid",
);
assertRule(
  globals,
  /\.ap-mobile-nav-link\s*\{[^}]*\}/s,
  /min-height:\s*50px/,
  "primary mobile navigation targets must remain at least 50px high",
);
assertRule(
  globals,
  /\.ap-mobile-more-link\s*\{[^}]*\}/s,
  /min-height:\s*44px/,
  "More menu links must remain at least 44px high",
);
assert(
  globals.includes(":focus-visible"),
  "Owner UI must keep a global visible keyboard focus treatment",
);
assert(
  globals.includes("@media (prefers-reduced-motion: reduce)"),
  "Owner UI must keep reduced-motion handling",
);
assertRule(
  ownerQa,
  /\.ap-research-section-nav a\s*\{[^}]*\}/s,
  /min-height:\s*44px/,
  "research in-page navigation must remain at least 44px high on mobile",
);
assertRule(
  reportViewer,
  /\.tab\s*\{[^}]*\}/s,
  /min-height:\s*44px/,
  "report tabs must remain at least 44px high",
);
assertRule(
  reportViewer,
  /\.copy\s*\{[^}]*\}/s,
  /min-height:\s*44px/,
  "report copy control must remain at least 44px high",
);

assertRule(
  calendarCss,
  /\.actionButton,\s*\.actionLink\s*\{[^}]*\}/s,
  /min-height:\s*44px/,
  "calendar header actions must remain at least 44px high",
);
assertRule(
  calendarCss,
  /\.chip\s*\{[^}]*\}/s,
  /min-height:\s*44px/,
  "calendar filter chips must remain at least 44px high",
);
assertRule(
  calendarCss,
  /\.monthButton,\s*\.nextEventMonth\s*\{[^}]*\}/s,
  /min-height:\s*44px/,
  "calendar month controls must remain at least 44px high",
);
assertRule(
  calendarCss,
  /\.openDetailButton\s*\{[^}]*\}/s,
  /min-height:\s*44px/,
  "calendar detail control must remain at least 44px high",
);
assertAnyRule(
  calendarCss,
  /\.closeButton\s*\{[^}]*\}/g,
  /width:\s*44px/,
  "calendar modal close control must remain 44px wide",
);
assert(
  /@media\(max-width:767px\)[\s\S]*?\.subtitle\{[^}]*font-size:15px/.test(calendarCss),
  "calendar mobile primary copy must remain at least 15px",
);
assert(
  /@media\(max-width:767px\)[\s\S]*?\.calendarToolbar\{[^}]*grid-template-columns:44px minmax\(0,1fr\) 44px/.test(calendarCss),
  "calendar mobile month buttons must retain 44px columns",
);

const expectedShellWidths = [
  ["/calendar", 1180],
  ["/research", 1180],
  ["/ops", 960],
  ["/feed", 980],
  ["/world-impact", 1080],
  ["/world", 1080],
  ["/outcomes", 1080],
  ["/stocks", 1120],
  ["/alerts", 1120],
  ["/actions", 1120],
  ["/reports", 1120],
] as const;
for (const [route, width] of expectedShellWidths) {
  assert(
    shell.includes(`pathname.startsWith('${route}')) return ${width}`),
    `${route} must keep its Owner UI v2 desktop shell width of ${width}px`,
  );
}
assert(shell.includes("if (pathname === '/') return 1120"), "home must keep its 1120px desktop shell width");
assert(layout.includes("themeColor: '#F5F5F7'"), "viewport theme color must match the neutral Owner UI v2 background");
assert(calendar.includes("CalendarV2.module.css"), "live calendar must keep using Calendar V2 styles");
assert(
  !existsSync("apps/web/app/calendar/calendar.module.css"),
  "unused legacy calendar styles must not be reintroduced",
);

const primaryCopyChecks: Array<[string, RegExp, string]> = [
  [
    "apps/web/app/home.module.css",
    /@media \(max-width: 767px\)[\s\S]*?\.subtitle\s*\{[^}]*font-size:\s*15px/,
    "home mobile primary copy must remain at least 15px",
  ],
  [
    "apps/web/app/stocks/StocksPage.module.css",
    /@media \(max-width: 640px\)[\s\S]*?\.subtitle\s*\{[^}]*font-size:\s*15px/,
    "stocks mobile primary copy must remain at least 15px",
  ],
  [
    "apps/web/app/world/world.module.css",
    /@media \(max-width: 767px\)[\s\S]*?\.lead,\s*\.overviewText\s*\{[^}]*font-size:\s*15px/,
    "world mobile lead and overview must remain at least 15px",
  ],
  [
    "apps/web/app/outcomes/outcomes.module.css",
    /@media \(max-width: 767px\)[\s\S]*?\.lead\s*\{[^}]*font-size:\s*15px/,
    "outcomes mobile lead must remain at least 15px",
  ],
  [
    "apps/web/app/feed/feed.module.css",
    /\.lead\s*\{[^}]*font-size:\s*15px/,
    "feed primary lead must remain at least 15px",
  ],
  [
    "apps/web/app/world-impact/world-impact.module.css",
    /@media \(max-width: 767px\)[\s\S]*?\.lead\s*\{[^}]*font-size:\s*15px/,
    "world-impact mobile lead must remain at least 15px",
  ],
];
for (const [path, pattern, message] of primaryCopyChecks) {
  assert(pattern.test(read(path)), message);
}

const activeStyleFiles = [
  "apps/web/app/globals.css",
  "apps/web/app/calendar/CalendarV2.module.css",
  "apps/web/app/home.module.css",
  "apps/web/app/stocks/StocksPage.module.css",
  "apps/web/app/alerts/AlertsV2.module.css",
  "apps/web/app/actions/ActionsPage.module.css",
  "apps/web/app/reports/ReportsPage.module.css",
  "apps/web/app/outcomes/outcomes.module.css",
  "apps/web/app/world/world.module.css",
  "apps/web/app/world-impact/world-impact.module.css",
  "apps/web/app/feed/feed.module.css",
];
for (const path of activeStyleFiles) {
  const source = read(path);
  assert(
    !/font-size:\s*(?:9|10)px\b/.test(source),
    `${path} must not reintroduce 9–10px essential Owner UI text`,
  );
}

console.log("owner-ui-v2-contract-verification: ok");
