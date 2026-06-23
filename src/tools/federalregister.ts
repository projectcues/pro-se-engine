// ---------------------------------------------------------------------------
// Federal Register MCP Tools
// ---------------------------------------------------------------------------

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { FederalRegisterClient } from "../federalregister/client.js";

/** Map user-friendly document type names to API constants. */
const DOC_TYPE_MAP: Record<string, string> = {
  rule: "RULE",
  proposed_rule: "PRORULE",
  notice: "NOTICE",
  presidential_document: "PRESDOCU",
};

/**
 * Register Federal Register research tools on the MCP server.
 */
export function registerFederalRegisterTools(
  server: McpServer,
  client: FederalRegisterClient,
): void {
  // -------------------------------------------------------------------------
  // search_federal_register
  // -------------------------------------------------------------------------

  server.tool(
    "search_federal_register",
    "Search the Federal Register for rules, proposed rules, notices, and presidential documents. Filter by agency, document type, date range, and economic significance. Essential for regulatory compliance and administrative law research.",
    {
      query: z.string().describe("Search terms"),
      document_type: z
        .string()
        .optional()
        .describe(
          "Document type: 'rule', 'proposed_rule', 'notice', 'presidential_document'",
        ),
      agency: z
        .string()
        .optional()
        .describe(
          "Agency slug (e.g., 'environmental-protection-agency'). Use list_federal_agencies to find slugs.",
        ),
      start_date: z
        .string()
        .optional()
        .describe("Start date filter (YYYY-MM-DD)"),
      end_date: z
        .string()
        .optional()
        .describe("End date filter (YYYY-MM-DD)"),
      significant_only: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          "Only return economically significant documents (default false)",
        ),
      max_results: z
        .number()
        .optional()
        .default(20)
        .describe("Maximum number of results (default 20)"),
    },
    async ({
      query,
      document_type,
      agency,
      start_date,
      end_date,
      significant_only,
      max_results,
    }) => {
      try {
        const types: string[] | undefined = document_type
          ? [DOC_TYPE_MAP[document_type] ?? document_type.toUpperCase()]
          : undefined;

        const data = await client.searchDocuments({
          term: query,
          type: types,
          agencies: agency ? [agency] : undefined,
          publicationDateGte: start_date,
          publicationDateLte: end_date,
          significant:
            significant_only ? true : undefined,
          perPage: Math.min(max_results, 100),
          order: "relevance",
        });

        if (!data.results || data.results.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No Federal Register documents found for query: "${query}". Try broadening your search or removing filters.`,
              },
            ],
          };
        }

        const lines: string[] = [
          `## Federal Register Search Results`,
          `**Query:** "${query}"`,
          `**Total matches:** ${data.count.toLocaleString()}`,
          `**Showing:** ${data.results.length} results`,
          "",
        ];

        for (let i = 0; i < data.results.length; i++) {
          const doc = data.results[i];
          const agencies =
            doc.agencies?.map((a) => a.name).join("; ") ||
            doc.agency_names?.join("; ") ||
            "—";

          lines.push(`### ${i + 1}. ${doc.title}`);
          lines.push("");
          lines.push(`| Field | Value |`);
          lines.push(`|-------|-------|`);
          lines.push(`| **Type** | ${doc.type} |`);
          lines.push(`| **Published** | ${doc.publication_date} |`);
          lines.push(`| **Agencies** | ${agencies} |`);
          lines.push(
            `| **Document #** | ${doc.document_number} |`,
          );
          if (doc.effective_on) {
            lines.push(
              `| **Effective** | ${doc.effective_on} |`,
            );
          }
          if (doc.comments_close_on) {
            lines.push(
              `| **Comments Close** | ${doc.comments_close_on} |`,
            );
          }
          if (doc.cfr_references?.length) {
            const cfr = doc.cfr_references
              .map((r) => `${r.title} CFR Part ${r.part}`)
              .join("; ");
            lines.push(`| **CFR References** | ${cfr} |`);
          }

          if (doc.abstract) {
            lines.push("");
            lines.push(
              `> ${doc.abstract.slice(0, 300)}${doc.abstract.length > 300 ? "..." : ""}`,
            );
          }
          lines.push("");
          lines.push(
            `🔗 [View on Federal Register](${doc.html_url})`,
          );
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
              text: `Error searching Federal Register: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // -------------------------------------------------------------------------
  // get_federal_register_document
  // -------------------------------------------------------------------------

  server.tool(
    "get_federal_register_document",
    "Get full details of a Federal Register document by its document number. Returns the title, abstract, effective dates, CFR references, and full text when available.",
    {
      document_number: z
        .string()
        .describe(
          "Federal Register document number (e.g., '2024-12345')",
        ),
    },
    async ({ document_number }) => {
      try {
        const doc = await client.getDocument(document_number);

        const lines: string[] = [
          `## ${doc.title}`,
          "",
          `| Field | Value |`,
          `|-------|-------|`,
          `| **Document Number** | ${doc.document_number} |`,
          `| **Type** | ${doc.type} |`,
          `| **Published** | ${doc.publication_date} |`,
        ];

        const agencies =
          doc.agencies?.map((a) => a.name).join("; ") ||
          doc.agency_names?.join("; ") ||
          "—";
        lines.push(`| **Agencies** | ${agencies} |`);

        if (doc.effective_on) {
          lines.push(
            `| **Effective Date** | ${doc.effective_on} |`,
          );
        }
        if (doc.comments_close_on) {
          lines.push(
            `| **Comments Close** | ${doc.comments_close_on} |`,
          );
        }
        if (doc.action) {
          lines.push(`| **Action** | ${doc.action} |`);
        }
        if (doc.dates) {
          lines.push(`| **Dates** | ${doc.dates} |`);
        }
        if (doc.cfr_references?.length) {
          const cfr = doc.cfr_references
            .map((r) => `${r.title} CFR Part ${r.part}`)
            .join("; ");
          lines.push(`| **CFR References** | ${cfr} |`);
        }
        if (doc.regulation_id_numbers?.length) {
          lines.push(
            `| **RIN** | ${doc.regulation_id_numbers.join(", ")} |`,
          );
        }

        if (doc.abstract) {
          lines.push("");
          lines.push(`### Abstract`);
          lines.push(doc.abstract);
        }

        lines.push("");
        lines.push(`### Links`);
        if (doc.html_url) {
          lines.push(
            `- 🔗 [View on Federal Register](${doc.html_url})`,
          );
        }
        if (doc.pdf_url) {
          lines.push(`- 📄 [PDF](${doc.pdf_url})`);
        }
        if (doc.full_text_xml_url) {
          lines.push(`- 📝 [Full Text XML](${doc.full_text_xml_url})`);
        }

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error fetching Federal Register document: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // -------------------------------------------------------------------------
  // list_federal_agencies
  // -------------------------------------------------------------------------

  server.tool(
    "list_federal_agencies",
    "List all federal agencies that publish in the Federal Register. Returns agency names and slugs for use as filters in search_federal_register.",
    {},
    async () => {
      try {
        const agencies = await client.listAgencies();

        // Sort alphabetically
        const sorted = [...agencies].sort((a, b) =>
          a.name.localeCompare(b.name),
        );

        const lines: string[] = [
          `## Federal Agencies (${sorted.length} total)`,
          "",
          "| Agency Name | Slug | Short Name |",
          "|-------------|------|------------|",
        ];

        for (const agency of sorted) {
          lines.push(
            `| ${agency.name} | \`${agency.slug}\` | ${agency.short_name ?? "—"} |`,
          );
        }

        lines.push(
          "",
          '_Use the `slug` value as the `agency` parameter in `search_federal_register`._',
        );

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error listing federal agencies: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
