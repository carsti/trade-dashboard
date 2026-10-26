"""Auswertung der Deal-History: Gewinn/Verlust pro Bot (Magic-Nummer) und Konto.

Eingabe sind normalisierte Deals (dicts) wie sie mt5_source / demo_source liefern:
    ticket, position_id, time (unix s, Serverzeit), type, entry, magic, symbol,
    volume, profit, commission, swap, fee, comment
"""
from __future__ import annotations

from collections import Counter, defaultdict

# MT5-Konstanten
DEAL_TYPE_BUY = 0
DEAL_TYPE_SELL = 1
DEAL_ENTRY_IN = 0
DEAL_ENTRY_OUT = 1
DEAL_ENTRY_INOUT = 2
DEAL_ENTRY_OUT_BY = 3

MANUAL_NAME = "Manuell"


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


def build_report(snapshots: list[dict], names: dict, t_from: int | None, t_to: int | None,
                 group: str = "account") -> dict:
    """Erzeugt den kompletten Dashboard-Report.

    snapshots: je Konto {"account": {...}, "deals": [...], "open_positions": [...]}
    group: "account" → ein Eintrag pro Bot und Konto, "bot" → gleiche Bots über Konten zusammengefasst
    """
    def in_range(t):
        return (t_from is None or t >= t_from) and (t_to is None or t < t_to)

    entries: dict[tuple, dict] = {}
    accounts_out = []

    for snap in snapshots:
        acc = snap["account"]
        key = acc["key"]
        currency = acc.get("currency", "")
        positions = build_positions(snap.get("deals", []))

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
                    "accounts": [], "magics": [],
                    "closed": [], "floating": 0.0, "open_count": 0,
                }
            if acc["label"] not in e["accounts"]:
                e["accounts"].append(acc["label"])
            if magic not in e["magics"]:
                e["magics"].append(magic)
            return e

        acc_closed_net = 0.0
        for p in positions:
            if p["closed"] and in_range(p["close_time"]):
                entry_for(p["magic"])["closed"].append(p)
                acc_closed_net += p["net"]

        acc_floating = 0.0
        for op in snap.get("open_positions", []):
            fl = op.get("profit", 0.0) + op.get("swap", 0.0)
            e = entry_for(op.get("magic", 0))
            e["floating"] += fl
            e["open_count"] += 1
            acc_floating += fl

        accounts_out.append({
            **{k: acc.get(k) for k in ("key", "label", "login", "server", "currency", "balance",
                                       "equity", "margin_level", "leverage", "status", "error", "updated")},
            "net": round(acc_closed_net, 2),
            "floating": round(acc_floating, 2),
            "open_count": len(snap.get("open_positions", [])),
        })

    bots = []
    for e in entries.values():
        if not e["closed"] and not e["open_count"]:
            continue
        stats = _stats(e["closed"])
        bots.append({
            "id": e["id"], "name": e["name"], "currency": e["currency"],
            "accounts": e["accounts"], "magics": sorted(e["magics"]),
            **stats,
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

    return {"bots": bots, "accounts": accounts_out, "totals": sorted(totals.values(), key=lambda t: t["currency"])}
