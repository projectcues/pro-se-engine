// ---------------------------------------------------------------------------
// MCP Tool — Document Editing with Tracked Changes
// ---------------------------------------------------------------------------

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { applyTrackedEdits } from "../lib/trackedChanges.js";
import type { EditInput } from "../lib/trackedChanges.js";

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

/**
 * Register document editing tools on the MCP server.
 * Provides tracked-change editing for Word (.docx) documents.
 */
export function registerEditingTools(server: McpServer): void {
  server.tool(
    "edit_document",
    "Apply edits to a Word (.docx) document as tracked changes. The recipient " +
      "can Accept or Reject each change in Microsoft Word. Use this to revise " +
      "contracts, agreements, or any legal document. Each edit specifies text to " +
      "find and its replacement. Use context_before and context_after to " +
      "disambiguate when the same text appears multiple times.",
    {
      document_base64: z
        .string()
        .describe("The source .docx file as a base64-encoded string"),
      edits: z
        .array(
          z.object({
            find: z
              .string()
              .describe("Exact text to find and replace"),
            replace: z
              .string()
              .describe("Replacement text (empty string for deletion)"),
            context_before: z
              .string()
              .optional()
              .default("")
              .describe("~40 chars before the find text for disambiguation"),
            context_after: z
              .string()
              .optional()
              .default("")
              .describe("~40 chars after the find text for disambiguation"),
            reason: z
              .string()
              .optional()
              .describe("Explanation for the edit"),
          }),
        )
        .min(1)
        .describe("Array of edits to apply as tracked changes"),
      author: z
        .string()
        .optional()
        .default("AI Legal Assistant")
        .describe("Author name for tracked changes attribution"),
    },
    async ({ document_base64, edits, author }) => {
      try {
        // Decode the base64 document
        let docxBytes: Uint8Array;
        try {
          docxBytes = new Uint8Array(Buffer.from(document_base64, "base64"));
        } catch {
          return {
            content: [
              {
                type: "text" as const,
                text: "Error: Invalid base64 encoding for document_base64. Please provide a valid base64-encoded .docx file.",
              },
            ],
          };
        }

        // Convert edits to the internal format
        const editInputs: EditInput[] = edits.map((e) => ({
          find: e.find,
          replace: e.replace,
          context_before: e.context_before ?? "",
          context_after: e.context_after ?? "",
          reason: e.reason,
        }));

        // Apply tracked changes
        const result = await applyTrackedEdits(docxBytes, editInputs, { author });

        // Encode result document as base64
        const resultBase64 = Buffer.from(result.bytes).toString("base64");

        // Build the summary
        const totalEdits = edits.length;
        const appliedCount = result.changes.length;
        const errorCount = result.errors.length;

        const lines: string[] = [];
        lines.push(`## Tracked Changes Summary`);
        lines.push(``);
        lines.push(`**${appliedCount} of ${totalEdits} edits applied** as tracked changes (author: "${author}")`);
        lines.push(``);

        // List each applied change
        if (result.changes.length > 0) {
          lines.push(`### Applied Changes`);
          lines.push(``);
          for (let i = 0; i < result.changes.length; i++) {
            const ch = result.changes[i];
            lines.push(`**${i + 1}.** `);
            if (ch.deletedText && ch.insertedText) {
              lines.push(`   - Deleted: "${truncateDisplay(ch.deletedText, 80)}"`);
              lines.push(`   - Inserted: "${truncateDisplay(ch.insertedText, 80)}"`);
            } else if (ch.deletedText) {
              lines.push(`   - Deleted: "${truncateDisplay(ch.deletedText, 80)}"`);
            } else if (ch.insertedText) {
              lines.push(`   - Inserted: "${truncateDisplay(ch.insertedText, 80)}"`);
            }
            if (ch.reason) {
              lines.push(`   - Reason: ${ch.reason}`);
            }
          }
          lines.push(``);
        }

        // List errors
        if (result.errors.length > 0) {
          lines.push(`### Errors`);
          lines.push(``);
          for (const err of result.errors) {
            if (err.index >= 0) {
              const failedEdit = edits[err.index];
              lines.push(
                `- Edit #${err.index + 1} (find: "${truncateDisplay(failedEdit?.find ?? "", 40)}"): ${err.reason}`,
              );
            } else {
              lines.push(`- ${err.reason}`);
            }
          }
          lines.push(``);
        }

        // Filename suggestion
        const filename = `edited_document_${Date.now()}.docx`;
        lines.push(`### Document`);
        lines.push(``);
        lines.push(`Filename: \`${filename}\``);
        lines.push(`Size: ${result.bytes.byteLength.toLocaleString()} bytes`);
        lines.push(`MIME: application/vnd.openxmlformats-officedocument.wordprocessingml.document`);
        lines.push(``);
        lines.push(`Open in Microsoft Word and use Review → Accept/Reject to finalise each change.`);
        lines.push(``);
        lines.push(`--- BASE64 START ---`);
        lines.push(resultBase64);
        lines.push(`--- BASE64 END ---`);

        return {
          content: [
            {
              type: "text" as const,
              text: lines.join("\n"),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error applying tracked changes: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncateDisplay(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + "…";
}
