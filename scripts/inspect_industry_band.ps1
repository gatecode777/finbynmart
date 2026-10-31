Add-Type -AssemblyName System.Drawing

$src = "C:\Users\busin\.gemini\antigravity\brain\9f4b7448-b1b2-445a-853b-9bb31b9ff1fb\.user_uploaded\media_1793449642566_baf161b1.jpg"
$bmp = [System.Drawing.Bitmap]::FromFile($src)

Write-Output "Image size: $($bmp.Width) x $($bmp.Height)"

# Crop the Industry Solutions area to inspect it
# In a 1024 high image, Industry Solutions is near the bottom, before footer
# Let's crop Y: 800 to 900
$rect = New-Object System.Drawing.Rectangle(0, 810, $bmp.Width, 90)
$crop = $bmp.Clone($rect, $bmp.PixelFormat)
$crop.Save("public\images\test_industry_band.png", [System.Drawing.Imaging.ImageFormat]::Png)
$crop.Dispose()

$bmp.Dispose()
Write-Output "Saved test_industry_band.png"
