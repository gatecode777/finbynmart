Add-Type -AssemblyName System.Drawing

$bmp = [System.Drawing.Bitmap]::FromFile("public\images\b2b_reference_homepage.jpg")

# Find the India map around X: 50, Y: 800 to 920
for ($y = 800; $y -lt 920; $y += 5) {
    $p = $bmp.GetPixel(60, $y)
    Write-Output "Y=$y R=$($p.R) G=$($p.G) B=$($p.B)"
}

$bmp.Dispose()

