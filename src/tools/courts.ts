// ---------------------------------------------------------------------------
// MCP Tools — Courts, Judges & Oral Arguments
// ---------------------------------------------------------------------------

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CourtListenerClient } from "../courtlistener/client.js";

/**
 * Register court, judge, and oral argument tools on the MCP server.
 */
export function registerCourtTools(
  server: McpServer,
  cl: CourtListenerClient,
): void {
  // -------------------------------------------------------------------------
  // list_courts
  // -------------------------------------------------------------------------
  server.tool(
    "list_courts",
    "List courts in the CourtListener database, optionally filtered by " +
      "jurisdiction type.",
    {
      jurisdiction: z
        .string()
        .optional()
        .describe(
          "Jurisdiction filter: 'F' (Federal Appellate), 'FD' (Federal District), " +
            "'FB' (Federal Bankruptcy), 'FS' (Federal Special), 'S' (State Supreme), " +
            "'SA' (State Appellate), 'ST' (State Trial), 'SS' (State Special), " +
            "'SAG' (State Attorney General), 'T' (Tribal), 'TA' (Testing/Academic)",
        ),
      page: z
        .number()
        .int()
        .positive()
        .optional()
        .default(1)
        .describe("Page number (default 1)"),
    },
    async ({ jurisdiction, page }) => {
      try {
        const data = await cl.listCourts(jurisdiction, page);

        if (!data.results || data.results.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: jurisdiction
                  ? `No courts found for jurisdiction "${jurisdiction}" (page ${page}).`
                  : `No courts found (page ${page}).`,
              },
            ],
          };
        }

        const lines = data.results.map((court) =>
          [
            `${court.id}: ${court.full_name}`,
            `  Short Name: ${court.short_name}`,
            `  Jurisdiction: ${court.jurisdiction}`,
            `  Citation String: ${court.citation_string || "N/A"}`,
            `  In Use: ${court.in_use ? "Yes" : "No"}`,
            `  Start Date: ${court.start_date || "N/A"}`,
          ].join("\n"),
        );

        const header =
          `${data.count.toLocaleString()} court(s) found` +
          (jurisdiction ? ` (jurisdiction: ${jurisdiction})` : "") +
          ` — page ${page}:\n`;

        return {
          content: [{ type: "text" as const, text: header + lines.join("\n\n") }],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error listing courts: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );

  // -------------------------------------------------------------------------
  // get_court
  // -------------------------------------------------------------------------
  server.tool(
    "get_court",
    "Get detailed information about a specific court by its CourtListener ID " +
      "(e.g. 'scotus', 'ca9', 'nyed').",
    {
      court_id: z
        .string()
        .describe("Court ID (e.g. 'scotus', 'ca9', 'nyed', 'cacd')"),
    },
    async ({ court_id }) => {
      try {
        const court = await cl.getCourt(court_id);

        const lines = [
          `Court ID: ${court.id}`,
          `Full Name: ${court.full_name}`,
          `Short Name: ${court.short_name}`,
          `Jurisdiction: ${court.jurisdiction}`,
          `Citation String: ${court.citation_string || "N/A"}`,
          `URL: ${court.url || "N/A"}`,
          `In Use: ${court.in_use ? "Yes" : "No"}`,
          `Start Date: ${court.start_date || "N/A"}`,
          `End Date: ${court.end_date ?? "N/A (still active)"}`,
          `Last Modified: ${court.date_modified}`,
        ];

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error fetching court "${court_id}": ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );

  // -------------------------------------------------------------------------
  // search_judges
  // -------------------------------------------------------------------------
  server.tool(
    "search_judges",
    "Search for judges by name or keyword. Returns name, court, and " +
      "CourtListener URL.",
    {
      query: z.string().describe("Judge name or keyword to search"),
      page: z
        .number()
        .int()
        .positive()
        .optional()
        .default(1)
        .describe("Page number (default 1)"),
    },
    async ({ query, page }) => {
      try {
        const data = await cl.searchPeople(query, page);

        if (!data.results || data.results.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No judges found for query: "${query}"`,
              },
            ],
          };
        }

        const lines = data.results.map((hit, i) => {
          const num = (page - 1) * 20 + i + 1;
          const url = CourtListenerClient.fullUrl(hit.absolute_url);
          return [
            `${num}. ${hit.caseName}`, // people search returns name in caseName
            `   Court: ${hit.court || "N/A"}`,
            `   URL: ${url}`,
          ].join("\n");
        });

        const header =
          `Found ${data.count.toLocaleString()} judge(s) for "${query}" ` +
          `(page ${page}):\n`;

        return {
          content: [{ type: "text" as const, text: header + lines.join("\n\n") }],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error searching judges: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );

  // -------------------------------------------------------------------------
  // get_judge
  // -------------------------------------------------------------------------
  server.tool(
    "get_judge",
    "Get detailed information about a judge including education, positions " +
      "(courts served), political affiliations, and ABA ratings.",
    {
      judge_id: z
        .number()
        .int()
        .positive()
        .describe("CourtListener person/judge ID"),
    },
    async ({ judge_id }) => {
      try {
        const person = await cl.getPerson(judge_id);

        // Assemble name
        const nameParts = [
          person.name_first,
          person.name_middle,
          person.name_last,
          person.name_suffix,
        ].filter(Boolean);
        const fullName = nameParts.join(" ");

        const lines: string[] = [
          `Name: ${fullName}`,
          `Gender: ${person.gender || "N/A"}`,
          `Born: ${person.date_dob ?? "N/A"}${person.dob_city ? ` in ${person.dob_city}` : ""}${person.dob_state ? `, ${person.dob_state}` : ""}`,
          `Died: ${person.date_dod ?? "N/A"}`,
          `URL: ${CourtListenerClient.fullUrl(person.absolute_url)}`,
        ];

        // Education
        if (person.educations && person.educations.length > 0) {
          lines.push("", "Education:");
          for (const edu of person.educations) {
            const degree = [edu.degree_level, edu.degree_detail]
              .filter(Boolean)
              .join(" — ");
            const year = edu.degree_year ? ` (${edu.degree_year})` : "";
            lines.push(`  • ${edu.school?.name ?? "Unknown school"}: ${degree}${year}`);
          }
        }

        // Positions
        if (person.positions && person.positions.length > 0) {
          lines.push("", "Positions:");
          for (const pos of person.positions) {
            const courtName = pos.court_full_name || "Unknown court";
            const dateRange = [pos.date_start, pos.date_termination ?? pos.date_retirement ?? "present"]
              .filter(Boolean)
              .join(" – ");
            lines.push(
              `  • ${pos.position_type || "Position"} at ${courtName}` +
                (dateRange ? ` (${dateRange})` : ""),
            );
            if (pos.how_selected) {
              lines.push(`    Selected: ${pos.how_selected}`);
            }
          }
        }

        // Political affiliations
        if (person.political_affiliations && person.political_affiliations.length > 0) {
          lines.push("", "Political Affiliations:");
          for (const pa of person.political_affiliations) {
            const range = [pa.date_start, pa.date_end]
              .filter(Boolean)
              .join(" – ");
            lines.push(
              `  • ${pa.political_party}` + (range ? ` (${range})` : ""),
            );
          }
        }

        // ABA ratings
        if (person.aba_ratings && person.aba_ratings.length > 0) {
          lines.push("", "ABA Ratings:");
          for (const r of person.aba_ratings) {
            lines.push(`  • ${r.rating} (${r.year_rated})`);
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
              text: `Error fetching judge ${judge_id}: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );

  // -------------------------------------------------------------------------
  // search_oral_arguments
  // -------------------------------------------------------------------------
  server.tool(
    "search_oral_arguments",
    "Search oral argument recordings. Returns case name, court, date argued, " +
      "duration, and download URL.",
    {
      query: z.string().describe("Search query for oral arguments"),
      page: z
        .number()
        .int()
        .positive()
        .optional()
        .default(1)
        .describe("Page number (default 1)"),
    },
    async ({ query, page }) => {
      try {
        const data = await cl.searchOralArguments(query, page);

        if (!data.results || data.results.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No oral arguments found for query: "${query}"`,
              },
            ],
          };
        }

        const lines = data.results.map((hit, i) => {
          const num = (page - 1) * 20 + i + 1;
          const url = CourtListenerClient.fullUrl(hit.absolute_url);
          return [
            `${num}. ${hit.caseName}`,
            `   Court: ${hit.court || "N/A"}`,
            `   Date Argued: ${hit.dateArgued ?? "N/A"}`,
            `   URL: ${url}`,
          ].join("\n");
        });

        const header =
          `Found ${data.count.toLocaleString()} oral argument(s) for "${query}" ` +
          `(page ${page}):\n`;

        return {
          content: [{ type: "text" as const, text: header + lines.join("\n\n") }],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error searching oral arguments: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );
}
