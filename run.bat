@echo off
title OmniTranslate AI - Real-Time Multilingual Studio
chcp 65001 >nul
echo ========================================================
echo   🌟 Starting OmniTranslate AI Studio...
echo ========================================================
echo.

if exist venv\Scripts\activate.bat (
    echo Activating Python virtual environment...
    call venv\Scripts\activate.bat
)

echo Opening browser in 2 seconds...
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://127.0.0.1:5000"

echo Running OmniTranslate AI on http://127.0.0.1:5000
python app.py

pause
