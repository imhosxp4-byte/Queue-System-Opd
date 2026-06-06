# Run this script as Administrator (once, requires internet)
# It installs the Premwadee TH voice then copies the files for offline bundling

$ErrorActionPreference = 'Stop'

Write-Host "Installing Microsoft Premwadee Thai TTS voice..." -ForegroundColor Cyan
Add-WindowsCapability -Online -Name "Language.TextToSpeech~~~th-TH~0.0.1.0"
Write-Host "Installed." -ForegroundColor Green

# Find new TH voice files (exclude Pattara)
$srcDir = "$env:WINDIR\Speech_OneCore\Engines\TTS\th-TH"
$destDir = Join-Path $PSScriptRoot "voices\th-TH-premwadee"
New-Item -ItemType Directory -Force -Path $destDir | Out-Null
New-Item -ItemType Directory -Force -Path "$destDir\NUSData" | Out-Null

$pattaraFiles = @('M1054Pattara*', 'MSTTSLocThTH*')

Get-ChildItem -Path $srcDir -File | Where-Object {
    $name = $_.Name
    -not ($pattaraFiles | Where-Object { $name -like $_ })
} | ForEach-Object {
    Copy-Item $_.FullName -Destination $destDir -Force
    Write-Host "  Copied: $($_.Name)"
}

# NUSData subfolder — new files only
if (Test-Path "$srcDir\NUSData") {
    Get-ChildItem -Path "$srcDir\NUSData" -File | Where-Object {
        $_.Name -notlike 'M1054Pattara*'
    } | ForEach-Object {
        Copy-Item $_.FullName -Destination "$destDir\NUSData" -Force
        Write-Host "  Copied NUSData: $($_.Name)"
    }
}

Write-Host ""
Write-Host "Done. Files saved to: $destDir" -ForegroundColor Green
Write-Host "Now run: npm run dist  to rebuild the installer." -ForegroundColor Yellow
