#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}===============================================${NC}"
echo -e "${BLUE}   PDF Batch Compressor Installer & Setup      ${NC}"
echo -e "${BLUE}===============================================${NC}"

# Check Node.js
echo -n "Checking Node.js... "
if command -v node >/dev/null 2>&1; then
    echo -e "${GREEN}Detected ($(node --version))${NC}"
else
    echo -e "${RED}Not found. Please install Node.js (v20+ recommended) to run locally.${NC}"
fi

# Check Docker
echo -n "Checking Docker... "
if command -v docker >/dev/null 2>&1; then
    echo -e "${GREEN}Detected ($(docker --version | awk '{print $3}' | tr -d ','))${NC}"
    DOCKER_AVAILABLE=true
else
    echo -e "${RED}Not found. Docker is recommended for the easiest setup.${NC}"
    DOCKER_AVAILABLE=false
fi

# Setup Env File if not exists
if [ ! -f .env ]; then
    echo "Creating .env configuration file..."
    cp .env.example .env
    echo -e "${GREEN}Created .env from .env.example${NC}"
else
    echo "Found existing .env file."
fi

# Selection menu
echo
echo "How would you like to run the application?"
echo -e "1) ${GREEN}Docker Compose${NC} (Recommended - runs backend with Ghostscript and frontend together)"
echo "2) Local Node.js Installation (Runs servers on your local machine)"
echo "3) Just install dependencies"
echo "4) Exit"
read -p "Enter choice [1-4]: " choice

case $choice in
    1)
        if [ "$DOCKER_AVAILABLE" = true ]; then
            echo -e "${BLUE}Starting application with Docker Compose...${NC}"
            docker-compose up --build
        else
            echo -e "${RED}Docker is not installed or not running. Please install Docker first or choose option 2.${NC}"
        fi
        ;;
    2)
        echo -e "${BLUE}Installing backend dependencies...${NC}"
        npm install
        
        echo -e "${BLUE}Installing frontend dependencies...${NC}"
        cd frontend && npm install
        cd ..
        
        echo -e "${GREEN}Dependencies installed successfully!${NC}"
        echo -e "To start the application, run:"
        echo -e "  - Backend (Terminal 1): ${BLUE}npm start${NC}"
        echo -e "  - Frontend (Terminal 2): ${BLUE}cd frontend && npm start${NC}"
        ;;
    3)
        echo -e "${BLUE}Installing backend dependencies...${NC}"
        npm install
        
        echo -e "${BLUE}Installing frontend dependencies...${NC}"
        cd frontend && npm install
        cd ..
        echo -e "${GREEN}All dependencies installed!${NC}"
        ;;
    *)
        echo "Exiting setup."
        exit 0
        ;;
esac
