// ---------------------------------------------------------------------------
// SEC EDGAR MCP Tools
// ---------------------------------------------------------------------------

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type {
  SECClient,
  SECCompanyFilings,
  SECCompanyFacts,
} from "../sec/client.js";

/**
 * Register SEC EDGAR research tools on the MCP server.
 */
export function registerSECTools(
  server: McpServer,
  client: SECClient,
): void {
  // -------------------------------------------------------------------------
  // search_sec_filings
  // -------------------------------------------------------------------------

  server.tool(
    "search_sec_filings",
    "Search the full text of all SEC filings since 2001. Find risk factors, legal proceedings, material agreements, and other disclosures. Use exact phrases in quotes for precision. Filter by form type (10-K, 10-Q, 8-K, DEF 14A, S-1, etc.) and date range.",
    {
      query: z
        .string()
        .describe(
          "Search terms (supports AND, OR, NOT, exact phrases in quotes)",
        ),
      forms: z
        .string()
        .optional()
        .describe(
          "Comma-separated form types: '10-K', '10-Q', '8-K', 'DEF 14A', 'S-1', etc.",
        ),
      start_date: z
        .string()
        .optional()
        .describe("Start date filter (YYYY-MM-DD)"),
      end_date: z
        .string()
        .optional()
        .describe("End date filter (YYYY-MM-DD)"),
      max_results: z
        .number()
        .optional()
        .default(20)
        .describe("Maximum number of results to return (default 20, max 100)"),
    },
    async ({ query, forms, start_date, end_date, max_results }) => {
      try {
        const data = await client.searchFilings({
          query,
          forms,
          startDate: start_date,
          endDate: end_date,
          size: Math.min(max_results, 100),
        });

        const total = data.hits?.total?.value ?? 0;
        const hits = data.hits?.hits ?? [];

        if (hits.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No SEC filings found for query: "${query}". Try broadening your search terms or removing filters.`,
              },
            ],
          };
        }

        const lines: string[] = [
          `## SEC Filing Search Results`,
          `**Query:** "${query}"`,
          `**Total matches:** ${total.toLocaleString()}`,
          `**Showing:** ${hits.length} results`,
          "",
          "| # | Entity | Form | Filed | Period | File Number |",
          "|---|--------|------|-------|--------|-------------|",
        ];

        for (let i = 0; i < hits.length; i++) {
          const src = hits[i]._source;
          lines.push(
            `| ${i + 1} | ${src.entity_name ?? "—"} | ${src.form_type ?? "—"} | ${src.file_date ?? "—"} | ${src.period_of_report ?? "—"} | ${src.file_num ?? "—"} |`,
          );
        }

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error searching SEC filings: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // -------------------------------------------------------------------------
  // get_company_filings
  // -------------------------------------------------------------------------

  server.tool(
    "get_company_filings",
    "Get the complete SEC filing history for a company by its CIK number. Returns company info (name, tickers, SIC code) and recent filings with form types, dates, and accession numbers. Use search_sec_filings to find filings by keyword instead.",
    {
      cik: z
        .string()
        .describe(
          "CIK number (e.g., '320193' for Apple) or 10-digit padded CIK",
        ),
    },
    async ({ cik }) => {
      try {
        const data: SECCompanyFilings =
          await client.getCompanyFilings(cik);

        const recent = data.filings?.recent;
        const filingCount = recent?.accessionNumber?.length ?? 0;

        const lines: string[] = [
          `## ${data.name}`,
          "",
          `| Field | Value |`,
          `|-------|-------|`,
          `| **CIK** | ${data.cik} |`,
          `| **Entity Type** | ${data.entityType ?? "—"} |`,
          `| **SIC** | ${data.sic ?? "—"} — ${data.sicDescription ?? ""} |`,
          `| **Tickers** | ${data.tickers?.join(", ") || "—"} |`,
          `| **Exchanges** | ${data.exchanges?.join(", ") || "—"} |`,
          "",
          `### Recent Filings (${filingCount} total)`,
          "",
          "| # | Form | Filed | Accession Number | Document |",
          "|---|------|-------|------------------|----------|",
        ];

        const showCount = Math.min(filingCount, 50);
        for (let i = 0; i < showCount; i++) {
          lines.push(
            `| ${i + 1} | ${recent.form[i]} | ${recent.filingDate[i]} | ${recent.accessionNumber[i]} | ${recent.primaryDocument?.[i] ?? "—"} |`,
          );
        }

        if (filingCount > showCount) {
          lines.push(
            "",
            `_...and ${filingCount - showCount} more filings. Use search_sec_filings for targeted searches._`,
          );
        }

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error fetching company filings: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // -------------------------------------------------------------------------
  // read_sec_filing
  // -------------------------------------------------------------------------

  server.tool(
    "read_sec_filing",
    "Read the actual text content of a specific SEC filing. Use get_company_filings first to find the accession number and primary document filename for the filing you want to read.",
    {
      accession_number: z
        .string()
        .describe(
          "Filing accession number (e.g., '0000320193-23-000106')",
        ),
      primary_document: z
        .string()
        .describe(
          "Primary document filename (e.g., 'aapl-20230930.htm')",
        ),
      max_chars: z
        .number()
        .optional()
        .default(50000)
        .describe(
          "Maximum characters to return (default 50000). Increase for longer filings.",
        ),
    },
    async ({ accession_number, primary_document, max_chars }) => {
      try {
        let text = await client.getFilingDocument(
          accession_number,
          primary_document,
        );

        const fullLength = text.length;
        if (text.length > max_chars) {
          text = text.slice(0, max_chars);
          text += `\n\n[... truncated at ${max_chars.toLocaleString()} of ${fullLength.toLocaleString()} characters. Increase max_chars to read more.]`;
        }

        return {
          content: [
            {
              type: "text" as const,
              text: `## SEC Filing: ${accession_number}\n**Document:** ${primary_document}\n**Length:** ${fullLength.toLocaleString()} characters\n\n---\n\n${text}`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error reading SEC filing: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // -------------------------------------------------------------------------
  // get_company_financials
  // -------------------------------------------------------------------------

  server.tool(
    "get_company_financials",
    "Get structured XBRL financial data for a company — revenue, assets, liabilities, net income, etc. across all their filings. Useful for financial analysis, damages calculations, and due diligence.",
    {
      cik: z.string().describe("CIK number (e.g., '320193' for Apple)"),
    },
    async ({ cik }) => {
      try {
        const data: SECCompanyFacts =
          await client.getCompanyFacts(cik);

        const lines: string[] = [
          `## Financial Data: ${data.entityName}`,
          `**CIK:** ${data.cik}`,
          "",
        ];

        const usGaap = data.facts?.["us-gaap"];
        if (!usGaap) {
          lines.push(
            "_No US-GAAP XBRL data available for this company._",
          );
          return {
            content: [
              { type: "text" as const, text: lines.join("\n") },
            ],
          };
        }

        // Key financial concepts to highlight
        const keyConcepts = [
          "Revenues",
          "RevenueFromContractWithCustomerExcludingAssessedTax",
          "NetIncomeLoss",
          "Assets",
          "Liabilities",
          "StockholdersEquity",
          "OperatingIncomeLoss",
          "CashAndCashEquivalentsAtCarryingValue",
          "LongTermDebt",
          "EarningsPerShareBasic",
          "EarningsPerShareDiluted",
          "CommonStockSharesOutstanding",
        ];

        let conceptsFound = 0;

        for (const concept of keyConcepts) {
          const factData = usGaap[concept];
          if (!factData) continue;
          conceptsFound++;

          lines.push(`### ${factData.label || concept}`);
          if (factData.description) {
            lines.push(`_${factData.description.slice(0, 200)}_`);
          }
          lines.push("");

          // Show the most common unit
          const unitEntries = Object.entries(factData.units);
          if (unitEntries.length === 0) continue;

          const [unitName, values] = unitEntries[0];
          lines.push(`**Unit:** ${unitName}`);
          lines.push("");
          lines.push("| Period | Form | Filed | Value |");
          lines.push("|--------|------|-------|-------|");

          // Show recent values (last 8)
          const recentValues = values.slice(-8);
          for (const v of recentValues) {
            const period =
              v.start && v.end
                ? `${v.start} → ${v.end}`
                : `FY${v.fy} ${v.fp}`;
            const formattedVal =
              unitName === "USD"
                ? `$${v.val.toLocaleString()}`
                : v.val.toLocaleString();
            lines.push(
              `| ${period} | ${v.form} | ${v.filed} | ${formattedVal} |`,
            );
          }
          lines.push("");
        }

        if (conceptsFound === 0) {
          // Show available concepts if none of the key ones matched
          const available = Object.keys(usGaap).slice(0, 30);
          lines.push(
            `_No standard financial concepts found. Available concepts (${Object.keys(usGaap).length} total):_`,
          );
          lines.push(available.map((c) => `\`${c}\``).join(", "));
        }

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error fetching company financials: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
