"""Startpunkt: startet den lokalen Server und öffnet das Dashboard im Browser."""
from __future__ import annotations

import argparse
import sys
import threading
import urllib.request
import webbrowser

from . import demo_source
from .config import Config, config_dir
from .server import APP_ID, AppState, serve

DEFAULT_PORT = 8765


def _already_running(port: int) -> bool:
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/ping", timeout=1) as r:
            return r.read().decode() == APP_ID
    except OSError:
        return False


def main(argv=None):
    ap = argparse.ArgumentParser(description="MT5 Bot Dashboard")
    ap.add_argument("--demo", action="store_true", help="mit Beispieldaten starten (kein MT5 nötig)")
    ap.add_argument("--port", type=int, default=DEFAULT_PORT)
    ap.add_argument("--no-browser", action="store_true")
    args = ap.parse_args(argv)

    url = f"http://127.0.0.1:{args.port}/"
    if _already_running(args.port):
        print(f"Dashboard läuft bereits: {url}")
        webbrowser.open(url)
        return

    if args.demo:
        cfg = Config(config_dir() / "demo-config.json")
        if not cfg.accounts():
            for a in demo_source.DEMO_ACCOUNTS:
                cfg.data["accounts"].append({"id": a["id"], "label": a["label"], "login": a["login"],
                                             "server": a["server"], "password": "", "terminal_path": "",
                                             "enabled": True, "allow_switch": False})
            cfg.save()
    else:
        cfg = Config()

    state = AppState(cfg, demo=args.demo)
    httpd, _ = serve(state, args.port)
    threading.Thread(target=state.loop, daemon=True).start()

    print("=" * 60)
    print(" MT5 Bot Dashboard" + (" (DEMO)" if args.demo else ""))
    print(f" Läuft unter: {url}")
    print(f" Konfiguration: {cfg.path}")
    print(" Zum Beenden dieses Fenster schließen oder im Dashboard 'Beenden' klicken.")
    print("=" * 60)
    if not args.no_browser:
        threading.Timer(0.8, webbrowser.open, args=(url,)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        state.stop.set()
        httpd.server_close()


if __name__ == "__main__":
    sys.exit(main())
