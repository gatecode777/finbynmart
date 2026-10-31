# Image Source Manifest

Records where each externally sourced photograph came from and under what license. Images that are crops of the approved design reference (categories, hero, industries, supplier logos) are listed in `docs/MISSING_ASSETS.md`, not here.

## Homepage "Featured Products" photos

Source: [Pexels](https://www.pexels.com), downloaded at 900px wide, cropped to 4:3 and saved as 800×600 WebP (quality 85). Licensed under the [Pexels License](https://www.pexels.com/license/) — free for commercial use, no attribution required. Original photographer credits are on each source page.

| Local file | Product | Source page | Notes |
|---|---|---|---|
| `public/images/products/industrial-air-compressor.webp` | Industrial Air Compressor | https://www.pexels.com/photo/an-air-compressor-9754814/ | Piston air compressor in a workshop |
| `public/images/products/solar-panel-540w.webp` | Solar Panel 540W | https://www.pexels.com/photo/solar-panel-356049/ | Generic solar panel photo; not a 540W product shot. Page lists it as a Pixabay image hosted on Pexels |
| `public/images/products/mens-cotton-tshirt.webp` | Men's Cotton T-Shirt | https://www.pexels.com/photo/a-person-holding-a-stack-of-neatly-folded-shirts-4440574/ | Folded shirts held by an unidentifiable person (no face) |
| `public/images/products/corrugated-packaging-box.webp` | Corrugated Packaging Boxes | https://www.pexels.com/photo/close-up-photo-of-stacked-carton-boxes-6170154/ | Stacked cardboard boxes |
| `public/images/products/stainless-steel-pipes.webp` | Stainless Steel Pipes | https://www.pexels.com/photo/silver-pipes-2310904 | Chrome industrial pipework |
| `public/images/products/pharma-tablets.webp` | Pharma Tablets | https://www.pexels.com/photo/pills-and-vial-16051960/ | Pill bottle and tablets |

**These are illustrative stock photos of the product type, not photographs of any specific supplier's product.** The product records they sit on are sample data. Replace with each supplier's own photography when real listings exist.

## Not used

- `public/images/products/*.png` (same filenames, `.png`) — low-resolution crops from the reference screenshot with the card's wishlist-heart button and heading text baked in. Superseded by the `.webp` files above; left on disk untouched.
- `public/images/suppliers/{shree-balaji,mahaveer-electricals,rajhans-textiles,ecopack-solutions,arogya-pharma}-{logo,preview-products}.png` — mis-cropped fragments of the reference (blurry text, not logos or product thumbnails). Not wired anywhere.
