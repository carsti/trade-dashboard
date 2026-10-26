@echo off
REM Baut dist\MT5-Bot-Dashboard.exe  (Voraussetzung: Python 3.10-3.13 64-bit, https://www.python.org)
setlocal
cd /d "%~dp0"
if not exist .venv (
  py -3 -m venv .venv || python -m venv .venv || goto :err
)
call .venv\Scripts\activate.bat || goto :err
python -m pip install --upgrade pip >nul
python -m pip install -r requirements-build.txt || goto :err
python -m unittest discover -s tests -t . || goto :err
pyinstaller --noconfirm --clean MT5-Bot-Dashboard.spec || goto :err
echo.
echo Fertig: dist\MT5-Bot-Dashboard.exe
goto :eof
:err
echo.
echo Build fehlgeschlagen.
exit /b 1
