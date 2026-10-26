import unittest
from collections import namedtuple

from mt5dash import analytics, mt5_source


def deal(ticket, pos, t, entry, magic, profit=0.0, comm=0.0, swap=0.0, typ=0, vol=0.1, comment=""):
    return {"ticket": ticket, "position_id": pos, "time": t, "type": typ, "entry": entry, "magic": magic,
            "symbol": "EURUSD", "volume": vol, "profit": profit, "commission": comm, "swap": swap, "fee": 0.0,
            "comment": comment}


def snap(login, deals, open_positions=(), currency="USD"):
    return {"account": {"key": str(login), "label": f"Acc {login}", "login": login, "server": "S",
                        "currency": currency},
            "deals": list(deals), "open_positions": list(open_positions)}


class AnalyticsTest(unittest.TestCase):
    def test_closing_deal_without_magic_is_attributed_to_opening_bot(self):
        deals = [deal(1, 1, 100, 0, 777, comm=-1, comment="Alpha"),
                 deal(2, 1, 200, 1, 0, profit=50, comm=-1, comment="[tp]")]
        rep = analytics.build_report([snap(1, deals)], {}, None, None)
        self.assertEqual(len(rep["bots"]), 1)
        b = rep["bots"][0]
        self.assertEqual(b["magics"], [777])
        self.assertEqual(b["name"], "Alpha (777)")
        self.assertEqual(b["net"], 48.0)
        self.assertEqual(b["costs"], -2.0)

    def test_balance_deals_and_open_positions_are_not_trades(self):
        deals = [deal(1, 0, 50, 0, 0, profit=1000, typ=2),         # Einzahlung
                 deal(2, 5, 100, 0, 9, comment="B")]                # noch offen
        rep = analytics.build_report([snap(1, deals, [{"magic": 9, "profit": -3.5, "swap": -0.5}])], {}, None, None)
        b = rep["bots"][0]
        self.assertEqual(b["trades"], 0)
        self.assertEqual(b["floating"], -4.0)
        self.assertEqual(b["open_count"], 1)

    def test_partial_close_counts_once_when_fully_closed(self):
        deals = [deal(1, 1, 100, 0, 5, vol=1.0),
                 deal(2, 1, 150, 1, 5, profit=10, vol=0.5),
                 deal(3, 1, 300, 1, 5, profit=-30, vol=0.5)]
        b = analytics.build_report([snap(1, deals)], {}, None, None)["bots"][0]
        self.assertEqual((b["trades"], b["net"], b["losses"]), (1, -20.0, 1))

    def test_period_filter_uses_close_time(self):
        deals = [deal(1, 1, 100, 0, 5), deal(2, 1, 200, 1, 5, profit=10),
                 deal(3, 2, 300, 0, 5), deal(4, 2, 400, 1, 5, profit=-4)]
        b = analytics.build_report([snap(1, deals)], {}, 150, 250)["bots"][0]
        self.assertEqual((b["trades"], b["net"]), (1, 10.0))

    def test_stats(self):
        deals = []
        for i, p in enumerate([10, -5, 20, -15, 5]):
            deals += [deal(2 * i, i + 1, 10 * i, 0, 3), deal(2 * i + 1, i + 1, 10 * i + 5, 1, 3, profit=p)]
        b = analytics.build_report([snap(1, deals)], {}, None, None)["bots"][0]
        self.assertEqual(b["win_rate"], 60.0)
        self.assertEqual(b["profit_factor"], round(35 / 20, 2))
        self.assertEqual(b["max_drawdown"], 15.0)  # Peak 25 → Tief 10
        self.assertEqual(b["curve"][-1][1], 15.0)

    def test_grouping_across_accounts_and_names(self):
        a = [deal(1, 1, 1, 0, 42), deal(2, 1, 2, 1, 42, profit=10)]
        b = [deal(1, 1, 1, 0, 42), deal(2, 1, 2, 1, 42, profit=-4)]
        names = {"42": "Scalper"}
        per_acc = analytics.build_report([snap(1, a), snap(2, b)], names, None, None, "account")
        self.assertEqual(len(per_acc["bots"]), 2)
        merged = analytics.build_report([snap(1, a), snap(2, b)], names, None, None, "bot")
        self.assertEqual(len(merged["bots"]), 1)
        self.assertEqual(merged["bots"][0]["net"], 6.0)
        self.assertEqual(merged["bots"][0]["accounts"], ["Acc 1", "Acc 2"])
        # konto-spezifischer Name gewinnt
        named = analytics.build_report([snap(1, a)], {"42": "X", "1:42": "Y"}, None, None)
        self.assertEqual(named["bots"][0]["name"], "Y")

    def test_currencies_are_not_mixed(self):
        a = [deal(1, 1, 1, 0, 42), deal(2, 1, 2, 1, 42, profit=10)]
        rep = analytics.build_report([snap(1, a, currency="USD"), snap(2, a, currency="EUR")],
                                     {"42": "S"}, None, None, "bot")
        self.assertEqual(len(rep["bots"]), 2)
        self.assertEqual([t["currency"] for t in rep["totals"]], ["EUR", "USD"])


Info = namedtuple("Info", "login server name currency balance equity margin_level leverage")


class FakeMT5:
    def __init__(self, logged_in):
        self.logged_in = logged_in
        self.logins = []

    def initialize(self, **kw):
        return True

    def shutdown(self):
        pass

    def last_error(self):
        return (-1, "fake")

    def account_info(self):
        if self.logged_in is None:
            return None
        return Info(self.logged_in, "S", "N", "USD", 1.0, 1.0, 0.0, 100)

    def login(self, login, password, server, timeout):
        self.logins.append(login)
        self.logged_in = login
        return True

    def history_deals_get(self, a, b):
        D = namedtuple("D", mt5_source.DEAL_FIELDS)
        return (D(*[0] * len(mt5_source.DEAL_FIELDS)),)

    def positions_get(self):
        return ()


class SourceTest(unittest.TestCase):
    def run_with(self, fake, acc):
        old = mt5_source.mt5
        mt5_source.mt5 = fake
        try:
            return mt5_source.fetch_account(acc, "pw", 30)
        finally:
            mt5_source.mt5 = old

    def test_reads_without_switching_when_already_logged_in(self):
        fake = FakeMT5(123)
        r = self.run_with(fake, {"login": 123, "server": "S"})
        self.assertEqual(fake.logins, [])
        self.assertEqual(len(r["deals"]), 1)

    def test_refuses_to_switch_terminal_with_other_account(self):
        fake = FakeMT5(999)
        with self.assertRaises(mt5_source.SourceError):
            self.run_with(fake, {"login": 123, "server": "S"})
        self.assertEqual(fake.logins, [])

    def test_switches_when_allowed_or_not_logged_in(self):
        fake = FakeMT5(999)
        self.run_with(fake, {"login": 123, "server": "S", "allow_switch": True})
        self.assertEqual(fake.logins, [123])
        fake = FakeMT5(None)
        self.run_with(fake, {"login": 123, "server": "S"})
        self.assertEqual(fake.logins, [123])


if __name__ == "__main__":
    unittest.main()
