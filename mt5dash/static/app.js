"use strict";

// ---------- Zustand ----------
const S = {
  period: "all", group: "account", from: null, to: null,
  report: null, state: null,
  sort: { key: "net", asc: false }, search: "",
  selected: new Set(), selectionTouched: false,
  colors: {},          // Bot-ID → Farbslot (folgt dem Bot, nicht dem Rang)
};
const SERIES = ["--s1", "--s2", "--s3", "--s4", "--s5", "--s6", "--s7", "--s8"];
const $ = (s) => document.querySelector(s);
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const nf = (d = 2) => new Intl.NumberFormat("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d });
const money = (v, cur = "") => v == null ? "–" : nf(2).format(v) + (cur ? " " + cur : "");
const signed = (v, cur) => v == null ? "–" : (v > 0 ? "+" : v < 0 ? "−" : "") + money(Math.abs(v), cur);
const cls = (v) => v > 0 ? "pos" : v < 0 ? "neg" : "";
const fmtDate = (t) => t ? new Date(t * 1000).toLocaleString("de-DE", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "–";
const fmtDay = (t) => new Date(t * 1000).toLocaleDateString("de-DE", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "2-digit" });

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
function query() {
  const [f, t] = periodRange();
  const p = new URLSearchParams({ group: S.group });
  if (f != null) p.set("from", f);
  if (t != null) p.set("to", t);
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
    (state.last_refresh ? `Zuletzt aktualisiert ${new Date(state.last_refresh * 1000).toLocaleTimeString("de-DE")} · alle ${state.settings.refresh_seconds} s` : "Lade Daten…") +
    (errs ? ` · <span class="err">${errs} Konto${errs > 1 ? "en" : ""} mit Fehler</span>` : "") +
    (!state.mt5_available && !state.demo ? ` · <span class="err">MetaTrader5-Paket nicht verfügbar</span>` : "") +
    ` · Zeiten in Serverzeit`;

  assignColors(report.bots);
  if (!S.selectionTouched) {
    // Standard: die 3 besten und der schlechteste Bot
    const withTrades = report.bots.filter((b) => b.trades > 0);
    S.selected = new Set([...withTrades.slice(0, 3), ...withTrades.slice(-1)].map((b) => b.id));
  }
  renderKpis(report.totals);
  renderBars(report.bots.filter((b) => b.trades > 0));
  renderLines(report.bots.filter((b) => S.selected.has(b.id)));
  renderTable(report.bots);
  renderAccounts(report.accounts);
  $("#btnCsv").href = "/api/export.csv?" + query() + "&token=" + encodeURIComponent(window.API_TOKEN);
}

function assignColors(bots) {
  // feste Reihenfolge nach erstem Auftauchen; ein Bot behält seine Farbe
  for (const b of [...bots].sort((a, c) => a.id.localeCompare(c.id))) {
    if (!(b.id in S.colors)) S.colors[b.id] = Object.keys(S.colors).length;
  }
}
const colorOf = (id) => { const i = S.colors[id]; return i < SERIES.length ? css(SERIES[i]) : null; };

// ---------- KPIs ----------
function renderKpis(totals) {
  if (!totals.length) { $("#kpis").innerHTML = ""; return; }
  $("#kpis").innerHTML = totals.map((t) => `
    <div class="kpi-row">
      <div class="kpi"><div class="label">Netto realisiert${totals.length > 1 ? " · " + esc(t.currency) : ""}</div>
        <div class="value ${cls(t.net)}">${signed(t.net, t.currency)}</div>
        <div class="sub">Brutto +${money(t.gross_profit)} / −${money(t.gross_loss)}</div></div>
      <div class="kpi"><div class="label">Offen (floating)</div>
        <div class="value ${cls(t.floating)}">${signed(t.floating, t.currency)}</div></div>
      <div class="kpi"><div class="label">Trades</div><div class="value">${nf(0).format(t.trades)}</div>
        <div class="sub">${nf(0).format(t.wins)} Gewinner</div></div>
      <div class="kpi"><div class="label">Trefferquote</div><div class="value">${t.win_rate == null ? "–" : nf(1).format(t.win_rate) + " %"}</div></div>
      <div class="kpi"><div class="label">Profit-Faktor</div><div class="value">${t.profit_factor == null ? "–" : nf(2).format(t.profit_factor)}</div></div>
      <div class="kpi"><div class="label">Bots im Plus / Minus</div>
        <div class="value"><span class="pos">▲ ${t.bots_profit}</span> <span class="muted">/</span> <span class="neg">▼ ${t.bots_loss}</span></div></div>
    </div>`).join("");
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
  return (v < 0 ? "−" : "") + (a >= 1e6 ? nf(1).format(a / 1e6) + " M" : a >= 1e4 ? nf(0).format(a / 1e3) + " k" : nf(0).format(a));
};

// ---------- Balken: Netto pro Bot (divergierend um 0) ----------
function renderBars(bots) {
  const el = $("#barChart");
  if (!bots.length) { el.innerHTML = `<div class="empty-chart">Keine geschlossenen Trades im Zeitraum</div>`; return; }
  const W = el.clientWidth || 600, narrow = W < 560, rowH = narrow ? 42 : 26, top = 6, bottom = 22;
  const labelW = narrow ? -8 : Math.min(190, W * 0.34), valW = narrow ? 0 : 92;
  const H = top + bots.length * rowH + bottom;
  const plotX = labelW + 8, plotW = W - plotX - valW;
  const min = Math.min(0, ...bots.map((b) => b.net)), max = Math.max(0, ...bots.map((b) => b.net));
  const ticks = niceTicks(min, max, 4);
  const lo = Math.min(min, ticks[0]), hi = Math.max(max, ticks[ticks.length - 1]);
  const x = (v) => plotX + ((v - lo) / (hi - lo || 1)) * plotW;
  const good = css("--good"), bad = css("--bad");
  let s = `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img" aria-label="Netto-Ergebnis pro Bot">`;
  s += `<g class="grid">` + ticks.map((t) => `<line x1="${x(t)}" x2="${x(t)}" y1="${top}" y2="${H - bottom}"/><text x="${x(t)}" y="${H - 6}" text-anchor="middle">${short(t)}</text>`).filter((_, i, a) => !narrow || i % 2 === 0 || i === a.length - 1).join("") + `</g>`;
  bots.forEach((b, i) => {
    const y = top + i * rowH, h = narrow ? 14 : rowH - 8, by = narrow ? y + 22 : y + 4, x0 = x(0), x1 = x(b.net);
    const bx = Math.min(x0, x1), bw = Math.max(1, Math.abs(x1 - x0));
    const sub = S.group === "account" ? b.accounts.join(", ") : `${b.accounts.length} Konto${b.accounts.length > 1 ? "en" : ""}`;
    s += `<g class="bar" data-i="${i}">
      <rect x="0" y="${y}" width="${W}" height="${rowH}" fill="transparent"/>
      <text x="${narrow ? 0 : labelW}" y="${narrow ? y + 11 : y + rowH / 2 + 1}" text-anchor="${narrow ? "start" : "end"}" dominant-baseline="middle" style="fill:var(--text-primary)">${esc(trunc(b.name, 26))}<tspan style="fill:var(--text-muted)" dx="4">${esc(trunc(sub, 14))}</tspan></text>
      <rect x="${bx}" y="${by}" width="${bw}" height="${h}" rx="4" fill="${b.net >= 0 ? good : bad}"/>
      <text x="${narrow ? W : W - valW + 6}" y="${narrow ? y + 11 : y + rowH / 2 + 1}" text-anchor="${narrow ? "end" : "start"}" dominant-baseline="middle" style="fill:var(--text-primary);font-variant-numeric:tabular-nums">${signed(b.net, "")} ${esc(b.currency)}</text>
    </g>`;
  });
  s += `<line class="zero" x1="${x(0)}" x2="${x(0)}" y1="${top}" y2="${H - bottom}"/></svg>`;
  el.innerHTML = s;
  el.querySelectorAll(".bar").forEach((g) => {
    const b = bots[+g.dataset.i];
    g.addEventListener("mousemove", (e) => showTip(e, `<b>${esc(b.name)}</b><div class="muted">${esc(b.accounts.join(", "))}</div>
      <div class="row"><span>Netto</span><span class="${cls(b.net)}">${signed(b.net, b.currency)}</span></div>
      <div class="row"><span>Trades</span><span>${b.trades} (${b.win_rate == null ? "–" : nf(1).format(b.win_rate) + " %"} Treffer)</span></div>
      <div class="row"><span>Profit-Faktor</span><span>${b.profit_factor ?? "–"}</span></div>
      <div class="row"><span>Max. Drawdown</span><span>${money(b.max_drawdown, b.currency)}</span></div>`));
    g.addEventListener("mouseleave", hideTip);
  });
}
const trunc = (s, n) => s.length > n ? s.slice(0, n - 1) + "…" : s;

// ---------- Linien: kumulierter Verlauf ----------
function renderLines(bots) {
  const el = $("#lineChart"), leg = $("#lineLegend");
  bots = bots.filter((b) => b.curve.length && colorOf(b.id));
  if (!bots.length) { leg.innerHTML = ""; el.innerHTML = `<div class="empty-chart">Bots in der Tabelle anhaken, um den Verlauf zu sehen</div>`; return; }
  leg.innerHTML = bots.map((b) => `<span><i style="background:${colorOf(b.id)}"></i>${esc(b.name)} <span class="muted">· ${esc(S.group === "account" ? b.accounts[0] : b.currency)}</span></span>`).join("");
  const W = el.clientWidth || 600, H = 300, padL = 54, padR = 10, padT = 10, padB = 24;
  const [pf] = periodRange();
  const allT = bots.flatMap((b) => b.curve.map((p) => p[0]));
  const t0 = pf ?? Math.min(...allT), t1 = Math.max(...allT, t0 + 3600);
  const vals = bots.flatMap((b) => b.curve.map((p) => p[1])).concat(0);
  const yt = niceTicks(Math.min(...vals), Math.max(...vals), 5);
  const lo = yt[0], hi = yt[yt.length - 1];
  const x = (t) => padL + ((t - t0) / (t1 - t0 || 1)) * (W - padL - padR);
  const y = (v) => padT + (1 - (v - lo) / (hi - lo || 1)) * (H - padT - padB);
  let s = `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img" aria-label="Kumulierter P&L">`;
  s += `<g class="grid">` + yt.map((v) => `<line x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}"/><text x="${padL - 6}" y="${y(v)}" text-anchor="end" dominant-baseline="middle">${short(v)}</text>`).join("");
  const nX = Math.max(2, Math.floor((W - padL) / 110));
  for (let i = 0; i <= nX; i++) { const t = t0 + (t1 - t0) * i / nX; s += `<text x="${x(t)}" y="${H - 6}" text-anchor="${i === 0 ? "start" : i === nX ? "end" : "middle"}">${fmtDay(t)}</text>`; }
  s += `</g><line class="zero" x1="${padL}" x2="${W - padR}" y1="${y(0)}" y2="${y(0)}"/>`;
  for (const b of bots) {
    const pts = [[t0, 0], ...b.curve];
    s += `<path d="M${pts.map((p) => `${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join("L")}" fill="none" stroke="${colorOf(b.id)}" stroke-width="2" stroke-linejoin="round"/>`;
  }
  s += `<line id="xhair" y1="${padT}" y2="${H - padB}" stroke="var(--text-muted)" stroke-dasharray="3 3" visibility="hidden"/><g id="xdots"></g>`;
  s += `<rect x="${padL}" y="0" width="${W - padL - padR}" height="${H}" fill="transparent" id="hit"/></svg>`;
  el.innerHTML = s;
  const hit = el.querySelector("#hit"), xh = el.querySelector("#xhair"), dots = el.querySelector("#xdots");
  hit.addEventListener("mousemove", (e) => {
    const r = el.querySelector("svg").getBoundingClientRect();
    const px = (e.clientX - r.left) * (W / r.width);
    const t = t0 + ((px - padL) / (W - padL - padR)) * (t1 - t0);
    xh.setAttribute("x1", px); xh.setAttribute("x2", px); xh.setAttribute("visibility", "visible");
    const rows = bots.map((b) => {
      let v = 0; for (const p of b.curve) { if (p[0] <= t) v = p[1]; else break; }
      return { b, v };
    }).sort((a, c) => c.v - a.v);
    dots.innerHTML = rows.map(({ b, v }) => `<circle cx="${px}" cy="${y(v)}" r="4" fill="${colorOf(b.id)}" stroke="var(--surface-1)" stroke-width="2"/>`).join("");
    showTip(e, `<b>${fmtDay(t)}</b>` + rows.map(({ b, v }) => `<div class="row"><span><span class="swatch" style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${colorOf(b.id)};margin-right:5px"></span>${esc(trunc(b.name, 24))}</span><span>${signed(v, b.currency)}</span></div>`).join(""));
  });
  hit.addEventListener("mouseleave", () => { hideTip(); xh.setAttribute("visibility", "hidden"); dots.innerHTML = ""; });
}

// ---------- Tabelle ----------
const COLS = [
  { k: "sel", t: "", sort: false },
  { k: "name", t: "Bot" },
  { k: "verdict", t: "", sort: false },
  { k: "net", t: "Netto", num: true },
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
  const q = S.search.toLowerCase();
  let rows = bots.filter((b) => !q || (b.name + " " + b.accounts.join(" ") + " " + b.magics.join(" ") + " " + b.symbols.join(" ")).toLowerCase().includes(q));
  const { key, asc } = S.sort;
  rows = [...rows].sort((a, b) => {
    const va = a[key], vb = b[key];
    if (va == null) return 1; if (vb == null) return -1;
    const r = typeof va === "string" ? va.localeCompare(vb) : va - vb;
    return asc ? r : -r;
  });
  const head = `<thead><tr>${COLS.map((c) => `<th data-k="${c.k}" class="${c.num ? "num" : ""} ${S.sort.key === c.k ? "sorted" + (asc ? " asc" : "") : ""}">${c.t}</th>`).join("")}</tr></thead>`;
  const body = rows.map((b) => {
    const color = colorOf(b.id);
    const sub = `Magic ${b.magics.join(", ")} · ${b.accounts.join(", ")}${b.symbols.length ? " · " + b.symbols.slice(0, 4).join(", ") : ""}`;
    const verdict = b.trades === 0 ? "" : b.net > 0 ? `<span class="verdict pos">▲ Ertrag</span>` : `<span class="verdict neg">▼ Verlust</span>`;
    return `<tr data-id="${esc(b.id)}">
      <td><input type="checkbox" class="sel" ${S.selected.has(b.id) ? "checked" : ""} ${!color ? "disabled title='Nur 8 Farben verfügbar'" : ""} aria-label="Im Verlauf anzeigen"></td>
      <td class="name" title="Klicken zum Umbenennen"><span class="swatch" style="background:${color || "transparent"};${color ? "" : "border:1px solid var(--border)"}"></span>${esc(b.name)}<small>${esc(sub)}</small></td>
      <td>${verdict}</td>
      <td class="num ${cls(b.net)}"><b>${signed(b.net, b.currency)}</b></td>
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
  if (e.target.classList.contains("sel")) {
    S.selectionTouched = true;
    e.target.checked ? S.selected.add(bot.id) : S.selected.delete(bot.id);
    return renderLines(S.report.bots.filter((b) => S.selected.has(b.id)));
  }
  const td = e.target.closest("td.name");
  if (td && !td.querySelector("input")) startRename(td, bot);
});

function startRename(td, bot) {
  // pro Konto: Name gilt für login:magic; kontoübergreifend: für die Magic-Nummer(n) auf allen Konten
  const inp = document.createElement("input");
  inp.value = bot.name;
  td.innerHTML = ""; td.appendChild(inp); inp.focus(); inp.select();
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

// ---------- Kontokarten ----------
function renderAccounts(accs) {
  $("#accountCards").innerHTML = accs.map((a) => {
    const cur = a.currency || "";
    return `<div class="acc">
      <h3><span class="dot ${a.status || "wait"}" title="${a.status === "ok" ? "verbunden" : "Fehler"}"></span>${esc(a.label)}</h3>
      <div class="muted small">${esc(a.login)} · ${esc(a.server)}</div>
      ${a.balance != null ? `<div class="kv">
        <span>Balance</span><span class="num">${money(a.balance, cur)}</span>
        <span>Equity</span><span class="num">${money(a.equity, cur)}</span>
        <span>Netto (Zeitraum)</span><span class="num ${cls(a.net)}">${signed(a.net, cur)}</span>
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
  renderAccList();
  const st = S.state.settings, f = $("#setForm");
  f.refresh_seconds.value = st.refresh_seconds; f.history_days.value = st.history_days; f.default_terminal_path.value = st.default_terminal_path;
  if (newForm) resetAccForm();
  accDialog.showModal();
}
function renderAccList() {
  const statusById = Object.fromEntries(S.report.accounts.map((a) => [String(a.login), a]));
  $("#accList").innerHTML = S.state.accounts.map((a) => {
    const st = statusById[String(a.login)];
    return `<div class="acc-item">
      <span class="dot ${a.enabled === false ? "wait" : st?.status || "wait"}"></span>
      <div class="meta"><b>${esc(a.label)}</b><small>${esc(a.login)} · ${esc(a.server)}${a.terminal_path ? " · " + esc(a.terminal_path) : ""}${a.enabled === false ? " · deaktiviert" : ""}${st?.error ? " · ⚠ " + esc(st.error) : ""}</small></div>
      <button class="btn" data-edit="${esc(a.id)}">Bearbeiten</button>
      <button class="btn danger" data-del="${esc(a.id)}">Entfernen</button>
    </div>`;
  }).join("") || `<div class="muted small">Noch keine Konten.</div>`;
}
$("#accList").addEventListener("click", async (e) => {
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
    await load(); renderAccList();
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
    await load(); renderAccList();
  } catch (err) { msg.className = "small neg"; msg.textContent = "⚠ " + err.message; }
});
$("#setForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  await api("/api/settings", Object.fromEntries(new FormData(e.target)));
  await load();
});

// ---------- Toolbar ----------
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
$("#search").addEventListener("input", (e) => { S.search = e.target.value; renderTable(S.report.bots); });
$("#btnRefresh").addEventListener("click", async () => { await api("/api/refresh", {}); setTimeout(load, 1500); });
$("#btnAccounts").addEventListener("click", () => openAccounts(true));
$("#btnQuit").addEventListener("click", async () => {
  if (!confirm("Dashboard beenden?")) return;
  await api("/api/shutdown", {}).catch(() => {});
  document.body.innerHTML = `<div class="empty" style="margin:40px">Dashboard beendet. Dieses Fenster kann geschlossen werden.</div>`;
});
let resizeT; addEventListener("resize", () => { clearTimeout(resizeT); resizeT = setTimeout(() => S.report && render(), 150); });
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => S.report && render());

load();
setInterval(() => { if (!accDialog.open && !document.querySelector("td.name input")) load(); }, 10000);
