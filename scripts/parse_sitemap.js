const fs = require('fs');

const buf = fs.readFileSync('docs/sitemap.xml');
let text = '';
if (buf[0] === 0xff && buf[1] === 0xfe) {
  text = buf.toString('utf16le');
} else {
  text = buf.toString('utf-8');
}

const urls = [...text.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].trim());

const categories = [];
const products = [];
const tags = [];
const staticPages = [];

urls.forEach(url => {
  if (url.includes('/category/') && url.includes('item=category')) {
    categories.push(url);
  } else if (url.includes('/category/') && url.includes('item=tag')) {
    tags.push(url);
  } else if (url.includes('/product/')) {
    products.push(url);
  } else {
    staticPages.push(url);
  }
});

console.log(`Total URLs in sitemap: ${urls.length}`);
console.log(`Products: ${products.length}`);
console.log(`Categories: ${categories.length}`);
console.log(`Tags: ${tags.length}`);
console.log(`Static pages: ${staticPages.length}`);

fs.writeFileSync('docs/site_inventory.json', JSON.stringify({
  products,
  categories,
  tags,
  staticPages
}, null, 2));

console.log('Sample products:', products.slice(0, 5));
console.log('Sample categories:', categories);
console.log('Static pages:', staticPages);

