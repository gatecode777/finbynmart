Add-Type -AssemblyName System.Drawing

$bmp = [System.Drawing.Bitmap]::FromFile("public\images\b2b_reference_homepage.jpg")

# In column X = 100 (Shree textiles photo), scan Y from 680 to 760
for ($y = 690; $y -lt 765; $y += 3) {
    $p = $bmp.GetPixel(100, $y)
    Write-Output "Y=$y R=$($p.R) G=$($p.G) B=$($p.B)"
}

$bmp.Dispose()

