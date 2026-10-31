Add-Type -AssemblyName System.Drawing

$src = "C:\Users\busin\.gemini\antigravity\brain\9f4b7448-b1b2-445a-853b-9bb31b9ff1fb\.user_uploaded\media_1793449642566_baf161b1.jpg"
$bmp = [System.Drawing.Bitmap]::FromFile($src)

# Let's inspect row Y = 870 across X from 0 to 681
# Card borders or gaps between cards are white/light background
$cardState = $false
$cardStart = 0
$cards = @()

for ($x = 0; $x -lt $bmp.Width; $x++) {
    $p = $bmp.GetPixel($x, 870)
    $isDark = ($p.R -lt 240 -or $p.G -lt 240 -or $p.B -lt 240)
    if ($isDark -and -not $cardState) {
        $cardState = $true
        $cardStart = $x
    } elseif (-not $isDark -and $cardState) {
        $cardState = $false
        $w = $x - $cardStart
        if ($w -gt 20) {
            $cards += @{ start = $cardStart; end = $x; width = $w }
        }
    }
}

Write-Output "Found $($cards.Count) cards:"
foreach ($c in $cards) {
    Write-Output "Card: X=$($c.start) to $($c.end) (W=$($c.width))"
}

$bmp.Dispose()
