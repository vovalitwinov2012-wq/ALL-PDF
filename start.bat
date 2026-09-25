@echo off
chcp 65001 >nul
title ALL PDF — локальный запуск
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ОШИБКА] Node.js не найден. Установите LTS с https://nodejs.org/ и запустите снова.
  pause
  exit /b 1
)

if not exist "package.json" (
  echo [ОШИБКА] start.bat должен лежать в корне проекта ALL-PDF (рядом с package.json).
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [1/2] Устанавливаю зависимости (первый запуск, ~1 минута)...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo [ОШИБКА] npm install завершился с ошибкой. Проверьте интернет и запустите снова.
    pause
    exit /b 1
  )
) else (
  echo [1/2] Зависимости уже установлены, пропускаю.
)

echo [2/2] Запускаю ALL PDF...
echo       Браузер откроется сам на адрес из строки Local ниже.
echo       Для остановки закройте это окно или нажмите Ctrl+C.
echo.

call npm run dev -- --port 5173 --open

pause
