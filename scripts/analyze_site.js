const fs = require('fs');

const buf = fs.readFileSync('docs/homepage_raw.html');
const text = buf.toString('utf16le');
console.log('Length of homepage raw HTML (chars):', text.length);

// Extract hrefs
const hrefMatches = text.matchAll(/href=["']([^"']+)["']/g);
const internalLinks = new Set();
for (const m of hrefMatches) {
  const link = m[1];
  if (link.startsWith('/') || link.includes('finbynkart.com')) {
    internalLinks.add(link);
  }
}

console.log(`Total unique internal links found: ${internalLinks.size}`);
const categorized = {
  categories: [],
  products: [],
  pages: [],
  auth: [],
  cart_checkout: [],
  other: []
};

for (const link of Array.from(internalLinks).sort()) {
  if (link.includes('/category/')) {
    categorized.categories.push(link);
  } else if (link.includes('/product/')) {
    categorized.products.push(link);
  } else if (/login|register|password|profile|my-account|customer/i.test(link)) {
    categorized.auth.push(link);
  } else if (/cart|checkout|track-order|wishlist/i.test(link)) {
    categorized.cart_checkout.push(link);
  } else if (/about|contact|terms|privacy|return|refund|policy/i.test(link)) {
    categorized.pages.push(link);
  } else {
    categorized.other.push(link);
  }
}

console.log("Categories count:", categorized.categories.length);
categorized.categories.slice(0, 15).forEach(c => console.log("  Category:", c));

console.log("\nProducts count:", categorized.products.length);
categorized.products.slice(0, 15).forEach(p => console.log("  Product:", p));

console.log("\nAuth links:", categorized.auth);
console.log("\nCart/Checkout links:", categorized.cart_checkout);
console.log("\nPolicy/Content pages:", categorized.pages);

// Look for forms and actions
const formMatches = text.matchAll(/<form\b[^>]*action=["']([^"']+)["'][^>]*method=["']?([^"'>\s]+)?/gi);
console.log("\nForms found:");
for (const f of formMatches) {
  console.log(`  Action: ${f[1]}, Method: ${f[2] || 'GET'}`);
}

// Find scripts / config variables
const scriptMatches = text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi);
console.log("\nScript analysis:");
for (const s of scriptMatches) {
  const content = s[1];
  if (content.includes('_token') || content.includes('baseUrl') || content.includes('routes') || content.includes('api') || content.includes('Cart')) {
    console.log("Found relevant script block snippet:\n", content.slice(0, 300), "\n---");
  }
}

// Find all script src
const srcMatches = text.matchAll(/<script\b[^>]*src=["']([^"']+)["']/gi);
console.log("\nExternal scripts:");
for (const sm of srcMatches) {
  console.log("  src:", sm[1]);
}
