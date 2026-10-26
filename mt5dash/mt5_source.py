"""Liest Kontodaten, Deal-History und offene Positionen über die MetaTrader5-Python-API.

Die API spricht immer mit einem lokal installierten MT5-Terminal. Ein Terminal ist
zu jeder Zeit nur mit einem Konto eingeloggt. Deshalb:
  * Jedes Konto kann einen eigenen Terminal-Pfad haben (empfohlen: ein Terminal pro Konto).
  * Ist das Terminal bereits mit dem Konto eingeloggt, wird nur gelesen, nichts umgeschaltet.
  * Ist es mit einem anderen Konto eingeloggt, wird nur umgeschaltet, wenn das Konto
    "allow_switch" erlaubt. Sonst würden laufende EAs in diesem Terminal plötzlich auf
    dem anderen Konto handeln.
"""
from __future__ import annotations

import threading
import time
from datetime import datetime, timedelta, timezone

try:
    import MetaTrader5 as mt5
except ImportError:  # nicht unter Windows oder Paket fehlt
    mt5 = None

# Die MT5-API hat globalen Zustand → Zugriffe strikt nacheinander.
_LOCK = threading.Lock()

DEAL_FIELDS = ("ticket", "order", "position_id", "time", "type", "entry", "magic", "symbol",
               "volume", "price", "profit", "commission", "swap", "fee", "comment", "reason")
POS_FIELDS = ("ticket", "identifier", "time", "type", "magic", "symbol", "volume",
              "price_open", "price_current", "sl", "tp", "profit", "swap", "comment")


class SourceError(Exception):
    pass


def available() -> bool:
    return mt5 is not None


def _err(prefix: str) -> SourceError:
    code, msg = mt5.last_error()
    return SourceError(f"{prefix}: {msg} ({code})")


def _pick(obj, fields) -> dict:
    d = obj._asdict()
    return {f: d.get(f) for f in fields}


def fetch_account(acc: dict, password: str, history_days: int, default_terminal_path: str = "") -> dict:
    if mt5 is None:
        raise SourceError("Python-Paket 'MetaTrader5' nicht verfügbar (nur unter Windows)")

    login = int(acc["login"])
    path = acc.get("terminal_path") or default_terminal_path or None

    with _LOCK:
        kw = {"path": path} if path else {}
        if not mt5.initialize(**kw, timeout=60_000):
            raise _err("Terminal konnte nicht gestartet/verbunden werden")
        try:
            info = mt5.account_info()
            if info is None or info.login != login:
                if info is not None and not acc.get("allow_switch"):
                    raise SourceError(
                        f"Terminal ist mit Konto {info.login} eingeloggt, nicht mit {login}. "
                        "Eigenen Terminal-Pfad für dieses Konto angeben oder 'Login-Wechsel erlauben' aktivieren "
                        "(nur wenn in diesem Terminal keine Bots laufen!).")
                if not mt5.login(login, password=password or "", server=acc["server"], timeout=60_000):
                    raise _err("Login fehlgeschlagen")
                info = mt5.account_info()
                if info is None:
                    raise _err("Keine Kontoinformationen")

            date_to = datetime.now(timezone.utc) + timedelta(days=2)  # Serverzeit kann vor UTC liegen
            date_from = date_to - timedelta(days=history_days + 2)
            deals = mt5.history_deals_get(date_from, date_to)
            if deals is None:
                raise _err("Deal-History nicht lesbar")
            positions = mt5.positions_get() or ()

            return {
                "account": {
                    "login": info.login,
                    "server": info.server,
                    "name": info.name,
                    "currency": info.currency,
                    "balance": info.balance,
                    "equity": info.equity,
                    "margin_level": info.margin_level,
                    "leverage": info.leverage,
                    "updated": int(time.time()),
                },
                "deals": [_pick(d, DEAL_FIELDS) for d in deals],
                "open_positions": [_pick(p, POS_FIELDS) for p in positions],
            }
        finally:
            mt5.shutdown()
