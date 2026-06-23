// ---------------------------------------------------------------------------
// MCP Tools — USAspending.gov Government Contracts
// ---------------------------------------------------------------------------

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type {
  USASpendingClient,
  AwardSearchFilters,
} from "../usaspending/client.js";

// ---------------------------------------------------------------------------
// Award type code mappings
// ---------------------------------------------------------------------------

const AWARD_TYPE_CODES: Record<string, string[]> = {
  contracts: ["A", "B", "C", "D"],
  grants: ["02", "03", "04", "05"],
  loans: ["07", "08"],
  all: ["A", "B", "C", "D", "02", "03", "04", "05", "07", "08"],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDollar(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return "N/A";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

/**
 * Register USAspending.gov tools on the MCP server.
 */
export function registerUSASpendingTools(
  server: McpServer,
  client: USASpendingClient,
): void {
  // -------------------------------------------------------------------------
  // search_government_contracts
  // -------------------------------------------------------------------------

  server.tool(
    "search_government_contracts",
    "Search federal government contracts, grants, and loans on USAspending.gov. " +
      "Find contracts by recipient company, awarding agency, keyword, or date range. " +
      "Essential for government contractor due diligence, False Claims Act research, " +
      "and procurement litigation.",
    {
      query: z
        .string()
        .describe("Search terms (company name, keyword, etc.)"),
      award_type: z
        .enum(["contracts", "grants", "loans", "all"])
        .optional()
        .default("contracts")
        .describe("Type of award to search: 'contracts', 'grants', 'loans', or 'all' (default 'contracts')"),
      agency: z
        .string()
        .optional()
        .describe("Awarding agency name filter (e.g. 'Department of Defense')"),
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
        .describe("Maximum results to return (default 20, max 100)"),
    },
    async ({ query, award_type, agency, start_date, end_date, max_results }) => {
      try {
        const filters: AwardSearchFilters = {
          keywords: [query],
          award_type_codes: AWARD_TYPE_CODES[award_type ?? "contracts"],
        };

        if (agency) {
          filters.agencies = [
            { type: "awarding", tier: "toptier", name: agency },
          ];
        }

        if (start_date || end_date) {
          filters.time_period = [
            {
              start_date: start_date ?? "2000-01-01",
              end_date: end_date ?? new Date().toISOString().slice(0, 10),
            },
          ];
        }

        const limit = Math.min(max_results ?? 20, 100);
        const data = await client.searchAwards({ filters, limit });

        if (!data.results || data.results.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No ${award_type ?? "contracts"} found for query: "${query}". Try broadening your search terms or adjusting filters.`,
              },
            ],
          };
        }

        const lines: string[] = [
          `Found ${(data.page_metadata?.total ?? data.results.length).toLocaleString()} results (showing ${data.results.length})`,
          "",
          "| Award ID | Recipient | Amount | Agency | Date Range | Description |",
          "|----------|-----------|--------|--------|------------|-------------|",
        ];

        for (const award of data.results) {
          const awardId = award["Award ID"] || "N/A";
          const recipient = award["Recipient Name"] || "N/A";
          const amount = formatDollar(award["Award Amount"]);
          const awardingAgency = award["Awarding Agency"] || "N/A";
          const startDt = award["Start Date"] || "N/A";
          const endDt = award["End Date"] || "N/A";
          const desc = (award.Description || "N/A").slice(0, 80);
          const internalId = award.generated_internal_id || "";

          lines.push(
            `| ${awardId} | ${recipient} | ${amount} | ${awardingAgency} | ${startDt} — ${endDt} | ${desc} |`,
          );

          // Store internal ID reference for follow-up
          if (internalId) {
            lines.push(`  _Internal ID: ${internalId}_`);
          }
        }

        if (data.page_metadata?.hasNext) {
          lines.push(
            "",
            `_More results available. Total: ${(data.page_metadata?.total ?? 0).toLocaleString()}_`,
          );
        }

        lines.push(
          "",
          "💡 Use get_contract_details with the Internal ID to get full award details.",
        );

        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error searching government contracts: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );

  // -------------------------------------------------------------------------
  // get_contract_details
  // -------------------------------------------------------------------------

  server.tool(
    "get_contract_details",
    "Get full details of a specific government contract or grant award. " +
      "Returns recipient info, performance period, funding amounts, description, " +
      "awarding agency, and sub-agency.",
    {
      award_id: z
        .string()
        .describe("Internal award ID from search results (generated_internal_id)"),
    },
    async ({ award_id }) => {
      try {
        const award = await client.getAward(award_id);

        const lines: string[] = [
          `# Award: ${award.generated_unique_award_id || award_id}`,
          "",
          `- **Type:** ${award.type_description || award.type}`,
          `- **Description:** ${award.description || "N/A"}`,
          "",
          "## Funding",
          `- **Total Obligation:** ${formatDollar(award.total_obligation)}`,
          `- **Base & All Options:** ${formatDollar(award.base_and_all_options_value)}`,
          `- **Date Signed:** ${award.date_signed || "N/A"}`,
          "",
          "## Period of Performance",
        ];

        if (award.period_of_performance) {
          lines.push(
            `- **Start Date:** ${award.period_of_performance.start_date || "N/A"}`,
            `- **End Date:** ${award.period_of_performance.end_date || "N/A"}`,
            `- **Potential End Date:** ${award.period_of_performance.potential_end_date || "N/A"}`,
            `- **Last Modified:** ${award.period_of_performance.last_modified_date || "N/A"}`,
          );
        }

        lines.push("", "## Recipient");
        if (award.recipient) {
          lines.push(
            `- **Name:** ${award.recipient.recipient_name || "N/A"}`,
            `- **DUNS/UEI:** ${award.recipient.recipient_unique_id || "N/A"}`,
            `- **Parent Company:** ${award.recipient.parent_recipient_name || "N/A"}`,
          );
          if (award.recipient.location) {
            const loc = award.recipient.location;
            lines.push(
              `- **Address:** ${[loc.address_line1, loc.city_name, loc.state_code, loc.zip5, loc.country_name].filter(Boolean).join(", ")}`,
            );
          }
          if (award.recipient.business_categories?.length) {
            lines.push(
              `- **Business Categories:** ${award.recipient.business_categories.join(", ")}`,
            );
          }
        }

        lines.push("", "## Awarding Agency");
        if (award.awarding_agency) {
          lines.push(
            `- **Agency:** ${award.awarding_agency.toptier_agency?.name || "N/A"} (${award.awarding_agency.toptier_agency?.abbreviation || ""})`,
            `- **Sub-Agency:** ${award.awarding_agency.subtier_agency?.name || "N/A"} (${award.awarding_agency.subtier_agency?.abbreviation || ""})`,
          );
        }

        lines.push("", "## Funding Agency");
        if (award.funding_agency) {
          lines.push(
            `- **Agency:** ${award.funding_agency.toptier_agency?.name || "N/A"} (${award.funding_agency.toptier_agency?.abbreviation || ""})`,
            `- **Sub-Agency:** ${award.funding_agency.subtier_agency?.name || "N/A"} (${award.funding_agency.subtier_agency?.abbreviation || ""})`,
          );
        }

        if (award.place_of_performance) {
          lines.push(
            "",
            "## Place of Performance",
            `- **Location:** ${[award.place_of_performance.city_name, award.place_of_performance.state_code, award.place_of_performance.country_name].filter(Boolean).join(", ")}`,
          );
        }

        if (award.naics || award.psc_code) {
          lines.push("", "## Classification");
          if (award.naics) {
            lines.push(`- **NAICS:** ${award.naics} — ${award.naics_description || ""}`);
          }
          if (award.psc_code) {
            lines.push(`- **PSC:** ${award.psc_code} — ${award.psc_description || ""}`);
          }
        }

        if (award.executive_details?.officers?.length) {
          lines.push("", "## Executive Compensation");
          for (const officer of award.executive_details.officers) {
            if (officer.name) {
              lines.push(`- ${officer.name}: ${officer.amount || "N/A"}`);
            }
          }
        }

        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error getting contract details for "${award_id}": ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );

  // -------------------------------------------------------------------------
  // get_contractor_profile
  // -------------------------------------------------------------------------

  server.tool(
    "get_contractor_profile",
    "Search for a government contractor by name. Returns matching recipients. " +
      "Use search_government_contracts for detailed award history.",
    {
      company_name: z
        .string()
        .describe("Contractor/recipient name to search"),
      max_results: z
        .number()
        .optional()
        .default(10)
        .describe("Maximum number of results (default 10)"),
    },
    async ({ company_name, max_results }) => {
      try {
        const limit = Math.min(max_results ?? 10, 50);
        const data = await client.searchRecipients(company_name, limit);

        if (!data.results || data.results.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No contractors found matching "${company_name}". Try a shorter or different name.`,
              },
            ],
          };
        }

        const lines: string[] = [
          `Found ${data.results.length} contractor(s) matching "${company_name}":`,
          "",
        ];

        for (let i = 0; i < data.results.length; i++) {
          lines.push(`${i + 1}. ${data.results[i]}`);
        }

        lines.push(
          "",
          "💡 Use search_government_contracts with the exact company name to find their award history.",
        );

        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error searching contractors: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );
}
