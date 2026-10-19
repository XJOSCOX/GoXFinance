@echo off
setlocal
title GoXFinance
pushd "%~dp0" || exit /b 1
where node >nul 2>nul
if errorlevel 1 (
  echo GoXFinance requires Node.js 22 or newer. Install Node.js, then try again.
  pause
  popd
  exit /b 1
)
if not exist "node_modules\tsx\package.json" (
  echo Dependencies are missing. Run npm install in this folder once, then try again.
  pause
  popd
  exit /b 1
)
node --import tsx scripts/windows/start.ts
set "launch_result=%errorlevel%"
if not "%launch_result%"=="0" pause
popd
exit /b %launch_result%
