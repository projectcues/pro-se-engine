// ---------------------------------------------------------------------------
// Regulations.gov MCP Tools
// ---------------------------------------------------------------------------

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { RegulationsClient } from "../regulations/client.js";
import { stripHtml } from "../utils/html.js";

/**
 * Register Regulations.gov regulatory research tools on the MCP server.
 */
export function registerRegulationsTools(
  server: McpServer,
  client: RegulationsClient,
): void {
  // -------------------------------------------------------------------------
  // search_regulatory_dockets
  // -------------------------------------------------------------------------

  server.tool(
    "search_regulatory_dockets",
    "Search federal regulatory dockets (proceedings) on Regulations.gov. Find active rulemakings by agency or keyword. Returns docket titles and IDs for further investigation.",
    {
      query: z.string().describe("Search terms for regulatory dockets"),
      agency: z
        .string()
        .optional()
        .describe(
          "Agency ID filter (e.g., 'EPA', 'FDA', 'SEC', 'FCC', 'DOL', 'HHS')",
        ),
      max_results: z
        .number()
        .optional()
        .default(20)
        .describe("Maximum number of results to return (max 250)"),
    },
    async ({ query, agency, max_results }) => {
      try {
        const data = await client.searchDockets({
          searchTerm: query,
          agencyId: agency,
          pageSize: Math.max(5, Math.min(max_results, 250)),
        });

        if (!data.data || data.data.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No regulatory dockets found for "${query}"${agency ? ` (agency: ${agency})` : ""}. Try different search terms or remove the agency filter.`,
              },
            ],
          };
        }

        const lines: string[] = [
          `# Regulatory Dockets — "${query}"${agency ? ` (${agency})` : ""}`,
          `Found ${data.meta.totalElements} dockets. Showing ${data.data.length}.\n`,
        ];

        for (const docket of data.data) {
          lines.push(`## ${docket.title}`);
          lines.push(`- **Docket ID:** ${docket.objectId}`);
          lines.push(`- **Agency:** ${docket.agencyId}`);
          lines.push(`- **Type:** ${docket.docketType}`);
          if (docket.highlightedContent) {
            lines.push(`- **Excerpt:** ${stripHtml(docket.highlightedContent)}`);
          }
          lines.push("");
        }

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error searching dockets: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // -------------------------------------------------------------------------
  // get_regulatory_document
  // -------------------------------------------------------------------------

  server.tool(
    "get_regulatory_document",
    "Get full details of a regulatory document from Regulations.gov by its document ID. Returns the document type, agency, title, posted date, and links to PDF versions.",
    {
      document_id: z
        .string()
        .describe("Document object ID from Regulations.gov"),
    },
    async ({ document_id }) => {
      try {
        const doc = await client.getDocument(document_id);

        const lines: string[] = [
          `# ${doc.title}`,
          `**Document ID:** ${doc.objectId}`,
          `**Agency:** ${doc.agencyId}`,
          `**Type:** ${doc.documentType}`,
        ];

        if (doc.postedDate) lines.push(`**Posted:** ${doc.postedDate}`);
        if (doc.frDocNum) {
          lines.push(`**Federal Register Number:** ${doc.frDocNum}`);
        }

        if (doc.summary) {
          lines.push("\n## Summary");
          lines.push(stripHtml(doc.summary));
        }

        if (doc.fileFormats && doc.fileFormats.length > 0) {
          lines.push("\n## Available Formats");
          for (const fmt of doc.fileFormats) {
            if (fmt.fileUrl) {
              lines.push(`- ${fmt.format ?? "Document"}: ${fmt.fileUrl}`);
            }
          }
        }

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error fetching document "${document_id}": ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // -------------------------------------------------------------------------
  // get_public_comments
  // -------------------------------------------------------------------------

  server.tool(
    "get_public_comments",
    "Get public comments submitted on a specific regulatory document. Returns comment text and metadata. Useful for understanding public response to proposed rules and for regulatory analysis.",
    {
      document_id: z
        .string()
        .describe("The document ID to retrieve comments for"),
      query: z
        .string()
        .optional()
        .describe("Filter comments by keyword"),
      max_results: z
        .number()
        .optional()
        .default(10)
        .describe(
          "Maximum number of comments to return (default 10). Each comment requires a separate API call for full text.",
        ),
    },
    async ({ document_id, query, max_results }) => {
      try {
        // First get the comment list (does NOT include comment text)
        const listData = await client.searchComments({
          commentOnId: document_id,
          searchTerm: query,
          pageSize: Math.max(5, Math.min(max_results, 25)), // Keep modest — each needs a follow-up call
        });

        if (!listData.data || listData.data.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No public comments found for document "${document_id}"${query ? ` matching "${query}"` : ""}. The document may not be open for comment, or no comments have been posted yet.`,
              },
            ],
          };
        }

        // Fetch full text for each comment (the list endpoint omits comment text)
        const detailedComments = await Promise.all(
          listData.data.slice(0, max_results).map(async (c) => {
            try {
              return await client.getComment(c.id);
            } catch {
              // If individual fetch fails, return partial data from list
              return c;
            }
          }),
        );

        const lines: string[] = [
          `# Public Comments on ${document_id}${query ? ` (matching "${query}")` : ""}`,
          `Found ${listData.meta.totalElements} comments. Showing ${detailedComments.length} with full text.\n`,
        ];

        for (let i = 0; i < detailedComments.length; i++) {
          const comment = detailedComments[i];
          if (!comment) continue;

          lines.push(`## Comment ${i + 1}${comment.title ? `: ${comment.title}` : ""}`);
          if (comment.postedDate) lines.push(`**Posted:** ${comment.postedDate}`);
          if (comment.receiveDate) lines.push(`**Received:** ${comment.receiveDate}`);
          if (comment.agencyId) lines.push(`**Agency:** ${comment.agencyId}`);

          if (comment.comment) {
            lines.push("\n" + stripHtml(comment.comment));
          } else {
            lines.push("\n*[Comment text not available]*");
          }
          lines.push("");
        }

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error fetching comments for "${document_id}": ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
