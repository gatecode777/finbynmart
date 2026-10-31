Add-Type -AssemblyName System.Drawing

$band = [System.Drawing.Bitmap]::FromFile("public\images\test_industry_band.png")

# Let's inspect column X = 50 in test_industry_band from Y = 0 to 89
for ($y = 0; $y -lt $band.Height; $y += 2) {
    $p = $band.GetPixel(50, $y)
    Write-Output "band Y=$y (main Y=$($y+810)) R=$($p.R) G=$($p.G) B=$($p.B)"
}

$band.Dispose()
