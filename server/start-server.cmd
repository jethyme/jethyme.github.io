@echo off
chcp 65001 > nul
cd /d "%~dp0.."

echo.
echo   Запуск Wordle-сервера для Twitch
echo   Доска: http://localhost:3123/board.html
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo [ОШИБКА] Node.js не найден. Установите Node.js 18+ с https://nodejs.org
    echo.
    pause
    exit /b 1
)

echo Открываю браузер...
start "" "http://localhost:3123/board.html"

node server\server.js

echo.
echo Сервер остановлен.
pause
