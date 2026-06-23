# Pro Se Engine

A powerful MCP (Model Context Protocol) server providing **39 legal research tools** across **6 government APIs** — designed for use with [Pickaxe](https://pickaxe.com) AI agents.

Built by [ProjectCues](https://github.com/projectcues).

---

## 🏛️ What It Does

Pro Se Engine gives AI agents access to:

| API | Tools | Auth |
|-----|:-----:|------|
| **CourtListener** | 16 | API token |
| **SEC EDGAR** | 4 | User-Agent header |
| **Federal Register** | 3 | None |
| **Congress.gov** | 4 | API key (free) |
| **Regulations.gov** | 3 | API key (free) |
| **USAspending.gov** | 3 | None |
| **Document Tools** | 4 | — |
| **Legal Workflows** | 2 (13 templates) | — |

### Tool Categories

- **Case Law** — Search opinions, read full text, verify citations
- **SEC Filings** — Full-text search, company filings, XBRL financials
- **Federal Legislation** — Bills, bill text, Congress members
- **Regulations** — Federal Register rules, regulatory dockets, public comments
- **Government Contracts** — USAspending awards, contractor profiles
- **Documents** — Generate DOCX, extract text from PDF/DOCX, tracked changes editing
- **Workflows** — 13 structured legal analysis templates (M&A due diligence, lease abstracts, litigation assessment, etc.)

---

## 🚀 Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your API keys
```

### 3. Run in development

```bash
npm run dev
```

### 4. Build for production

```bash
npm run build
node dist/index.js
```

The server starts on `http://localhost:3001/mcp`.

---

## 🔑 API Keys

| Variable | Required | How to Get |
|----------|----------|------------|
| `COURTLISTENER_API_TOKEN` | Yes | [courtlistener.com/help/api](https://www.courtlistener.com/help/api/) |
| `CONGRESS_API_KEY` | Yes | [api.data.gov/signup](https://api.data.gov/signup/) (free) |
| `REGULATIONS_API_KEY` | Yes | Same key from api.data.gov |
| `SEC_USER_AGENT` | Yes | Any string: `"YourApp your@email.com"` |
| `MCP_AUTH_TOKEN` | Optional | Set to require bearer auth on the MCP endpoint |

SEC EDGAR, Federal Register, and USAspending.gov require **no API keys**.

---

## 🔗 Connecting to Pickaxe

1. Deploy this server to a public URL (e.g., Hostinger VPS)
2. In Pickaxe Agent Builder, add an MCP server
3. Set the endpoint URL to `https://your-domain.com/mcp`
4. If `MCP_AUTH_TOKEN` is set, configure the bearer token in Pickaxe

---

## 📋 13 Legal Workflow Templates

| ID | Template |
|----|----------|
| `cp-checklist` | Conditions Precedent Checklist |
| `credit-agreement-summary` | Credit Agreement Summary (21 sections) |
| `shareholder-agreement-summary` | Shareholder Agreement Summary (15 sections) |
| `ma-due-diligence` | M&A Due Diligence Checklist (10 categories) |
| `commercial-lease-abstract` | Commercial Lease Abstract (18 points) |
| `employment-agreement-review` | Employment Agreement Review (15 sections) |
| `ip-assignment-review` | IP Assignment/License Review (12 sections) |
| `litigation-case-assessment` | Litigation Case Assessment (12 sections) |
| `regulatory-compliance-review` | Regulatory Compliance Review (10 sections) |
| `power-of-attorney-review` | Power of Attorney Review (11 sections) |
| `corporate-bylaws-review` | Corporate Bylaws Review (12 sections) |
| `settlement-agreement-review` | Settlement Agreement Review (14 sections) |
| `partnership-agreement-review` | Partnership Agreement Review (15 sections) |

---

## 🏗️ Architecture

- **Runtime**: Node.js 20+
- **Language**: TypeScript (strict mode)
- **Transport**: Streamable HTTP (stateless — each request is independent)
- **Framework**: Express + `@modelcontextprotocol/sdk`

---

## 📄 License

MIT
