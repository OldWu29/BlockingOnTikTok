# Generate all Microsoft Edge Add-ons store listing images.
# Usage: .\scripts\generate-store-listing.ps1
#
# Output folder: docs/store-assets/store-listing/
#   extension-logo-300x300.png
#   small-promo-tile-440x280.png
#   large-promo-tile-1400x560.png
#   screenshot-01..04-1280x800.png

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$AssetsDir = Join-Path $ProjectRoot "docs\store-assets"
$ListingDir = Join-Path $AssetsDir "store-listing"
$OutputDir = Join-Path $AssetsDir "output"

New-Item -ItemType Directory -Path $ListingDir -Force | Out-Null

& (Join-Path $ProjectRoot "scripts\generate-icons.ps1")
& (Join-Path $ProjectRoot "scripts\generate-store-assets.ps1")

function Get-EdgePath {
    $candidates = @(
        "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
        "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
    )
    foreach ($path in $candidates) {
        if (Test-Path $path) { return $path }
    }
    throw "Microsoft Edge not found."
}

function Export-Screenshot {
    param(
        [string]$HtmlFile,
        [string]$PngFile,
        [int]$Width,
        [int]$Height
    )

    $edge = Get-EdgePath
    $fullPath = (Resolve-Path $HtmlFile).Path
    $uri = [Uri]::new($fullPath).AbsoluteUri
    $args = @(
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        "--window-size=$Width,$Height",
        "--screenshot=$PngFile",
        $uri
    )
    & $edge @args | Out-Null
    if (-not (Test-Path $PngFile)) {
        throw "Screenshot failed: $HtmlFile"
    }
}

Write-Host ""
Write-Host "Generating store listing images..." -ForegroundColor Cyan

$icon300 = Join-Path $ProjectRoot "icons\icon-300.png"
$logo300 = Join-Path $ListingDir "extension-logo-300x300.png"
Copy-Item $icon300 $logo300 -Force
Write-Host "  OK extension-logo-300x300.png"

Export-Screenshot `
    -HtmlFile (Join-Path $AssetsDir "promo-small-440x280.html") `
    -PngFile (Join-Path $ListingDir "small-promo-tile-440x280.png") `
    -Width 440 -Height 280
Write-Host "  OK small-promo-tile-440x280.png"

Export-Screenshot `
    -HtmlFile (Join-Path $AssetsDir "promo-large-1400x560.html") `
    -PngFile (Join-Path $ListingDir "large-promo-tile-1400x560.png") `
    -Width 1400 -Height 560
Write-Host "  OK large-promo-tile-1400x560.png"

$screenshots = @(
    "01-video-page-1280x800.png",
    "02-popup-1280x800.png",
    "03-blacklist-1280x800.png",
    "04-shortcuts-1280x800.png"
)

for ($i = 0; $i -lt $screenshots.Count; $i++) {
    $src = Join-Path $OutputDir $screenshots[$i]
    $dest = Join-Path $ListingDir ("screenshot-{0:D2}-1280x800.png" -f ($i + 1))
    Copy-Item $src $dest -Force
    Write-Host "  OK $(Split-Path $dest -Leaf)"
}

Write-Host ""
Write-Host "All store listing images ready:" -ForegroundColor Green
Write-Host "  $ListingDir"
Write-Host ""
Write-Host "Partner Center upload mapping:"
Write-Host "  Extension logo        -> extension-logo-300x300.png"
Write-Host "  Small promotional tile -> small-promo-tile-440x280.png"
Write-Host "  Screenshots           -> screenshot-01..04-1280x800.png"
Write-Host "  Large promotional tile -> large-promo-tile-1400x560.png"
