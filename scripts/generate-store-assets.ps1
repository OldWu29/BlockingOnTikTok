# Generate store listing screenshots (1280x800 PNG) and extension icons.
# Usage: .\scripts\generate-store-assets.ps1

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$AssetsDir = Join-Path $ProjectRoot "docs\store-assets"
$IconsDir = Join-Path $AssetsDir "icons"
$OutputDir = Join-Path $AssetsDir "output"

New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
New-Item -ItemType Directory -Path $IconsDir -Force | Out-Null

function Get-EdgePath {
    $candidates = @(
        "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
        "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
    )
    foreach ($path in $candidates) {
        if (Test-Path $path) { return $path }
    }
    throw "Microsoft Edge not found. Install Edge or capture screenshots manually from docs/store-assets/*.html"
}

function Export-Screenshot {
    param(
        [string]$HtmlFile,
        [string]$PngFile,
        [int]$Width = 1280,
        [int]$Height = 800
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

function Export-IconPng {
    param(
        [string]$SvgPath,
        [string]$PngPath,
        [int]$Size
    )

    if (-not (Get-Command magick -ErrorAction SilentlyContinue)) {
        return $false
    }

    & magick convert -background none -resize "${Size}x${Size}" $SvgPath $PngPath
    return (Test-Path $PngPath)
}

$screenshots = @(
    @{ Html = "screenshot-01-video-page.html"; Png = "01-video-page-1280x800.png" },
    @{ Html = "screenshot-02-popup.html"; Png = "02-popup-1280x800.png" },
    @{ Html = "screenshot-03-blacklist.html"; Png = "03-blacklist-1280x800.png" },
    @{ Html = "screenshot-04-shortcuts.html"; Png = "04-shortcuts-1280x800.png" }
)

Write-Host "Generating screenshots..." -ForegroundColor Cyan
foreach ($item in $screenshots) {
    $html = Join-Path $AssetsDir $item.Html
    $png = Join-Path $OutputDir $item.Png
    Export-Screenshot -HtmlFile $html -PngFile $png
    Write-Host "  OK $($item.Png)"
}

$svg = Join-Path $IconsDir "icon.svg"
$iconSizes = @(16, 48, 128)
$iconExported = $true

foreach ($size in $iconSizes) {
    $png = Join-Path $IconsDir "icon-$size.png"
    $ok = Export-IconPng -SvgPath $svg -PngPath $png -Size $size
    if (-not $ok) {
        $iconExported = $false
        break
    }
    Write-Host "  OK icon-$size.png"
}

if (-not $iconExported) {
    Write-Host ""
    Write-Host "ImageMagick not found. Icons were not exported automatically." -ForegroundColor Yellow
    Write-Host "Install ImageMagick, or open docs/store-assets/icons/icon.svg and export 16/48/128 PNG manually."
}

Write-Host ""
Write-Host "Store assets generated in:" -ForegroundColor Green
Write-Host "  $OutputDir"
Write-Host ""
Write-Host "Upload to Partner Center -> Store listings -> Screenshots (1280x800 recommended)."
