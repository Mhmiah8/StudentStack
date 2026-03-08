@echo off
setlocal
cd /d C:\Users\User\studentstack

for /f %%I in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set TIMESTAMP=%%I
set LOG_FILE=scraper_log_run_%TIMESTAMP%.txt

echo [%date% %time%] Starting Trackr scraper... >> %LOG_FILE%
py trackr_scraper_final.py --season 2026 --all >> %LOG_FILE% 2>&1
if errorlevel 1 (
	echo [%date% %time%] Trackr scraper FAILED >> %LOG_FILE%
	echo Log saved to %LOG_FILE%
	exit /b 1
)
echo [%date% %time%] Trackr scraper finished >> %LOG_FILE%

echo [%date% %time%] Starting LUMA scraper... >> %LOG_FILE%
py luma/luma_api_scraper.py >> %LOG_FILE% 2>&1
if errorlevel 1 (
	echo [%date% %time%] LUMA scraper FAILED >> %LOG_FILE%
	echo Log saved to %LOG_FILE%
	exit /b 1
)
echo [%date% %time%] LUMA scraper finished >> %LOG_FILE%

echo [%date% %time%] Starting UCAS scraper... >> %LOG_FILE%
py ucas_scraper.py --pages 5 >> %LOG_FILE% 2>&1
if errorlevel 1 (
	echo [%date% %time%] UCAS scraper FAILED >> %LOG_FILE%
	echo Log saved to %LOG_FILE%
	exit /b 1
)
echo [%date% %time%] UCAS scraper finished >> %LOG_FILE%

echo [%date% %time%] All scrapers completed! >> %LOG_FILE%
echo ---------------------------------------- >> %LOG_FILE%
echo Log saved to %LOG_FILE%
endlocal