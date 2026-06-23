// ---------------------------------------------------------------------------
// Pro Se Engine — Main Entry Point
// ---------------------------------------------------------------------------
// A standalone Node.js MCP server exposing legal research capabilities
// powered by CourtListener. Designed for use with Pickaxe agents via
// Streamable HTTP transport.
// ---------------------------------------------------------------------------

import "dotenv/config";
import express from "express";
import helmet from "helmet";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CourtListenerClient } from "./courtlistener/client.js";
import { SECClient } from "./sec/client.js";
import { FederalRegisterClient } from "./federalregister/client.js";
import { CongressClient } from "./congress/client.js";
import { RegulationsClient } from "./regulations/client.js";
import { USASpendingClient } from "./usaspending/client.js";
import { registerCaseLawTools } from "./tools/caselaw.js";
import { registerCitationTools } from "./tools/citations.js";
import { registerDocketTools } from "./tools/dockets.js";
import { registerCourtTools } from "./tools/courts.js";
import { registerDocumentTools } from "./tools/documents.js";
import { registerExtractionTools } from "./tools/extraction.js";
import { registerEditingTools } from "./tools/editing.js";
import { registerWorkflowTools } from "./tools/workflows.js";
import { registerSECTools } from "./tools/sec.js";
import { registerFederalRegisterTools } from "./tools/federalregister.js";
import { registerCongressTools } from "./tools/congress.js";
import { registerRegulationsTools } from "./tools/regulations.js";
import { registerUSASpendingTools } from "./tools/usaspending.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PORT = Number(process.env.PORT ?? 3001);
const CL_TOKEN = process.env.COURTLISTENER_API_TOKEN ?? "";
const MCP_AUTH_TOKEN = process.env.MCP_AUTH_TOKEN;
const SEC_USER_AGENT = process.env.SEC_USER_AGENT ?? "ProSeEngine admin@projectcues.com";
const CONGRESS_API_KEY = process.env.CONGRESS_API_KEY ?? "";
const REGULATIONS_API_KEY = process.env.REGULATIONS_API_KEY ?? "";

if (!CL_TOKEN) {
  console.error(
    "⚠️  COURTLISTENER_API_TOKEN is not set. Legal research tools will fail.",
  );
}

if (!CONGRESS_API_KEY) {
  console.warn("⚠️  CONGRESS_API_KEY is not set. Congress tools will fail.");
}

if (!REGULATIONS_API_KEY) {
  console.warn("⚠️  REGULATIONS_API_KEY is not set. Regulations tools will fail.");
}

// ---------------------------------------------------------------------------
// CourtListener client (singleton)
// ---------------------------------------------------------------------------

const clClient = new CourtListenerClient(CL_TOKEN);
const secClient = new SECClient(SEC_USER_AGENT);
const frClient = new FederalRegisterClient();
const congressClient = new CongressClient(CONGRESS_API_KEY);
const regulationsClient = new RegulationsClient(REGULATIONS_API_KEY);
const usaSpendingClient = new USASpendingClient();

// ---------------------------------------------------------------------------
// MCP Server setup
// ---------------------------------------------------------------------------

function createMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: "pro-se-engine",
      version: "3.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  // Register all tool groups — Phase 1: Legal Research
  registerCaseLawTools(server, clClient);
  registerCitationTools(server, clClient);
  registerDocketTools(server, clClient);
  registerCourtTools(server, clClient);
  registerDocumentTools(server);
  registerExtractionTools(server);
  registerEditingTools(server);
  registerWorkflowTools(server);

  // Phase 2: Government & Regulatory
  registerSECTools(server, secClient);
  registerFederalRegisterTools(server, frClient);
  registerCongressTools(server, congressClient);
  registerRegulationsTools(server, regulationsClient);
  registerUSASpendingTools(server, usaSpendingClient);

  return server;
}

// ---------------------------------------------------------------------------
// Express HTTP server with Streamable HTTP transport
// ---------------------------------------------------------------------------

const app = express();

app.disable("x-powered-by");

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        baseUri: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    hsts: process.env.NODE_ENV === "production"
      ? { maxAge: 15552000, includeSubDomains: true }
      : false,
  }),
);

// Optional: bearer token auth for the MCP endpoint
function checkAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
): void {
  if (!MCP_AUTH_TOKEN) return next();

  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${MCP_AUTH_TOKEN}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

// Health check
app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    server: "pro-se-engine",
    version: "3.0.0",
    courtlistener: !!CL_TOKEN,
    sec: true,
    federal_register: true,
    congress: !!CONGRESS_API_KEY,
    regulations: !!REGULATIONS_API_KEY,
    usaspending: true,
  });
});

// ---------------------------------------------------------------------------
// Streamable HTTP Transport — stateless mode
// ---------------------------------------------------------------------------
// Each request gets its own McpServer + transport instance (stateless).
// This is ideal for Pickaxe which sends independent requests.
// ---------------------------------------------------------------------------

app.post("/mcp", checkAuth, async (req, res) => {
  try {
    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // Stateless — no sessions
    });

    res.on("close", () => {
      transport.close().catch(() => {});
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("MCP request error:", err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

// Handle GET and DELETE for SSE transport (required by MCP spec)
app.get("/mcp", checkAuth, async (_req, res) => {
  res.writeHead(405).end(JSON.stringify({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed. Use POST for stateless mode." },
    id: null,
  }));
});

app.delete("/mcp", checkAuth, async (_req, res) => {
  res.writeHead(405).end(JSON.stringify({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed. Stateless server does not support sessions." },
    id: null,
  }));
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║   ⚖️  Pro Se Engine  v3.0.0                              ║
║                                                          ║
║   Running on port ${String(PORT).padEnd(38)}║
║   MCP endpoint: http://localhost:${PORT}/mcp${" ".repeat(Math.max(0, 19 - String(PORT).length))}║
║   Health check: http://localhost:${PORT}/health${" ".repeat(Math.max(0, 16 - String(PORT).length))}║
║                                                          ║
║   APIs:                                                  ║
║     CourtListener: ${CL_TOKEN ? "✅ Connected" : "❌ No token"}${" ".repeat(CL_TOKEN ? 25 : 26)}║
║     SEC EDGAR:     ✅ Connected                          ║
║     Fed Register:  ✅ Connected                          ║
║     Congress.gov:  ${CONGRESS_API_KEY ? "✅ Connected" : "❌ No key  "}${" ".repeat(CONGRESS_API_KEY ? 25 : 25)}║
║     Regulations:   ${REGULATIONS_API_KEY ? "✅ Connected" : "❌ No key  "}${" ".repeat(REGULATIONS_API_KEY ? 25 : 25)}║
║     USAspending:   ✅ Connected                          ║
║                                                          ║
║   Auth: ${MCP_AUTH_TOKEN ? "🔒 Bearer token required" : "🔓 Open (no auth)"}${" ".repeat(MCP_AUTH_TOKEN ? 22 : 22)}║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
  `);
});

export { app };
