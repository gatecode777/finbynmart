$industries = @(
    @{ name = "manufacturing";    url = "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=800&auto=format&fit=crop&q=80" },
    @{ name = "retail-wholesale"; url = "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=800&auto=format&fit=crop&q=80" },
    @{ name = "construction";     url = "https://images.unsplash.com/photo-1541888946425-d0fbb186c5f7?w=800&auto=format&fit=crop&q=80" },
    @{ name = "healthcare";       url = "https://images.unsplash.com/photo-1516549655169-df83a0774514?w=800&auto=format&fit=crop&q=80" },
    @{ name = "agriculture";      url = "https://images.unsplash.com/photo-1500937386664-56d1dfef3854?w=800&auto=format&fit=crop&q=80" },
    @{ name = "education";        url = "https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=800&auto=format&fit=crop&q=80" },
    @{ name = "hospitality";      url = "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&auto=format&fit=crop&q=80" },
    @{ name = "services";         url = "https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&auto=format&fit=crop&q=80" }
)

foreach ($ind in $industries) {
    $dest = "public\images\industries\$($ind.name).jpg"
    curl.exe -s -L -o $dest $ind.url
    $item = Get-Item $dest
    Write-Output "Downloaded $($ind.name): $($item.Length) bytes"
}

# Also update chemicals-dyes and the remaining 3 suppliers with high-res images
curl.exe -s -L -o "public\images\categories\chemicals-dyes.png" "https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?w=800&auto=format&fit=crop&q=80"
curl.exe -s -L -o "public\images\suppliers\medico-pharma.png" "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=800&auto=format&fit=crop&q=80"
curl.exe -s -L -o "public\images\suppliers\buildright-solutions.png" "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=800&auto=format&fit=crop&q=80"
curl.exe -s -L -o "public\images\suppliers\agro-fresh-foods.png" "https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=800&auto=format&fit=crop&q=80"
Write-Output "All industry and supplementary supplier images ready!"

