// ---------------------------------------------------------------------------
// HTML / text utilities
// ---------------------------------------------------------------------------

/**
 * Strip HTML tags and decode common entities. Returns plain text.
 */
export function stripHtml(html: string): string {
  if (!html) return "";

  return html
    // Remove script/style blocks
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    // Replace block-level tags with newlines
    .replace(/<\/(p|div|br|h[1-6]|li|tr|blockquote)>/gi, "\n")
    .replace(/<(br|hr)\s*\/?>/gi, "\n")
    // Remove all remaining tags
    .replace(/<[^>]+>/g, "")
    // Decode common entities
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    // Collapse excessive whitespace
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Get the best available opinion text, preferring plain_text, then
 * falling back through the HTML variants.
 */
export function getBestOpinionText(opinion: {
  plain_text?: string;
  html?: string;
  html_lawbox?: string;
  html_columbia?: string;
  html_with_citations?: string;
}): string {
  if (opinion.plain_text?.trim()) return opinion.plain_text.trim();
  const html =
    opinion.html_with_citations ||
    opinion.html_columbia ||
    opinion.html_lawbox ||
    opinion.html ||
    "";
  return stripHtml(html);
}

/**
 * Truncate text to maxChars, appending a truncation note.
 */
export function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const truncated = text.slice(0, maxChars);
  const lastNewline = truncated.lastIndexOf("\n");
  const breakPoint = lastNewline > maxChars * 0.8 ? lastNewline : maxChars;
  return (
    truncated.slice(0, breakPoint) +
    `\n\n[Truncated — showing ${breakPoint.toLocaleString()} of ${text.length.toLocaleString()} characters]`
  );
}

/**
 * Case-insensitive, whitespace-tolerant search within text.
 * Returns matches with surrounding context.
 */
export function findInText(
  text: string,
  query: string,
  maxResults = 20,
  contextChars = 160,
): { matchIndex: number; context: string }[] {
  if (!text || !query) return [];

  const normalizedText = text.replace(/\s+/g, " ");
  const normalizedQuery = query.replace(/\s+/g, " ").toLowerCase();
  const lowerText = normalizedText.toLowerCase();

  const matches: { matchIndex: number; context: string }[] = [];
  let startPos = 0;

  while (matches.length < maxResults) {
    const idx = lowerText.indexOf(normalizedQuery, startPos);
    if (idx === -1) break;

    const ctxStart = Math.max(0, idx - contextChars);
    const ctxEnd = Math.min(normalizedText.length, idx + normalizedQuery.length + contextChars);
    const context = normalizedText.slice(ctxStart, ctxEnd);

    matches.push({ matchIndex: idx, context });
    startPos = idx + normalizedQuery.length;
  }

  return matches;
}

/**
 * Format a CourtListener citation object as a readable string.
 */
export function formatCitation(cit: {
  volume: number;
  reporter: string;
  page: string;
}): string {
  return `${cit.volume} ${cit.reporter} ${cit.page}`;
}
