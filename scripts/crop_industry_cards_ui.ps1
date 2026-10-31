Add-Type -AssemblyName System.Drawing

$src = "C:\Users\busin\.gemini\antigravity\brain\9f4b7448-b1b2-445a-853b-9bb31b9ff1fb\.user_uploaded\media_1793449642566_baf161b1.jpg"
$bmp = [System.Drawing.Bitmap]::FromFile($src)

function Crop-Image($x, $y, $w, $h, $destPath) {
    if ($x + $w -gt $bmp.Width) { $w = $bmp.Width - $x }
    if ($y + $h -gt $bmp.Height) { $h = $bmp.Height - $y }
    $rect = New-Object System.Drawing.Rectangle($x, $y, $w, $h)
    
    # We create a 2x upscaled version with high quality bicubic interpolation
    $targetW = $w * 3
    $targetH = $h * 3
    $destBmp = New-Object System.Drawing.Bitmap($targetW, $targetH)
    $g = [System.Drawing.Graphics]::FromImage($destBmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    
    $destRect = New-Object System.Drawing.Rectangle(0, 0, $targetW, $targetH)
    $g.DrawImage($bmp, $destRect, $rect, [System.Drawing.GraphicsUnit]::Pixel)
    $g.Dispose()
    
    $dir = Split-Path $destPath
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    $destBmp.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $destBmp.Dispose()
    Write-Output "Saved $destPath ($targetW x $targetH)"
}

# The 8 Industry Solutions cards in the UI:
# Y is approx 834, Height is approx 38
$industries = @(
    @{ name = "manufacturing";    x = 23;  w = 72 },
    @{ name = "construction";     x = 104; w = 72 },
    @{ name = "agriculture";      x = 184; w = 72 },
    @{ name = "healthcare";       x = 264; w = 72 },
    @{ name = "food-processing";  x = 344; w = 72 },
    @{ name = "retail-wholesale"; x = 424; w = 72 },
    @{ name = "hospitality";      x = 504; w = 72 },
    @{ name = "education";        x = 584; w = 72 }
)

foreach ($ind in $industries) {
    Crop-Image $ind.x 834 $ind.w 38 "public\images\industries\$($ind.name).png"
}

$bmp.Dispose()
