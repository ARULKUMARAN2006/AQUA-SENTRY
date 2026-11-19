@echo off
REM Starts the Aqua Sentry analytics backend (Spark job output + ingest API).
REM Requires Java 17+. Run from this folder.
setlocal
cd /d "%~dp0"
if "%AQUA_DB_USER%"=="" set "AQUA_DB_USER=root"
if "%AQUA_DB_PASSWORD%"=="" set /p "AQUA_DB_PASSWORD=MySQL password (Enter if empty): "
if "%AQUA_DB_URL%"=="" set "AQUA_DB_URL=jdbc:mysql://localhost:3306/aquasentry?useSSL=false^&serverTimezone=UTC"
if not exist "sbt-launch.jar" (
  echo Downloading sbt launcher...
  powershell -NoProfile -Command "Invoke-WebRequest -Uri 'https://repo1.maven.org/maven2/org/scala-sbt/sbt-launch/1.10.7/sbt-launch-1.10.7.jar' -OutFile 'sbt-launch.jar' -UseBasicParsing"
)
echo Starting analytics API on http://localhost:8080
java -Xmx1200m -jar sbt-launch.jar "runMain com.aquasentry.analytics.AnalyticsApi 8080"
endlocal
