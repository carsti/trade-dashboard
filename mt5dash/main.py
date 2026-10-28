"""Startpunkt: startet den Server und öffnet das Dashboard im Browser."""
from __future__ import annotations

import argparse
import sys
import threading
import urllib.request
import webbrowser

from .server import APP_ID, VERSION, AppState, lan_ip, make_config, serve

DEFAULT_PORT = 8765


def _running_instance(port: int) -> str | None:
    """'same' = diese Version läuft schon, 'old' = andere Version des Dashboards, None = Port frei/fremd."""
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/ping", timeout=1) as r:
            reply = r.read().decode()
    except OSError:
        return None
    if reply == f"{APP_ID} {VERSION}":
        return "same"
    return "old" if reply.startswith(APP_ID) else None


def main(argv=None):
    ap = argparse.ArgumentParser(description="MT5 Bot Dashboard")
    ap.add_argument("--demo", action="store_true", help="mit Beispieldaten starten (kein MT5 nötig)")
    ap.add_argument("--port", type=int, default=DEFAULT_PORT)
    ap.add_argument("--no-browser", action="store_true")
    ap.add_argument("--local", action="store_true", help="nur auf diesem PC erreichbar, nicht im Netzwerk")
    args = ap.parse_args(argv)

    url = f"http://127.0.0.1:{args.port}/"
    running = _running_instance(args.port)
    if running == "same":
        print(f"Dashboard läuft bereits: {url}")
        webbrowser.open(url)
        return
    while running == "old":
        # Eine ältere Version (z. B. die alte .exe) belegt den Port. Statt sie wiederzuverwenden
        # und die alte Oberfläche zu zeigen, auf den nächsten Port ausweichen.
        print(f"Hinweis: Auf Port {args.port} läuft noch eine ältere Dashboard-Version. "
              "Dort im Dashboard 'Beenden' klicken oder das alte Konsolenfenster schließen.")
        args.port += 1
        url = f"http://127.0.0.1:{args.port}/"
        running = _running_instance(args.port)
        if running == "same":
            print(f"Dashboard läuft bereits: {url}")
            webbrowser.open(url)
            return

    cfg = make_config(args.demo)
    state = AppState(cfg, demo=args.demo)
    httpd, _ = serve(state, args.port, "127.0.0.1" if args.local else "0.0.0.0")
    threading.Thread(target=state.loop, daemon=True).start()

    print("=" * 60)
    print(" MT5 Bot Dashboard" + (" (DEMO)" if args.demo else ""))
    print(f" Läuft unter: {url}")
    if not args.local:
        ip = lan_ip()
        if ip:
            print(f" Im Netzwerk (Handy, Tablet, anderer PC): http://{ip}:{args.port}/")
        else:
            print(" Im Netzwerk: keine Netzwerkverbindung gefunden")
        print(" Fragt die Windows-Firewall nach, 'Private Netzwerke' zulassen.")
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
