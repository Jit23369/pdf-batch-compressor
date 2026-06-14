@echo off
echo ===============================================
echo    PDF Batch Compressor Installer (Windows)   
echo ===============================================

rem Check Node.js
where node >nul 2>nul
if %errorlevel% equ 0 (
    for /f "tokens=*" %%i in ('node --version') do set NODE_VER=%%i
    echo Node.js: Detected (%NODE_VER%)
) else (
    echo Node.js: Not found. Please install Node.js (v20+ recommended) to run locally.
)

rem Check Docker
where docker >nul 2>nul
if %errorlevel% equ 0 (
    echo Docker: Detected
    set DOCKER_AVAILABLE=true
) else (
    echo Docker: Not found. Docker is recommended for the easiest setup.
    set DOCKER_AVAILABLE=false
)

rem Setup Env File
if not exist .env (
    echo Creating .env configuration file...
    copy .env.example .env >nul
    echo Created .env from .env.example
) else (
    echo Found existing .env file.
)

echo.
echo How would you like to run the application?
echo 1] Docker Compose (Recommended)
echo 2] Local Node.js Installation
echo 3] Just install dependencies
echo 4] Exit
set /p choice="Enter choice [1-4]: "

if "%choice%"=="1" (
    if "%DOCKER_AVAILABLE%"=="true" (
        echo Starting application with Docker Compose...
        docker-compose up --build
    ) else (
        echo Docker is not installed. Please install Docker or select option 2.
    )
) else if "%choice%"=="2" (
    echo Installing backend dependencies...
    call npm install
    echo Installing frontend dependencies...
    cd frontend
    call npm install
    cd ..
    echo Setup complete! To start:
    echo   - Backend (Terminal 1): npm start
    echo   - Frontend (Terminal 2): cd frontend ^&^& npm start
) else if "%choice%"=="3" (
    echo Installing backend dependencies...
    call npm install
    echo Installing frontend dependencies...
    cd frontend
    call npm install
    cd ..
    echo All dependencies installed!
) else (
    echo Exiting.
)
pause
