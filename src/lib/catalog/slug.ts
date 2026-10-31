export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Normalizes text for matching: lower-case, hyphens dropped ("t-shirt" -> "tshirt"),
 * so it lines up with the dataset's spellings.
 */
export function searchText(value: string): string {
  return value.toLowerCase().replace(/-/g, "");
}

/** Query words for matching; a lone letter joins the next word ("t shirts" -> "tshirts"). */
export function searchTokens(query: string | undefined): string[] {
  const words = searchText(query ?? "").split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    if (words[i].length === 1 && i + 1 < words.length) {
      words[i + 1] = words[i] + words[i + 1];
    } else {
      out.push(words[i]);
    }
  }
  return out;
}

export function initials(name: string): string {
  const words = name.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w));
  const letters = words.slice(0, 2).map((w) => (w.match(/[A-Za-z0-9]/) ?? [""])[0]);
  return letters.join("").toUpperCase() || "?";
}
