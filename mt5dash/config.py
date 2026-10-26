"""Speichert Konten und Bot-Namen in einer JSON-Datei.

Windows: %APPDATA%\\MT5BotDashboard\\config.json
Passwörter werden unter Windows mit DPAPI verschlüsselt (nur der gleiche
Windows-Benutzer auf dem gleichen PC kann sie entschlüsseln).
"""
from __future__ import annotations

import base64
import json
import os
import sys
import threading
import uuid
from pathlib import Path

APP_NAME = "MT5BotDashboard"


def config_dir() -> Path:
    if sys.platform == "win32":
        base = Path(os.environ.get("APPDATA") or Path.home())
    else:
        base = Path(os.environ.get("XDG_CONFIG_HOME") or Path.home() / ".config")
    d = base / APP_NAME
    d.mkdir(parents=True, exist_ok=True)
    return d


# --- Passwort-Verschlüsselung -------------------------------------------------

if sys.platform == "win32":
    import ctypes
    from ctypes import wintypes

    class _Blob(ctypes.Structure):
        _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_char))]

    def _to_blob(data: bytes) -> _Blob:
        buf = ctypes.create_string_buffer(data, len(data))
        return _Blob(len(data), ctypes.cast(buf, ctypes.POINTER(ctypes.c_char)))

    def _crypt(fn, data: bytes) -> bytes:
        src, out = _to_blob(data), _Blob()
        if not fn(ctypes.byref(src), None, None, None, None, 0, ctypes.byref(out)):
            raise ctypes.WinError()
        try:
            return ctypes.string_at(out.pbData, out.cbData)
        finally:
            ctypes.windll.kernel32.LocalFree(out.pbData)

    def encrypt_secret(plain: str) -> str:
        if not plain:
            return ""
        return "dpapi:" + base64.b64encode(_crypt(ctypes.windll.crypt32.CryptProtectData, plain.encode())).decode()

    def decrypt_secret(stored: str) -> str:
        if not stored:
            return ""
        if stored.startswith("dpapi:"):
            raw = base64.b64decode(stored[6:])
            return _crypt(ctypes.windll.crypt32.CryptUnprotectData, raw).decode()
        return base64.b64decode(stored.split(":", 1)[-1]).decode()
else:
    # Nur für Entwicklung/Demo außerhalb von Windows: keine echte Verschlüsselung.
    def encrypt_secret(plain: str) -> str:
        return "b64:" + base64.b64encode(plain.encode()).decode() if plain else ""

    def decrypt_secret(stored: str) -> str:
        return base64.b64decode(stored.split(":", 1)[-1]).decode() if stored else ""


# --- Konfiguration -------------------------------------------------------------

DEFAULTS = {
    "accounts": [],          # [{id, label, login, server, password(enc), terminal_path}]
    "bot_names": {},         # "login:magic" oder "magic" → Anzeigename
    "refresh_seconds": 60,
    "history_days": 3650,    # wie weit zurück die Deal-History gelesen wird
    "default_terminal_path": "",
}


class Config:
    def __init__(self, path: Path | None = None):
        self.path = path or config_dir() / "config.json"
        self._lock = threading.Lock()
        self.data = json.loads(json.dumps(DEFAULTS))
        if self.path.exists():
            try:
                self.data.update(json.loads(self.path.read_text(encoding="utf-8")))
            except (OSError, ValueError):
                self.path.rename(self.path.with_suffix(".broken.json"))

    def save(self):
        with self._lock:
            tmp = self.path.with_suffix(".tmp")
            tmp.write_text(json.dumps(self.data, indent=2, ensure_ascii=False), encoding="utf-8")
            tmp.replace(self.path)

    # Konten ---------------------------------------------------------------
    def accounts(self) -> list[dict]:
        return self.data["accounts"]

    def public_accounts(self) -> list[dict]:
        """Konten ohne Passwort, für die Oberfläche."""
        return [{k: v for k, v in a.items() if k != "password"} | {"has_password": bool(a.get("password"))}
                for a in self.data["accounts"]]

    def upsert_account(self, payload: dict) -> dict:
        login = int(str(payload.get("login", "")).strip())
        server = str(payload.get("server", "")).strip()
        if not server:
            raise ValueError("Server fehlt")
        acc_id = payload.get("id")
        existing = next((a for a in self.data["accounts"] if a["id"] == acc_id), None) if acc_id else None
        if existing is None:
            existing = {"id": uuid.uuid4().hex[:8]}
            self.data["accounts"].append(existing)
        existing.update({
            "label": str(payload.get("label") or f"{login} @ {server}").strip(),
            "login": login,
            "server": server,
            "terminal_path": str(payload.get("terminal_path") or "").strip(),
            "enabled": bool(payload.get("enabled", True)),
            "allow_switch": bool(payload.get("allow_switch", False)),
        })
        pw = payload.get("password")
        if pw:  # leer lassen = bisheriges Passwort behalten
            existing["password"] = encrypt_secret(pw)
        existing.setdefault("password", "")
        self.save()
        return existing

    def delete_account(self, acc_id: str):
        self.data["accounts"] = [a for a in self.data["accounts"] if a["id"] != acc_id]
        self.save()

    def password_for(self, acc: dict) -> str:
        return decrypt_secret(acc.get("password", ""))

    # Bot-Namen ------------------------------------------------------------
    def set_bot_name(self, key: str, name: str):
        name = name.strip()
        if name:
            self.data["bot_names"][key] = name
        else:
            self.data["bot_names"].pop(key, None)
        self.save()

    def set_settings(self, payload: dict):
        for k in ("refresh_seconds", "history_days"):
            if k in payload:
                self.data[k] = max(10 if k == "refresh_seconds" else 1, int(payload[k]))
        if "default_terminal_path" in payload:
            self.data["default_terminal_path"] = str(payload["default_terminal_path"]).strip()
        self.save()
