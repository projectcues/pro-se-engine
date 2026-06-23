// ---------------------------------------------------------------------------
// Case Law MCP Tools
// ---------------------------------------------------------------------------

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CourtListenerClient } from "../courtlistener/client.js";
import {
  getBestOpinionText,
  truncateText,
  findInText,
  formatCitation,
  stripHtml,
} from "../utils/html.js";

/**
 * Register case-law research tools on the MCP server.
 */
export function registerCaseLawTools(
  server: McpServer,
  cl: CourtListenerClient,
): void {
  // -------------------------------------------------------------------------
  // search_case_law
  // -------------------------------------------------------------------------

  server.tool(
    "search_case_law",
    "Search US case law across all federal and state courts. Returns case names, citations, dates, courts, and relevance snippets. Use for broad legal research — finding cases by topic, legal principle, party name, or keyword. Supports filtering by court, date range, citation count, and precedential status.",
    {
      query: z.string().describe("Search query (keywords, phrases, legal concepts, party names)"),
      court: z
        .string()
        .optional()
        .describe("Court ID filter, e.g. 'scotus', 'ca9', 'ca2', 'nyed'. Omit to search all courts"),
      date_filed_after: z
        .string()
        .optional()
        .describe("Only cases filed after this date (YYYY-MM-DD)"),
      date_filed_before: z
        .string()
        .optional()
        .describe("Only cases filed before this date (YYYY-MM-DD)"),
      cited_gt: z
        .number()
        .optional()
        .describe("Minimum citation count — use to find well-cited, influential cases"),
      status: z
        .string()
        .optional()
        .describe("Precedential status filter: 'Published' or 'Unpublished'"),
      page: z
        .number()
        .optional()
        .default(1)
        .describe("Results page number (default 1)"),
    },
    async ({ query, court, date_filed_after, date_filed_before, cited_gt, status, page }) => {
      try {
        const filters: Record<string, string | number | boolean | undefined> = {};
        if (court) filters.court = court;
        if (date_filed_after) filters.filed_after = date_filed_after;
        if (date_filed_before) filters.filed_before = date_filed_before;
        if (cited_gt !== undefined) filters.cited_gt = cited_gt;
        if (status) filters.stat = status;

        const data = await cl.search(query, "o", filters, page);

        if (!data.results || data.results.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No cases found for query: "${query}". Try broadening your search terms or removing filters.`,
              },
            ],
          };
        }

        const lines: string[] = [
          `Found ${data.count.toLocaleString()} cases (page ${page}, showing ${data.results.length} results)`,
          "",
        ];

        for (const hit of data.results) {
          const citations = hit.citation?.join(", ") || "No citation";
          const snippet = stripHtml(hit.snippet || "");

          lines.push(`## ${hit.caseName}`);
          lines.push(`- **Court:** ${hit.court} (${hit.court_id})`);
          lines.push(`- **Date Filed:** ${hit.dateFiled}`);
          lines.push(`- **Citations:** ${citations}`);
          lines.push(`- **Cited by:** ${hit.citeCount} cases`);
          lines.push(`- **Status:** ${hit.status}`);
          lines.push(`- **Cluster ID:** ${hit.cluster_id}`);
          lines.push(`- **URL:** https://www.courtlistener.com${hit.absolute_url}`);
          if (snippet) {
            lines.push(`- **Snippet:** ${snippet}`);
          }
          lines.push("");
        }

        if (data.next) {
          lines.push(`_More results available — request page ${page + 1}_`);
        }

        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error searching case law: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );

  // -------------------------------------------------------------------------
  // get_case
  // -------------------------------------------------------------------------

  server.tool(
    "get_case",
    "Get detailed metadata for a specific case by its cluster ID. Returns case name, court, date filed, all citations, nature of suit, judges, syllabus, precedential status, opinion count, and docket ID. Use after search_case_law to get full details, or when you already know the cluster ID.",
    {
      cluster_id: z.number().describe("The CourtListener cluster ID for the case"),
    },
    async ({ cluster_id }) => {
      try {
        const cluster = await cl.getCluster(cluster_id);

        const citations = cluster.citations
          ?.map((c) => formatCitation(c))
          .join("; ") || "None";

        const lines: string[] = [
          `# ${cluster.case_name_full || cluster.case_name}`,
          "",
          `- **Short Name:** ${cluster.case_name_short}`,
          `- **Date Filed:** ${cluster.date_filed}${cluster.date_filed_is_approximate ? " (approximate)" : ""}`,
          `- **Citations:** ${citations}`,
          `- **Citation Count:** ${cluster.citation_count}`,
          `- **Precedential Status:** ${cluster.precedential_status}`,
          `- **Nature of Suit:** ${cluster.nature_of_suit || "N/A"}`,
          `- **Judges:** ${cluster.judges || "N/A"}`,
          `- **Posture:** ${cluster.posture || "N/A"}`,
          `- **Docket ID:** ${cluster.docket_id}`,
          `- **Opinions:** ${cluster.sub_opinions?.length ?? 0} opinion(s)`,
          `- **URL:** https://www.courtlistener.com${cluster.absolute_url}`,
        ];

        if (cluster.syllabus) {
          lines.push("", "## Syllabus", stripHtml(cluster.syllabus));
        }

        if (cluster.procedural_history) {
          lines.push("", "## Procedural History", stripHtml(cluster.procedural_history));
        }

        if (cluster.sub_opinions && cluster.sub_opinions.length > 0) {
          lines.push("", "## Opinion IDs");
          for (const url of cluster.sub_opinions) {
            const opId = CourtListenerClient.extractIdFromUrl(url);
            if (opId) lines.push(`- Opinion ${opId}`);
          }
        }

        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error getting case ${cluster_id}: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );

  // -------------------------------------------------------------------------
  // read_opinion
  // -------------------------------------------------------------------------

  server.tool(
    "read_opinion",
    "Read the full text of a court opinion by its opinion ID. Returns the opinion text in plain text format. Use when you need to read the actual legal reasoning, holdings, or analysis. Get opinion IDs from get_case or get_case_opinions.",
    {
      opinion_id: z.number().describe("The CourtListener opinion ID"),
      max_chars: z
        .number()
        .optional()
        .default(50000)
        .describe("Maximum characters to return (default 50000). Increase for very long opinions"),
    },
    async ({ opinion_id, max_chars }) => {
      try {
        const opinion = await cl.getOpinion(opinion_id);
        const text = getBestOpinionText(opinion);

        if (!text) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Opinion ${opinion_id} exists but has no available text. It may only be available as a PDF download: ${opinion.download_url || "N/A"}`,
              },
            ],
          };
        }

        const header = [
          `# Opinion ${opinion_id}`,
          `- **Type:** ${opinion.type}`,
          `- **Author:** ${opinion.author_str || "Unknown"}`,
          `- **Cluster ID:** ${opinion.cluster_id}`,
          `- **URL:** https://www.courtlistener.com${opinion.absolute_url}`,
          "",
          "---",
          "",
        ].join("\n");

        const body = truncateText(text, max_chars);

        return {
          content: [{ type: "text" as const, text: header + body }],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error reading opinion ${opinion_id}: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );

  // -------------------------------------------------------------------------
  // get_case_opinions
  // -------------------------------------------------------------------------

  server.tool(
    "get_case_opinions",
    "List all opinions for a case (majority, concurrence, dissent, etc.) and optionally read their full text. Use to understand the different perspectives in a case — who wrote what, who concurred, who dissented. Set include_text=true to read all opinions at once.",
    {
      cluster_id: z.number().describe("The CourtListener cluster ID for the case"),
      include_text: z
        .boolean()
        .optional()
        .default(false)
        .describe("If true, include the full text of each opinion (default false)"),
      max_chars_per_opinion: z
        .number()
        .optional()
        .default(30000)
        .describe("Maximum characters per opinion when include_text is true (default 30000)"),
    },
    async ({ cluster_id, include_text, max_chars_per_opinion }) => {
      try {
        const data = await cl.getClusterOpinions(cluster_id);

        if (!data.results || data.results.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No opinions found for cluster ${cluster_id}. The case may not have digitized opinions.`,
              },
            ],
          };
        }

        const lines: string[] = [
          `# Opinions for Cluster ${cluster_id}`,
          `Found ${data.results.length} opinion(s)`,
          "",
        ];

        for (const opinion of data.results) {
          lines.push(`## Opinion ${opinion.id} — ${opinion.type}`);
          lines.push(`- **Author:** ${opinion.author_str || "Unknown"}`);
          if (opinion.joined_by && opinion.joined_by.length > 0) {
            lines.push(`- **Joined by:** ${opinion.joined_by.length} judge(s)`);
          }
          lines.push(`- **URL:** https://www.courtlistener.com${opinion.absolute_url}`);

          if (include_text) {
            const text = getBestOpinionText(opinion);
            if (text) {
              lines.push("");
              lines.push(truncateText(text, max_chars_per_opinion));
            } else {
              lines.push("");
              lines.push("_No text available for this opinion._");
            }
          }

          lines.push("");
        }

        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error getting opinions for cluster ${cluster_id}: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );

  // -------------------------------------------------------------------------
  // find_in_opinion
  // -------------------------------------------------------------------------

  server.tool(
    "find_in_opinion",
    "Search for specific text within a court opinion. Returns matching passages with surrounding context. Use to locate specific holdings, quotes, legal standards, or discussions of particular topics within a long opinion without reading the entire text.",
    {
      opinion_id: z.number().describe("The CourtListener opinion ID to search within"),
      query: z.string().describe("Text to search for within the opinion (case-insensitive)"),
      max_results: z
        .number()
        .optional()
        .default(20)
        .describe("Maximum number of matches to return (default 20)"),
      context_chars: z
        .number()
        .optional()
        .default(200)
        .describe("Characters of surrounding context for each match (default 200)"),
    },
    async ({ opinion_id, query, max_results, context_chars }) => {
      try {
        const opinion = await cl.getOpinion(opinion_id);
        const text = getBestOpinionText(opinion);

        if (!text) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Opinion ${opinion_id} has no available text to search.`,
              },
            ],
          };
        }

        const matches = findInText(text, query, max_results, context_chars);

        if (matches.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No matches for "${query}" in opinion ${opinion_id}. Try different terms or check spelling.`,
              },
            ],
          };
        }

        const lines: string[] = [
          `Found ${matches.length} match(es) for "${query}" in opinion ${opinion_id}:`,
          "",
        ];

        for (let i = 0; i < matches.length; i++) {
          const m = matches[i];
          lines.push(`### Match ${i + 1} (position ${m.matchIndex})`);
          lines.push(`> …${m.context}…`);
          lines.push("");
        }

        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error searching opinion ${opinion_id}: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );
}
