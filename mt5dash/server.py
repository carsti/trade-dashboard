"""Lokaler HTTP-Server (nur 127.0.0.1) mit JSON-API und der Dashboard-Oberfläche."""
from __future__ import annotations

import csv
import io
import json
import secrets
import sys
import threading
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from . import analytics, demo_source, mt5_source
from .config import Config

APP_ID = "mt5-bot-dashboard"


def static_dir() -> Path:
    base = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent.parent))
    return base / "mt5dash" / "static"


class AppState:
    def __init__(self, cfg: Config, demo: bool):
        self.cfg = cfg
        self.demo = demo
        self.snapshots: dict[str, dict] = {}
        self.lock = threading.Lock()
        self.refreshing = False
        self.last_refresh = None
        self._wake = threading.Event()
        self.stop = threading.Event()

    # Datenabruf -----------------------------------------------------------
    def _fetch(self, acc: dict) -> dict:
        if self.demo and acc["id"].startswith("demo"):
            return demo_source.fetch_demo(acc["id"])
        return mt5_source.fetch_account(acc, self.cfg.password_for(acc), int(self.cfg.data["history_days"]),
                                        self.cfg.data.get("default_terminal_path", ""))

    def refresh_account(self, acc: dict):
        base = {"key": str(acc["login"]), "label": acc["label"], "login": acc["login"], "server": acc["server"]}
        try:
            snap = self._fetch(acc)
            snap["account"] = {**snap["account"], **base, "status": "ok", "error": None}
        except Exception as e:  # noqa: BLE001 – Fehler pro Konto anzeigen, nicht abstürzen
            old = self.snapshots.get(acc["id"])
            snap = old or {"deals": [], "open_positions": [], "account": {}}
            snap = {**snap, "account": {**snap["account"], **base, "status": "error", "error": str(e),
                                        "updated": snap["account"].get("updated")}}
        with self.lock:
            self.snapshots[acc["id"]] = snap
        return snap["account"]

    def refresh_all(self):
        self.refreshing = True
        try:
            for acc in list(self.cfg.accounts()):
                if acc.get("enabled", True):
                    self.refresh_account(acc)
            ids = {a["id"] for a in self.cfg.accounts() if a.get("enabled", True)}
            with self.lock:
                for k in list(self.snapshots):
                    if k not in ids:
                        del self.snapshots[k]
            self.last_refresh = int(time.time())
        finally:
            self.refreshing = False

    def trigger_refresh(self):
        self._wake.set()

    def loop(self):
        while not self.stop.is_set():
            self.refresh_all()
            self._wake.wait(timeout=int(self.cfg.data.get("refresh_seconds", 60)))
            self._wake.clear()

    def report(self, t_from, t_to, group, accounts=None):
        with self.lock:
            snaps = list(self.snapshots.values())
        return analytics.build_report(snaps, self.cfg.data["bot_names"], t_from, t_to, group, accounts)


def _int_or_none(v):
    try:
        return int(v) if v not in (None, "") else None
    except ValueError:
        return None


def make_handler(state: AppState, token: str):
    class Handler(BaseHTTPRequestHandler):
        server_version = "MT5Dash"

        def log_message(self, fmt, *args):  # Konsole ruhig halten
            pass

        # Hilfsfunktionen -------------------------------------------------
        def _send(self, code, body: bytes, ctype="application/json; charset=utf-8", extra=None):
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            for k, v in (extra or {}).items():
                self.send_header(k, v)
            self.end_headers()
            self.wfile.write(body)

        def _json(self, obj, code=200):
            self._send(code, json.dumps(obj, ensure_ascii=False).encode())

        def _body(self):
            n = int(self.headers.get("Content-Length") or 0)
            return json.loads(self.rfile.read(n) or b"{}")

        def _authorized(self, q):
            return secrets.compare_digest(self.headers.get("X-Token") or q.get("token", [""])[0], token)

        # Routing ---------------------------------------------------------
        def do_GET(self):
            u = urlparse(self.path)
            q = parse_qs(u.query)
            if u.path == "/ping":
                return self._send(200, APP_ID.encode(), "text/plain")
            if u.path in ("/", "/index.html"):
                html = (static_dir() / "index.html").read_text(encoding="utf-8").replace("__TOKEN__", token)
                return self._send(200, html.encode(), "text/html; charset=utf-8")
            if u.path.startswith("/static/"):
                f = (static_dir() / u.path[len("/static/"):]).resolve()
                if static_dir().resolve() in f.parents and f.is_file():
                    ctype = {".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml",
                             ".ico": "image/x-icon"}.get(f.suffix, "application/octet-stream")
                    return self._send(200, f.read_bytes(), ctype + "; charset=utf-8")
                return self._send(404, b"not found", "text/plain")
            if not u.path.startswith("/api/"):
                return self._send(404, b"not found", "text/plain")
            if not self._authorized(q):
                return self._json({"error": "unauthorized"}, 403)

            if u.path == "/api/state":
                return self._json({
                    "demo": state.demo,
                    "mt5_available": mt5_source.available(),
                    "accounts": state.cfg.public_accounts(),
                    "settings": {k: state.cfg.data[k] for k in ("refresh_seconds", "history_days",
                                                               "default_terminal_path")},
                    "bot_names": state.cfg.data["bot_names"],
                    "refreshing": state.refreshing,
                    "last_refresh": state.last_refresh,
                })
            if u.path in ("/api/report", "/api/export.csv"):
                t_from = _int_or_none(q.get("from", [None])[0])
                t_to = _int_or_none(q.get("to", [None])[0])
                group = q.get("group", ["account"])[0]
                accs = {a for a in q.get("accounts", [""])[0].split(",") if a} or None
                rep = state.report(t_from, t_to, "bot" if group == "bot" else "account", accs)
                if u.path == "/api/report":
                    return self._json(rep)
                return self._send(200, _csv(rep).encode("utf-8-sig"), "text/csv; charset=utf-8",
                                  {"Content-Disposition": 'attachment; filename="bot-auswertung.csv"'})
            return self._json({"error": "not found"}, 404)

        def do_POST(self):
            u = urlparse(self.path)
            if not self._authorized(parse_qs(u.query)):
                return self._json({"error": "unauthorized"}, 403)
            try:
                body = self._body()
                if u.path == "/api/accounts":
                    acc = state.cfg.upsert_account(body)
                    status = state.refresh_account(acc)
                    return self._json({"account": acc["id"], "status": status})
                if u.path == "/api/accounts/delete":
                    state.cfg.delete_account(body["id"])
                    with state.lock:
                        state.snapshots.pop(body["id"], None)
                    return self._json({"ok": True})
                if u.path == "/api/bot-name":
                    state.cfg.set_bot_name(str(body["key"]), str(body.get("name", "")))
                    return self._json({"ok": True})
                if u.path == "/api/settings":
                    state.cfg.set_settings(body)
                    state.trigger_refresh()
                    return self._json({"ok": True})
                if u.path == "/api/refresh":
                    state.trigger_refresh()
                    return self._json({"ok": True})
                if u.path == "/api/shutdown":
                    self._json({"ok": True})
                    state.stop.set()
                    threading.Thread(target=self.server.shutdown, daemon=True).start()
                    return None
            except (ValueError, KeyError, TypeError) as e:
                return self._json({"error": str(e) or e.__class__.__name__}, 400)
            return self._json({"error": "not found"}, 404)

    return Handler


def _fmt_time(t):
    return datetime.fromtimestamp(t, timezone.utc).strftime("%Y-%m-%d %H:%M") if t else ""


def _csv(rep: dict) -> str:
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";")
    w.writerow(["Bot", "Magic", "Konten", "Währung", "Trades", "Gewinner", "Verlierer", "Trefferquote %",
                "Netto", "Bruttogewinn", "Bruttoverlust", "Kosten", "Profit-Faktor", "Ø Trade",
                "Max. Drawdown", "Offen", "Floating", "Letzter Trade"])
    def num(v):  # Dezimalkomma für deutsches Excel
        return "" if v is None else str(v).replace(".", ",")

    for b in rep["bots"]:
        w.writerow([b["name"], " ".join(map(str, b["magics"])), ", ".join(b["accounts"]), b["currency"],
                    b["trades"], b["wins"], b["losses"], num(b["win_rate"]), num(b["net"]),
                    num(b["gross_profit"]), num(b["gross_loss"]), num(b["costs"]), num(b["profit_factor"]),
                    num(b["avg_trade"]), num(b["max_drawdown"]), b["open_count"], num(b["floating"]),
                    _fmt_time(b["last_trade"])])
    return buf.getvalue()


def serve(state: AppState, port: int) -> tuple[ThreadingHTTPServer, str]:
    token = secrets.token_urlsafe(24)
    httpd = ThreadingHTTPServer(("127.0.0.1", port), make_handler(state, token))
    return httpd, token
