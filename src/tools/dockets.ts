// ---------------------------------------------------------------------------
// MCP Tools — Dockets (RECAP / PACER)
// ---------------------------------------------------------------------------

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CourtListenerClient } from "../courtlistener/client.js";
import { stripHtml } from "../utils/html.js";

/**
 * Register docket-related tools on the MCP server.
 */
export function registerDocketTools(
  server: McpServer,
  cl: CourtListenerClient,
): void {
  // -------------------------------------------------------------------------
  // search_dockets
  // -------------------------------------------------------------------------
  server.tool(
    "search_dockets",
    "Search federal court dockets (RECAP archive). Returns case name, court, " +
      "docket number, date filed, and CourtListener URL.",
    {
      query: z.string().describe("Full-text search query"),
      court: z
        .string()
        .optional()
        .describe("Court ID to filter by (e.g. 'nyed', 'cacd')"),
      date_filed_after: z
        .string()
        .optional()
        .describe("Filter: filed on or after this date (YYYY-MM-DD)"),
      date_filed_before: z
        .string()
        .optional()
        .describe("Filter: filed on or before this date (YYYY-MM-DD)"),
      page: z
        .number()
        .int()
        .positive()
        .optional()
        .default(1)
        .describe("Page number (default 1)"),
    },
    async ({ query, court, date_filed_after, date_filed_before, page }) => {
      try {
        const filters: Record<string, string | undefined> = {
          court,
          filed_after: date_filed_after,
          filed_before: date_filed_before,
        };

        const data = await cl.search(query, "r", filters, page);

        if (!data.results || data.results.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No dockets found for query: "${query}"`,
              },
            ],
          };
        }

        const lines = data.results.map((hit, i) => {
          const num = (page - 1) * 20 + i + 1;
          const url = CourtListenerClient.fullUrl(hit.absolute_url);
          return [
            `${num}. ${hit.caseName}`,
            `   Court: ${hit.court}`,
            `   Docket #: ${hit.docketNumber}`,
            `   Date Filed: ${hit.dateFiled ?? "N/A"}`,
            `   URL: ${url}`,
          ].join("\n");
        });

        const header =
          `Found ${data.count.toLocaleString()} docket(s) for "${query}" ` +
          `(page ${page}):\n`;

        return {
          content: [{ type: "text" as const, text: header + lines.join("\n\n") }],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error searching dockets: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );

  // -------------------------------------------------------------------------
  // get_docket
  // -------------------------------------------------------------------------
  server.tool(
    "get_docket",
    "Get full details for a specific court docket by its CourtListener docket ID.",
    {
      docket_id: z
        .number()
        .int()
        .positive()
        .describe("CourtListener docket ID"),
    },
    async ({ docket_id }) => {
      try {
        const docket = await cl.getDocket(docket_id);

        const lines = [
          `Case: ${docket.case_name}`,
          `Short Name: ${docket.case_name_short}`,
          `Court: ${docket.court_id}`,
          `Docket #: ${docket.docket_number}`,
          `Date Filed: ${docket.date_filed ?? "N/A"}`,
          `Date Terminated: ${docket.date_terminated ?? "N/A"}`,
          `Date Last Filing: ${docket.date_last_filing ?? "N/A"}`,
          `Nature of Suit: ${docket.nature_of_suit || "N/A"}`,
          `Cause: ${docket.cause || "N/A"}`,
          `Assigned To: ${docket.assigned_to_str || "N/A"}`,
          `Referred To: ${docket.referred_to_str || "N/A"}`,
          `PACER Case ID: ${docket.pacer_case_id || "N/A"}`,
          `URL: ${CourtListenerClient.fullUrl(docket.absolute_url)}`,
        ];

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error fetching docket ${docket_id}: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );

  // -------------------------------------------------------------------------
  // get_docket_entries
  // -------------------------------------------------------------------------
  server.tool(
    "get_docket_entries",
    "Get docket entries (filings) for a specific docket. Returns entry number, " +
      "date, description, and document availability.",
    {
      docket_id: z
        .number()
        .int()
        .positive()
        .describe("CourtListener docket ID"),
      page: z
        .number()
        .int()
        .positive()
        .optional()
        .default(1)
        .describe("Page number (default 1)"),
    },
    async ({ docket_id, page }) => {
      try {
        const data = await cl.getDocketEntries(docket_id, page);

        if (!data.results || data.results.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No docket entries found for docket ${docket_id} (page ${page}).`,
              },
            ],
          };
        }

        const lines = data.results.map((entry) => {
          const docs = entry.recap_documents ?? [];
          const available = docs.filter((d) => d.is_available).length;
          const docInfo =
            docs.length > 0
              ? `${available}/${docs.length} document(s) available`
              : "No documents";

          const description = entry.description
            ? stripHtml(entry.description)
            : "No description";

          return [
            `Entry #${entry.entry_number ?? "—"}`,
            `  Date Filed: ${entry.date_filed ?? "N/A"}`,
            `  Description: ${description}`,
            `  Documents: ${docInfo}`,
          ].join("\n");
        });

        const header =
          `Docket ${docket_id} — ${data.count.toLocaleString()} total entries ` +
          `(page ${page}):\n`;

        return {
          content: [{ type: "text" as const, text: header + lines.join("\n\n") }],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error fetching entries for docket ${docket_id}: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );
}
