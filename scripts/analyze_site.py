import re
import json

with open('docs/homepage_raw.html', 'r', encoding='utf-8', errors='ignore') as f:
    text = f.read()

print('Length of homepage raw HTML:', len(text))

# Find routes and URLs
hrefs = set(re.findall(r'href=["\']([^"\']+)["\']', text))
internal_links = set()
for h in hrefs:
    if h.startswith('/') or 'finbynkart.com' in h:
        internal_links.add(h)

print(f"Total unique internal links found: {len(internal_links)}")
categorized = {
    'categories': [],
    'products': [],
    'pages': [],
    'auth': [],
    'cart_checkout': [],
    'other': []
}

for link in sorted(internal_links):
    if '/category/' in link:
        categorized['categories'].append(link)
    elif '/product/' in link:
        categorized['products'].append(link)
    elif any(k in link for k in ['login', 'register', 'password', 'profile', 'my-account']):
        categorized['auth'].append(link)
    elif any(k in link for k in ['cart', 'checkout', 'track-order', 'wishlist']):
        categorized['cart_checkout'].append(link)
    elif any(k in link for k in ['about', 'contact', 'terms', 'privacy', 'return']):
        categorized['pages'].append(link)
    else:
        categorized['other'].append(link)

print("Categories count:", len(categorized['categories']))
for c in categorized['categories'][:10]:
    print("  Category:", c)

print("Products count:", len(categorized['products']))
for p in categorized['products'][:10]:
    print("  Product:", p)

print("Auth links:", categorized['auth'])
print("Cart/Checkout links:", categorized['cart_checkout'])
print("Policy/Content pages:", categorized['pages'])

# Look for APIs and ajax calls or forms
ajax_endpoints = set(re.findall(r'[\'"](/[^"\'\s]+\b(?:api|ajax|cart|wishlist|checkout|search)[^"\'\s]*)[\'"]', text))
print("\nPossible AJAX/API endpoints in HTML:")
for ep in sorted(ajax_endpoints):
    print("  Endpoint:", ep)

# Check why HTML is 3.98 MB
scripts = re.findall(r'<script\b[^>]*>([\s\S]*?)</script>', text, re.IGNORECASE)
total_script_len = sum(len(s) for s in scripts)
print(f"\nInline scripts count: {len(scripts)}, total inline script length: {total_script_len}")

styles = re.findall(r'<style\b[^>]*>([\s\S]*?)</style>', text, re.IGNORECASE)
total_style_len = sum(len(s) for s in styles)
print(f"Inline styles count: {len(styles)}, total inline style length: {total_style_len}")

