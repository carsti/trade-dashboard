"""Auswertung der Deal-History: Gewinn/Verlust pro Bot (Magic-Nummer) und Konto.

Eingabe sind normalisierte Deals (dicts) wie sie mt5_source / demo_source liefern:
    ticket, position_id, time (unix s, Serverzeit), type, entry, magic, symbol,
    volume, profit, commission, swap, fee, comment
"""
from __future__ import annotations

import time
from collections import Counter, defaultdict

# MT5-Konstanten
DEAL_TYPE_BUY = 0
DEAL_TYPE_SELL = 1
DEAL_TYPE_BALANCE = 2   # Ein-/Auszahlung
DEAL_TYPE_CREDIT = 3    # Kredit: ändert nicht die Balance
DEAL_ENTRY_IN = 0
DEAL_ENTRY_OUT = 1
DEAL_ENTRY_INOUT = 2
DEAL_ENTRY_OUT_BY = 3

MANUAL_NAME = "Manuell"
DAY = 86400
RECENT_TRADES = 15


def deal_net(d: dict) -> float:
    return d.get("profit", 0.0) + d.get("commission", 0.0) + d.get("swap", 0.0) + d.get("fee", 0.0)


def build_positions(deals: list[dict]) -> list[dict]:
    """Fasst Trade-Deals zu Positionen zusammen.

    Der Bot einer Position ist die Magic-Nummer des Eröffnungs-Deals, weil Deals
    die per SL/TP oder manuell geschlossen werden oft Magic 0 tragen.
    Eine Position gilt als geschlossen, wenn Eingangs- und Ausgangsvolumen gleich sind.
    """
    by_pos: dict[int, list[dict]] = defaultdict(list)
    for d in deals:
        if d.get("type") not in (DEAL_TYPE_BUY, DEAL_TYPE_SELL):
            continue  # Balance, Credit, Bonus usw. gehören zu keinem Bot
        by_pos[d.get("position_id") or d["ticket"]].append(d)

    positions = []
    for pos_id, ds in by_pos.items():
        ds.sort(key=lambda d: (d["time"], d["ticket"]))
        opening = next((d for d in ds if d.get("entry") == DEAL_ENTRY_IN), ds[0])
        vol_in = sum(d["volume"] for d in ds if d.get("entry") == DEAL_ENTRY_IN)
        vol_out = sum(d["volume"] for d in ds if d.get("entry") in (DEAL_ENTRY_OUT, DEAL_ENTRY_OUT_BY))
        closed = vol_out > 0 and vol_out >= vol_in - 1e-9
        positions.append({
            "position_id": pos_id,
            "magic": opening.get("magic", 0),
            "comment": opening.get("comment", ""),
            "symbol": opening.get("symbol", ""),
            "direction": "buy" if opening.get("type") == DEAL_TYPE_BUY else "sell",
            "volume": vol_in,
            "open_time": opening["time"],
            "close_time": ds[-1]["time"] if closed else None,
            "closed": closed,
            "net": round(sum(deal_net(d) for d in ds), 2),
            "profit": round(sum(d.get("profit", 0.0) for d in ds), 2),
            "costs": round(sum(d.get("commission", 0.0) + d.get("swap", 0.0) + d.get("fee", 0.0) for d in ds), 2),
        })
    return positions


def default_bot_name(magic: int, comments: Counter) -> str:
    if magic == 0:
        return MANUAL_NAME
    common = [c for c, _ in comments.most_common() if c and c.strip()]
    if common:
        # Kommentare wie "MyEA 1.2 #12345" → nur den Namen ohne Ticket-Anhang
        return f"{common[0].split('#')[0].strip() or 'Bot'} ({magic})"
    return f"Magic {magic}"


def resolve_bot_name(account_key: str, magic: int, names: dict, comments: Counter) -> str:
    return (names.get(f"{account_key}:{magic}")
            or names.get(str(magic))
            or default_bot_name(magic, comments))


def _max_drawdown(nets: list[float]) -> float:
    peak = cum = dd = 0.0
    for n in nets:
        cum += n
        peak = max(peak, cum)
        dd = max(dd, peak - cum)
    return round(dd, 2)


def _stats(closed: list[dict]) -> dict:
    closed = sorted(closed, key=lambda p: p["close_time"])
    nets = [p["net"] for p in closed]
    wins = [n for n in nets if n > 0]
    losses = [n for n in nets if n < 0]
    gross_win = sum(wins)
    gross_loss = -sum(losses)
    n = len(nets)
    return {
        "trades": n,
        "wins": len(wins),
        "losses": len(losses),
        "win_rate": round(100 * len(wins) / n, 1) if n else None,
        "gross_profit": round(gross_win, 2),
        "gross_loss": round(gross_loss, 2),
        "net": round(sum(nets), 2),
        "avg_win": round(gross_win / len(wins), 2) if wins else None,
        "avg_loss": round(gross_loss / len(losses), 2) if losses else None,
        "costs": round(sum(p["costs"] for p in closed), 2),
        "profit_factor": round(gross_win / gross_loss, 2) if gross_loss > 0 else None,
        "avg_trade": round(sum(nets) / n, 2) if n else None,
        "best": round(max(nets), 2) if n else None,
        "worst": round(min(nets), 2) if n else None,
        "max_drawdown": _max_drawdown(nets),
        "volume": round(sum(p["volume"] for p in closed), 2),
        "symbols": sorted({p["symbol"] for p in closed}),
        "last_trade": closed[-1]["close_time"] if closed else None,
    }


def _curve(closed: list[dict]) -> list[list]:
    """Kumulierte P&L-Kurve als [[zeit, wert], ...]."""
    cum = 0.0
    pts = []
    for p in sorted(closed, key=lambda p: p["close_time"]):
        cum += p["net"]
        pts.append([p["close_time"], round(cum, 2)])
    return pts


def _daily(closed: list[dict]) -> list[list]:
    """Netto je Kalendertag (Serverzeit) als [[tagesbeginn, netto], ...]."""
    days: dict[int, float] = defaultdict(float)
    for p in closed:
        days[p["close_time"] - p["close_time"] % DAY] += p["net"]
    return [[d, round(v, 2)] for d, v in sorted(days.items())]


def _breakdowns(closed: list[dict]) -> dict:
    """Netto und Trades je Symbol, Wochentag (0 = Montag) und Stunde der Schließzeit (Serverzeit)."""
    sym: dict[str, list] = defaultdict(lambda: [0.0, 0, 0])
    wd = [[0.0, 0] for _ in range(7)]
    hr = [[0.0, 0] for _ in range(24)]
    for p in closed:
        s = sym[p["symbol"] or "?"]
        s[0] += p["net"]; s[1] += 1; s[2] += p["net"] > 0
        d = (p["close_time"] // DAY + 3) % 7  # 1.1.1970 war ein Donnerstag
        wd[d][0] += p["net"]; wd[d][1] += 1
        h = p["close_time"] % DAY // 3600
        hr[h][0] += p["net"]; hr[h][1] += 1
    return {
        "by_symbol": sorted(({"symbol": k, "net": round(v[0], 2), "trades": v[1],
                              "win_rate": round(100 * v[2] / v[1], 1)} for k, v in sym.items()),
                            key=lambda x: x["net"], reverse=True),
        "by_weekday": [[round(n, 2), c] for n, c in wd],
        "by_hour": [[round(n, 2), c] for n, c in hr],
    }


def _pct(net: float, base: float) -> float | None:
    return round(100 * net / base, 2) if base > 0 else None


def capital_base(deals: list[dict], balance: float, t_from: int | None) -> float | None:
    """Kapital, auf das sich die Rendite im Zeitraum bezieht.

    Balance zu Zeitraumbeginn (aktuelle Balance minus aller Balance-Änderungen seitdem, also Trades UND
    Ein-/Auszahlungen) plus Einzahlungen im Zeitraum. Bei "Gesamt" ist das die Summe der Einzahlungen.
    Auszahlungen senken die Basis nicht – sonst ergäben abgezogene Gewinne absurde Renditen.
    Liefert None, wenn keine sinnvolle (positive) Basis bestimmbar ist.
    """
    since = [d for d in deals if d.get("type") != DEAL_TYPE_CREDIT and (t_from is None or d["time"] >= t_from)]
    start = balance - sum(deal_net(d) for d in since)
    deposits = sum(d.get("profit", 0.0) for d in since if d.get("type") == DEAL_TYPE_BALANCE and d.get("profit", 0.0) > 0)
    base = round(start + deposits, 2)
    return base if base > 0.005 else None


def build_report(snapshots: list[dict], names: dict, t_from: int | None, t_to: int | None,
                 group: str = "account", accounts: set[str] | None = None, now: int | None = None) -> dict:
    """Erzeugt den kompletten Dashboard-Report.

    snapshots: je Konto {"account": {...}, "deals": [...], "open_positions": [...]}
    group: "account" → ein Eintrag pro Bot und Konto, "bot" → gleiche Bots über Konten zusammengefasst
    accounts: nur diese Konto-Keys auswerten (None = alle); die Kontoliste enthält trotzdem alle Konten
    now: Bezugszeit für Heute/7 T/30 T (unabhängig vom gewählten Zeitraum)

    Rendite in % bezieht sich auf das Kapital des Zeitraums (siehe capital_base): Balance zu Zeitraumbeginn
    plus Einzahlungen im Zeitraum.
    """
    now = int(time.time()) if now is None else now
    today = now - now % DAY
    recent_from = {"today": today, "d7": today - 6 * DAY, "d30": today - 29 * DAY}
    def in_range(t):
        return (t_from is None or t >= t_from) and (t_to is None or t < t_to)

    entries: dict[tuple, dict] = {}
    accounts_out = []
    per_cur: dict[str, dict] = {}   # Währung → Konto-Summen, Startkapital, alle/realisierte Positionen
    recent: list[dict] = []

    for snap in snapshots:
        acc = snap["account"]
        key = acc["key"]
        currency = acc.get("currency", "")
        positions = build_positions(snap.get("deals", []))
        closed_all = [p for p in positions if p["closed"]]
        start_balance = None
        if acc.get("balance") is not None:
            start_balance = capital_base(snap.get("deals", []), acc["balance"], t_from)
        selected = accounts is None or key in accounts

        comments_by_magic: dict[int, Counter] = defaultdict(Counter)
        for p in positions:
            comments_by_magic[p["magic"]][p["comment"]] += 1
        for op in snap.get("open_positions", []):
            comments_by_magic[op.get("magic", 0)][op.get("comment", "")] += 1

        def entry_for(magic):
            name = resolve_bot_name(key, magic, names, comments_by_magic[magic])
            gk = (key, magic) if group == "account" else (name, currency)
            e = entries.get(gk)
            if e is None:
                e = entries[gk] = {
                    "id": f"{key}:{magic}" if group == "account" else f"{name}|{currency}",
                    "name": name, "currency": currency,
                    "accounts": [], "account_keys": [], "magics": [], "base": 0.0,
                    "closed": [], "floating": 0.0, "open_count": 0,
                }
            if acc["label"] not in e["accounts"]:
                e["accounts"].append(acc["label"])
            if key not in e["account_keys"]:
                e["account_keys"].append(key)
                e["base"] += start_balance or 0.0
            if magic not in e["magics"]:
                e["magics"].append(magic)
            return e

        in_period = [p for p in closed_all if in_range(p["close_time"])]
        acc_closed_net = sum(p["net"] for p in in_period)
        acc_floating = sum(op.get("profit", 0.0) + op.get("swap", 0.0) for op in snap.get("open_positions", []))

        if selected:
            for p in in_period:
                entry_for(p["magic"])["closed"].append(p)
            for op in snap.get("open_positions", []):
                e = entry_for(op.get("magic", 0))
                e["floating"] += op.get("profit", 0.0) + op.get("swap", 0.0)
                e["open_count"] += 1
            c = per_cur.setdefault(currency, {"balance": 0.0, "equity": 0.0, "base": 0.0,
                                              "all": [], "period": [], "open_count": 0})
            c["balance"] += acc.get("balance") or 0.0
            c["equity"] += acc.get("equity") or 0.0
            c["base"] += start_balance or 0.0
            c["all"] += closed_all
            c["period"] += in_period
            for p in sorted(in_period, key=lambda p: p["close_time"])[-RECENT_TRADES:]:
                recent.append({
                    "time": p["close_time"], "account": acc["label"], "currency": currency,
                    "bot": resolve_bot_name(key, p["magic"], names, comments_by_magic[p["magic"]]),
                    "symbol": p["symbol"], "direction": p["direction"], "volume": p["volume"], "net": p["net"],
                })
            c["open_count"] += len(snap.get("open_positions", []))

        accounts_out.append({
            **{k: acc.get(k) for k in ("key", "label", "login", "server", "currency", "balance",
                                       "equity", "margin_level", "leverage", "status", "error", "updated")},
            "net": round(acc_closed_net, 2),
            "return_pct": _pct(acc_closed_net, start_balance or 0.0),
            "floating": round(acc_floating, 2),
            "open_count": len(snap.get("open_positions", [])),
            "trades": len(in_period),
            "selected": selected,
        })

    bots = []
    for e in entries.values():
        if not e["closed"] and not e["open_count"]:
            continue
        stats = _stats(e["closed"])
        bots.append({
            "id": e["id"], "name": e["name"], "currency": e["currency"],
            "accounts": e["accounts"], "account_keys": e["account_keys"], "magics": sorted(e["magics"]),
            **stats,
            "return_pct": _pct(stats["net"], e["base"]),
            "floating": round(e["floating"], 2), "open_count": e["open_count"],
            "curve": _curve(e["closed"]),
        })
    bots.sort(key=lambda b: b["net"], reverse=True)

    totals: dict[str, dict] = {}
    for b in bots:
        t = totals.setdefault(b["currency"], {"currency": b["currency"], "net": 0.0, "floating": 0.0,
                                              "trades": 0, "wins": 0, "gross_profit": 0.0, "gross_loss": 0.0,
                                              "bots_profit": 0, "bots_loss": 0})
        t["net"] += b["net"]
        t["floating"] += b["floating"]
        t["trades"] += b["trades"]
        t["wins"] += b["wins"]
        t["gross_profit"] += b["gross_profit"]
        t["gross_loss"] += b["gross_loss"]
        if b["trades"]:
            t["bots_profit" if b["net"] > 0 else "bots_loss"] += 1
    for t in totals.values():
        t["win_rate"] = round(100 * t["wins"] / t["trades"], 1) if t["trades"] else None
        t["profit_factor"] = round(t["gross_profit"] / t["gross_loss"], 2) if t["gross_loss"] > 0 else None
        for k in ("net", "floating", "gross_profit", "gross_loss"):
            t[k] = round(t[k], 2)
        c = per_cur.get(t["currency"])
        if c:
            t["balance"] = round(c["balance"], 2)
            t["equity"] = round(c["equity"], 2)
            t["return_pct"] = _pct(t["net"], c["base"])
            t["open_count"] = c["open_count"]
            for k, since in recent_from.items():
                t[k] = round(sum(p["net"] for p in c["all"] if p["close_time"] >= since), 2)
            daily = _daily(c["period"])
            t["daily"] = daily
            cum = 0.0
            t["curve"] = [[d + DAY, round(cum := cum + v, 2)] for d, v in daily]
            t["max_drawdown"] = _max_drawdown([v for _, v in daily])
            t.update(_breakdowns(c["period"]))

    recent.sort(key=lambda r: r["time"], reverse=True)
    return {"bots": bots, "accounts": accounts_out, "totals": sorted(totals.values(), key=lambda t: t["currency"]),
            "recent_trades": recent[:RECENT_TRADES]}
