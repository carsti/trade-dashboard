"use strict";

// ---------- Zustand ----------
const S = {
  period: "all", group: "account", view: "overview", chart: "equity", botView: "cards",
  report: null, state: null, cur: null,
  accFilter: new Set(),  // Konto-Keys; leer = alle Konten
  sort: { key: "net", asc: false }, search: "",
  selected: new Set(), selectionTouched: false,
  colors: {},            // Bot-ID → Farbslot (folgt dem Bot, nicht dem Rang)
  calMonth: null,        // [Jahr, Monat] im Kalender; null = Monat des letzten Handelstags
};
const SERIES = ["--s1", "--s2", "--s3", "--s4", "--s5", "--s6", "--s7", "--s8"];
const VIEWS = { overview: "Übersicht", bots: "Bots", accounts: "Konten" };
const IDLE_DAYS = 7;
const $ = (s) => document.querySelector(s);
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

async function api(path, body) {
  const opt = { headers: { "X-Token": window.API_TOKEN } };
  if (body !== undefined) { opt.method = "POST"; opt.body = JSON.stringify(body); opt.headers["Content-Type"] = "application/json"; }
  const r = await fetch(path, opt);
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}

// ---------- Zeitraum ----------
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

// ---------- Laden ----------
async function load() {
  try {
    const [state, report] = await Promise.all([api("/api/state"), api("/api/report?" + query())]);
    S.state = state; S.report = report;
    render();
  } catch (e) {
    $("#statusLine").innerHTML = `<span class="err">Verbindung zum Dashboard-Dienst verloren: ${esc(e.message)}</span>`;
  }
}

function render() {
  const { state, report } = S;
  $("#demoBadge").hidden = !state.demo;
  $("#emptyState").hidden = state.accounts.length > 0;
  const errs = report.accounts.filter((a) => a.status === "error").length;
  $("#statusLine").innerHTML = (state.refreshing ? "Aktualisiere… " : "") +
    (state.last_refresh ? `Stand ${new Date(state.last_refresh * 1000).toLocaleTimeString("de-DE")} · alle ${state.settings.refresh_seconds} s` : "Lade Daten…") +
    (errs ? ` · <span class="err">${errs} Konto${errs > 1 ? "en" : ""} mit Fehler</span>` : "") +
    (!state.mt5_available && !state.demo ? ` · <span class="err">MetaTrader5-Paket nicht verfügbar</span>` : "") +
    ` · Serverzeit`;

  // Charts zeigen immer eine Währung; Standard ist die mit den meisten Trades
  const curs = report.totals.map((t) => t.currency);
  if (!curs.includes(S.cur)) S.cur = [...report.totals].sort((a, b) => b.trades - a.trades)[0]?.currency ?? null;

  assignColors(report.bots);
  if (!S.selectionTouched) {
    // Standard: die 3 besten und der schlechteste Bot der Chart-Währung
    const withTrades = report.bots.filter((b) => b.trades > 0 && b.currency === S.cur);
    S.selected = new Set([...withTrades.slice(0, 3), ...withTrades.slice(-1)].map((b) => b.id));
  }
  renderFilterBar();
  renderCurSeg();
  renderKpis(report.totals, report.bots);
  renderMain();
  renderAccMini(report.accounts);
  renderRank(report.bots);
  renderCalendar();
  renderLines();
  renderBots();
  renderAccounts(report.accounts);
  $("#btnCsv").href = "/api/export.csv?" + query() + "&token=" + encodeURIComponent(window.API_TOKEN);
}

function assignColors(bots) {
  for (const b of [...bots].sort((a, c) => a.id.localeCompare(c.id))) {
    if (!(b.id in S.colors)) S.colors[b.id] = Object.keys(S.colors).length;
  }
}
const colorOf = (id) => { const i = S.colors[id]; return i < SERIES.length ? css(SERIES[i]) : null; };

// Hinweise je Bot: Risiko-Muster und Inaktivität (immer mit Symbol + Text, nie nur Farbe)
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

// ---------- Filter & Währung ----------
function renderFilterBar() {
  const bar = $("#filterBar");
  bar.hidden = !S.accFilter.size;
  if (!S.accFilter.size) return;
  const byKey = Object.fromEntries(S.report.accounts.map((a) => [a.key, a]));
  bar.innerHTML = `Gefiltert auf: ` + [...S.accFilter].map((k) => `<span class="chip">${esc(byKey[k]?.label ?? k)}<button data-k="${esc(k)}" aria-label="Filter entfernen">×</button></span>`).join("") +
    ` <button class="btn ghost" data-clear>Alle Konten zeigen</button>`;
}
$("#filterBar").addEventListener("click", (e) => {
  const k = e.target.dataset.k;
  if (k) S.accFilter.delete(k);
  else if (e.target.hasAttribute("data-clear")) S.accFilter.clear();
  else return;
  S.selectionTouched = false; load();
});
function toggleAccount(key) {
  S.accFilter.has(key) ? S.accFilter.delete(key) : S.accFilter.add(key);
  if (S.accFilter.size === S.report.accounts.length) S.accFilter.clear();
  S.selectionTouched = false; load();
}

function renderCurSeg() {
  const curs = S.report.totals.map((t) => t.currency);
  $("#curSeg").innerHTML = curs.length > 1 ? curs.map((c) => `<button data-cur="${esc(c)}" class="${c === S.cur ? "on" : ""}">${esc(c)}</button>`).join("") : "";
}
$("#curSeg").addEventListener("click", (e) => {
  const c = e.target.dataset.cur; if (!c) return;
  S.cur = c; S.selectionTouched = false; S.calMonth = null; render();
});

// ---------- KPIs ----------
function sparkPath(pts, W, H, pad = 2) {
  if (pts.length < 2) return null;
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const x = (t) => pad + ((t - x0) / (x1 - x0 || 1)) * (W - 2 * pad);
  const y = (v) => pad + (1 - (v - y0) / (y1 - y0 || 1)) * (H - 2 * pad);
  const line = "M" + pts.map((p) => `${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join("L");
  return { line, area: `${line}L${x(x1).toFixed(1)},${H}L${x(x0).toFixed(1)},${H}Z` };
}
let gradId = 0;
function sparkSvg(pts, color, W = 200, H = 60) {
  const p = sparkPath([[pts[0]?.[0] ?? 0, 0], ...pts], W, H);
  if (!p) return "";
  const id = "g" + (++gradId);
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".35"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
    <path d="${p.area}" fill="url(#${id})"/><path d="${p.line}" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>`;
}
function gauge(value, label, sub) {
  const r = 30, c = 2 * Math.PI * r, v = Math.max(0, Math.min(100, value ?? 0));
  return `<div class="gauge"><svg viewBox="0 0 74 74" role="img" aria-label="${esc(label)} ${value == null ? "–" : nf(0).format(v) + " %"}">
    <circle class="track" cx="37" cy="37" r="${r}" fill="none" stroke-width="7"/>
    <circle cx="37" cy="37" r="${r}" fill="none" stroke="${css("--accent")}" stroke-width="7" stroke-linecap="round"
      stroke-dasharray="${(c * v / 100).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 37 37)"/>
    <text x="37" y="38" text-anchor="middle" dominant-baseline="middle">${value == null ? "–" : nf(0).format(v) + "%"}</text></svg>
    <span>${esc(label)}</span>${sub ? `<span>${sub}</span>` : ""}</div>`;
}
function renderKpis(totals, bots) {
  if (!totals.length) { $("#kpis").innerHTML = ""; return; }
  const multi = totals.length > 1, accent = css("--accent");
  const hero = totals.map((t) => `<div class="cur-row"><div>
      <div class="top"><span class="value ${cls(t.net)}">${signed(t.net, t.currency)}</span>
        ${t.return_pct != null ? `<span class="pill ${cls(t.return_pct)}" title="Bezogen auf das Startkapital im Zeitraum">${pct(t.return_pct)}</span>` : ""}</div>
      <div class="recent">Heute <b class="${cls(t.today)}">${signed(t.today)}</b> · 7 T <b class="${cls(t.d7)}">${signed(t.d7)}</b> · 30 T <b class="${cls(t.d30)}">${signed(t.d30)}</b></div>
      </div><div class="spark">${sparkSvg(t.curve, accent)}</div>
    </div>`).join("");
  const open = totals.map((t) => `<div class="cur-row">
      <div class="value ${cls(t.floating)}">${signed(t.floating, t.currency)}</div>
      <div class="sub">${t.open_count} Position${t.open_count === 1 ? "" : "en"} · Equity ${money(t.equity, t.currency)}</div></div>`).join("");
  const quality = `<div class="gauges">${totals.map((t) => gauge(t.win_rate, multi ? `Treffer ${t.currency}` : "Trefferquote",
      `PF <b class="${t.profit_factor == null ? "" : t.profit_factor >= 1 ? "pos" : "neg"}">${t.profit_factor == null ? "–" : nf(2).format(t.profit_factor)}</b>`)).join("")}</div>`;
  const traded = bots.filter((b) => b.trades > 0), plus = traded.filter((b) => b.net > 0).length;
  const warns = bots.filter((b) => flags(b).some((f) => f.k === "warn")).length;
  const botsCard = `<div class="gauges">${gauge(traded.length ? 100 * plus / traded.length : null, "im Plus")}
      <div><div class="value"><span class="pos">▲ ${plus}</span> <span class="muted">/</span> <span class="neg">▼ ${traded.length - plus}</span></div>
      <div class="sub">${warns ? `<span class="pill warn">⚠ ${warns} Risiko-Hinweis${warns > 1 ? "e" : ""}</span>` : "keine Risiko-Hinweise"}</div></div></div>`;
  $("#kpis").innerHTML = `
    <div class="card kpi hero"><div class="label">Netto realisiert · ${periodLabel()}</div>${hero}</div>
    <div class="card kpi mid"><div class="label">Offen (floating)</div>${open}</div>
    <div class="card kpi mid"><div class="label">Qualität</div>${quality}</div>
    <div class="card kpi mid"><div class="label">Bots</div>${botsCard}</div>`;
}

// ---------- Tooltip ----------
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
const short = (v) => {
  const a = Math.abs(v);
  if (a < 0.5) return "0";
  return (v < 0 ? "−" : "") + (a >= 1e6 ? nf(1).format(a / 1e6) + " M" : a >= 1e4 ? nf(0).format(a / 1e3) + " k" : nf(0).format(a));
};

// Gemeinsames Achsengerüst für Zeitreihen
function timeFrame(el, t0, t1, vals, H = 300) {
  const W = el.clientWidth || 600, padL = 54, padR = 10, padT = 10, padB = 24;
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
function crosshair(el, f, t0, t1, onMove) {
  const svg = el.querySelector("svg"), xh = el.querySelector("#xhair"), dots = el.querySelector("#xdots");
  const hit = el.querySelector("#hit");
  hit.addEventListener("mousemove", (e) => {
    const r = svg.getBoundingClientRect();
    const px = (e.clientX - r.left) * (f.W / r.width);
    const t = t0 + ((px - f.padL) / (f.W - f.padL - f.padR)) * (t1 - t0);
    xh.setAttribute("x1", px); xh.setAttribute("x2", px); xh.setAttribute("visibility", "visible");
    onMove(e, t, px, dots);
  });
  hit.addEventListener("mouseleave", () => { hideTip(); xh.setAttribute("visibility", "hidden"); dots.innerHTML = ""; });
}
const hairSvg = (f) => `<line id="xhair" y1="${f.padT}" y2="${f.H - f.padB}" stroke="var(--text-muted)" stroke-dasharray="3 3" visibility="hidden"/><g id="xdots"></g>
  <rect x="${f.padL}" y="0" width="${f.W - f.padL - f.padR}" height="${f.H}" fill="transparent" id="hit"/>`;
const valueAt = (curve, t) => { let v = 0; for (const p of curve) { if (p[0] <= t) v = p[1]; else break; } return v; };

// ---------- Hauptchart: kumuliert oder Tagesergebnis (eine Währung) ----------
function renderMain() {
  const el = $("#mainChart"), t = S.report.totals.find((x) => x.currency === S.cur);
  if (!t || !t.daily.length) { el.innerHTML = `<div class="empty-chart">Keine geschlossenen Trades im Zeitraum</div>`; return; }
  const [pf] = periodRange();
  if (S.chart === "equity") {
    const curve = t.curve, t0 = Math.min(pf ?? Infinity, curve[0][0] - 86400), t1 = Math.max(curve[curve.length - 1][0], t0 + 86400);
    const f = timeFrame(el, t0, t1, curve.map((p) => p[1]));
    const pts = [[t0, 0], ...curve], acc = css("--accent");
    const line = "M" + pts.map((p) => `${f.x(p[0]).toFixed(1)},${f.y(p[1]).toFixed(1)}`).join("L");
    const area = `${line}L${f.x(pts[pts.length - 1][0]).toFixed(1)},${f.y(0).toFixed(1)}L${f.x(t0).toFixed(1)},${f.y(0).toFixed(1)}Z`;
    el.innerHTML = `<svg viewBox="0 0 ${f.W} ${f.H}" height="${f.H}" role="img" aria-label="Kumuliertes Netto ${esc(t.currency)}">
      <defs><linearGradient id="eqg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${acc}" stop-opacity=".35"/><stop offset="1" stop-color="${acc}" stop-opacity="0"/></linearGradient></defs>
      ${f.svg}<path d="${area}" fill="url(#eqg)"/><path d="${line}" fill="none" stroke="${acc}" stroke-width="2" stroke-linejoin="round"/>${hairSvg(f)}</svg>`;
    crosshair(el, f, t0, t1, (e, tt, px, dots) => {
      const v = valueAt(curve, tt), day = t.daily.find((d) => d[0] <= tt && tt < d[0] + 86400);
      dots.innerHTML = `<circle cx="${px}" cy="${f.y(v)}" r="4" fill="${acc}" stroke="var(--surface-1)" stroke-width="2"/>`;
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
  $("#chartTabs").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.c === c));
  renderMain();
});

// ---------- Konten (Übersicht) ----------
function renderAccMini(accs) {
  $("#accList").innerHTML = accs.map((a) => {
    const cur = a.currency || "", f = S.accFilter;
    return `<button class="acc-row ${f.size ? (f.has(a.key) ? "on" : "off") : ""}" data-key="${esc(a.key)}" aria-pressed="${f.has(a.key)}">
      <span class="dot ${a.status || "wait"}" title="${a.status === "ok" ? "verbunden" : "Fehler"}"></span>
      <span class="nm">${esc(a.label)}<small>${a.error ? "⚠ " + esc(trunc(a.error, 40)) : `Balance ${short(a.balance ?? 0)} ${esc(cur)}`}</small></span>
      <span class="r"><span class="${cls(a.net)}">${signed(a.net, cur)}</span><small>${pct(a.return_pct)} · ${a.trades} Trades</small></span>
    </button>`;
  }).join("") || `<div class="muted">Keine aktiven Konten</div>`;
}
$("#accList").addEventListener("click", (e) => {
  const b = e.target.closest(".acc-row"); if (b) toggleAccount(b.dataset.key);
});

// ---------- Top & Flop (nach Rendite %, damit große und kleine Konten vergleichbar sind) ----------
function renderRank(bots) {
  const traded = bots.filter((b) => b.trades > 0);
  const top = traded.filter((b) => b.net > 0).sort((a, b) => (b.return_pct ?? 0) - (a.return_pct ?? 0)).slice(0, 5);
  const flop = traded.filter((b) => b.net < 0).sort((a, b) => (a.return_pct ?? 0) - (b.return_pct ?? 0)).slice(0, 5);
  const max = Math.max(1e-9, ...[...top, ...flop].map((b) => Math.abs(b.return_pct ?? 0)));
  const row = (b) => `<div class="rank-row" data-id="${esc(b.id)}" title="Zum Bot springen">
      <span class="nm">${esc(b.name)}<small>${esc(b.accounts.join(", "))}</small></span>
      <span class="num"><b class="${cls(b.net)}">${signed(b.net, b.currency)}</b> <span class="muted small">${pct(b.return_pct)}</span></span>
      <span class="meter"><i style="width:${(100 * Math.abs(b.return_pct ?? 0) / max).toFixed(1)}%;background:${b.net >= 0 ? css("--good") : css("--bad")}"></i></span>
    </div>`;
  $("#rank").innerHTML = traded.length
    ? `<div class="rank-col"><h3>▲ Beste Bots</h3>${top.map(row).join("") || `<span class="muted small">Kein Bot im Plus</span>`}</div>
       <div class="rank-col"><h3>▼ Schwächste Bots</h3>${flop.map(row).join("") || `<span class="muted small">Kein Bot im Minus</span>`}</div>`
    : `<div class="empty-chart">Keine geschlossenen Trades im Zeitraum</div>`;
}
$("#rank").addEventListener("click", (e) => {
  const r = e.target.closest(".rank-row"); if (!r) return;
  setView("bots");
  const card = document.querySelector(`.bot[data-id="${CSS.escape(r.dataset.id)}"]`);
  if (card) { card.scrollIntoView({ behavior: "smooth", block: "center" }); card.classList.add("flash"); setTimeout(() => card.classList.remove("flash"), 1600); }
});

// ---------- Kalender: Tagesergebnis eines Monats ----------
function renderCalendar() {
  const el = $("#calendar"), t = S.report.totals.find((x) => x.currency === S.cur);
  const days = new Map((t?.daily ?? []).map((d) => [d[0], d[1]]));
  if (!S.calMonth) {
    const last = t?.daily.length ? new Date(t.daily[t.daily.length - 1][0] * 1000) : new Date();
    S.calMonth = [last.getUTCFullYear(), last.getUTCMonth()];
  }
  const [yr, mo] = S.calMonth;
  $("#calTitle").textContent = new Date(Date.UTC(yr, mo, 1)).toLocaleDateString("de-DE", { timeZone: "UTC", month: "long", year: "numeric" });
  const first = Date.UTC(yr, mo, 1) / 1000, n = new Date(Date.UTC(yr, mo + 1, 0)).getUTCDate();
  const lead = (new Date(first * 1000).getUTCDay() + 6) % 7;  // Montag zuerst
  const vals = [...Array(n)].map((_, i) => days.get(first + i * 86400));
  const max = Math.max(1e-9, ...vals.filter((v) => v != null).map(Math.abs));
  const now = new Date(), today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 1000;
  const good = css("--good"), bad = css("--bad");
  let h = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((d) => `<div class="wd">${d}</div>`).join("") + `<div></div>`.repeat(lead);
  vals.forEach((v, i) => {
    const ts = first + i * 86400;
    const bg = v == null ? "" : `background:color-mix(in srgb, ${v >= 0 ? good : bad} ${Math.round(18 + 62 * Math.abs(v) / max)}%, var(--surface-2))`;
    h += `<div class="d ${v != null ? "has" : ""} ${ts === today ? "today" : ""}" style="${bg}" data-t="${ts}">${i + 1}${v != null ? `<b>${short(v)}</b>` : ""}</div>`;
  });
  const sum = vals.reduce((a, v) => a + (v ?? 0), 0), plus = vals.filter((v) => v > 0).length, minus = vals.filter((v) => v < 0).length;
  h += `<div class="sum"><span>${plus} Tage ▲ · ${minus} Tage ▼</span><b class="${cls(sum)}">${signed(sum, S.cur ?? "")}</b></div>`;
  el.innerHTML = h;
}
$("#calendar").addEventListener("mousemove", (e) => {
  const d = e.target.closest(".d.has"); if (!d) return hideTip();
  const t = S.report.totals.find((x) => x.currency === S.cur), v = t.daily.find((x) => x[0] === +d.dataset.t)?.[1];
  showTip(e, `<b>${fmtDay(+d.dataset.t)}</b><div class="row"><span>Netto</span><span class="${cls(v)}">${signed(v, S.cur)}</span></div>`);
});
$("#calendar").addEventListener("mouseleave", hideTip);
[["#calPrev", -1], ["#calNext", 1]].forEach(([id, step]) => $(id).addEventListener("click", () => {
  if (!S.report) return;
  if (!S.calMonth) renderCalendar();
  const d = new Date(Date.UTC(S.calMonth[0], S.calMonth[1] + step, 1));
  S.calMonth = [d.getUTCFullYear(), d.getUTCMonth()];
  renderCalendar();
}));

// ---------- Bot-Vergleich ----------
function renderLines() {
  const el = $("#lineChart"), leg = $("#lineLegend");
  const chosen = S.report.bots.filter((b) => S.selected.has(b.id));
  const bots = chosen.filter((b) => b.curve.length && colorOf(b.id) && b.currency === S.cur);
  const hidden = chosen.length - bots.length;
  if (!bots.length) { leg.innerHTML = ""; el.innerHTML = `<div class="empty-chart">Bei den Bots unten „Vergleichen“ anhaken, um den Verlauf zu sehen</div>`; return; }
  leg.innerHTML = bots.map((b) => `<span><i style="background:${colorOf(b.id)}"></i>${esc(b.name)} <span class="muted">· ${esc(S.group === "account" ? b.accounts[0] : b.currency)}</span></span>`).join("") +
    (hidden ? `<span class="muted">${hidden} ausgeblendet (andere Währung als ${esc(S.cur)})</span>` : "");
  const [pf] = periodRange();
  const allT = bots.flatMap((b) => b.curve.map((p) => p[0]));
  const t0 = pf ?? Math.min(...allT), t1 = Math.max(...allT, t0 + 3600);
  const f = timeFrame(el, t0, t1, bots.flatMap((b) => b.curve.map((p) => p[1])));
  let s = f.svg;
  for (const b of bots) {
    const pts = [[t0, 0], ...b.curve];
    s += `<path d="M${pts.map((p) => `${f.x(p[0]).toFixed(1)},${f.y(p[1]).toFixed(1)}`).join("L")}" fill="none" stroke="${colorOf(b.id)}" stroke-width="2" stroke-linejoin="round"/>`;
  }
  el.innerHTML = `<svg viewBox="0 0 ${f.W} ${f.H}" height="${f.H}" role="img" aria-label="Kumulierter P&L je Bot">${s}${hairSvg(f)}</svg>`;
  crosshair(el, f, t0, t1, (e, t, px, dots) => {
    const rows = bots.map((b) => ({ b, v: valueAt(b.curve, t) })).sort((a, c) => c.v - a.v);
    dots.innerHTML = rows.map(({ b, v }) => `<circle cx="${px}" cy="${f.y(v)}" r="4" fill="${colorOf(b.id)}" stroke="var(--surface-1)" stroke-width="2"/>`).join("");
    showTip(e, `<b>${fmtDay(t)}</b>` + rows.map(({ b, v }) => `<div class="row"><span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${colorOf(b.id)};margin-right:5px"></span>${esc(trunc(b.name, 24))}</span><span>${signed(v, b.currency)}</span></div>`).join(""));
  });
}

// ---------- Bots: Karten / Tabelle ----------
function filteredSorted(bots) {
  const q = S.search.toLowerCase();
  let rows = bots.filter((b) => !q || (b.name + " " + b.accounts.join(" ") + " " + b.magics.join(" ") + " " + b.symbols.join(" ")).toLowerCase().includes(q));
  const { key, asc } = S.sort;
  return [...rows].sort((a, b) => {
    const va = a[key], vb = b[key];
    if (va == null) return 1; if (vb == null) return -1;
    const r = typeof va === "string" ? va.localeCompare(vb) : va - vb;
    return asc ? r : -r;
  });
}
function renderBots() {
  $("#botCards").hidden = S.botView !== "cards";
  $("#botTableWrap").hidden = S.botView !== "table";
  S.botView === "cards" ? renderCards(S.report.bots) : renderTable(S.report.bots);
}
const subline = (b) => `Magic ${b.magics.join(", ")} · ${b.accounts.join(", ")}${b.symbols.length ? " · " + b.symbols.slice(0, 3).join(", ") : ""}`;
const selBox = (b) => {
  const color = colorOf(b.id);
  return `<input type="checkbox" class="sel" ${S.selected.has(b.id) ? "checked" : ""} ${!color ? "disabled title='Nur 8 Farben verfügbar'" : ""} aria-label="Im Vergleich anzeigen">`;
};
function renderCards(bots) {
  const rows = filteredSorted(bots);
  $("#botCards").innerHTML = rows.map((b) => {
    const color = colorOf(b.id), fl = flags(b);
    const tags = (b.trades ? [`<span class="pill ${cls(b.net)}">${b.net > 0 ? "▲ Profitabel" : "▼ Verlust"}</span>`] : [])
      .concat(fl.map((x) => `<span class="pill ${x.k}" title="${esc(x.d)}">${x.t}</span>`)).join("");
    return `<div class="card bot" data-id="${esc(b.id)}">
      <div class="head"><span class="swatch" style="background:${color || "transparent"};${color ? "" : "border:1px solid var(--border)"}"></span>
        <div class="nm" title="Klicken zum Umbenennen"><span class="nm-text">${esc(b.name)}</span><small>${esc(subline(b))}</small></div>
        <div class="tags">${tags}</div></div>
      <div class="mid"><div><div class="value ${cls(b.net)}">${signed(b.net, b.currency)}</div><div class="small muted">${pct(b.return_pct)} vom Konto</div></div>
        ${b.curve.length > 1 ? sparkSvg(b.curve, color || css("--accent"), 160, 44) : ""}</div>
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
  }).join("") || `<div class="card muted">Keine Bots gefunden</div>`;
}
$("#botCards").addEventListener("click", (e) => {
  const card = e.target.closest(".bot[data-id]"); if (!card) return;
  const bot = S.report.bots.find((b) => b.id === card.dataset.id);
  if (e.target.classList.contains("sel")) return toggleSel(bot, e.target.checked);
  const nm = e.target.closest(".nm");
  if (nm && !nm.querySelector("input")) startRename(nm, bot);
});

const COLS = [
  { k: "sel", t: "", sort: false },
  { k: "name", t: "Bot" },
  { k: "flags", t: "", sort: false },
  { k: "net", t: "Netto", num: true },
  { k: "return_pct", t: "Rendite", num: true },
  { k: "trades", t: "Trades", num: true },
  { k: "win_rate", t: "Treffer %", num: true },
  { k: "profit_factor", t: "PF", num: true },
  { k: "avg_trade", t: "Ø Trade", num: true },
  { k: "max_drawdown", t: "Max. DD", num: true },
  { k: "costs", t: "Kosten", num: true },
  { k: "floating", t: "Offen", num: true },
  { k: "last_trade", t: "Letzter Trade", num: true },
];
function renderTable(bots) {
  const rows = filteredSorted(bots), { asc } = S.sort;
  const head = `<thead><tr>${COLS.map((c) => `<th data-k="${c.k}" class="${c.num ? "num" : ""} ${S.sort.key === c.k ? "sorted" + (asc ? " asc" : "") : ""}">${c.t}</th>`).join("")}</tr></thead>`;
  const body = rows.map((b) => {
    const color = colorOf(b.id);
    const tags = flags(b).map((x) => `<span class="pill ${x.k}" title="${esc(x.d)}">${x.t}</span>`).join(" ");
    return `<tr data-id="${esc(b.id)}">
      <td>${selBox(b)}</td>
      <td class="name" title="Klicken zum Umbenennen"><span class="swatch" style="background:${color || "transparent"};${color ? "" : "border:1px solid var(--border)"}"></span>${esc(b.name)}<small>${esc(subline(b))}</small></td>
      <td>${tags}</td>
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
  }).join("");
  $("#botTable").innerHTML = head + `<tbody>${body || `<tr><td colspan="${COLS.length}" class="muted">Keine Bots gefunden</td></tr>`}</tbody>`;
}
$("#botTable").addEventListener("click", (e) => {
  const th = e.target.closest("th");
  if (th) {
    const c = COLS.find((c) => c.k === th.dataset.k);
    if (c.sort === false) return;
    S.sort = S.sort.key === c.k ? { key: c.k, asc: !S.sort.asc } : { key: c.k, asc: c.k === "name" };
    return renderTable(S.report.bots);
  }
  const tr = e.target.closest("tr[data-id]");
  if (!tr) return;
  const bot = S.report.bots.find((b) => b.id === tr.dataset.id);
  if (e.target.classList.contains("sel")) return toggleSel(bot, e.target.checked);
  const td = e.target.closest("td.name");
  if (td && !td.querySelector("input")) startRename(td, bot);
});
function toggleSel(bot, on) {
  S.selectionTouched = true;
  on ? S.selected.add(bot.id) : S.selected.delete(bot.id);
  if (on && bot.currency !== S.cur) { S.cur = bot.currency; renderCurSeg(); renderMain(); }
  renderLines();
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

// ---------- Konten (Detail) ----------
function renderAccounts(accs) {
  $("#accountCards").innerHTML = accs.map((a) => {
    const cur = a.currency || "";
    return `<div class="card acc">
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
    </div>`;
  }).join("") || `<div class="muted">Keine aktiven Konten</div>`;
}

// ---------- Kontodialog ----------
const accDialog = $("#accDialog");
function openAccounts(newForm) {
  renderAccManage();
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
    await api("/api/accounts/delete", { id: del });
    await load(); renderAccManage();
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
  await api("/api/settings", Object.fromEntries(new FormData(e.target)));
  await load();
});

// ---------- Navigation & Toolbar ----------
function setView(v) {
  S.view = v;
  document.querySelectorAll(".view").forEach((s) => { s.hidden = s.dataset.view !== v; });
  $("#nav").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.view === v));
  $("#viewTitle").textContent = VIEWS[v];
  try { localStorage.setItem("view", v); } catch (e) {}
  if (S.report) render();  // Charts brauchen die echte Breite des sichtbaren Bereichs
}
$("#nav").addEventListener("click", (e) => { const b = e.target.closest("button[data-view]"); if (b) setView(b.dataset.view); });
document.querySelectorAll("[data-goto]").forEach((b) => b.addEventListener("click", () => setView(b.dataset.goto)));

$("#periodSeg").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  S.period = b.dataset.p;
  $("#periodSeg").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
  $("#customRange").hidden = S.period !== "custom";
  S.selectionTouched = false;
  load();
});
["#dFrom", "#dTo"].forEach((s) => $(s).addEventListener("change", load));
$("#groupSeg").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  S.group = b.dataset.g; S.selectionTouched = false; S.colors = {};
  $("#groupSeg").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
  load();
});
$("#botViewSeg").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  S.botView = b.dataset.b;
  $("#botViewSeg").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
  renderBots();
});
$("#search").addEventListener("input", (e) => { S.search = e.target.value; renderBots(); });
$("#btnRefresh").addEventListener("click", async () => { await api("/api/refresh", {}); setTimeout(load, 1500); });
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

try { const v = localStorage.getItem("view"); if (VIEWS[v]) setView(v); } catch (e) {}
load();
setInterval(() => { if (!accDialog.open && !document.querySelector("input.renaming")) load(); }, 10000);
