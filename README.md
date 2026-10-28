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
- **Design**: buntes Violett/Neon (Hell umschaltbar unter Einstellungen), Sidebar mit aufklappbaren Menüs
  (eingeklappt als Flyout), Suche oben (Bot, Symbol, Magic). Jede Ansicht hat eine eigene Adresse
  (z. B. `#/bots/tabelle`), Zurück/Vor im Browser funktioniert.
- **Demo / Live** umschaltbar unter Einstellungen (oder Klick auf das DEMO-Abzeichen), ohne Neustart.
- **Dashboard**: Neon-Ringe für Trefferquote, Bots im Plus und Gewinntage; Netto je Währung mit Rendite in %
  und Heute / 7 T / 30 T; Konten als Balken (Klick zeigt nur dieses Konto, Strg+Klick mehrere); Verlauf kumuliert oder täglich mit
  Markierung des besten und schwächsten Tags; Bot-Ranking nach Rendite (bei vielen Bots die besten 6 und schwächsten 4); **Aktivität** (letzte Trades);
  Kalender mit Tages-P&L; Trefferquote der meistgehandelten Symbole.
- **Bots**: Karte pro Bot mit Mini-Kurve, Rendite, Trades, Treffer, PF, Max. DD und Hinweisen
  (⚠ Risiko bei Grid/Martingale-Muster: hohe Trefferquote, aber Ø Verlust ≥ 3× Ø Gewinn; ◷ Inaktiv nach 7 Tagen
  ohne Trade), alternativ Tabelle; Bot-Vergleich der kumulierten Kurven (beliebige 8 Bots gleichzeitig).
- **Analyse**: Ergebnis je Symbol, nach Wochentag und nach Uhrzeit (Serverzeit), großer Monatskalender.
- Rendite in % bezieht sich auf die Balance zu Zeitraumbeginn plus Einzahlungen im Zeitraum (bei „Gesamt“ also auf
  die Summe der Einzahlungen). Auszahlungen senken die Basis nicht, abgezogene Gewinne verfälschen die Rendite also nicht.
- **CSV-Export** (Excel-tauglich, Dezimalkomma).
- Automatische Aktualisierung (Standard alle 60 s).

## Benutzung

1. Auf dem PC muss das **MetaTrader 5-Terminal installiert** sein. Die MT5-Python-Schnittstelle spricht immer mit
   einem lokalen Terminal.
2. `MT5-Bot-Dashboard.exe` starten. Der Browser öffnet sich mit `http://127.0.0.1:8765/`.
   Das Konsolenfenster zeigt den Status und die Adresse im Netzwerk. Zum Beenden das Fenster schließen oder im Dashboard
   „Beenden“ klicken.
3. **Konten** → Konto hinzufügen → „Speichern & verbinden“.

### Von anderen Geräten aus (Handy, Tablet, zweiter PC)

Die exe läuft nur auf dem PC mit den MT5-Terminals. Andere Geräte im selben Netzwerk öffnen einfach im Browser die
Adresse, die das Konsolenfenster unter „Im Netzwerk“ anzeigt, z. B. `http://192.168.1.20:8765/`. Auf den anderen
Geräten muss nichts installiert werden.

- Beim ersten Start fragt die Windows-Firewall nach: **„Private Netzwerke“ zulassen**. Wurde das abgelehnt, unter
  *Windows-Sicherheit → Firewall → Zugriff von Apps durch die Firewall zulassen* nachholen.
- Von anderen Geräten aus kann man alles ansehen, aktualisieren und Bots umbenennen. Konten, Terminalpfade,
  Einstellungen und „Beenden“ gehen nur am PC selbst.
- Wer das Dashboard nur lokal haben will: mit `--local` starten.

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
| `mt5dash/server.py` | HTTP-Server (lokal und im Heimnetz, mit Zugriffstoken; Änderungen an Konten nur lokal) und JSON-API |
| `mt5dash/static/` | Oberfläche (HTML/CSS/JS, keine externen Abhängigkeiten, läuft offline) |
| `mt5dash/demo_source.py` | Beispieldaten für `--demo` |
