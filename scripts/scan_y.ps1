Add-Type -AssemblyName System.Drawing

$bmp = [System.Drawing.Bitmap]::FromFile("public\images\b2b_reference_homepage.jpg")

# Find the card borders and images for the category section
# Let's inspect column X = 80 (middle of Card 1) from Y = 380 to Y = 560
for ($y = 380; $y -lt 560; $y += 5) {
    $p = $bmp.GetPixel(80, $y)
    Write-Output "Y=$y R=$($p.R) G=$($p.G) B=$($p.B)"
}

$bmp.Dispose()

