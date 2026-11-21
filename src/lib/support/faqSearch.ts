/**
 * Local search and topic filter for the public Help Center (pure, client-safe, no imports so the browser, the server and the node tests share it). The text is trimmed, normalised and lower-cased,
 * cut to SEARCH_MAX, split on spaces, and EVERY word must appear in the question or the answer (plain substring matching: no pattern or markup is ever interpreted). An unknown topic
 * matches nothing. Nothing leaves the browser.
 */
export const SEARCH_MAX = 80;

export function filterFaqs<T extends { category: string; question: string; answer: string }>(faqs: T[], query: string, topic: string): T[] {
  const words = query.normalize("NFKC").trim().toLowerCase().slice(0, SEARCH_MAX).split(/\s+/).filter(Boolean);
  return faqs.filter((f) => (topic === "all" || f.category === topic) && words.every((w) => `${f.question} ${f.answer}`.toLowerCase().includes(w)));
}
