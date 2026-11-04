# Trade Dashboard – Android App

Android companion app for the [MT5 Bot Dashboard](../README.md), built with Kotlin and Jetpack Compose.

## Features

- **Connect** to any running MT5 Bot Dashboard instance on your local network
- **Dashboard overview**: currency totals, net P&L, return %, gauges (win rate, bots in profit, profit factor)
- **Bot listing**: per-bot cards with mini equity curves, stats, rename support, risk warnings
- **Analysis**: breakdown by symbol, weekday, and hour (server time)
- **Time ranges**: Today, 7 days, 30 days, 90 days, YTD, All-time
- **Demo mode** toggle
- **Auto-refresh** at the server's configured interval (default 60 s)
- Dark neon purple/violet theme matching the web dashboard

## Build

Requires Android Studio Ladybug (2024.2) or later.

```bash
cd android-app
./gradlew assembleDebug
# APK: app/build/outputs/apk/debug/app-debug.apk
```

Minimum Android: API 26 (Android 8.0 Oreo)

## Connect

1. Start `MT5-Bot-Dashboard.exe` on your trading PC
2. Open the browser URL that the console shows (e.g. `http://192.168.1.20:8765/?token=…`)
3. Copy that full URL and paste it into the Android app's connect screen

The app parses the token automatically from the URL.

> **Note:** `usesCleartextTraffic="true"` is set in the manifest so the app can reach `http://` LAN addresses.
> For internet-facing servers, use a reverse proxy with HTTPS.
