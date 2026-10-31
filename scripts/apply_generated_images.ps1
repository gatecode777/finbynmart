$artifactDir = "C:\Users\busin\.gemini\antigravity\brain\9f4b7448-b1b2-445a-853b-9bb31b9ff1fb"

# 1. Hero
Copy-Item "$artifactDir\hero_professionals_hd_1793447973254.jpg" "public\images\hero\hero-professionals.png" -Force

# 2. Categories
Copy-Item "$artifactDir\industrial_machinery_hd_1793447980414.jpg" "public\images\categories\industrial-machinery.png" -Force
Copy-Item "$artifactDir\electrical_electronics_hd_1793448003241.jpg" "public\images\categories\electrical-electronics.png" -Force
Copy-Item "$artifactDir\apparel_fashion_hd_1793448026393.jpg" "public\images\categories\apparel-fashion.png" -Force
Copy-Item "$artifactDir\home_lifestyle_hd_1793448042895.jpg" "public\images\categories\home-lifestyle.png" -Force
Copy-Item "$artifactDir\packaging_printing_hd_1793448060275.jpg" "public\images\categories\packaging-printing.png" -Force
Copy-Item "$artifactDir\food_beverages_hd_1793448000642.jpg" "public\images\categories\food-beverages.png" -Force
Copy-Item "$artifactDir\health_pharma_hd_1793448019780.jpg" "public\images\categories\health-pharma.png" -Force
Copy-Item "$artifactDir\agriculture_hd_1793448036685.jpg" "public\images\categories\agriculture.png" -Force
Copy-Item "$artifactDir\construction_real_estate_hd_1793448052756.jpg" "public\images\categories\construction-real-estate.png" -Force

# 3. Suppliers
Copy-Item "$artifactDir\shree_textiles_hd_1793448005667.jpg" "public\images\suppliers\shree-textiles.png" -Force
Copy-Item "$artifactDir\abc_engineering_works_hd_1793448025323.jpg" "public\images\suppliers\abc-engineering-works.png" -Force
Copy-Item "$artifactDir\sunrise_packaging_hd_1793448040556.jpg" "public\images\suppliers\sunrise-packaging.png" -Force

Write-Output "Copied all generated HD images into public\images successfully!"

