Add-Type -AssemblyName System.Drawing

$srcPath = "public\images\b2b_reference_homepage.jpg"
$bmp = [System.Drawing.Bitmap]::FromFile($srcPath)

function Crop-Image($x, $y, $w, $h, $destPath) {
    # Ensure within bounds
    if ($x + $w -gt $bmp.Width) { $w = $bmp.Width - $x }
    if ($y + $h -gt $bmp.Height) { $h = $bmp.Height - $y }
    $rect = New-Object System.Drawing.Rectangle($x, $y, $w, $h)
    $crop = $bmp.Clone($rect, $bmp.PixelFormat)
    $dir = Split-Path $destPath
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    $crop.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Jpeg)
    $crop.Dispose()
    Write-Output "Saved $destPath ($w x $h)"
}

# The 10 categories are roughly evenly spaced between X=40 and X=985
# Width of area = 945px, 10 items => each slot is ~94.5px
# Let's inspect the cards:
# Card Y range is approx Y: 462 to 535 for the image part

# Let's crop 10 test slices:
$catNames = @(
    "industrial-machinery",
    "electrical-electronics",
    "apparel-fashion",
    "home-lifestyle",
    "packaging-printing",
    "food-beverages",
    "health-pharma",
    "agriculture",
    "construction-real-estate",
    "chemicals-dyes"
)

# Approx centers:
# Let's try 10 slots with X starting at ~40, step ~94.5, card inner image width ~70, height ~60, Y ~465
for ($i = 0; $i -lt 10; $i++) {
    $x = [int](40 + $i * 94.5 + 10)
    $y = 465
    $w = 75
    $h = 60
    Crop-Image $x $y $w $h "public\images\categories\$($catNames[$i]).jpg"
}

$bmp.Dispose()

