// ---------------------------------------------------------------------------
// Citation MCP Tools
// ---------------------------------------------------------------------------

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CourtListenerClient } from "../courtlistener/client.js";

/**
 * Register citation-analysis tools on the MCP server.
 */
export function registerCitationTools(
  server: McpServer,
  cl: CourtListenerClient,
): void {
  // -------------------------------------------------------------------------
  // verify_citations
  // -------------------------------------------------------------------------

  server.tool(
    "verify_citations",
    "Verify that legal citations are real and resolve to actual cases. Accepts reporter citations like '384 U.S. 436' or '410 F.2d 701' and checks each against the CourtListener database. Returns which citations are valid, their matched case names, cluster IDs, and URLs. Use to fact-check citations in legal documents, briefs, or AI-generated text.",
    {
      citations: z
        .array(z.string())
        .min(1)
        .describe(
          "Array of reporter citations to verify, e.g. ['384 U.S. 436', '347 U.S. 483', '410 F.2d 701']",
        ),
    },
    async ({ citations }) => {
      try {
        // Build a text blob containing all citations for the lookup endpoint
        const text = citations.join("\n");
        const data = await cl.verifyCitations(text);

        // The citation-lookup endpoint returns an array of matches
        const results = data as Array<{
          citation: string;
          normalized_citations?: string[];
          clusters?: Array<{
            id: number;
            case_name: string;
            absolute_url: string;
          }>;
          status?: number;
        }>;

        if (!Array.isArray(results) || results.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No citation results returned. The citations may not be in a recognized format. Try standard reporter citations like '384 U.S. 436'.`,
              },
            ],
          };
        }

        const lines: string[] = [
          `# Citation Verification Results`,
          `Checked ${citations.length} citation(s):`,
          "",
        ];

        for (const result of results) {
          const cite = result.citation || "Unknown";

          if (result.clusters && result.clusters.length > 0) {
            lines.push(`## ✅ ${cite}`);
            for (const cluster of result.clusters) {
              lines.push(`- **Case:** ${cluster.case_name}`);
              lines.push(`- **Cluster ID:** ${cluster.id}`);
              lines.push(
                `- **URL:** https://www.courtlistener.com${cluster.absolute_url}`,
              );
            }
          } else {
            lines.push(`## ❌ ${cite}`);
            lines.push(`- Not found in CourtListener database`);
          }
          lines.push("");
        }

        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error verifying citations: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );

  // -------------------------------------------------------------------------
  // get_citing_cases
  // -------------------------------------------------------------------------

  server.tool(
    "get_citing_cases",
    "Find cases that cite a given opinion (forward citations / Shepardize). Returns the IDs of opinions that cite the specified opinion, along with citation depth. Use to trace how a case has been used — whether it's been followed, distinguished, or frequently cited. Requires an opinion ID (not a cluster ID).",
    {
      opinion_id: z
        .number()
        .describe("The opinion ID to find forward citations for"),
      page: z
        .number()
        .optional()
        .default(1)
        .describe("Results page number (default 1)"),
    },
    async ({ opinion_id, page }) => {
      try {
        const data = await cl.getCitingOpinions(opinion_id, page);

        if (!data.results || data.results.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No citing opinions found for opinion ${opinion_id}. This opinion may not have been cited yet, or the ID may be incorrect.`,
              },
            ],
          };
        }

        const lines: string[] = [
          `# Cases Citing Opinion ${opinion_id}`,
          `Total: ${data.count.toLocaleString()} citing opinion(s) (page ${page}, showing ${data.results.length})`,
          "",
        ];

        for (const hit of data.results) {
          const citingId = CourtListenerClient.extractIdFromUrl(
            hit.citing_opinion,
          );
          lines.push(
            `- **Citing Opinion ID:** ${citingId ?? "unknown"} | **Depth:** ${hit.depth} | **Record ID:** ${hit.id}`,
          );
        }

        if (data.next) {
          lines.push("");
          lines.push(`_More results available — request page ${page + 1}_`);
        }

        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error getting citing cases for opinion ${opinion_id}: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );

  // -------------------------------------------------------------------------
  // get_authorities
  // -------------------------------------------------------------------------

  server.tool(
    "get_authorities",
    "Find cases cited BY a given opinion (backward citations / authorities). Returns the IDs of opinions that the specified opinion cites, with citation depth. Use to understand what precedent an opinion relies on — its legal foundation and authority chain. Requires an opinion ID (not a cluster ID).",
    {
      opinion_id: z
        .number()
        .describe("The opinion ID to find backward citations (authorities) for"),
      page: z
        .number()
        .optional()
        .default(1)
        .describe("Results page number (default 1)"),
    },
    async ({ opinion_id, page }) => {
      try {
        const data = await cl.getAuthorities(opinion_id, page);

        if (!data.results || data.results.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No authorities found for opinion ${opinion_id}. This opinion may not cite other cases, or the ID may be incorrect.`,
              },
            ],
          };
        }

        const lines: string[] = [
          `# Authorities Cited by Opinion ${opinion_id}`,
          `Total: ${data.count.toLocaleString()} cited opinion(s) (page ${page}, showing ${data.results.length})`,
          "",
        ];

        for (const hit of data.results) {
          const citedId = CourtListenerClient.extractIdFromUrl(
            hit.cited_opinion,
          );
          lines.push(
            `- **Cited Opinion ID:** ${citedId ?? "unknown"} | **Depth:** ${hit.depth} | **Record ID:** ${hit.id}`,
          );
        }

        if (data.next) {
          lines.push("");
          lines.push(`_More results available — request page ${page + 1}_`);
        }

        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error getting authorities for opinion ${opinion_id}: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );
}
