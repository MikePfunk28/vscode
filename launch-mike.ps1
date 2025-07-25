# Mike IDE PowerShell Launcher
# This script launches Mike IDE from Windows PowerShell

param(
    [string]$ProjectPath = ".",
    [switch]$Help
)

if ($Help) {
    Write-Host "Mike IDE Launcher"
    Write-Host "Usage: .\launch-mike.ps1 [ProjectPath]"
    Write-Host ""
    Write-Host "Examples:"
    Write-Host "  .\launch-mike.ps1                    # Open current directory"
    Write-Host "  .\launch-mike.ps1 C:\MyProject       # Open specific Windows folder"
    Write-Host "  .\launch-mike.ps1 -Help              # Show this help"
    exit
}

Write-Host "Starting Mike IDE..." -ForegroundColor Green

# Convert Windows path to WSL path if needed
$WSLPath = $ProjectPath
if ($ProjectPath -match "^[A-Za-z]:\\") {
    $Drive = $ProjectPath.Substring(0,1).ToLower()
    $RestPath = $ProjectPath.Substring(3).Replace('\', '/')
    $WSLPath = "/mnt/$Drive/$RestPath"
}

# Launch Mike IDE through WSL2
$Command = "cd /mnt/c/Users/mikep/code_clone && ./.build/electron/code-oss `"$WSLPath`" --no-sandbox"

Write-Host "Launching: $Command" -ForegroundColor Yellow

# Execute through WSL
wsl bash -c $Command

Write-Host "Mike IDE launched!" -ForegroundColor Green