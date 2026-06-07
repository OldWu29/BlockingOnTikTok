# Generate extension icon PNG files (16, 48, 128).
# Design: Douyin-style dark bg + cyan/pink accents + default avatar + prohibition badge.
# Usage: .\scripts\generate-icons.ps1

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$IconsDir = Join-Path $ProjectRoot "docs\store-assets\icons"
New-Item -ItemType Directory -Path $IconsDir -Force | Out-Null

Add-Type -AssemblyName System.Drawing

function Add-RoundedRect {
    param($Graphics, $Brush, [int]$X, [int]$Y, [int]$W, [int]$H, [int]$R)
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc($X, $Y, $R * 2, $R * 2, 180, 90)
    $path.AddArc($X + $W - $R * 2, $Y, $R * 2, $R * 2, 270, 90)
    $path.AddArc($X + $W - $R * 2, $Y + $H - $R * 2, $R * 2, $R * 2, 0, 90)
    $path.AddArc($X, $Y + $H - $R * 2, $R * 2, $R * 2, 90, 90)
    $path.CloseFigure()
    $Graphics.FillPath($Brush, $path)
    $path.Dispose()
}

function Draw-DouyinNote {
    param($Graphics, [int]$X, [int]$Y, [int]$Scale, [int]$Alpha)

    $pink = [System.Drawing.Color]::FromArgb($Alpha, 254, 44, 85)
    $cyan = [System.Drawing.Color]::FromArgb($Alpha, 37, 244, 238)
    $penW = [Math]::Max(2, [int]($Scale * 0.22))

    $pinkPen = New-Object System.Drawing.Pen $pink, $penW
    $cyanPen = New-Object System.Drawing.Pen $cyan, $penW
    $pinkPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pinkPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $cyanPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $cyanPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

    $cx = $X + [int]($Scale * 0.45)
    $cy = $Y + [int]($Scale * 0.35)
    $r = [int]($Scale * 0.22)
    $Graphics.DrawArc($cyanPen, $X, $Y, $Scale, $Scale, 210, 120)
    $Graphics.DrawLine($cyanPen, $cx, $cy, $cx, $Y + $Scale)
    $Graphics.FillEllipse((New-Object System.Drawing.SolidBrush $cyan), $cx - $r, $cy - $r, $r * 2, $r * 2)

    $Graphics.DrawArc($pinkPen, $X + [int]($Scale * 0.12), $Y + [int]($Scale * 0.08), $Scale, $Scale, 210, 120)
    $Graphics.DrawLine($pinkPen, $cx + [int]($Scale * 0.12), $cy + [int]($Scale * 0.08), $cx + [int]($Scale * 0.12), $Y + $Scale + [int]($Scale * 0.08))
    $Graphics.FillEllipse((New-Object System.Drawing.SolidBrush $pink), $cx + [int]($Scale * 0.12) - $r, $cy + [int]($Scale * 0.08) - $r, $r * 2, $r * 2)

    $pinkPen.Dispose()
    $cyanPen.Dispose()
}

function New-ExtensionIcon {
    param([int]$Size)

    $bmp = New-Object System.Drawing.Bitmap $Size, $Size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.Clear([System.Drawing.Color]::FromArgb(255, 22, 24, 35))

    $corner = [Math]::Max(2, [int]($Size * 0.18))
    Add-RoundedRect $g (New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 22, 24, 35))) 0 0 $Size $Size $corner

    if ($Size -ge 32) {
        Draw-DouyinNote $g ([int]($Size * 0.06)) ([int]($Size * 0.06)) ([int]($Size * 0.28)) 180
    }

    $ringPenW = [Math]::Max(2, [int]($Size * 0.035))
    $ringRect = [int]($Size * 0.10)
    $ringSize = $Size - $ringRect * 2
    $pinkPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(220, 254, 44, 85)), $ringPenW
    $cyanPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(220, 37, 244, 238)), $ringPenW
    $g.DrawArc($cyanPen, $ringRect - 1, $ringRect - 1, $ringSize, $ringSize, 130, 160)
    $g.DrawArc($pinkPen, $ringRect + 1, $ringRect + 1, $ringSize, $ringSize, -50, 160)

    $avatarSize = [int]($Size * 0.62)
    $avatarX = [int](($Size - $avatarSize) / 2)
    $avatarY = [int](($Size - $avatarSize) / 2) - [Math]::Max(0, [int]($Size * 0.01))

    $avatarBg = [System.Drawing.Color]::FromArgb(255, 232, 232, 232)
    $silhouette = [System.Drawing.Color]::FromArgb(255, 178, 178, 178)
    $g.FillEllipse((New-Object System.Drawing.SolidBrush $avatarBg), $avatarX, $avatarY, $avatarSize, $avatarSize)

    $headSize = [int]($avatarSize * 0.30)
    $headX = $avatarX + [int](($avatarSize - $headSize) / 2)
    $headY = $avatarY + [int]($avatarSize * 0.22)
    $g.FillEllipse((New-Object System.Drawing.SolidBrush $silhouette), $headX, $headY, $headSize, $headSize)

    $bodyW = [int]($avatarSize * 0.52)
    $bodyH = [int]($avatarSize * 0.30)
    $bodyX = $avatarX + [int](($avatarSize - $bodyW) / 2)
    $bodyY = $avatarY + [int]($avatarSize * 0.52)
    $g.FillEllipse((New-Object System.Drawing.SolidBrush $silhouette), $bodyX, $bodyY, $bodyW, $bodyH)

    $badgeSize = [Math]::Max([int]($Size * 0.30), 6)
    $badgeX = $Size - $badgeSize - [int]($Size * 0.04)
    $badgeY = $Size - $badgeSize - [int]($Size * 0.04)

    $whiteRing = [Math]::Max(2, [int]($Size * 0.035))
    $g.FillEllipse(
        (New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 22, 24, 35))),
        $badgeX - $whiteRing,
        $badgeY - $whiteRing,
        $badgeSize + $whiteRing * 2,
        $badgeSize + $whiteRing * 2
    )
    $g.FillEllipse(
        (New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 254, 44, 85))),
        $badgeX,
        $badgeY,
        $badgeSize,
        $badgeSize
    )

    $barWidth = [Math]::Max(2, [int]($Size * 0.055))
    $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), $barWidth
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $cx = $badgeX + $badgeSize / 2
    $cy = $badgeY + $badgeSize / 2
    $half = $badgeSize * 0.28
    $g.DrawLine($pen, $cx - $half, $cy + $half, $cx + $half, $cy - $half)

    $out = Join-Path $IconsDir "icon-$Size.png"
    $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
    $pen.Dispose(); $pinkPen.Dispose(); $cyanPen.Dispose()
    $g.Dispose(); $bmp.Dispose()
    Write-Host "  OK icon-$Size.png"
}

foreach ($size in @(16, 48, 128, 300)) {
    New-ExtensionIcon -Size $size
}

$svg = @'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="24" fill="#161823"/>
  <path d="M18 34c10-8 18-6 24 2s4 18-4 24" fill="none" stroke="#25f4ee" stroke-width="5" stroke-linecap="round"/>
  <path d="M30 42c10-8 18-6 24 2s4 18-4 24" fill="none" stroke="#fe2c55" stroke-width="5" stroke-linecap="round"/>
  <circle cx="30" cy="66" r="6" fill="#25f4ee"/>
  <circle cx="42" cy="74" r="6" fill="#fe2c55"/>
  <circle cx="64" cy="58" r="40" fill="none" stroke="#25f4ee" stroke-width="3" opacity=".8"/>
  <circle cx="66" cy="60" r="40" fill="none" stroke="#fe2c55" stroke-width="3" opacity=".8"/>
  <circle cx="64" cy="58" r="34" fill="#e8e8e8"/>
  <circle cx="64" cy="48" r="10" fill="#b2b2b2"/>
  <ellipse cx="64" cy="72" rx="18" ry="10" fill="#b2b2b2"/>
  <circle cx="96" cy="96" r="20" fill="#fe2c55"/>
  <circle cx="96" cy="96" r="23" fill="none" stroke="#161823" stroke-width="4"/>
  <line x1="86" y1="106" x2="106" y2="86" stroke="#fff" stroke-width="5" stroke-linecap="round"/>
</svg>
'@
Set-Content -Path (Join-Path $IconsDir "icon.svg") -Value $svg -Encoding UTF8

$destRoot = Join-Path $ProjectRoot "icons"
New-Item -ItemType Directory -Path $destRoot -Force | Out-Null
Copy-Item (Join-Path $IconsDir "icon-16.png") (Join-Path $destRoot "icon-16.png") -Force
Copy-Item (Join-Path $IconsDir "icon-48.png") (Join-Path $destRoot "icon-48.png") -Force
Copy-Item (Join-Path $IconsDir "icon-128.png") (Join-Path $destRoot "icon-128.png") -Force
Copy-Item (Join-Path $IconsDir "icon-300.png") (Join-Path $destRoot "icon-300.png") -Force

Write-Host ""
Write-Host "Icons copied to: $destRoot" -ForegroundColor Green
