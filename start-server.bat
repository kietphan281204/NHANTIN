@echo off
cd /d "%~dp0server"
echo Starting server...
node src/index.js
pause
