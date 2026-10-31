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

# 6 Suppliers (Y=700, H=54)
$suppliers = @(
    @{ name = "shree-textiles";         x = 37;  w = 143 },
    @{ name = "abc-engineering-works";   x = 195; w = 143 },
    @{ name = "sunrise-packaging";      x = 353; w = 143 },
    @{ name = "medico-pharma";          x = 511; w = 143 },
    @{ name = "buildright-solutions";   x = 669; w = 143 },
    @{ name = "agro-fresh-foods";       x = 827; w = 143 }
)

foreach ($sup in $suppliers) {
    Crop-Image $sup.x 700 $sup.w 54 "public\images\suppliers\$($sup.name).png"
}

# India map graphic
Crop-Image 45 828 60 50 "public\images\banners\india-map.png"

$bmp.Dispose()
Write-Output "Final supplier and banner crops completed!"

