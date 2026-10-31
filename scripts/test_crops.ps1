Add-Type -AssemblyName System.Drawing

$srcPath = "public\images\b2b_reference_homepage.jpg"
$bmp = [System.Drawing.Bitmap]::FromFile($srcPath)

function Crop-Image($x, $y, $w, $h, $destPath) {
    $rect = New-Object System.Drawing.Rectangle($x, $y, $w, $h)
    $crop = $bmp.Clone($rect, $bmp.PixelFormat)
    $dir = Split-Path $destPath
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    $crop.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $crop.Dispose()
    Write-Output "Saved $destPath ($w x $h)"
}

# Test crop hero professionals
Crop-Image 520 90 350 265 "public\images\hero\test_hero_people.png"

# Test crop logo
Crop-Image 25 5 155 42 "public\images\test_logo.png"

# Test crop India map
Crop-Image 45 892 55 60 "public\images\test_india_map.png"

$bmp.Dispose()

