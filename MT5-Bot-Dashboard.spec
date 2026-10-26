# PyInstaller-Spezifikation: eine einzelne .exe mit Konsole (zeigt Adresse & Status an)
a = Analysis(
    ["run.py"],
    datas=[("mt5dash/static", "mt5dash/static")],
    hiddenimports=["MetaTrader5"],
    excludes=["tkinter", "matplotlib", "pandas", "PIL", "IPython"],
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz, a.scripts, a.binaries, a.datas,
    name="MT5-Bot-Dashboard",
    icon="mt5dash/static/icon.ico",
    console=True,
    upx=False,
)
