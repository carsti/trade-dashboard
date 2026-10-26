# PyInstaller-Spezifikation: eine einzelne .exe mit Konsole (zeigt Adresse & Status an)
try:
    from PyInstaller.utils.hooks import collect_all
    _mt5_datas, _mt5_binaries, _mt5_hidden = collect_all("MetaTrader5")
except Exception:
    _mt5_datas, _mt5_binaries, _mt5_hidden = [], [], ["MetaTrader5"]

a = Analysis(
    ["run.py"],
    datas=[("mt5dash/static", "mt5dash/static")] + _mt5_datas,
    binaries=_mt5_binaries,
    hiddenimports=_mt5_hidden + ["numpy"],
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
