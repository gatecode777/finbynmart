Add-Type -AssemblyName System.Drawing

$srcPath = "public\images\b2b_reference_homepage.jpg"
$bmp = [System.Drawing.Bitmap]::FromFile($srcPath)

function Crop-Image($x, $y, $w, $h, $destPath) {
    if ($x + $w -gt $bmp.Width) { $w = $bmp.Width - $x }
    if ($y + $h -gt $bmp.Height) { $h = $bmp.Height - $y }
    $rect = New-Object System.Drawing.Rectangle($x, $y, $w, $h)
    $crop = $bmp.Clone($rect, $bmp.PixelFormat)
    $dir = Split-Path $destPath
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    $crop.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $crop.Dispose()
    Write-Output "Saved $destPath ($w x $h)"
}

$categories = @(
    @{ name = "industrial-machinery";      x = 38;  w = 78 },
    @{ name = "electrical-electronics";    x = 133; w = 78 },
    @{ name = "apparel-fashion";          x = 228; w = 78 },
    @{ name = "home-lifestyle";           x = 323; w = 78 },
    @{ name = "packaging-printing";       x = 418; w = 78 },
    @{ name = "food-beverages";           x = 514; w = 78 },
    @{ name = "health-pharma";            x = 609; w = 78 },
    @{ name = "agriculture";              x = 705; w = 78 },
    @{ name = "construction-real-estate"; x = 800; w = 78 },
    @{ name = "chemicals-dyes";           x = 896; w = 78 }
)

foreach ($cat in $categories) {
    Crop-Image $cat.x 433 $cat.w 58 "public\images\categories\$($cat.name).png"
}

$bmp.Dispose()

