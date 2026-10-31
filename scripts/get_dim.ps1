Add-Type -AssemblyName System.Drawing
$filePath = "C:\Users\busin\.gemini\antigravity\brain\9f4b7448-b1b2-445a-853b-9bb31b9ff1fb\.user_uploaded\media_1793444316627_d43e3c7a.jpg"
$img = [System.Drawing.Bitmap]::FromFile($filePath)
Write-Output "Dimensions: $($img.Width) x $($img.Height)"
$img.Dispose()

