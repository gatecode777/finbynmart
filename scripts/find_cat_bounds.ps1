Add-Type -AssemblyName System.Drawing

$band = [System.Drawing.Bitmap]::FromFile("public\images\categories_band.png")

# Card 1 is roughly X: 40 to 110 in the band
# Let's inspect where the dark pixels (the motor) are between X=45 and X=110 across Y=0 to 129
$minY = 999
$maxY = -1
$minX = 999
$maxX = -1

for ($y = 0; $y -lt $band.Height; $y++) {
    for ($x = 40; $x -lt 115; $x++) {
        $pixel = $band.GetPixel($x, $y)
        # Background is white/light gray (R,G,B > 230)
        # The motor has darker pixels (brightness < 0.8)
        if ($pixel.GetBrightness() -lt 0.75) {
            if ($y -lt $minY) { $minY = $y }
            if ($y -gt $maxY) { $maxY = $y }
            if ($x -lt $minX) { $minX = $x }
            if ($x -gt $maxX) { $maxX = $x }
        }
    }
}

Write-Output "In categories_band.png:"
Write-Output "Card 1 content bounds: X=$minX..$maxX, Y=$minY..$maxY"
Write-Output "In main image (add Y=440): Y=$($minY + 440)..$($maxY + 440)"

$band.Dispose()

