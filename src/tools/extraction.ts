// ---------------------------------------------------------------------------
// MCP Tools — Document Text Extraction & Search
// ---------------------------------------------------------------------------

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { extractText } from "../lib/textExtraction.js";
import { truncateText, findInText } from "../utils/html.js";

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

/**
 * Register document extraction and search tools on the MCP server.
 */
export function registerExtractionTools(server: McpServer): void {
  // -------------------------------------------------------------------------
  // extract_document_text
  // -------------------------------------------------------------------------

  server.tool(
    "extract_document_text",
    "Extract text content from a PDF or Word document for analysis. " +
      "Pass the file as a base64-encoded string. Returns the document text " +
      "with page markers for PDFs. Use this before analyzing, summarizing, " +
      "or searching within a document.",
    {
      document_base64: z
        .string()
        .describe("Base64-encoded file content"),
      file_type: z
        .string()
        .describe("File type: 'pdf', 'docx', or 'doc'"),
      max_chars: z
        .number()
        .optional()
        .default(100000)
        .describe("Maximum characters to return (default: 100 000)"),
    },
    async ({ document_base64, file_type, max_chars }) => {
      try {
        const rawText = await extractText(document_base64, file_type);
        const text = truncateText(rawText, max_chars);

        return {
          content: [
            {
              type: "text" as const,
              text,
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error extracting document text: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );

  // -------------------------------------------------------------------------
  // find_in_document
  // -------------------------------------------------------------------------

  server.tool(
    "find_in_document",
    "Search within a PDF or Word document for specific text — like Ctrl+F. " +
      "Returns matches with surrounding context. Use for targeted lookups " +
      "(finding a clause, party name, or specific phrase) without reading " +
      "the entire document.",
    {
      document_base64: z
        .string()
        .describe("Base64-encoded file content"),
      file_type: z
        .string()
        .describe("File type: 'pdf', 'docx', or 'doc'"),
      query: z
        .string()
        .describe("Text to search for within the document"),
      max_results: z
        .number()
        .optional()
        .default(20)
        .describe("Maximum number of matches to return (default: 20)"),
      context_chars: z
        .number()
        .optional()
        .default(200)
        .describe(
          "Characters of surrounding context for each match (default: 200)",
        ),
    },
    async ({ document_base64, file_type, query, max_results, context_chars }) => {
      try {
        const rawText = await extractText(document_base64, file_type);
        const matches = findInText(rawText, query, max_results, context_chars);

        if (matches.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No matches found for "${query}" in the document.`,
              },
            ],
          };
        }

        const formatted = matches
          .map(
            (m, i) =>
              `--- Match ${i + 1} (position ${m.matchIndex}) ---\n…${m.context}…`,
          )
          .join("\n\n");

        return {
          content: [
            {
              type: "text" as const,
              text: [
                `Found ${matches.length} match${matches.length === 1 ? "" : "es"} for "${query}":`,
                "",
                formatted,
              ].join("\n"),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error searching document: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );
}
