// ---------------------------------------------------------------------------
// Congress MCP Tools
// ---------------------------------------------------------------------------

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CongressClient } from "../congress/client.js";
import { truncateText, stripHtml } from "../utils/html.js";

/**
 * Register Congress.gov legislative research tools on the MCP server.
 */
export function registerCongressTools(
  server: McpServer,
  client: CongressClient,
): void {
  // -------------------------------------------------------------------------
  // search_bills
  // -------------------------------------------------------------------------

  server.tool(
    "search_bills",
    "Search federal legislation by Congress session. Returns recent bills with their status, sponsors, and latest action. Use get_bill for full details on a specific bill.",
    {
      congress: z
        .number()
        .optional()
        .default(118)
        .describe("Congress session number (e.g. 118 for the 118th Congress)"),
      bill_type: z
        .string()
        .optional()
        .describe(
          "Bill type filter: 'hr' (House), 's' (Senate), 'hjres', 'sjres', 'hconres', 'sconres'",
        ),
      max_results: z
        .number()
        .optional()
        .default(20)
        .describe("Maximum number of results to return (max 250)"),
      sort: z
        .string()
        .optional()
        .default("updateDate+desc")
        .describe("Sort order, e.g. 'updateDate+desc' or 'updateDate+asc'"),
    },
    async ({ congress, bill_type, max_results, sort }) => {
      try {
        const data = await client.searchBills({
          congress,
          billType: bill_type,
          limit: Math.min(max_results, 250),
          sort,
        });

        if (!data.bills || data.bills.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No bills found for Congress ${congress}${bill_type ? ` (type: ${bill_type})` : ""}. Try a different Congress session or remove the type filter.`,
              },
            ],
          };
        }

        const lines: string[] = [
          `# Bills — ${congress}th Congress${bill_type ? ` (${bill_type.toUpperCase()})` : ""}`,
          `Found ${data.pagination.count} bills. Showing ${data.bills.length}.\n`,
        ];

        for (const bill of data.bills) {
          lines.push(`## ${bill.type?.toUpperCase() ?? ""} ${bill.number} — ${bill.title}`);
          if (bill.originChamber) lines.push(`Chamber: ${bill.originChamber}`);
          if (bill.latestAction) {
            lines.push(
              `Latest Action (${bill.latestAction.actionDate}): ${bill.latestAction.text}`,
            );
          }
          if (bill.updateDate) lines.push(`Updated: ${bill.updateDate}`);
          lines.push(
            `→ Use get_bill(congress=${bill.congress}, bill_type="${bill.type?.toLowerCase()}", bill_number=${bill.number}) for details`,
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
              text: `Error searching bills: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // -------------------------------------------------------------------------
  // get_bill
  // -------------------------------------------------------------------------

  server.tool(
    "get_bill",
    "Get comprehensive details about a specific bill including title, sponsors, committee assignments, latest action, policy area, and CRS summary. Also returns the bill's action history showing its journey through Congress.",
    {
      congress: z.number().describe("Congress number (e.g. 118)"),
      bill_type: z
        .string()
        .describe("Bill type: 'hr', 's', 'hjres', 'sjres', 'hconres', 'sconres'"),
      bill_number: z.number().describe("Bill number"),
    },
    async ({ congress, bill_type, bill_number }) => {
      try {
        // Fetch bill details, summaries, and actions in parallel
        const [bill, summaries, actions] = await Promise.all([
          client.getBill(congress, bill_type, bill_number),
          client.getBillSummaries(congress, bill_type, bill_number).catch(() => []),
          client.getBillActions(congress, bill_type, bill_number).catch(() => []),
        ]);

        const lines: string[] = [
          `# ${bill.type?.toUpperCase() ?? bill_type.toUpperCase()} ${bill.number} — ${bill.title}`,
          `**Congress:** ${bill.congress}th Congress`,
        ];

        if (bill.introducedDate) lines.push(`**Introduced:** ${bill.introducedDate}`);
        if (bill.originChamber) lines.push(`**Origin Chamber:** ${bill.originChamber}`);
        if (bill.policyArea?.name) lines.push(`**Policy Area:** ${bill.policyArea.name}`);

        // Sponsors
        if (bill.sponsors && bill.sponsors.length > 0) {
          lines.push("\n## Sponsors");
          for (const s of bill.sponsors) {
            const party = s.party ? ` (${s.party})` : "";
            const state = s.state ? `, ${s.state}` : "";
            lines.push(`- ${s.fullName}${party}${state}`);
          }
        }

        if (bill.cosponsors?.count) {
          lines.push(`**Cosponsors:** ${bill.cosponsors.count}`);
        }

        // Latest action
        if (bill.latestAction) {
          lines.push("\n## Latest Action");
          lines.push(
            `${bill.latestAction.actionDate}: ${bill.latestAction.text}`,
          );
        }

        // Laws enacted
        if (bill.laws && bill.laws.length > 0) {
          lines.push("\n## Laws Enacted");
          for (const law of bill.laws) {
            lines.push(`- ${law.type} ${law.number}`);
          }
        }

        // CRS Summaries
        if (summaries.length > 0) {
          lines.push("\n## CRS Summary");
          // Show the most recent summary
          const latest = summaries[summaries.length - 1];
          if (latest) {
            if (latest.actionDesc) lines.push(`*${latest.actionDesc}*`);
            lines.push(latest.text);
          }
        }

        // Action history
        if (actions.length > 0) {
          lines.push("\n## Action History");
          for (const action of actions.slice(0, 30)) {
            const actionType = action.type ? ` [${action.type}]` : "";
            lines.push(`- ${action.actionDate}${actionType}: ${action.text}`);
          }
          if (actions.length > 30) {
            lines.push(`... and ${actions.length - 30} more actions`);
          }
        }

        // Constitutional authority
        if (bill.constitutionalAuthorityStatementText) {
          lines.push("\n## Constitutional Authority");
          lines.push(stripHtml(bill.constitutionalAuthorityStatementText));
        }

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error fetching bill ${bill_type.toUpperCase()} ${bill_number}: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // -------------------------------------------------------------------------
  // get_bill_text
  // -------------------------------------------------------------------------

  server.tool(
    "get_bill_text",
    "Get the actual text of a bill. Returns the most recent version (enrolled > engrossed > introduced). Use for analyzing specific legislative language, amendments, or provisions.",
    {
      congress: z.number().describe("Congress number (e.g. 118)"),
      bill_type: z
        .string()
        .describe("Bill type: 'hr', 's', 'hjres', 'sjres', 'hconres', 'sconres'"),
      bill_number: z.number().describe("Bill number"),
      max_chars: z
        .number()
        .optional()
        .default(50000)
        .describe("Maximum characters to return (default 50000)"),
    },
    async ({ congress, bill_type, bill_number, max_chars }) => {
      try {
        const versions = await client.getBillText(congress, bill_type, bill_number);

        if (!versions || versions.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No text versions available for ${bill_type.toUpperCase()} ${bill_number} (Congress ${congress}). The bill text may not yet be published.`,
              },
            ],
          };
        }

        // Prefer enrolled > engrossed > introduced (later versions are more final)
        // The API returns them in order, so the last entry is typically the most recent
        const priorityOrder = [
          "Enrolled Bill",
          "Engrossed",
          "Reported in Senate",
          "Reported in House",
          "Placed on Calendar",
          "Engrossed Amendment",
          "Received in Senate",
          "Referred in Senate",
          "Introduced in House",
          "Introduced in Senate",
        ];

        let bestVersion = versions[versions.length - 1];

        for (const priority of priorityOrder) {
          const match = versions.find(
            (v) => v.type?.toLowerCase().includes(priority.toLowerCase()),
          );
          if (match) {
            bestVersion = match;
            break;
          }
        }

        if (!bestVersion) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No bill text versions could be selected.",
              },
            ],
          };
        }

        const textContent = await client.fetchBillTextContent(bestVersion);

        if (!textContent) {
          // Fall back to listing available versions with their format URLs
          const versionList = versions
            .map(
              (v) =>
                `- ${v.type ?? "Unknown"} (${v.date ?? "no date"}): ${v.formats?.map((f) => f.url).join(", ") ?? "no URLs"}`,
            )
            .join("\n");

          return {
            content: [
              {
                type: "text" as const,
                text: `Could not fetch bill text content. Available versions:\n${versionList}`,
              },
            ],
          };
        }

        const header = [
          `# ${bill_type.toUpperCase()} ${bill_number} — Full Text`,
          `**Congress:** ${congress}`,
          `**Version:** ${bestVersion.type ?? "Unknown"}`,
          `**Date:** ${bestVersion.date ?? "Unknown"}`,
          "",
          "---\n",
        ].join("\n");

        return {
          content: [
            {
              type: "text" as const,
              text: header + truncateText(textContent, max_chars),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error fetching bill text: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // -------------------------------------------------------------------------
  // search_congress_members
  // -------------------------------------------------------------------------

  server.tool(
    "search_congress_members",
    "List members of Congress. Filter to current members only or include historical members. Returns name, party, state, and chamber.",
    {
      current_only: z
        .boolean()
        .optional()
        .default(true)
        .describe("If true, only return current members of Congress"),
      max_results: z
        .number()
        .optional()
        .default(50)
        .describe("Maximum number of results (max 250)"),
    },
    async ({ current_only, max_results }) => {
      try {
        const data = await client.searchMembers({
          currentMember: current_only,
          limit: Math.min(max_results, 250),
        });

        if (!data.members || data.members.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No members found matching the criteria.",
              },
            ],
          };
        }

        const lines: string[] = [
          `# Members of Congress${current_only ? " (Current)" : ""}`,
          `Found ${data.pagination.count} members. Showing ${data.members.length}.\n`,
        ];

        for (const member of data.members) {
          const party = member.partyName ? ` (${member.partyName})` : "";
          const state = member.state ? `, ${member.state}` : "";
          const district =
            member.district !== undefined ? `, District ${member.district}` : "";
          lines.push(
            `- **${member.name}**${party}${state}${district} [${member.bioguideId}]`,
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
              text: `Error fetching members: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
