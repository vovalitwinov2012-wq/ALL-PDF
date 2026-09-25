@echo off
chcp 65001 >nul
title ALL PDF — локальный запуск
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 goto nonode
if not exist "package.json" goto nopkg
if not exist "node_modules" goto install
echo [1/2] Зависимости уже установлены, пропускаю.
goto run

:nonode
echo [ОШИБКА] Node.js не найден. Установите LTS с https://nodejs.org/ и запустите снова.
pause
exit /b 1

:nopkg
echo [ОШИБКА] start.bat должен лежать в корне проекта ALL-PDF, рядом с package.json.
pause
exit /b 1

:install
echo [1/2] Устанавливаю зависимости, первый запуск около минуты...
call npm install --no-audit --no-fund
if errorlevel 1 goto npmfail
goto run

:npmfail
echo [ОШИБКА] npm install завершился с ошибкой. Проверьте интернет и запустите снова.
pause
exit /b 1

:run
echo [2/2] Запускаю ALL PDF...
echo       Браузер откроется сам на адрес из строки Local ниже.
echo       Для остановки закройте это окно или нажмите Ctrl+C.
echo.
call npm run dev -- --port 5173 --open
pause
