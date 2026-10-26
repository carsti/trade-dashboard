# MT5 Bot Dashboard

Ein Dashboard für mehrere MetaTrader 5-Konten, das zeigt, **welcher Bot (EA) Gewinn macht und welcher Verlust**:
pro Konto oder kontoübergreifend, für frei wählbare Zeiträume. Läuft als einzelne `MT5-Bot-Dashboard.exe`,
ohne Python-Installation auf dem Zielrechner.

## Was es kann

- **Mehrere MT5-Konten** hinzufügen (Login, Server, Passwort, optional eigener Terminal-Pfad).
  Passwörter werden mit Windows-DPAPI verschlüsselt gespeichert (nur dein Windows-Benutzer kann sie lesen).
  Das **Investor-Passwort reicht**, da nur gelesen wird.
- **Auswertung pro Bot**: Bots werden über die **Magic-Nummer** erkannt. Netto-Ergebnis inkl. Kommission und Swap,
  Anzahl Trades, Trefferquote, Profit-Faktor, Ø Trade, max. Drawdown, Kosten, offene Positionen (floating).
- Positionen, die per SL/TP oder manuell geschlossen wurden, werden über die Position dem Bot zugeordnet,
  der sie eröffnet hat. Magic 0 erscheint als „Manuell“.
- **Bot je Konto** oder **Bots kontoübergreifend** zusammengefasst (gleicher Name und gleiche Kontowährung).
- Bots **umbenennen** (Name in der Tabelle anklicken). Standardname ist der Order-Kommentar des EAs plus Magic-Nummer.
- Zeiträume: Heute, 7/30/90 Tage, laufendes Jahr, Gesamt, Von/Bis.
- Diagramme: Netto pro Bot und kumulierter Verlauf ausgewählter Bots.
- **CSV-Export** (Excel-tauglich, Dezimalkomma).
- Automatische Aktualisierung (Standard alle 60 s).

## Benutzung

1. Auf dem PC muss das **MetaTrader 5-Terminal installiert** sein. Die MT5-Python-Schnittstelle spricht immer mit
   einem lokalen Terminal.
2. `MT5-Bot-Dashboard.exe` starten. Der Browser öffnet sich mit `http://127.0.0.1:8765/`
   (nur lokal erreichbar). Das Konsolenfenster zeigt den Status. Zum Beenden das Fenster schließen oder im Dashboard
   „Beenden“ klicken.
3. **Konten** → Konto hinzufügen → „Speichern & verbinden“.

Ausprobieren ohne MT5: `MT5-Bot-Dashboard.exe --demo` startet mit Beispieldaten.

### Wichtig: ein Terminal = ein eingeloggtes Konto

Ein MT5-Terminal kann immer nur mit einem Konto eingeloggt sein. Würde das Dashboard ein Terminal, in dem deine Bots
laufen, auf ein anderes Konto umschalten, würden die Bots **auf dem anderen Konto weiterhandeln**. Deshalb gilt:

- **Empfohlen:** Pro Konto ein eigenes Terminal (z. B. die Broker-Installationen, die du ohnehin hast) und den Pfad zur
  jeweiligen `terminal64.exe` beim Konto eintragen. Ist das Terminal bereits mit dem Konto eingeloggt, liest das
  Dashboard nur mit und schaltet nichts um.
- Ist ein Terminal mit einem anderen Konto eingeloggt, meldet das Dashboard einen Fehler, statt umzuschalten.
- **Login-Wechsel erlauben** beim Konto nur aktivieren, wenn es ein eigenes „Dashboard-Terminal“ ohne Bots ist.
  Dann loggt das Dashboard nacheinander in alle so markierten Konten ein.

Tipp für ein separates Dashboard-Terminal: den MT5-Ordner kopieren (z. B. nach `C:\MT5-Dashboard\`) und
`terminal64.exe /portable` einmal starten.

### Hinweise zur Auswertung

- Gezählt werden **geschlossene Positionen**, deren Schließzeit im Zeitraum liegt. Teilschließungen fließen ein,
  sobald die Position ganz geschlossen ist. Offene Positionen erscheinen separat als „Offen (floating)“.
- Zeiten sind **Serverzeit des Brokers** (so wie im MT5-Terminal).
- Summen werden **nie über Währungen hinweg** gemischt: ein EUR- und ein USD-Konto ergeben getrennte Kennzahlen.
- Einzahlungen, Auszahlungen, Credits usw. zählen nicht als Bot-Ergebnis.

Konfiguration: `%APPDATA%\MT5BotDashboard\config.json`

## Selbst bauen

Voraussetzung: Windows, Python 3.10–3.13 (64-bit).

```bat
build.bat
```

Ergebnis: `dist\MT5-Bot-Dashboard.exe`. Alternativ baut der GitHub-Workflow `.github/workflows/build-exe.yml`
die exe bei jedem Tag `v*` automatisch und hängt sie an das Release.

Entwicklung ohne Build: `pip install -r requirements.txt` und `python run.py` (bzw. `python run.py --demo`).
Tests: `python -m unittest discover -s tests -t .`

## Aufbau

| Datei | Aufgabe |
|---|---|
| `mt5dash/mt5_source.py` | Liest Konto, Deal-History und Positionen über das `MetaTrader5`-Paket |
| `mt5dash/analytics.py` | Fasst Deals zu Positionen zusammen und berechnet die Kennzahlen pro Bot |
| `mt5dash/config.py` | Konten, Bot-Namen, Einstellungen, DPAPI-Verschlüsselung |
| `mt5dash/server.py` | Lokaler HTTP-Server (nur 127.0.0.1, mit Zugriffstoken) und JSON-API |
| `mt5dash/static/` | Oberfläche (HTML/CSS/JS, keine externen Abhängigkeiten, läuft offline) |
| `mt5dash/demo_source.py` | Beispieldaten für `--demo` |
