"""Erzeugt realistische Beispieldaten, damit das Dashboard ohne MT5 ausprobiert werden kann."""
from __future__ import annotations

import random
import time

DEMO_ACCOUNTS = [
    {"id": "demo1", "label": "IC Markets Live", "login": 51234567, "server": "ICMarketsSC-Live07",
     "currency": "USD", "balance0": 25000},
    {"id": "demo2", "label": "FTMO Challenge", "login": 1520448811, "server": "FTMO-Server3",
     "currency": "USD", "balance0": 100000},
    {"id": "demo3", "label": "Pepperstone EUR", "login": 8801234, "server": "Pepperstone-Edge05",
     "currency": "EUR", "balance0": 5000},
]

# (Magic, Kommentar, Symbole, Trades/Tag, Trefferquote, Ø Gewinn, Ø Verlust, Lots)
DEMO_BOTS = {
    "demo1": [(1001, "GoldScalper v2", ["XAUUSD"], 6, 0.62, 38, 52, 0.2),
              (2002, "EURUSD Trend", ["EURUSD"], 1.2, 0.41, 95, 48, 0.5),
              (3003, "Grid Martingale", ["GBPUSD", "EURGBP"], 3, 0.83, 22, 160, 0.1),
              (0, "", ["US30"], 0.3, 0.5, 120, 110, 0.1)],
    "demo2": [(1001, "GoldScalper v2", ["XAUUSD"], 5, 0.60, 240, 320, 1.5),
              (4004, "NAS100 Breakout", ["NAS100"], 1, 0.38, 900, 420, 2.0)],
    "demo3": [(2002, "EURUSD Trend", ["EURUSD"], 1, 0.43, 70, 40, 0.3),
              (5005, "Mean Reversion", ["AUDCAD", "NZDCAD"], 2, 0.55, 30, 41, 0.2)],
}


def fetch_demo(acc_id: str, days: int = 180) -> dict:
    meta = next(a for a in DEMO_ACCOUNTS if a["id"] == acc_id)
    rnd = random.Random(acc_id)
    now = int(time.time())
    start = now - days * 86400
    deals, open_positions = [], []
    ticket = 1_000_000 * (DEMO_ACCOUNTS.index(meta) + 1)

    deals.append({"ticket": ticket, "position_id": 0, "time": start - 3600, "type": 2, "entry": 0, "magic": 0,
                  "symbol": "", "volume": 0, "profit": meta["balance0"], "commission": 0, "swap": 0, "fee": 0,
                  "comment": "Deposit"})
    balance = meta["balance0"]

    for magic, comment, symbols, per_day, hit, avg_w, avg_l, lots in DEMO_BOTS[acc_id]:
        # leichter Drift über die Zeit, damit Kurven nicht linear aussehen
        t = start + rnd.randint(0, 3600 * 12)
        while t < now:
            t += int(rnd.expovariate(per_day / 86400))
            if t >= now:
                break
            ticket += 2
            dur = rnd.randint(300, 3600 * 30 if per_day < 2 else 3600 * 3)
            phase = (t - start) / (now - start)
            p_hit = hit + (0.06 * (0.5 - phase) if magic == 3003 else 0)
            win = rnd.random() < p_hit
            profit = rnd.gauss(avg_w, avg_w * 0.4) if win else -abs(rnd.gauss(avg_l, avg_l * 0.5))
            if magic == 3003 and rnd.random() < 0.015:
                profit = -avg_l * rnd.uniform(6, 12)  # gelegentlicher Grid-Crash
            comm = -round(lots * 7, 2)
            swap = round(rnd.uniform(-3, 1) * lots, 2) if dur > 86400 else 0
            sym = rnd.choice(symbols)
            typ = rnd.randint(0, 1)
            if t + dur > now:
                open_positions.append({"ticket": ticket, "identifier": ticket, "time": t, "type": typ,
                                       "magic": magic, "symbol": sym, "volume": lots,
                                       "profit": round(rnd.gauss(0, avg_l * 0.6), 2), "swap": swap,
                                       "comment": comment})
                deals.append({"ticket": ticket, "position_id": ticket, "time": t, "type": typ, "entry": 0,
                              "magic": magic, "symbol": sym, "volume": lots, "profit": 0,
                              "commission": comm / 2, "swap": 0, "fee": 0, "comment": comment})
                continue
            deals.append({"ticket": ticket, "position_id": ticket, "time": t, "type": typ, "entry": 0,
                          "magic": magic, "symbol": sym, "volume": lots, "profit": 0,
                          "commission": comm / 2, "swap": 0, "fee": 0, "comment": comment})
            # Schließender Deal: bei SL/TP trägt er oft keine Magic → Zuordnung über position_id
            deals.append({"ticket": ticket + 1, "position_id": ticket, "time": t + dur, "type": 1 - typ,
                          "entry": 1, "magic": magic if rnd.random() < 0.5 else 0, "symbol": sym,
                          "volume": lots, "profit": round(profit, 2), "commission": comm / 2, "swap": swap,
                          "fee": 0, "comment": rnd.choice(["[tp]", "[sl]", ""])})
            balance += profit + comm + swap

    floating = sum(p["profit"] + p["swap"] for p in open_positions)
    return {
        "account": {"login": meta["login"], "server": meta["server"], "name": "Demo", "currency": meta["currency"],
                    "balance": round(balance, 2), "equity": round(balance + floating, 2),
                    "margin_level": 1850.0, "leverage": 500, "updated": now},
        "deals": deals,
        "open_positions": open_positions,
    }
