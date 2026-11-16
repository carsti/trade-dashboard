"use strict";

// ================= Zustand =================
const S = {
  period: "all", group: "account", view: "dashboard", sub: null, chart: "equity", botView: "cards",
  report: null, state: null, cur: null,
  accFilter: new Set(),  // Konto-Keys; leer = alle Konten
  sort: { key: "net", asc: false }, search: "",
  selected: new Set(), selectionTouched: false,
  collapsed: new Set(),  // zugeklappte Konto-Gruppen in Karten/Tabelle
  colors: {},            // Bot-ID → Farbslot, nur für Bots im Vergleich (folgt dem Bot, nicht dem Rang)
  calMonth: null,        // [Jahr, Monat]; null = Monat des letzten Handelstags
};
const SERIES = ["--s1", "--s2", "--s3", "--s4", "--s5", "--s6", "--s7", "--s8"];
const VIEWS = { dashboard: "Dashboard", bots: "Bots", accounts: "Konten", analysis: "Analyse" };
const SUBS = { cards: "Karten", table: "Tabelle", compare: "Vergleich", symbols: "Symbole", time: "Wochentag & Uhrzeit", calendar: "Kalender" };
const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const IDLE_DAYS = 7;
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const nf = (d = 2) => new Intl.NumberFormat("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d });
const money = (v, cur = "") => v == null ? "–" : nf(2).format(v) + (cur ? " " + cur : "");
const signed = (v, cur) => v == null ? "–" : (v > 0 ? "+" : v < 0 ? "−" : "") + money(Math.abs(v), cur);
const pct = (v) => v == null ? "–" : (v > 0 ? "+" : v < 0 ? "−" : "") + nf(1).format(Math.abs(v)) + " %";
const cls = (v) => v > 0 ? "pos" : v < 0 ? "neg" : "";
const fmtDate = (t) => t ? new Date(t * 1000).toLocaleString("de-DE", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "–";
const fmtDay = (t) => new Date(t * 1000).toLocaleDateString("de-DE", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "2-digit" });
const trunc = (s, n) => s.length > n ? s.slice(0, n - 1) + "…" : s;
const short = (v) => {
  const a = Math.abs(v);
  if (a < 0.5) return "0";
  return (v < 0 ? "−" : "") + (a >= 1e6 ? nf(1).format(a / 1e6) + " M" : a >= 1e4 ? nf(0).format(a / 1e3) + " k" : nf(0).format(a));
};

async function api(path, body) {
  const opt = { headers: { "X-Token": window.API_TOKEN } };
  if (body !== undefined) { opt.method = "POST"; opt.body = JSON.stringify(body); opt.headers["Content-Type"] = "application/json"; }
  const r = await fetch(path, opt);
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}

// Farbverlauf zwischen zwei Hex-Farben (für die segmentierten Neon-Ringe)
function mix(a, b, t) {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return "#" + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("");
}
// Verlauf über mehrere Farben, t von 0 bis 1
function grad(stops, t) {
  const n = stops.length - 1, i = Math.min(n - 1, Math.floor(t * n));
  return mix(stops[i], stops[i + 1], t * n - i);
}
// Bunte Neon-Verläufe wie im Referenzdesign: jedes Element bekommt seinen eigenen.
// "Gut" sind kühle Töne (Cyan/Grün/Blau), "schlecht" warme (Pink/Rot/Orange) – der Wert steht immer als Text daneben.
const PAL = {
  gauge: [["#22d3ee", "#3b82f6", "#a855f7"], ["#f43f5e", "#ec4899", "#fb923c"], ["#2dd4bf", "#a3e635", "#facc15"]],
  good: [["#22d3ee", "#34d399"], ["#3b82f6", "#22d3ee"], ["#a855f7", "#22d3ee"], ["#10b981", "#a3e635"], ["#6366f1", "#38bdf8"]],
  bad: [["#ec4899", "#fb923c"], ["#d946ef", "#f43f5e"], ["#f43f5e", "#f59e0b"]],
  donut: [["#facc15", "#f472b6"], ["#22d3ee", "#a3e635"], ["#3b82f6", "#22d3ee"], ["#f472b6", "#a855f7"], ["#fb923c", "#d946ef"]],
};
const palOf = (list, i) => list[i % list.length];

// ================= Zeitraum =================
function periodRange() {
  const now = new Date();
  const day = (d) => Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 1000);
  switch (S.period) {
    case "today": return [day(now), null];
    case "7": case "30": case "90": return [day(now) - (+S.period - 1) * 86400, null];
    case "ytd": return [Math.floor(Date.UTC(now.getFullYear(), 0, 1) / 1000), null];
    case "custom": {
      const f = $("#dFrom").value, t = $("#dTo").value;
      return [f ? Date.parse(f) / 1000 : null, t ? Date.parse(t) / 1000 + 86400 : null];
    }
    default: return [null, null];
  }
}
const periodLabel = () => ({ today: "heute", 7: "7 Tage", 30: "30 Tage", 90: "90 Tage", ytd: "lfd. Jahr", all: "gesamt", custom: "Von/Bis" }[S.period]);
function query() {
  const [f, t] = periodRange();
  const p = new URLSearchParams({ group: S.group });
  if (f != null) p.set("from", f);
  if (t != null) p.set("to", t);
  if (S.accFilter.size) p.set("accounts", [...S.accFilter].join(","));
  return p.toString();
}

// ================= Laden & Rendern =================
// Nur die Antwort der jeweils letzten Anfrage zeichnen: sonst kann ein langsamer, älterer
// Abruf (z. B. der automatische) einen gerade gesetzten Filter oder Zeitraum wieder überschreiben.
let loadSeq = 0;
async function load() {
  const seq = ++loadSeq;
  try {
    const [state, report] = await Promise.all([api("/api/state"), api("/api/report?" + query())]);
    if (seq !== loadSeq) return;
    S.state = state; S.report = report;
    $("#btnQuit").hidden = state.remote;  // von anderen Geräten aus nicht den Server auf dem PC beenden
    // Filter auf inzwischen entfernte Konten verwerfen, sonst bliebe alles leer
    const keys = new Set(report.accounts.map((a) => a.key));
    if ([...S.accFilter].some((k) => !keys.has(k))) {
      S.accFilter = new Set([...S.accFilter].filter((k) => keys.has(k)));
      return load();
    }
    render();
  } catch (e) {
    $("#sideStatus").innerHTML = `<span class="err">Verbindung zum Dashboard-Dienst verloren: ${esc(e.message)}</span>`;
  }
}

const curTotals = () => S.report.totals.find((t) => t.currency === S.cur);

function render() {
  const { state, report } = S;
  $("#demoBadge").hidden = !state.demo;
  $$("#modeSeg button").forEach((b) => b.classList.toggle("on", (b.dataset.mode === "demo") === state.demo));
  $("#emptyState").hidden = state.accounts.length > 0;
  document.querySelector("main").classList.toggle("no-accounts", !state.accounts.length);
  const errs = report.accounts.filter((a) => a.status === "error").length;
  $("#sideStatus").innerHTML = [
    state.refreshing ? "Aktualisiere…" : state.last_refresh ? `Stand ${new Date(state.last_refresh * 1000).toLocaleTimeString("de-DE")}` : "Lade Daten…",
    `alle ${state.settings.refresh_seconds} s · Serverzeit`,
    `${report.accounts.length} ${report.accounts.length === 1 ? "Konto" : "Konten"} · ${report.bots.length} Bots`,
    errs ? `<span class="err">⚠ ${errs} Konto${errs > 1 ? "en" : ""} mit Fehler</span>` : "",
    !state.mt5_available && !state.demo ? `<span class="err">MetaTrader5-Paket nicht verfügbar</span>` : "",
  ].filter(Boolean).map((x) => `<span>${x}</span>`).join("");

  // Diagramme zeigen immer eine Währung; Standard ist die mit den meisten Trades
  if (!report.totals.some((t) => t.currency === S.cur)) {
    S.cur = [...report.totals].sort((a, b) => b.trades - a.trades)[0]?.currency ?? null;
    S.calMonth = null;
  }
  if (!S.selectionTouched) {
    const withTrades = report.bots.filter((b) => b.trades > 0 && b.currency === S.cur);
    S.selected = new Set([...withTrades.slice(0, 3), ...withTrades.slice(-1)].map((b) => b.id));
  }
  assignColors();
  renderMenuAccounts();
  renderFilterBar();
  renderCurSeg();
  // nur die sichtbare Ansicht zeichnen: Charts brauchen die echte Breite
  ({ dashboard: renderDashboard, bots: renderBotsView, accounts: renderAccounts, analysis: renderAnalysis })[S.view]();
  $("#btnCsv").href = "/api/export.csv?" + query() + "&token=" + encodeURIComponent(window.API_TOKEN);
}

// Farben gibt es nur für die (max. 8) Bots im Vergleich, damit auch bei vielen Bots jeder auswählbar ist
function assignColors() {
  for (const id of Object.keys(S.colors)) if (!S.selected.has(id)) delete S.colors[id];
  for (const id of S.selected) {
    if (id in S.colors) continue;
    const used = new Set(Object.values(S.colors)), free = SERIES.findIndex((_, i) => !used.has(i));
    if (free < 0) S.selected.delete(id); else S.colors[id] = free;
  }
}
const colorOf = (id) => id in S.colors ? css(SERIES[S.colors[id]]) : null;

// Hinweise je Bot: Risiko-Muster und Inaktivität (immer Symbol + Text, nie nur Farbe)
function flags(b) {
  const out = [];
  if (b.trades >= 20 && b.win_rate >= 65 && b.avg_loss && b.avg_win && b.avg_loss >= 3 * b.avg_win) {
    out.push({ k: "warn", t: "⚠ Risiko", d: `Hohe Trefferquote (${nf(0).format(b.win_rate)} %), aber Ø Verlust ist ${nf(1).format(b.avg_loss / b.avg_win)}× so groß wie Ø Gewinn – typisch für Grid/Martingale.` });
  }
  const idle = b.last_trade ? (Date.now() / 1000 - b.last_trade) / 86400 : null;
  if (idle != null && idle > IDLE_DAYS && !b.open_count) {
    out.push({ k: "idle", t: "◷ Inaktiv", d: `Letzter Trade vor ${nf(0).format(idle)} Tagen.` });
  }
  return out;
}

// ================= Filter, Währung, Menü =================
function renderFilterBar() {
  const bar = $("#filterBar");
  bar.hidden = !S.accFilter.size;
  if (!S.accFilter.size) return;
  const byKey = Object.fromEntries(S.report.accounts.map((a) => [a.key, a]));
  bar.innerHTML = `Gefiltert auf: ` + [...S.accFilter].map((k) => `<span class="chip">${esc(byKey[k]?.label ?? k)}<button data-k="${esc(k)}" aria-label="Filter entfernen">×</button></span>`).join("") +
    ` <button class="btn ghost" data-clear>Alle Konten zeigen</button>`;
}
$("#filterBar").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.k) S.accFilter.delete(b.dataset.k);
  else if (b.hasAttribute("data-clear")) S.accFilter.clear();
  else return;
  S.selectionTouched = false; load();
});
// Klick zeigt nur dieses Konto (erneuter Klick = wieder alle); mit Strg/Shift werden Konten hinzugefügt
function toggleAccount(key, additive = false) {
  if (key === "") S.accFilter.clear();
  else if (additive) S.accFilter.has(key) ? S.accFilter.delete(key) : S.accFilter.add(key);
  else S.accFilter = S.accFilter.size === 1 && S.accFilter.has(key) ? new Set() : new Set([key]);
  if (S.accFilter.size === S.report.accounts.length) S.accFilter.clear();
  S.selectionTouched = false; load();
}
function renderMenuAccounts() {
  const f = S.accFilter;
  $("#menuAccounts").innerHTML = `<button data-acc="" class="${f.size ? "" : "on"}">Alle Konten</button>` +
    S.report.accounts.map((a) => `<button data-acc="${esc(a.key)}" class="${f.has(a.key) ? "on" : ""}"><span class="dot ${a.status || "wait"}"></span>${esc(trunc(a.label, 20))}</button>`).join("");
}
$("#menuAccounts").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-acc]"); if (b) toggleAccount(b.dataset.acc, e.ctrlKey || e.metaKey || e.shiftKey);
});

function renderCurSeg() {
  const curs = S.report.totals.map((t) => t.currency);
  $("#curSeg").innerHTML = curs.length > 1 ? curs.map((c) => `<button data-cur="${esc(c)}" class="${c === S.cur ? "on" : ""}">${esc(c)}</button>`).join("") : "";
}
$("#curSeg").addEventListener("click", (e) => {
  const c = e.target.dataset.cur; if (!c) return;
  S.cur = c; S.selectionTouched = false; S.calMonth = null; render();
});

// ================= Tooltip & Achsen =================
const tip = $("#tooltip");
function showTip(e, html) {
  tip.innerHTML = html; tip.hidden = false;
  const r = tip.getBoundingClientRect();
  let x = e.clientX + 14, y = e.clientY + 14;
  if (x + r.width > innerWidth - 8) x = e.clientX - r.width - 14;
  if (y + r.height > innerHeight - 8) y = e.clientY - r.height - 14;
  tip.style.left = x + "px"; tip.style.top = y + "px";
}
const hideTip = () => { tip.hidden = true; };

function niceTicks(min, max, n = 5) {
  if (min === max) { min -= 1; max += 1; }
  const step0 = (max - min) / n, mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0);
  const ticks = [];
  for (let v = Math.floor(min / step) * step; ; v += step) {
    ticks.push(+v.toFixed(10));
    if (v >= max - step * 1e-9) break;
  }
  return ticks;
}
function timeFrame(el, t0, t1, vals, H = 290) {
  const W = el.clientWidth || 600, padL = 54, padR = 12, padT = 16, padB = 24;
  const yt = niceTicks(Math.min(0, ...vals), Math.max(0, ...vals), 5);
  const lo = yt[0], hi = yt[yt.length - 1];
  const x = (t) => padL + ((t - t0) / (t1 - t0 || 1)) * (W - padL - padR);
  const y = (v) => padT + (1 - (v - lo) / (hi - lo || 1)) * (H - padT - padB);
  let s = `<g class="grid">` + yt.map((v) => `<line x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}"/><text x="${padL - 6}" y="${y(v)}" text-anchor="end" dominant-baseline="middle">${short(v)}</text>`).join("");
  const nX = Math.max(2, Math.floor((W - padL) / 110));
  for (let i = 0; i <= nX; i++) { const t = t0 + (t1 - t0) * i / nX; s += `<text x="${x(t)}" y="${H - 6}" text-anchor="${i === 0 ? "start" : i === nX ? "end" : "middle"}">${fmtDay(t)}</text>`; }
  s += `</g><line class="zero" x1="${padL}" x2="${W - padR}" y1="${y(0)}" y2="${y(0)}"/>`;
  return { W, H, padL, padR, padT, padB, x, y, svg: s };
}
const hairSvg = (f) => `<line class="xhair" y1="${f.padT}" y2="${f.H - f.padB}" stroke="var(--text-muted)" stroke-dasharray="3 3" visibility="hidden"/><g class="xdots"></g>
  <rect x="${f.padL}" y="0" width="${f.W - f.padL - f.padR}" height="${f.H}" fill="transparent" class="hit"/>`;
function crosshair(el, f, t0, t1, onMove) {
  const svg = el.querySelector("svg"), xh = el.querySelector(".xhair"), dots = el.querySelector(".xdots");
  const hit = el.querySelector(".hit");
  hit.addEventListener("mousemove", (e) => {
    const r = svg.getBoundingClientRect();
    const px = (e.clientX - r.left) * (f.W / r.width);
    const t = t0 + ((px - f.padL) / (f.W - f.padL - f.padR)) * (t1 - t0);
    xh.setAttribute("x1", px); xh.setAttribute("x2", px); xh.setAttribute("visibility", "visible");
    onMove(e, t, px, dots);
  });
  hit.addEventListener("mouseleave", () => { hideTip(); xh.setAttribute("visibility", "hidden"); dots.innerHTML = ""; });
}
const valueAt = (curve, t) => { let v = 0; for (const p of curve) { if (p[0] <= t) v = p[1]; else break; } return v; };

let gradId = 0;
function sparkSvg(pts, color, W = 160, H = 44) {
  if (pts.length < 2) return "";
  const all = [[pts[0][0], 0], ...pts], xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const x = (t) => 2 + ((t - x0) / (x1 - x0 || 1)) * (W - 4), y = (v) => 2 + (1 - (v - y0) / (y1 - y0 || 1)) * (H - 4);
  const line = "M" + all.map((p) => `${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join("L");
  const id = "sg" + (++gradId);
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".35"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
    <path d="${line}L${x(x1)},${H}L${x(x0)},${H}Z" fill="url(#${id})"/><path d="${line}" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>`;
}

// ================= Dashboard =================
function renderDashboard() {
  const t = curTotals();
  renderGauges(t);
  renderHero();
  renderAccBars();
  renderMain();
  renderRanking();
  renderBotResults();
  renderCalendar();
  renderSymbolDonuts(t);
}

// Segmentierter Neon-Ring wie im Referenzdesign: Segmente laufen von Cyan nach Magenta
function neonGauge(value, big, small, stops) {
  const N = 44, r = 46, c = 56, v = Math.max(0, Math.min(100, value ?? 0)), on = Math.round(N * v / 100);
  let segs = "";
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * 2 * Math.PI - Math.PI / 2 + 0.03, a1 = ((i + 1) / N) * 2 * Math.PI - Math.PI / 2 - 0.03;
    const p = (ang, rr) => `${(c + rr * Math.cos(ang)).toFixed(2)},${(c + rr * Math.sin(ang)).toFixed(2)}`;
    const d = `M${p(a0, r)}A${r},${r} 0 0 1 ${p(a1, r)}`;
    segs += i < on ? `<path d="${d}" stroke="${grad(stops, i / Math.max(1, N - 1))}" stroke-width="9" fill="none"/>`
                   : `<path d="${d}" class="seg-off" stroke-width="9" fill="none"/>`;
  }
  return `<svg viewBox="0 0 112 112" role="img" aria-label="${esc(big)}">${segs}
    <text class="g-num" x="56" y="54" text-anchor="middle" dominant-baseline="middle">${esc(big)}</text>
    <text class="g-sub" x="56" y="74" text-anchor="middle">${esc(small)}</text></svg>`;
}
function renderGauges(t) {
  const set = (id, value, big, small, title, text) => {
    const stops = PAL.gauge[["#gWin", "#gBots", "#gDays"].indexOf(id)];
    $(id).innerHTML = `${neonGauge(value, big, small, stops)}<div class="g-title" style="color:${stops[0]}">${title}</div><div class="g-text">${text}</div>`;
  };
  const traded = S.report.bots.filter((b) => b.trades > 0 && b.currency === S.cur), plus = traded.filter((b) => b.net > 0).length;
  const days = t?.daily ?? [], gDays = days.filter((d) => d[1] > 0).length;
  const cur = S.report.totals.length > 1 && S.cur ? ` · ${esc(S.cur)}` : "";
  set("#gWin", t?.win_rate, t?.win_rate == null ? "–" : nf(0).format(t.win_rate) + "%", t?.profit_factor == null ? "PF –" : "PF " + nf(2).format(t.profit_factor),
    "Trefferquote", t ? `${nf(0).format(t.wins)} von ${nf(0).format(t.trades)} Trades im Plus${cur}` : "keine Trades");
  set("#gBots", traded.length ? 100 * plus / traded.length : null, `${plus}/${traded.length}`, "BOTS",
    "Bots im Plus", traded.length ? `${traded.length - plus} Bot${traded.length - plus === 1 ? "" : "s"} im Minus${cur}` : "keine Trades");
  set("#gDays", days.length ? 100 * gDays / days.length : null, days.length ? nf(0).format(100 * gDays / days.length) + "%" : "–", `${gDays}/${days.length} TAGE`,
    "Gewinntage", days.length ? `Ø Tag ${signed(days.reduce((s, d) => s + d[1], 0) / days.length, S.cur)}` : "keine Trades");
}
function renderHero() {
  const totals = S.report.totals;
  $("#hero").innerHTML = `<div class="h-label">Netto realisiert · ${periodLabel()}</div>` + (totals.length ? totals.map((t) => `
    <div class="h-row">
      <div class="h-big"><span class="h-pct ${t.return_pct < 0 ? "neg" : ""}" title="Rendite bezogen auf das Startkapital im Zeitraum">${pct(t.return_pct)}</span>
        <span class="h-val ${cls(t.net)}">${signed(t.net, t.currency)}</span></div>
      <div class="h-recent">Heute <b class="${cls(t.today)}">${signed(t.today)}</b> · 7 T <b class="${cls(t.d7)}">${signed(t.d7)}</b> · 30 T <b class="${cls(t.d30)}">${signed(t.d30)}</b></div>
      <div class="h-open">Offen <b class="${cls(t.floating)}">${signed(t.floating, t.currency)}</b> (${t.open_count}) · Equity ${money(t.equity, t.currency)}</div>
    </div>`).join("") : `<div class="muted">Keine Daten</div>`);
}
function renderAccBars() {
  const accs = S.report.accounts, f = S.accFilter;
  const max = Math.max(1e-9, ...accs.map((a) => Math.abs(a.return_pct ?? 0)));
  $("#accBars").innerHTML = `<div class="ph"><h2>Konten</h2><span class="muted small">Klick filtert · Strg+Klick mehrere</span></div>` + (accs.map((a, i) => {
    const w = 100 * Math.abs(a.return_pct ?? 0) / max, [c1, c2] = palOf((a.return_pct ?? a.net ?? 0) >= 0 ? PAL.good : PAL.bad, i);
    return `<button class="acc-bar ${f.size ? (f.has(a.key) ? "on" : "off") : ""}" data-key="${esc(a.key)}" aria-pressed="${f.has(a.key)}">
      <div class="t"><b><span class="dot ${a.status || "wait"}"></span>${esc(a.label)}</b><span class="${cls(a.net)}">${signed(a.net, a.currency)} · ${pct(a.return_pct)}</span></div>
      <div class="track"><i style="width:${Math.max(2, w).toFixed(1)}%;background:linear-gradient(90deg,${c1},${c2})"></i></div>
    </button>`;
  }).join("") || `<div class="muted">Keine aktiven Konten</div>`);
}
$("#accBars").addEventListener("click", (e) => { const b = e.target.closest(".acc-bar"); if (b) toggleAccount(b.dataset.key, e.ctrlKey || e.metaKey || e.shiftKey); });

// Hauptchart: kumuliert (Neon-Linie mit Markierung bester/schlechtester Tag) oder Tagesbalken
function renderMain() {
  const el = $("#mainChart"), t = curTotals();
  if (!t || !t.daily.length) { el.innerHTML = `<div class="empty-chart">Keine geschlossenen Trades im Zeitraum</div>`; return; }
  const [pf] = periodRange(), lineA = css("--neon-3"), lineB = css("--neon-4");
  if (S.chart === "equity") {
    const curve = t.curve, t0 = Math.min(pf ?? Infinity, curve[0][0] - 86400), t1 = Math.max(curve[curve.length - 1][0], t0 + 86400);
    const f = timeFrame(el, t0, t1, curve.map((p) => p[1]));
    const pts = [[t0, 0], ...curve];
    const line = "M" + pts.map((p) => `${f.x(p[0]).toFixed(1)},${f.y(p[1]).toFixed(1)}`).join("L");
    const area = `${line}L${f.x(pts[pts.length - 1][0]).toFixed(1)},${f.y(0).toFixed(1)}L${f.x(t0).toFixed(1)},${f.y(0).toFixed(1)}Z`;
    // Markierungen: bester und schlechtester Tag als Beschriftung an der Kurve
    const best = t.daily.reduce((a, d) => d[1] > a[1] ? d : a), worst = t.daily.reduce((a, d) => d[1] < a[1] ? d : a);
    // Bester Tag steht über der Kurve, schwächster darunter, damit sich die Beschriftungen nicht überdecken
    const ann = [[best, "Bester Tag", -1], [worst, "Schwächster Tag", 1]].filter(([d], i, arr) => i === 0 || d !== arr[0][0]).map(([d, lb, dir]) => {
      const tx = d[0] + 86400, px = f.x(tx), py = f.y(valueAt(curve, tx)), text = `${lb} ${signed(d[1])}`;
      const w = text.length * 6.2 + 14, bx = Math.min(Math.max(px - w / 2, f.padL), f.W - f.padR - w);
      const by = dir < 0 ? Math.max(2, py - 34) : Math.min(f.H - f.padB - 22, py + 14);
      return `<g class="ann"><line x1="${px}" x2="${px}" y1="${dir < 0 ? by + 20 : f.padT}" y2="${dir < 0 ? f.H - f.padB : by}" stroke="var(--text-muted)" stroke-opacity=".5"/>
        <circle cx="${px}" cy="${py}" r="4.5" fill="var(--surface-1)" stroke="${lineA}" stroke-width="2"/>
        <rect x="${bx}" y="${by}" width="${w}" height="20" rx="5"/><text x="${bx + w / 2}" y="${by + 14}" text-anchor="middle">${esc(text)}</text></g>`;
    }).join("");
    el.innerHTML = `<svg viewBox="0 0 ${f.W} ${f.H}" height="${f.H}" role="img" aria-label="Kumuliertes Netto ${esc(t.currency)}">
      <defs><linearGradient id="eqLine" x1="0" x2="1"><stop offset="0" stop-color="${lineB}"/><stop offset="1" stop-color="${lineA}"/></linearGradient>
        <linearGradient id="eqArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${lineB}" stop-opacity=".35"/><stop offset="1" stop-color="${lineB}" stop-opacity="0"/></linearGradient></defs>
      ${f.svg}<path d="${area}" fill="url(#eqArea)"/><path d="${line}" fill="none" stroke="url(#eqLine)" stroke-width="2.5" stroke-linejoin="round"/>${ann}${hairSvg(f)}</svg>`;
    crosshair(el, f, t0, t1, (e, tt, px, dots) => {
      const v = valueAt(curve, tt), day = t.daily.find((d) => d[0] <= tt && tt < d[0] + 86400);
      dots.innerHTML = `<circle cx="${px}" cy="${f.y(v)}" r="4" fill="${lineA}" stroke="var(--surface-1)" stroke-width="2"/>`;
      showTip(e, `<b>${fmtDay(tt)}</b><div class="row"><span>Kumuliert</span><span class="${cls(v)}">${signed(v, t.currency)}</span></div>` +
        (day ? `<div class="row"><span>Tag</span><span class="${cls(day[1])}">${signed(day[1], t.currency)}</span></div>` : ""));
    });
  } else {
    const days = t.daily, t0 = days[0][0], t1 = days[days.length - 1][0] + 86400;
    const f = timeFrame(el, t0, t1, days.map((d) => d[1]));
    const bw = Math.max(1, (f.x(t0 + 86400) - f.x(t0)) - 2), good = css("--good"), bad = css("--bad");
    const bars = days.map((d) => {
      const y0 = f.y(0), y1 = f.y(d[1]);
      return `<rect x="${(f.x(d[0]) + 1).toFixed(1)}" y="${Math.min(y0, y1).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1, Math.abs(y1 - y0)).toFixed(1)}" rx="${Math.min(3, bw / 2)}" fill="${d[1] >= 0 ? good : bad}"/>`;
    }).join("");
    el.innerHTML = `<svg viewBox="0 0 ${f.W} ${f.H}" height="${f.H}" role="img" aria-label="Tagesergebnis ${esc(t.currency)}">${f.svg}${bars}${hairSvg(f)}</svg>`;
    crosshair(el, f, t0, t1, (e, tt) => {
      const d = days.find((x) => x[0] <= tt && tt < x[0] + 86400);
      showTip(e, `<b>${fmtDay(tt)}</b><div class="row"><span>Netto</span><span class="${d ? cls(d[1]) : ""}">${d ? signed(d[1], t.currency) : "kein Trade"}</span></div>`);
    });
  }
}
$("#chartTabs").addEventListener("click", (e) => {
  const c = e.target.dataset.c; if (!c) return;
  S.chart = c;
  $$("#chartTabs button").forEach((b) => b.classList.toggle("on", b.dataset.c === c));
  renderMain();
});

// Ranking als bunte Segmentbalken, nach Rendite in % (vergleichbar zwischen großen und kleinen Konten).
// Bei vielen Bots: die besten 6 und die schwächsten 4, damit Verlierer nicht unter den Tisch fallen.
function renderRanking() {
  const key = (b) => b.return_pct ?? (b.net > 0 ? 0 : b.net < 0 ? -1e-9 : 0);
  const all = S.report.bots.filter((b) => b.trades > 0).sort((a, b) => key(b) - key(a) || b.net - a.net);
  const bots = all.length > 10 ? [...all.slice(0, 6), null, ...all.slice(-4)] : all;
  const max = Math.max(1e-9, ...all.map((b) => Math.abs(b.return_pct ?? 0)));
  const maxNet = Math.max(1e-9, ...all.map((b) => Math.abs(b.net)));
  let gi = 0, bi = 0;
  $("#ranking").innerHTML = bots.map((b) => {
    if (!b) return `<div class="rk-gap muted small">… ${all.length - 10} weitere · schwächste:</div>`;
    // ohne Rendite (kein Startkapital bekannt) nach Netto skalieren
    const rel = b.return_pct != null ? Math.abs(b.return_pct) / max : Math.abs(b.net) / maxNet;
    const n = Math.max(1, Math.round(20 * rel)), [c1, c2] = b.net >= 0 ? palOf(PAL.good, gi++) : palOf(PAL.bad, bi++);
    const segs = [...Array(20)].map((_, i) => i < n ? `<i style="background:${mix(c1, c2, i / 19)}"></i>` : "<i></i>").join("");
    return `<button class="rk" data-id="${esc(b.id)}" title="${esc(b.name)} · ${esc(b.accounts.join(", "))} – Klick öffnet die Bot-Karte">
      <span class="nm">${esc(b.name)}<small>${esc(trunc(b.accounts.join(", "), 18))}</small></span>
      <span class="v"><b class="${cls(b.return_pct ?? b.net)}">${pct(b.return_pct)}</b> <span class="muted">${b.net > 0 ? "+" : ""}${short(b.net)} ${esc(b.currency)}</span></span>
      <span class="segs">${segs}</span></button>`;
  }).join("") || `<div class="empty-chart">Keine geschlossenen Trades im Zeitraum</div>`;
}
$("#ranking").addEventListener("click", (e) => {
  const r = e.target.closest(".rk"); if (!r) return;
  openBotCard(r.dataset.id);
});
function openBotCard(id) {
  // Suchfilter leeren, sonst ist die Karte des Bots evtl. ausgeblendet
  S.search = ""; $("#search").value = ""; $("#topSearch").value = "";
  const bot = S.report.bots.find((b) => b.id === id);
  if (bot) S.collapsed.delete(accGroupKey(bot));
  setView("bots", "cards");
  const card = document.querySelector(`.bot[data-id="${CSS.escape(id)}"]`);
  if (card) { card.scrollIntoView({ behavior: "smooth", block: "center" }); card.classList.add("flash"); setTimeout(() => card.classList.remove("flash"), 1600); }
}

// Ein Eintrag pro Bot: Netto aller Trades im Zeitraum plus offene Positionen, statt einzelner Trades
function renderBotResults() {
  const bots = [...S.report.bots].sort((a, b) => b.result - a.result);
  const sums = {};
  bots.forEach((b) => { sums[b.currency] = (sums[b.currency] ?? 0) + b.result; });
  $("#botResults").innerHTML = bots.map((b) => `<button class="act" data-id="${esc(b.id)}" title="Klick öffnet die Bot-Karte">
      <span class="ic ${cls(b.result)}">${b.result >= 0 ? "▲" : "▼"}</span>
      <span class="nm">${esc(b.name)}<small>${esc(b.accounts.join(", "))} · ${b.trades} Trade${b.trades === 1 ? "" : "s"}${b.open_count ? ` · ${b.open_count} offen` : ""}</small></span>
      <span class="v"><b class="${cls(b.result)}">${signed(b.result, b.currency)}</b><small>${b.open_count ? `realisiert ${signed(b.net)} · offen ${signed(b.floating)}` : "realisiert"}</small></span>
    </button>`).join("") + `<div class="act-sums">` + Object.entries(sums).sort().map(([cur, v]) => `<div class="act act-sum">
      <span class="ic">Σ</span><span class="nm">Summe aller Bots<small>${esc(cur)}</small></span>
      <span class="v"><b class="${cls(v)}">${signed(v, cur)}</b></span></div>`).join("") + `</div>`;
  if (!bots.length) $("#botResults").innerHTML = `<div class="empty-chart">Keine Bots im Zeitraum</div>`;
}
$("#botResults").addEventListener("click", (e) => {
  const r = e.target.closest(".act[data-id]"); if (!r) return;
  openBotCard(r.dataset.id);
});

// Kalender (Dashboard und Analyse teilen sich den Monat)
function renderCalendar() {
  const t = curTotals(), days = new Map((t?.daily ?? []).map((d) => [d[0], d[1]]));
  if (!S.calMonth) {
    const last = t?.daily.length ? new Date(t.daily[t.daily.length - 1][0] * 1000) : new Date();
    S.calMonth = [last.getUTCFullYear(), last.getUTCMonth()];
  }
  const [yr, mo] = S.calMonth;
  const title = new Date(Date.UTC(yr, mo, 1)).toLocaleDateString("de-DE", { timeZone: "UTC", month: "long", year: "numeric" });
  const first = Date.UTC(yr, mo, 1) / 1000, n = new Date(Date.UTC(yr, mo + 1, 0)).getUTCDate();
  const lead = (new Date(first * 1000).getUTCDay() + 6) % 7;  // Montag zuerst
  const vals = [...Array(n)].map((_, i) => days.get(first + i * 86400));
  const max = Math.max(1e-9, ...vals.filter((v) => v != null).map(Math.abs));
  const now = new Date(), today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 1000;
  const good = css("--good"), bad = css("--bad");
  let h = WEEKDAYS.map((d) => `<div class="wd">${d}</div>`).join("") + `<div></div>`.repeat(lead);
  vals.forEach((v, i) => {
    const ts = first + i * 86400;
    const bg = v == null ? "" : `background:color-mix(in srgb, ${v >= 0 ? good : bad} ${Math.round(20 + 60 * Math.abs(v) / max)}%, var(--surface-2))`;
    h += `<div class="d ${v != null ? "has" : ""} ${ts === today ? "today" : ""}" style="${bg}" data-t="${ts}">${i + 1}${v != null ? `<b>${short(v)}</b>` : ""}</div>`;
  });
  const sum = vals.reduce((a, v) => a + (v ?? 0), 0), plus = vals.filter((v) => v > 0).length, minus = vals.filter((v) => v < 0).length;
  h += `<div class="sum"><span>${plus} Tage ▲ · ${minus} Tage ▼</span><b class="${cls(sum)}">${signed(sum, S.cur ?? "")}</b></div>`;
  $$("[data-cal-title]").forEach((el) => { el.textContent = title; });
  $$("[data-cal-grid]").forEach((el) => { el.innerHTML = h; });
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-cal]"); if (!b || !S.report) return;
  const d = new Date(Date.UTC(S.calMonth[0], S.calMonth[1] + +b.dataset.cal, 1));
  S.calMonth = [d.getUTCFullYear(), d.getUTCMonth()];
  renderCalendar();
});
document.addEventListener("mousemove", (e) => {
  const d = e.target.closest?.(".cal .d.has");
  if (!d) { if (e.target.closest?.(".cal")) hideTip(); return; }
  const v = curTotals()?.daily.find((x) => x[0] === +d.dataset.t)?.[1];
  showTip(e, `<b>${fmtDay(+d.dataset.t)}</b><div class="row"><span>Netto</span><span class="${cls(v)}">${signed(v, S.cur)}</span></div>`);
});
document.addEventListener("mouseout", (e) => { if (e.target.closest?.(".cal") && !e.relatedTarget?.closest?.(".cal")) hideTip(); });

// Donut-Reihe: die meistgehandelten Symbole mit Trefferquote
function renderSymbolDonuts(t) {
  const syms = [...(t?.by_symbol ?? [])].sort((a, b) => b.trades - a.trades).slice(0, 5);
  const r = 26, c = 2 * Math.PI * r;
  $("#symbolDonuts").innerHTML = syms.map((s, i) => { const [a, b] = palOf(PAL.donut, i); return `<div class="donut" title="${esc(s.symbol)}: ${s.trades} Trades, ${nf(1).format(s.win_rate)} % Treffer">
      <div class="box"><svg viewBox="0 0 64 64" role="img" aria-label="${esc(s.symbol)} ${nf(0).format(s.win_rate)} % Treffer">
        <defs><linearGradient id="dn${i}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
        <circle cx="32" cy="32" r="${r}" fill="none" stroke="var(--border)" stroke-width="6"/>
        <circle cx="32" cy="32" r="${r}" fill="none" stroke="url(#dn${i})" stroke-width="6" stroke-linecap="round"
          stroke-dasharray="${(c * s.win_rate / 100).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 32 32)"/>
        <text x="32" y="33" text-anchor="middle" dominant-baseline="middle">${nf(0).format(s.win_rate)}%</text></svg></div>
      <span class="pin" style="background:${a}"></span>
      <span class="lb">${esc(s.symbol)}<small class="${cls(s.net)}">${signed(s.net)}</small></span>
    </div>`; }).join("") || `<div class="empty-chart">Keine Trades im Zeitraum</div>`;
}

// ================= Bots =================
function renderBotsView() {
  renderLines();
  $("#botCards").hidden = S.botView !== "cards";
  $("#botTableWrap").hidden = S.botView !== "table";
  S.botView === "cards" ? renderCards(S.report.bots) : renderTable(S.report.bots);
}
function renderLines() {
  const el = $("#lineChart"), leg = $("#lineLegend");
  const chosen = S.report.bots.filter((b) => S.selected.has(b.id));
  const bots = chosen.filter((b) => b.curve.length && colorOf(b.id) && b.currency === S.cur);
  const hidden = chosen.length - bots.length;
  if (!bots.length) { leg.innerHTML = ""; el.innerHTML = `<div class="empty-chart">Bei den Bots unten „Vergleichen“ anhaken, um den Verlauf zu sehen</div>`; return; }
  // Legende je MT5-Konto; bei mehreren Konten unterscheidet zusätzlich die Strichart das Konto
  const groups = byAccount(bots), multi = groups.length > 1;
  const dashOf = (b) => multi ? DASHES[groups.findIndex((g) => g.bots.includes(b)) % DASHES.length] : "";
  const swatch = (b) => `<svg class="ln" viewBox="0 0 18 6" aria-hidden="true"><line x1="1" y1="3" x2="17" y2="3" stroke="${colorOf(b.id)}" stroke-width="2.5" stroke-dasharray="${dashOf(b)}"/></svg>`;
  leg.innerHTML = groups.map((g) => `<div class="leg-acc"><b>${esc(g.title)}${DASH_NAMES[DASHES.indexOf(dashOf(g.bots[0]))] ? ` <span class="muted">(${DASH_NAMES[DASHES.indexOf(dashOf(g.bots[0]))]})</span>` : ""}</b>` +
    g.bots.map((b) => `<span>${swatch(b)}${esc(b.name)}</span>`).join("") + `</div>`).join("") +
    (hidden ? `<span class="muted">${hidden} ausgeblendet (andere Währung als ${esc(S.cur)})</span>` : "");
  const [pf] = periodRange();
  const allT = bots.flatMap((b) => b.curve.map((p) => p[0]));
  const t0 = pf ?? Math.min(...allT), t1 = Math.max(...allT, t0 + 3600);
  const f = timeFrame(el, t0, t1, bots.flatMap((b) => b.curve.map((p) => p[1])));
  let s = f.svg;
  for (const b of bots) {
    const pts = [[t0, 0], ...b.curve];
    s += `<path d="M${pts.map((p) => `${f.x(p[0]).toFixed(1)},${f.y(p[1]).toFixed(1)}`).join("L")}" fill="none" stroke="${colorOf(b.id)}" stroke-width="2" stroke-linejoin="round"${dashOf(b) ? ` stroke-dasharray="${dashOf(b)}"` : ""}/>`;
  }
  el.innerHTML = `<svg viewBox="0 0 ${f.W} ${f.H}" height="${f.H}" role="img" aria-label="Kumulierter P&L je Bot">${s}${hairSvg(f)}</svg>`;
  crosshair(el, f, t0, t1, (e, t, px, dots) => {
    const rows = bots.map((b) => ({ b, v: valueAt(b.curve, t) })).sort((a, c) => c.v - a.v);
    dots.innerHTML = rows.map(({ b, v }) => `<circle cx="${px}" cy="${f.y(v)}" r="4" fill="${colorOf(b.id)}" stroke="var(--surface-1)" stroke-width="2"/>`).join("");
    showTip(e, `<b>${fmtDay(t)}</b>` + rows.map(({ b, v }) => `<div class="row"><span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${colorOf(b.id)};margin-right:5px"></span>${esc(trunc(b.name, 24))}${multi ? ` <span class="muted">· ${esc(trunc(accGroup(b).title, 16))}</span>` : ""}</span><span>${signed(v, b.currency)}</span></div>`).join(""));
  });
}
// ===== Gliederung nach MT5-Konto =====
// Pro Konto ist jeder Bot genau einem Konto zugeordnet; „zusammengefasst“ kann ein Bot auf mehreren Konten
// laufen, dann bekommt diese Kontokombination eine eigene Gruppe.
const DASHES = ["", "7 4", "2 3", "10 3 2 3"], DASH_NAMES = ["", "gestrichelt", "gepunktet", "Strich-Punkt"];
const accGroupKey = (b) => b.account_keys.join("+");
function accGroup(b) {
  const accs = b.account_keys.map((k) => S.report.accounts.find((a) => a.key === k)).filter(Boolean);
  const one = accs.length === 1 ? accs[0] : null;
  return {
    key: accGroupKey(b), accs,
    title: one ? one.label : b.accounts.join(" + "),
    meta: one ? `${one.login} · ${one.server}` : `auf ${b.accounts.length} Konten zusammengefasst`,
  };
}
function byAccount(rows) {
  const groups = new Map(), order = new Map(S.report.accounts.map((a, i) => [a.key, i]));
  for (const b of rows) {
    const k = accGroupKey(b);
    if (!groups.has(k)) groups.set(k, { ...accGroup(b), bots: [] });
    groups.get(k).bots.push(b);
  }
  // Reihenfolge wie in der Kontoliste, Kombinationen aus mehreren Konten am Ende
  const pos = (g) => g.accs.length === 1 ? order.get(g.accs[0].key) : 1e3 + g.accs.length;
  return [...groups.values()].sort((a, b) => pos(a) - pos(b));
}
function accHead(g) {
  const sums = {};
  for (const b of g.bots) sums[b.currency] = (sums[b.currency] || 0) + b.net;
  const st = g.accs.length === 1 ? g.accs[0].status : null;
  const won = g.bots.filter((b) => b.net > 0).length, lost = g.bots.filter((b) => b.net < 0).length;
  const sel = g.bots.filter((b) => S.selected.has(b.id)).length, open = !S.collapsed.has(g.key);
  return `<button class="acc-head" data-acc-group="${esc(g.key)}" aria-expanded="${open}">
    <em class="caret"></em>${st ? `<span class="dot ${st || "wait"}"></span>` : ""}
    <span class="ttl"><b>${esc(g.title)}</b><small>${esc(g.meta)}</small></span>
    <span class="spacer"></span>
    <span class="meta">${g.bots.length} ${g.bots.length === 1 ? "Bot" : "Bots"} · <span class="pos">▲ ${won}</span> · <span class="neg">▼ ${lost}</span>${sel ? ` · ${sel} im Vergleich` : ""}</span>
    <span class="sum">${Object.entries(sums).map(([c, v]) => `<b class="${cls(v)}">${signed(v, c)}</b>`).join(" ")}</span>
  </button>`;
}
function toggleAccGroup(key) {
  S.collapsed.has(key) ? S.collapsed.delete(key) : S.collapsed.add(key);
  renderBotsView();
}

function filteredSorted(bots) {
  const q = S.search.toLowerCase();
  const rows = bots.filter((b) => !q || (b.name + " " + b.accounts.join(" ") + " " + b.magics.join(" ") + " " + b.symbols.join(" ")).toLowerCase().includes(q));
  const { key, asc } = S.sort;
  return [...rows].sort((a, b) => {
    const va = a[key], vb = b[key];
    if (va == null) return 1; if (vb == null) return -1;
    const r = typeof va === "string" ? va.localeCompare(vb) : va - vb;
    return asc ? r : -r;
  });
}
// das Konto steht schon in der Gruppenüberschrift
const subline = (b) => `Magic ${b.magics.join(", ")}${b.symbols.length ? " · " + b.symbols.slice(0, 3).join(", ") : ""}`;
const selBox = (b) => `<input type="checkbox" class="sel" ${S.selected.has(b.id) ? "checked" : ""} ${!S.selected.has(b.id) && S.selected.size >= SERIES.length ? `disabled title="Höchstens ${SERIES.length} Bots gleichzeitig vergleichen"` : ""} aria-label="Im Vergleich anzeigen">`;
function renderCards(bots) {
  const groups = byAccount(filteredSorted(bots));
  $("#botCards").innerHTML = groups.map((g) => `<section class="acc-group${S.collapsed.has(g.key) ? " closed" : ""}">${accHead(g)}
    <div class="bot-cards"${S.collapsed.has(g.key) ? " hidden" : ""}>${g.bots.map(cardHtml).join("")}</div></section>`).join("") ||
    `<div class="panel muted">Keine Bots gefunden</div>`;
}
function cardHtml(b) {
  const color = colorOf(b.id), fl = flags(b);
  const tags = (b.trades ? [`<span class="pill ${cls(b.net)}">${b.net > 0 ? "▲ Profitabel" : "▼ Verlust"}</span>`] : [])
    .concat(fl.map((x) => `<span class="pill ${x.k}" title="${esc(x.d)}">${x.t}</span>`)).join("");
  return `<div class="panel bot" data-id="${esc(b.id)}">
    <div class="head"><span class="swatch" style="background:${color || "transparent"};${color ? "" : "border:1px solid var(--border)"}"></span>
      <div class="nm" title="Klicken zum Umbenennen">${esc(b.name)}<small>${esc(subline(b))}</small></div>
      <div class="tags">${tags}</div></div>
    <div class="mid"><div><div class="value ${cls(b.net)}">${signed(b.net, b.currency)}</div><div class="small muted">${pct(b.return_pct)} vom Konto</div></div>
      ${sparkSvg(b.curve, color || css("--neon-2"))}</div>
    <div class="stats">
      <div>Trades<b>${b.trades}</b></div>
      <div>Treffer<b>${b.win_rate == null ? "–" : nf(0).format(b.win_rate) + " %"}</b></div>
      <div>PF<b class="${b.profit_factor == null ? "" : b.profit_factor >= 1 ? "pos" : "neg"}">${b.profit_factor == null ? "–" : nf(2).format(b.profit_factor)}</b></div>
      <div>Max. DD<b>${short(b.max_drawdown)}</b></div>
    </div>
    ${fl.filter((x) => x.k === "warn").map((x) => `<div class="warnline">${esc(x.d)}</div>`).join("")}
    <div class="foot"><label>${selBox(b)} Vergleichen</label><span class="spacer"></span>
      ${b.open_count ? `Offen <b class="${cls(b.floating)}">${signed(b.floating)}</b> (${b.open_count}) · ` : ""}Letzter Trade ${fmtDate(b.last_trade)}</div>
  </div>`;
}
$("#botCards").addEventListener("click", (e) => {
  const head = e.target.closest(".acc-head"); if (head) return toggleAccGroup(head.dataset.accGroup);
  const card = e.target.closest(".bot[data-id]"); if (!card) return;
  const bot = S.report.bots.find((b) => b.id === card.dataset.id);
  if (e.target.classList.contains("sel")) return toggleSel(bot, e.target.checked);
  const nm = e.target.closest(".nm");
  if (nm && !nm.querySelector("input")) startRename(nm, bot);
});

const COLS = [
  { k: "sel", t: "", sort: false }, { k: "name", t: "Bot" }, { k: "flags", t: "", sort: false },
  { k: "net", t: "Netto", num: true }, { k: "return_pct", t: "Rendite", num: true }, { k: "trades", t: "Trades", num: true },
  { k: "win_rate", t: "Treffer %", num: true }, { k: "profit_factor", t: "PF", num: true }, { k: "avg_trade", t: "Ø Trade", num: true },
  { k: "max_drawdown", t: "Max. DD", num: true }, { k: "costs", t: "Kosten", num: true }, { k: "floating", t: "Offen", num: true },
  { k: "last_trade", t: "Letzter Trade", num: true },
];
function renderTable(bots) {
  const groups = byAccount(filteredSorted(bots)), { asc } = S.sort;
  const head = `<thead><tr>${COLS.map((c) => `<th data-k="${c.k}" class="${c.num ? "num" : ""} ${S.sort.key === c.k ? "sorted" + (asc ? " asc" : "") : ""}">${c.t}</th>`).join("")}</tr></thead>`;
  const row = (b) => {
    const color = colorOf(b.id);
    return `<tr data-id="${esc(b.id)}">
      <td>${selBox(b)}</td>
      <td class="name" title="Klicken zum Umbenennen"><span class="swatch" style="background:${color || "transparent"};${color ? "" : "border:1px solid var(--border)"}"></span>${esc(b.name)}<small>${esc(subline(b))}</small></td>
      <td>${flags(b).map((x) => `<span class="pill ${x.k}" title="${esc(x.d)}">${x.t}</span>`).join(" ")}</td>
      <td class="num ${cls(b.net)}"><b>${signed(b.net, b.currency)}</b></td>
      <td class="num ${cls(b.return_pct)}">${pct(b.return_pct)}</td>
      <td class="num">${b.trades}</td>
      <td class="num">${b.win_rate == null ? "–" : nf(1).format(b.win_rate)}</td>
      <td class="num">${b.profit_factor == null ? "–" : nf(2).format(b.profit_factor)}</td>
      <td class="num ${cls(b.avg_trade)}">${money(b.avg_trade)}</td>
      <td class="num">${money(b.max_drawdown)}</td>
      <td class="num">${money(b.costs)}</td>
      <td class="num ${cls(b.floating)}">${b.open_count ? signed(b.floating) + ` <span class="muted">(${b.open_count})</span>` : "–"}</td>
      <td class="num">${fmtDate(b.last_trade)}</td>
    </tr>`;
  };
  // innerhalb jedes Kontos sortiert, Konten bleiben getrennt
  const body = groups.map((g) => `<tr class="acc-row"><td colspan="${COLS.length}">${accHead(g)}</td></tr>` +
    (S.collapsed.has(g.key) ? "" : g.bots.map(row).join(""))).join("");
  $("#botTable").innerHTML = head + `<tbody>${body || `<tr><td colspan="${COLS.length}" class="muted">Keine Bots gefunden</td></tr>`}</tbody>`;
}
$("#botTable").addEventListener("click", (e) => {
  const head = e.target.closest(".acc-head"); if (head) return toggleAccGroup(head.dataset.accGroup);
  const th = e.target.closest("th");
  if (th) {
    const c = COLS.find((c) => c.k === th.dataset.k);
    if (c.sort === false) return;
    S.sort = S.sort.key === c.k ? { key: c.k, asc: !S.sort.asc } : { key: c.k, asc: c.k === "name" };
    return renderTable(S.report.bots);
  }
  const tr = e.target.closest("tr[data-id]"); if (!tr) return;
  const bot = S.report.bots.find((b) => b.id === tr.dataset.id);
  if (e.target.classList.contains("sel")) return toggleSel(bot, e.target.checked);
  const td = e.target.closest("td.name");
  if (td && !td.querySelector("input")) startRename(td, bot);
});
function toggleSel(bot, on) {
  S.selectionTouched = true;
  on ? S.selected.add(bot.id) : S.selected.delete(bot.id);
  assignColors();
  if (on && bot.currency !== S.cur) { S.cur = bot.currency; S.calMonth = null; renderCurSeg(); }
  renderBotsView();  // Farbmarken und gesperrte Häkchen aktualisieren
}
function startRename(el, bot) {
  // pro Konto: Name gilt für login:magic; zusammengefasst: für die Magic-Nummer(n) auf allen Konten
  const inp = document.createElement("input");
  inp.value = bot.name; inp.className = "renaming";
  el.innerHTML = ""; el.appendChild(inp); inp.focus(); inp.select();
  let done = false;
  const finish = async (save) => {
    if (done) return; done = true;
    if (save && inp.value.trim() !== bot.name) {
      const keys = S.group === "account" ? [bot.id] : bot.magics.map(String);
      for (const key of keys) await api("/api/bot-name", { key, name: inp.value });
    }
    load();
  };
  inp.addEventListener("keydown", (e) => { if (e.key === "Enter") finish(true); if (e.key === "Escape") finish(false); });
  inp.addEventListener("blur", () => finish(true));
}

// ================= Konten =================
function renderAccounts() {
  $("#accountCards").innerHTML = S.report.accounts.map((a) => {
    const cur = a.currency || "";
    return `<div class="panel acc">
      <h3><span class="dot ${a.status || "wait"}" title="${a.status === "ok" ? "verbunden" : "Fehler"}"></span>${esc(a.label)}</h3>
      <div class="muted small">${esc(a.login)} · ${esc(a.server)}</div>
      ${a.balance != null ? `<div class="kv">
        <span>Balance</span><span class="num">${money(a.balance, cur)}</span>
        <span>Equity</span><span class="num">${money(a.equity, cur)}</span>
        <span>Netto (${periodLabel()})</span><span class="num ${cls(a.net)}">${signed(a.net, cur)} · ${pct(a.return_pct)}</span>
        <span>Trades</span><span class="num">${a.trades}</span>
        <span>Offen</span><span class="num ${cls(a.floating)}">${signed(a.floating, cur)} (${a.open_count})</span>
        <span>Stand</span><span class="num">${a.updated ? new Date(a.updated * 1000).toLocaleTimeString("de-DE") : "–"}</span>
      </div>` : ""}
      ${a.error ? `<div class="err">⚠ ${esc(a.error)}</div>` : ""}
      <div class="acts"><button class="btn" data-filter="${esc(a.key)}">${S.accFilter.has(a.key) ? "Filter entfernen" : "Nur dieses Konto"}</button></div>
    </div>`;
  }).join("") || `<div class="muted">Keine aktiven Konten</div>`;
}
$("#accountCards").addEventListener("click", (e) => {
  const k = e.target.closest("[data-filter]")?.dataset.filter; if (k == null) return;
  if (S.accFilter.has(k)) { S.accFilter.delete(k); S.selectionTouched = false; load(); }
  else { toggleAccount(k); setView("dashboard"); }
});

// ================= Analyse =================
function renderAnalysis() {
  const t = curTotals();
  renderSymbolBars(t);
  vBars($("#weekdayChart"), WEEKDAYS, t?.by_weekday ?? []);
  vBars($("#hourChart"), [...Array(24)].map((_, h) => String(h)), t?.by_hour ?? []);
  renderCalendar();
}
function renderSymbolBars(t) {
  const rows = t?.by_symbol ?? [], max = Math.max(1e-9, ...rows.map((s) => Math.abs(s.net)));
  const g = [css("--neon-1"), css("--neon-4")], r = [css("--neon-3"), css("--bad")];
  $("#symbolBars").innerHTML = rows.map((s) => {
    const w = 50 * Math.abs(s.net) / max, [c1, c2] = s.net >= 0 ? g : r;
    const pos = s.net >= 0 ? `left:50%;width:${w}%` : `left:${50 - w}%;width:${w}%`;
    return `<div class="sym"><b>${esc(s.symbol)}</b>
      <div class="b"><span class="mid"></span><i style="${pos};background:linear-gradient(90deg,${c1},${c2})"></i></div>
      <span class="n ${cls(s.net)}">${signed(s.net, t.currency)}</span>
      <span class="m">${s.trades} Trades · ${nf(0).format(s.win_rate)} % Treffer</span></div>`;
  }).join("") || `<div class="empty-chart">Keine Trades im Zeitraum</div>`;
}
// Senkrechte Balken um die Nulllinie (Wochentage, Stunden)
function vBars(el, labels, data) {
  if (!data.some((d) => d[1])) { el.innerHTML = `<div class="empty-chart">Keine Trades im Zeitraum</div>`; return; }
  const W = el.clientWidth || 500, H = 240, padL = 48, padR = 8, padT = 10, padB = 22;
  const vals = data.map((d) => d[0]), yt = niceTicks(Math.min(0, ...vals), Math.max(0, ...vals), 4);
  const lo = yt[0], hi = yt[yt.length - 1], y = (v) => padT + (1 - (v - lo) / (hi - lo || 1)) * (H - padT - padB);
  const step = (W - padL - padR) / labels.length, bw = Math.max(2, Math.min(36, step - 4));
  const good = css("--good"), bad = css("--bad");
  let s = `<g class="grid">` + yt.map((v) => `<line x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}"/><text x="${padL - 6}" y="${y(v)}" text-anchor="end" dominant-baseline="middle">${short(v)}</text>`).join("") + `</g>`;
  data.forEach((d, i) => {
    const cx = padL + step * i + step / 2, y0 = y(0), y1 = y(d[0]);
    if (labels.length <= 12 || i % 2 === 0) s += `<text x="${cx}" y="${H - 6}" text-anchor="middle">${labels[i]}</text>`;
    s += `<g class="vb" data-i="${i}"><rect x="${cx - step / 2}" y="0" width="${step}" height="${H}" fill="transparent"/>` +
      (d[1] ? `<rect x="${cx - bw / 2}" y="${Math.min(y0, y1)}" width="${bw}" height="${Math.max(1, Math.abs(y1 - y0))}" rx="3" fill="${d[0] >= 0 ? good : bad}"/>` : "") + `</g>`;
  });
  s += `<line class="zero" x1="${padL}" x2="${W - padR}" y1="${y(0)}" y2="${y(0)}"/>`;
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img">${s}</svg>`;
  el.querySelectorAll(".vb").forEach((g) => {
    const d = data[+g.dataset.i], lb = labels[+g.dataset.i];
    g.addEventListener("mousemove", (e) => showTip(e, `<b>${labels.length === 24 ? lb + ":00–" + lb + ":59" : lb}</b><div class="row"><span>Netto</span><span class="${cls(d[0])}">${signed(d[0], S.cur)}</span></div><div class="row"><span>Trades</span><span>${d[1]}</span></div>`));
    g.addEventListener("mouseleave", hideTip);
  });
}

// ================= Kontodialog =================
const accDialog = $("#accDialog");
function openAccounts(newForm) {
  if (!S.state || !S.report) return;
  renderAccManage();
  $("#setMsg").textContent = "";
  const st = S.state.settings, f = $("#setForm");
  f.refresh_seconds.value = st.refresh_seconds; f.history_days.value = st.history_days; f.default_terminal_path.value = st.default_terminal_path;
  if (newForm) resetAccForm();
  accDialog.showModal();
}
function renderAccManage() {
  const statusById = Object.fromEntries(S.report.accounts.map((a) => [String(a.login), a]));
  $("#accManage").innerHTML = S.state.accounts.map((a) => {
    const st = statusById[String(a.login)];
    return `<div class="acc-item">
      <span class="dot ${a.enabled === false ? "wait" : st?.status || "wait"}"></span>
      <div class="meta"><b>${esc(a.label)}</b><small>${esc(a.login)} · ${esc(a.server)}${a.terminal_path ? " · " + esc(a.terminal_path) : ""}${a.enabled === false ? " · deaktiviert" : ""}${st?.error ? " · ⚠ " + esc(st.error) : ""}</small></div>
      <button class="btn" data-edit="${esc(a.id)}">Bearbeiten</button>
      <button class="btn danger" data-del="${esc(a.id)}">Entfernen</button>
    </div>`;
  }).join("") || `<div class="muted small">Noch keine Konten.</div>`;
}
$("#accManage").addEventListener("click", async (e) => {
  const ed = e.target.dataset.edit, del = e.target.dataset.del;
  if (ed) {
    const a = S.state.accounts.find((x) => x.id === ed), f = $("#accForm");
    f.id.value = a.id; f.label.value = a.label; f.login.value = a.login; f.server.value = a.server;
    f.password.value = ""; f.terminal_path.value = a.terminal_path || "";
    f.allow_switch.checked = !!a.allow_switch; f.enabled.checked = a.enabled !== false;
    $("#accFormTitle").textContent = "Konto bearbeiten"; $("#accMsg").textContent = "";
  }
  if (del && confirm("Konto wirklich entfernen? (Am MT5-Konto selbst ändert sich nichts.)")) {
    try {
      await api("/api/accounts/delete", { id: del });
      if ($("#accForm").id.value === del) resetAccForm();
      await load(); renderAccManage();
    } catch (err) { $("#accMsg").className = "small neg"; $("#accMsg").textContent = "⚠ " + err.message; }
  }
});
function resetAccForm() {
  const f = $("#accForm"); f.reset(); f.id.value = "";
  $("#accFormTitle").textContent = "Konto hinzufügen"; $("#accMsg").textContent = "";
}
$("#accForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target, msg = $("#accMsg");
  const body = Object.fromEntries(new FormData(f));
  body.allow_switch = f.allow_switch.checked; body.enabled = f.enabled.checked;
  msg.className = "small muted"; msg.textContent = "Verbinde…";
  try {
    const r = await api("/api/accounts", body);
    f.id.value = r.account;
    if (r.status.status === "ok") { msg.className = "small pos"; msg.textContent = `✓ Verbunden – Balance ${money(r.status.balance, r.status.currency)}`; }
    else { msg.className = "small neg"; msg.textContent = "⚠ " + r.status.error; }
    await load(); renderAccManage();
  } catch (err) { msg.className = "small neg"; msg.textContent = "⚠ " + err.message; }
});
$("#setForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = $("#setMsg");
  try {
    await api("/api/settings", Object.fromEntries(new FormData(e.target)));
    msg.className = "small pos"; msg.textContent = "✓ Gespeichert";
    await load();
  } catch (err) { msg.className = "small neg"; msg.textContent = "⚠ " + err.message; }
});

// ================= Navigation =================
// Jede Ansicht hat eine eigene Adresse (#/bots/tabelle …): Zurück/Vor im Browser und Lesezeichen funktionieren.
const SUB_SLUG = { cards: "karten", table: "tabelle", compare: "vergleich", symbols: "symbole", time: "zeit", calendar: "kalender" };
const VIEW_SLUG = { dashboard: "dashboard", bots: "bots", accounts: "konten", analysis: "analyse" };
const VIEW_SUBS = { bots: ["cards", "table", "compare"], analysis: ["symbols", "time", "calendar"] };
const hashOf = (v, sub) => "#/" + VIEW_SLUG[v] + (sub ? "/" + SUB_SLUG[sub] : "");
function parseHash() {
  const [v, sub] = location.hash.replace(/^#\/?/, "").split("/");
  const view = Object.keys(VIEW_SLUG).find((k) => VIEW_SLUG[k] === v);
  if (!view) return null;
  const s = Object.keys(SUB_SLUG).find((k) => SUB_SLUG[k] === sub);
  return [view, VIEW_SUBS[view]?.includes(s) ? s : null];
}
const sidebarCollapsed = () => $("#shell").classList.contains("collapsed") ||
  (matchMedia("(max-width: 900px)").matches && !$("#shell").classList.contains("expanded"));

function openGroup(g) {
  // Akkordeon: immer nur ein Menü offen
  $$("#menu .group").forEach((x) => x.classList.toggle("open", x === g && !!g));
  if (g && sidebarCollapsed()) {
    // eingeklappte Sidebar: Untermenü als Flyout neben dem Symbol
    const r = g.querySelector(".item").getBoundingClientRect();
    g.querySelector(".sub").style.top = Math.min(r.top, innerHeight - g.querySelector(".sub").offsetHeight - 8) + "px";
  }
}

function setView(v, sub = null) {
  if (!VIEWS[v]) v = "dashboard";
  if (sub && !VIEW_SUBS[v]?.includes(sub)) sub = null;
  S.view = v; S.sub = sub;
  if (location.hash !== hashOf(v, sub)) history.pushState(null, "", hashOf(v, sub));
  $$(".view").forEach((s) => { s.hidden = s.dataset.view !== v; });
  $$("#menu .item").forEach((b) => b.classList.toggle("on", b.dataset.view === v));
  $$("#menu .sub button[data-view]").forEach((b) => b.classList.toggle("on", b.dataset.view === v && b.dataset.sub === sub));
  if (sidebarCollapsed()) openGroup(null);
  else { const grp = document.querySelector(`.group[data-group="${v}"]`); if (grp && !grp.classList.contains("open")) openGroup(grp); }
  $("#viewTitle").textContent = VIEWS[v];
  $("#viewSub").textContent = SUBS[sub] ?? (v === "dashboard" ? "Übersicht" : "Alle");
  if (v === "bots" && (sub === "cards" || sub === "table")) setBotView(sub, false);
  try { localStorage.setItem("view", v); } catch (e) {}
  if (S.report) render();
  const target = { compare: "#comparePanel", symbols: "#anSymbols", time: "#anTime", calendar: "#anCalendar", table: "#botTableWrap" }[sub];
  if (target) setTimeout(() => $(target).scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  else scrollTo({ top: 0 });
}
addEventListener("popstate", () => { const h = parseHash(); setView(...(h ?? ["dashboard", null])); });

$("#menu").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.classList.contains("has-sub")) {
    const g = b.closest(".group");
    // Menü der aktuellen Ansicht (oder Einstellungen) nur auf-/zuklappen, sonst Ansicht wechseln und aufklappen
    if (sidebarCollapsed()) {
      // eingeklappt: Ansicht wechseln und Untermenü als Flyout zeigen (zweiter Klick schließt es)
      const wasOpen = g.classList.contains("open");
      if (b.dataset.view && S.view !== b.dataset.view) setView(b.dataset.view);
      return openGroup(wasOpen ? null : g);
    }
    if (!b.dataset.view || S.view === b.dataset.view) return openGroup(g.classList.contains("open") ? null : g);
  }
  if (b.dataset.view) setView(b.dataset.view, b.dataset.sub ?? null);
  else if (b.closest(".sub") && sidebarCollapsed()) openGroup(null);
});
// Flyout der eingeklappten Sidebar schließt bei Klick daneben
document.addEventListener("click", (e) => { if (sidebarCollapsed() && !e.target.closest("#menu")) openGroup(null); });
$("#btnBurger").addEventListener("click", () => {
  const sh = $("#shell");
  matchMedia("(max-width: 900px)").matches ? sh.classList.toggle("expanded") : sh.classList.toggle("collapsed");
  openGroup(sidebarCollapsed() ? null : document.querySelector(`.group[data-group="${S.view}"]`));
  setTimeout(() => S.report && render(), 50);
});

function setBotView(v, rerender = true) {
  S.botView = v;
  $$("#botViewSeg button").forEach((x) => x.classList.toggle("on", x.dataset.b === v));
  if (rerender && S.report) renderBotsView();
}
$("#botViewSeg").addEventListener("click", (e) => { const b = e.target.closest("button[data-b]"); if (b) setView("bots", b.dataset.b); });

$("#periodSeg").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  S.period = b.dataset.p;
  $$("#periodSeg button").forEach((x) => x.classList.toggle("on", x === b));
  $("#customRange").hidden = S.period !== "custom";
  S.selectionTouched = false; S.calMonth = null;
  load();
});
["#dFrom", "#dTo"].forEach((s) => $(s).addEventListener("change", load));
$("#groupSeg").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  S.group = b.dataset.g; S.selectionTouched = false; S.colors = {};
  $$("#groupSeg button").forEach((x) => x.classList.toggle("on", x === b));
  load();
});
$("#search").addEventListener("input", (e) => { S.search = e.target.value; $("#topSearch").value = S.search; renderBotsView(); });
// Suche oben: springt zu den Bots und filtert dort
$("#topSearch").addEventListener("input", (e) => {
  S.search = e.target.value; $("#search").value = S.search;
  if (S.view !== "bots") setView("bots", S.botView);
  else if (S.report) renderBotsView();
});
$("#topSearchForm").addEventListener("submit", (e) => { e.preventDefault(); setView("bots", S.botView); });
$("#btnRefresh").addEventListener("click", async (e) => {
  const b = e.currentTarget; b.classList.add("spin");
  try { await api("/api/refresh", {}); } catch (err) { /* Status zeigt den Fehler beim nächsten Laden */ }
  setTimeout(() => { load(); b.classList.remove("spin"); }, 1500);
});
// Demo-Daten ⇄ echte Konten
async function setMode(demo) {
  if (S.state && S.state.demo === demo) return;
  try {
    await api("/api/mode", { demo });
    S.accFilter.clear(); S.selectionTouched = false; S.colors = {}; S.cur = null; S.calMonth = null;
    setTimeout(load, 300); setTimeout(load, 1500);
  } catch (err) { alert("Umschalten fehlgeschlagen: " + err.message); }
}
$("#modeSeg").addEventListener("click", (e) => { const b = e.target.closest("button[data-mode]"); if (b) setMode(b.dataset.mode === "demo"); });
$("#demoBadge").addEventListener("click", () => setMode(false));
$("#btnAccounts").addEventListener("click", () => openAccounts(true));
$("#btnTheme").addEventListener("click", () => {
  const t = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem("theme", t); } catch (e) {}
  if (S.report) render();
});
$("#btnQuit").addEventListener("click", async () => {
  if (!confirm("Dashboard beenden?")) return;
  await api("/api/shutdown", {}).catch(() => {});
  document.body.innerHTML = `<div class="empty" style="margin:40px">Dashboard beendet. Dieses Fenster kann geschlossen werden.</div>`;
});
let resizeT; addEventListener("resize", () => { clearTimeout(resizeT); resizeT = setTimeout(() => S.report && render(), 150); });

{
  let start = parseHash();
  if (!start) { try { const v = localStorage.getItem("view"); start = [VIEWS[v] ? v : "dashboard", null]; } catch (e) { start = ["dashboard", null]; } }
  history.replaceState(null, "", hashOf(...start));
  setView(...start);
}
load();
setInterval(() => { if (!accDialog.open && !document.querySelector("input.renaming")) load(); }, 10000);
