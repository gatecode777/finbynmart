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
    Write-Output "Extracted $destPath ($w x $h)"
}

# 1. Hero Image (the two executives with corporate background)
Crop-Image 505 85 345 255 "public\images\hero\hero-professionals.png"

# 2. 10 Category Images
# Exact boundaries from categories_band inspection:
$categories = @(
    @{ name = "industrial-machinery";      x = 38;  w = 78 },
    @{ name = "electrical-electronics";    x = 134; w = 78 },
    @{ name = "apparel-fashion";          x = 229; w = 78 },
    @{ name = "home-lifestyle";           x = 325; w = 78 },
    @{ name = "packaging-printing";       x = 421; w = 78 },
    @{ name = "food-beverages";           x = 517; w = 78 },
    @{ name = "health-pharma";            x = 612; w = 78 },
    @{ name = "agriculture";              x = 708; w = 78 },
    @{ name = "construction-real-estate"; x = 804; w = 78 },
    @{ name = "chemicals-dyes";           x = 900; w = 78 }
)

foreach ($cat in $categories) {
    # Inner photo without border: Y=464, H=64
    Crop-Image $cat.x 464 $cat.w 64 "public\images\categories\$($cat.name).png"
}

# 3. 6 Supplier Images
$suppliers = @(
    @{ name = "shree-textiles";         x = 36;  w = 145 },
    @{ name = "abc-engineering-works";   x = 194; w = 145 },
    @{ name = "sunrise-packaging";      x = 352; w = 145 },
    @{ name = "medico-pharma";          x = 510; w = 145 },
    @{ name = "buildright-solutions";   x = 668; w = 145 },
    @{ name = "agro-fresh-foods";       x = 826; w = 145 }
)

foreach ($sup in $suppliers) {
    # Photo at top of supplier card: Y=720, H=50
    Crop-Image $sup.x 720 $sup.w 50 "public\images\suppliers\$($sup.name).png"
}

# 4. India Map Graphic
Crop-Image 45 845 58 58 "public\images\banners\india-map.png"

$bmp.Dispose()
Write-Output "All reference assets extracted successfully!"

