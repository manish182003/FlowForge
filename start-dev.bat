@echo off
echo =============================================
echo    FlowForge Distributed Platform Launcher   
echo =============================================
start "FlowForge API Server" cmd /k "cd server && npm run dev"
start "FlowForge React UI" cmd /k "cd client && npm run dev"
echo Both services are launching in separate windows!
echo Open your browser at: http://localhost:5173/

