// ---------------------------------------------------------------------------
// MCP Tools — Legal Document Generation
// ---------------------------------------------------------------------------

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  PageOrientation,
  SectionType,
  BorderStyle,
} from "docx";

// ---------------------------------------------------------------------------
// Zod schemas for tool parameters
// ---------------------------------------------------------------------------

const TableSchema = z.object({
  headers: z.array(z.string()).describe("Column header labels"),
  rows: z.array(z.array(z.string())).describe("Row data (array of string arrays)"),
});

const SectionSchema = z.object({
  heading: z.string().optional().describe("Section heading text"),
  level: z
    .number()
    .int()
    .min(1)
    .max(3)
    .optional()
    .describe("Heading level: 1, 2, or 3"),
  content: z
    .string()
    .optional()
    .describe("Prose text; paragraphs separated by double newlines"),
  pageBreak: z
    .boolean()
    .optional()
    .describe("Insert a page break before this section"),
  table: TableSchema.optional().describe("Optional table for this section"),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map numeric heading level to the docx HeadingLevel enum. */
function headingLevelFor(level?: number): (typeof HeadingLevel)[keyof typeof HeadingLevel] | undefined {
  switch (level) {
    case 1:
      return HeadingLevel.HEADING_1;
    case 2:
      return HeadingLevel.HEADING_2;
    case 3:
      return HeadingLevel.HEADING_3;
    default:
      return HeadingLevel.HEADING_1;
  }
}

/** Create a bordered table from headers + rows. */
function buildTable(
  headers: string[],
  rows: string[][],
): Table {
  const borderStyle = {
    style: BorderStyle.SINGLE,
    size: 1,
    color: "999999",
  };
  const borders = {
    top: borderStyle,
    bottom: borderStyle,
    left: borderStyle,
    right: borderStyle,
  };

  // Header row
  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map(
      (h) =>
        new TableCell({
          borders,
          width: { size: Math.floor(100 / headers.length), type: WidthType.PERCENTAGE },
          shading: { fill: "E8E8E8" },
          children: [
            new Paragraph({
              alignment: AlignmentType.LEFT,
              children: [new TextRun({ text: h, bold: true, size: 20 })],
            }),
          ],
        }),
    ),
  });

  // Data rows
  const dataRows = rows.map(
    (row) =>
      new TableRow({
        children: row.map(
          (cell) =>
            new TableCell({
              borders,
              width: { size: Math.floor(100 / headers.length), type: WidthType.PERCENTAGE },
              children: [
                new Paragraph({
                  children: [new TextRun({ text: cell, size: 20 })],
                }),
              ],
            }),
        ),
      }),
  );

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...dataRows],
  });
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

/**
 * Register document-generation tools on the MCP server.
 * No CourtListener client needed — purely local document creation.
 */
export function registerDocumentTools(server: McpServer): void {
  server.tool(
    "generate_legal_document",
    "Generate a professional Word (.docx) legal document from structured " +
      "sections. Returns the document as a base64-encoded string with a " +
      "suggested filename.",
    {
      title: z.string().describe("Document title"),
      landscape: z
        .boolean()
        .optional()
        .default(false)
        .describe("Use landscape orientation (default: portrait)"),
      sections: z
        .array(SectionSchema)
        .min(1)
        .describe("Ordered list of document sections"),
    },
    async ({ title, landscape, sections }) => {
      try {
        // Build the paragraph / table children for the document body
        const children: (Paragraph | Table)[] = [];

        // Document title
        children.push(
          new Paragraph({
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
            children: [
              new TextRun({
                text: title,
                bold: true,
                size: 48, // 24pt in half-points
              }),
            ],
          }),
        );

        // Process each section
        for (const section of sections) {
          // Optional page break
          if (section.pageBreak) {
            children.push(
              new Paragraph({
                children: [],
                pageBreakBefore: true,
              }),
            );
          }

          // Section heading
          if (section.heading) {
            children.push(
              new Paragraph({
                heading: headingLevelFor(section.level),
                spacing: { before: 240, after: 120 },
                children: [
                  new TextRun({
                    text: section.heading,
                    bold: true,
                  }),
                ],
              }),
            );
          }

          // Section prose content — split on double newlines into paragraphs
          if (section.content) {
            const paragraphs = section.content.split(/\n\n+/);
            for (const para of paragraphs) {
              const trimmed = para.trim();
              if (!trimmed) continue;
              children.push(
                new Paragraph({
                  spacing: { after: 200 },
                  children: [new TextRun({ text: trimmed, size: 24 })], // 12pt
                }),
              );
            }
          }

          // Section table
          if (section.table) {
            children.push(buildTable(section.table.headers, section.table.rows));
            // Small spacer after table
            children.push(new Paragraph({ spacing: { after: 200 }, children: [] }));
          }
        }

        // Assemble Document
        const doc = new Document({
          creator: "Pro Se Engine",
          title,
          sections: [
            {
              properties: {
                type: SectionType.CONTINUOUS,
                page: {
                  size: landscape
                    ? { orientation: PageOrientation.LANDSCAPE }
                    : { orientation: PageOrientation.PORTRAIT },
                  margin: {
                    top: 1440,    // 1 inch
                    right: 1440,
                    bottom: 1440,
                    left: 1440,
                  },
                },
              },
              children,
            },
          ],
        });

        // Pack to buffer and encode
        const buffer = await Packer.toBuffer(doc);
        const base64 = Buffer.from(buffer).toString("base64");

        // Sanitise title for filename
        const safeTitle = title
          .replace(/[^a-zA-Z0-9_\- ]/g, "")
          .replace(/\s+/g, "_")
          .slice(0, 80);
        const filename = `${safeTitle}.docx`;

        return {
          content: [
            {
              type: "text" as const,
              text: [
                `✅ Document generated successfully.`,
                ``,
                `Filename: ${filename}`,
                `Size: ${buffer.byteLength.toLocaleString()} bytes`,
                ``,
                `To deliver this to the user, present the base64 data below ` +
                  `as a downloadable file (MIME type: ` +
                  `application/vnd.openxmlformats-officedocument.wordprocessingml.document).`,
                ``,
                `--- BASE64 START ---`,
                base64,
                `--- BASE64 END ---`,
              ].join("\n"),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error generating document: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );
}
