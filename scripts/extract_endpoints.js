const fs = require('fs');

const buf = fs.readFileSync('docs/homepage_raw.html');
const text = buf.toString('utf16le');

// Search for any $.post, $.get, $.ajax, fetch, axios, url: in the script tags
const endpoints = new Set();
const regexes = [
  /\$\.(?:post|get|ajax)\(\s*['"`]([^'"`]+)['"`]/g,
  /url\s*:\s*['"`]([^'"`]+)['"`]/g,
  /fetch\(\s*['"`]([^'"`]+)['"`]/g,
  /action\s*=\s*['"`]([^'"`]+)['"`]/g,
  /window\.location\.href\s*=\s*['"`]([^'"`]+)['"`]/g
];

for (const regex of regexes) {
  let m;
  while ((m = regex.exec(text)) !== null) {
    endpoints.add(m[1]);
  }
}

console.log("Found endpoints/URLs in scripts:");
for (const ep of Array.from(endpoints).sort()) {
  console.log("  ", ep);
}

// Let's also check for meta tags, og tags, and API endpoints
const metaMatches = text.matchAll(/<meta\b[^>]*>/gi);
console.log("\nMeta tags sample:");
let count = 0;
for (const m of metaMatches) {
  if (count++ < 15) console.log("  ", m[0]);
}

