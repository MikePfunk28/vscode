@echo off
REM Mike-AI-IDE Windows Build Script
REM Simple script to build Mike-AI-IDE for Windows

echo.
echo =============================================
echo   Mike-AI-IDE Windows Build Script
echo =============================================
echo.

REM Check if we're in the right directory
if not exist "package.json" (
    echo ERROR: package.json not found!
    echo Please run this script from the VS Code root directory.
    pause
    exit /b 1
)

if not exist "product.json" (
    echo ERROR: product.json not found!
    echo Please run this script from the VS Code root directory.
    pause
    exit /b 1
)

echo ✓ Verified VS Code directory structure
echo.

REM Set architecture (default to x64, can be overridden)
set ARCH=x64
if "%1"=="arm64" set ARCH=arm64

echo Building Mike-AI-IDE for Windows %ARCH%...
echo.

REM Clean previous builds
echo 🧹 Cleaning previous builds...
if exist "out-vscode" rmdir /s /q "out-vscode"
if exist "out-vscode-min" rmdir /s /q "out-vscode-min"

REM Compile the source
echo 📦 Compiling source code...
call npm run compile
if errorlevel 1 (
    echo ❌ Compilation failed!
    pause
    exit /b 1
)

echo ✅ Compilation completed
echo.

REM Build minified version
echo 🚀 Building Mike-AI-IDE for Windows %ARCH%...
call npx gulp vscode-win32-%ARCH%-min
if errorlevel 1 (
    echo ❌ Build failed!
    pause
    exit /b 1
)

echo ✅ Build completed successfully!
echo.

REM Optional: Create installer (if Inno Setup is available)
echo 📦 Attempting to create Windows installer...
call npx gulp vscode-win32-%ARCH%-system-setup 2>nul
if errorlevel 1 (
    echo ⚠️  Warning: Could not create system installer
    echo    This is normal if Inno Setup is not installed
) else (
    echo ✅ System installer created
)

call npx gulp vscode-win32-%ARCH%-user-setup 2>nul
if errorlevel 1 (
    echo ⚠️  Warning: Could not create user installer
    echo    This is normal if Inno Setup is not installed
) else (
    echo ✅ User installer created
)

echo.
echo 🎉 Mike-AI-IDE build process completed!
echo.
echo Build output location: ..\VSCode-win32-%ARCH%
echo.

REM Check if output exists
if exist "..\VSCode-win32-%ARCH%" (
    echo ✅ Build output verified at: ..\VSCode-win32-%ARCH%
    echo.
    echo You can now run Mike-AI-IDE with:
    echo    ..\VSCode-win32-%ARCH%\Mike-AI-IDE.exe
) else (
    echo ❌ Build output not found! Build may have failed.
)

echo.
echo Press any key to exit...
pause >nul