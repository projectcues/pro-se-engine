// ---------------------------------------------------------------------------
// Text Extraction Utilities — PDF & DOCX
// ---------------------------------------------------------------------------
// Extracts plain text from base64-encoded PDF and Word documents.
// Used by the extraction MCP tools but also available for direct import.
// ---------------------------------------------------------------------------

import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import mammoth from "mammoth";

// ---------------------------------------------------------------------------
// PDF extraction
// ---------------------------------------------------------------------------

/**
 * Extract text from a base64-encoded PDF using pdfjs-dist.
 * Each page is prefixed with a `[Page N]` header.
 */
export async function extractPdfText(base64: string): Promise<string> {
  try {
    const data = new Uint8Array(Buffer.from(base64, "base64"));
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    const pages: string[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const strings: string[] = [];
      for (const item of content.items) {
        if ("str" in item) {
          strings.push((item as { str: string }).str);
        }
      }
      pages.push(`[Page ${i}]\n${strings.join(" ")}`);
    }

    return pages.join("\n\n");
  } catch (err) {
    throw new Error(
      `Failed to extract text from PDF: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// DOCX extraction
// ---------------------------------------------------------------------------

/**
 * Extract raw text from a base64-encoded Word document (.docx) using mammoth.
 */
export async function extractDocxText(base64: string): Promise<string> {
  try {
    const buffer = Buffer.from(base64, "base64");
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  } catch (err) {
    throw new Error(
      `Failed to extract text from DOCX: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

/**
 * Extract text from a document based on its file type.
 *
 * @param base64   - Base64-encoded file content
 * @param fileType - One of 'pdf', 'docx', or 'doc'
 */
export async function extractText(
  base64: string,
  fileType: string,
): Promise<string> {
  const normalised = fileType.toLowerCase().trim();

  switch (normalised) {
    case "pdf":
      return extractPdfText(base64);
    case "docx":
    case "doc":
      return extractDocxText(base64);
    default:
      throw new Error(
        `Unsupported file type "${fileType}". Supported types: pdf, docx, doc.`,
      );
  }
}
