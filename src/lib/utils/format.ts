const inrFormatter = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 2,
});

export function formatInr(value: number): string {
  return `₹${inrFormatter.format(value)}`;
}

export function formatPriceRange(priceMin: number, priceMax: number | undefined): string {
  if (priceMax && priceMax !== priceMin) {
    return `${formatInr(priceMin)} – ${formatInr(priceMax)}`;
  }
  return formatInr(priceMin);
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat("en-IN").format(value);
}
