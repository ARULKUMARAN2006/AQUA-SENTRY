@echo off
REM Runs the Apache Spark batch analytics job over XAMPP MySQL.
setlocal
cd /d "%~dp0"
if "%AQUA_DB_USER%"=="" set "AQUA_DB_USER=root"

if "%AQUA_DB_PASSWORD%"=="" (
  echo Enter the local MySQL password for user %AQUA_DB_USER%.
  echo Leave it empty if the XAMPP account has no password.
  set /p "AQUA_DB_PASSWORD=MySQL password: "
)
if "%AQUA_DB_URL%"=="" set "AQUA_DB_URL=jdbc:mysql://localhost:3306/aquasentry?useSSL=false^&serverTimezone=UTC"
set "INPUT=%AQUA_DB_URL%"
set "OUTPUT=data/analytics_summary.json"
set "BUCKET=60"

echo Running Spark analytics job...
java -Xmx2g -jar sbt-launch.jar "runMain com.aquasentry.analytics.AquaSentryAnalytics %INPUT% %OUTPUT% %BUCKET%"
echo Done. Result written to %OUTPUT%
endlocal
