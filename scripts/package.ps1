# Edge extension packaging script for Microsoft Partner Center upload.
# Usage: .\scripts\package.ps1
# Optional: .\scripts\package.ps1 -OutputDir dist -ZipName my-extension.zip

param(
    [string]$OutputDir = "dist",
    [string]$ZipName = ""
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

function Get-ManifestVersion {
    $manifestPath = Join-Path $ProjectRoot "manifest.json"
    if (-not (Test-Path $manifestPath)) {
        throw "manifest.json not found: $manifestPath"
    }
    $manifest = Get-Content $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
    return [string]$manifest.version
}

function Test-RequiredFiles {
    $required = @(
        "manifest.json",
        "src\background.js",
        "src\content.js",
        "src\inject.js",
        "src\popup.html",
        "src\popup.js",
        "src\blacklist.html",
        "src\blacklist.js",
        "src\storage.js"
    )

    foreach ($file in $required) {
        $path = Join-Path $ProjectRoot $file
        if (-not (Test-Path $path)) {
            throw "Missing required file: $file"
        }
    }
}

function New-ExtensionPackage {
    param(
        [string]$StageDir,
        [string]$ZipPath
    )

    if (Test-Path $StageDir) {
        Remove-Item $StageDir -Recurse -Force
    }
    New-Item -ItemType Directory -Path $StageDir | Out-Null

    Copy-Item (Join-Path $ProjectRoot "manifest.json") $StageDir
    Copy-Item (Join-Path $ProjectRoot "src") (Join-Path $StageDir "src") -Recurse
    if (Test-Path (Join-Path $ProjectRoot "icons")) {
        Copy-Item (Join-Path $ProjectRoot "icons") (Join-Path $StageDir "icons") -Recurse
    }

    $manifestInStage = Join-Path $StageDir "manifest.json"
    if (-not (Test-Path $manifestInStage)) {
        throw "Invalid package layout: manifest.json must be at zip root"
    }

    if (Test-Path $ZipPath) {
        Remove-Item $ZipPath -Force
    }

    Compress-Archive -Path (Join-Path $StageDir "*") -DestinationPath $ZipPath -CompressionLevel Optimal
}

Test-RequiredFiles

$version = Get-ManifestVersion
if ([string]::IsNullOrWhiteSpace($ZipName)) {
    $ZipName = "douyin-block-v$version.zip"
}

$distPath = Join-Path $ProjectRoot $OutputDir
$stagePath = Join-Path $distPath "_stage"
$zipPath = Join-Path $distPath $ZipName

New-Item -ItemType Directory -Path $distPath -Force | Out-Null
New-ExtensionPackage -StageDir $stagePath -ZipPath $zipPath
Remove-Item $stagePath -Recurse -Force

Write-Host ""
Write-Host "Package created successfully." -ForegroundColor Green
Write-Host "Version: $version"
Write-Host "Output : $zipPath"
Write-Host ""
Write-Host "Before upload, verify:" -ForegroundColor Yellow
Write-Host "  1. Unzipped root contains manifest.json directly"
Write-Host "  2. manifest version matches this release"
Write-Host "  3. Extension works in edge://extensions (load unpacked)"
