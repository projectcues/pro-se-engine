// ---------------------------------------------------------------------------
// MCP Tools — Legal Workflow Templates
// ---------------------------------------------------------------------------
// Pre-built analysis frameworks for common legal document tasks.
// These return structured prompts that guide the LLM through a thorough,
// section-by-section analysis of a legal document.
// ---------------------------------------------------------------------------

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Workflow definitions
// ---------------------------------------------------------------------------

interface LegalWorkflow {
  id: string;
  title: string;
  description: string;
  prompt: string;
}

const LEGAL_WORKFLOWS: LegalWorkflow[] = [
  {
    id: "cp-checklist",
    title: "Generate CP Checklist",
    description:
      "Generate a Conditions Precedent checklist from a credit agreement as a downloadable Word document in landscape orientation.",
    prompt: `Review the uploaded credit agreement or financing document and generate a comprehensive Conditions Precedent (CP) checklist.

You MUST use the generate_legal_document tool to produce the checklist as a downloadable Word document.
You MUST pass landscape: true — the document must be in landscape orientation.

Structure the document as follows:
- For each category of conditions (e.g. Corporate, Financial, Legal, Security), add a section with a heading
- Under each category heading, include a table with exactly these four columns in this order:
  1. Index — sequential number within the category (1, 2, 3…)
  2. Clause Number — the clause or schedule reference from the agreement
  3. Clause — a concise description of the condition precedent
  4. Status — leave blank (empty string) for the user to fill in

Use the table field in the section object (not content) for each category's rows.

Before finalizing, double-check that every table is formatted correctly: each table must have exactly the four columns above in the same order, headers must match exactly (Index, Clause Number, Clause, Status), every row must have the same number of cells as the headers, the Index column must be sequential starting from 1 within each category, and no cells should contain stray markdown, newlines, or placeholder text (use an empty string for Status).`,
  },
  {
    id: "credit-agreement-summary",
    title: "Credit Agreement Summary",
    description:
      "Produce a comprehensive 21-section legal summary of a credit agreement covering lenders, borrowers, facilities, covenants, events of default, and more.",
    prompt: `Review the uploaded credit agreement and produce a comprehensive legal summary covering the following topics. For each section, identify the key provisions, quote the relevant clause or schedule references, and flag any unusual, onerous, or non-market terms.

1. Lenders — All lenders or members of the lender syndicate, including their full legal name and role
2. Borrowers — All borrowers, including their full legal name and jurisdiction of incorporation
3. Guarantors — All guarantors, including their full legal name and the scope of their guarantee obligation
4. Other Parties — Any other material parties and their roles
5. Date of Agreement
6. Facilities — Each facility available, the facility type, tranche name, and any key structural features
7. Amount — Total committed amount across all facilities, the currency, and breakdown by tranche
8. Purpose — Stated purpose for which borrowings may be used and any restrictions
9. Interest — Applicable reference rate, the margin, any margin ratchet mechanism
10. Commitment Fee — Commitment or utilisation fees, the applicable rate, how they are calculated
11. Repayment Schedule — Repayment profile for each facility
12. Maturity — Final maturity date for each facility
13. Security — Each class of security granted or required
14. Guarantees — Guarantee obligations, the guarantors, the scope, and any limitations
15. Financial Covenants — Each financial covenant, the metric, the applicable test, testing frequency
16. Events of Default — Each event of default, noting any grace periods or materiality thresholds
17. Assignment — Restrictions or permissions on assignment or transfer
18. Change of Control — What constitutes a change of control, what obligations it triggers
19. Prepayment Fee — Any prepayment fees, make-whole premiums, or soft-call protections
20. Governing Law
21. Dispute Resolution — Whether disputes go to litigation or arbitration, the chosen forum`,
  },
  {
    id: "shareholder-agreement-summary",
    title: "Shareholder Agreement Summary",
    description:
      "Produce a comprehensive 15-section legal summary of a shareholder agreement covering parties, share classes, governance, transfer restrictions, and exit provisions.",
    prompt: `Review the uploaded shareholder agreement and produce a comprehensive legal summary covering the following topics. For each section, identify the key provisions, quote the relevant clause references, and flag any unusual, onerous, or market-standard deviations.

1. Parties & Shareholdings — Full legal names, roles, share classes held, and percentage interests
2. Share Classes & Rights — For each class: voting rights, dividend rights, liquidation preference, conversion or redemption features
3. Board Composition & Governance — Board size, director appointment rights, quorum, and casting vote
4. Reserved Matters — Decisions requiring a special majority, unanimity, or a specific shareholder's consent
5. Pre-emption on New Shares — Who holds pre-emption rights, procedure, timeline, and any carve-outs
6. Transfer Restrictions — Lock-up periods, prohibited transfers, permitted transfers, and any board approval requirements
7. Right of First Refusal / Pre-emption on Transfer — Trigger, procedure, pricing mechanics, and any exceptions
8. Drag-Along Rights — Who holds the right, threshold to trigger, conditions, and minority protections
9. Tag-Along Rights — Who holds the right, triggering threshold, exercise procedure, and price terms
10. Anti-Dilution Protections — Type (full ratchet, weighted average), trigger events, calculation mechanics
11. Dividend Policy — Any obligation or target to pay dividends, preferential dividend rights
12. Exit & Liquidity — Agreed exit routes (trade sale, IPO, drag sale), timelines, and liquidation preferences
13. Deadlock — Deadlock definition, escalation and resolution mechanisms, and consequences if unresolved
14. Non-Compete & Non-Solicitation — Who is bound, scope of activities and geography, duration
15. Governing Law & Dispute Resolution — Applicable law, forum, arbitration or litigation`,
  },

  // -----------------------------------------------------------------------
  // M&A Due Diligence Checklist
  // -----------------------------------------------------------------------
  {
    id: "ma-due-diligence",
    title: "M&A Due Diligence Checklist",
    description:
      "Generate a comprehensive M&A due diligence checklist as a Word document covering corporate, financial, legal, operational, and regulatory categories.",
    prompt: `Review the uploaded documents related to the target company and generate a comprehensive M&A due diligence checklist.

You MUST use the generate_legal_document tool to produce the checklist.
You MUST pass landscape: true.

Organize into these categories, each with a table (Index, Item, Status, Notes columns):
1. Corporate Structure — Articles, bylaws, organizational chart, subsidiaries, jurisdictions, capitalization table
2. Financial — Audited financials (3 years), tax returns, accounts receivable/payable, debt schedule, projections, working capital
3. Material Contracts — Customer agreements, supplier agreements, leases, license agreements, distribution agreements, joint ventures
4. Intellectual Property — Patents, trademarks, copyrights, trade secrets, IP assignments, infringement claims
5. Employment & Labor — Key employee agreements, benefit plans, union contracts, WARN Act compliance, pending claims
6. Litigation & Disputes — Pending/threatened litigation, arbitrations, government investigations, consent decrees
7. Real Property — Owned property, leased property, environmental assessments, zoning compliance
8. Regulatory & Compliance — Permits, licenses, regulatory approvals, compliance programs, data privacy
9. Insurance — Policy schedule, claims history, pending claims, adequacy analysis
10. Tax — Federal/state/local tax returns, ongoing audits, tax liens, transfer pricing`,
  },

  // -----------------------------------------------------------------------
  // Commercial Lease Abstract
  // -----------------------------------------------------------------------
  {
    id: "commercial-lease-abstract",
    title: "Commercial Lease Abstract",
    description:
      "Extract and summarize the key terms of a commercial lease agreement in a structured 18-point format.",
    prompt: `Review the uploaded commercial lease and produce a comprehensive lease abstract covering:
1. Landlord — Full legal name and notice address
2. Tenant — Full legal name and notice address
3. Premises — Description, suite/unit number, rentable square footage, usable square footage
4. Term — Commencement date, expiration date, total lease term
5. Base Rent — Monthly/annual amounts, escalation schedule, any free rent periods
6. Additional Rent — CAM charges, property taxes, insurance (NNN, modified gross, full service)
7. Security Deposit — Amount, conditions for return, letter of credit requirements
8. Permitted Use — Permitted uses, exclusive use provisions, prohibited uses
9. Renewal Options — Number of options, term of each, rent during renewal, notice requirements
10. Expansion Options — Right of first refusal/offer, expansion space, terms
11. Tenant Improvements — Landlord's contribution (TI allowance), construction obligations, ownership
12. Maintenance & Repairs — Tenant vs landlord responsibilities, HVAC, structural, roof
13. Assignment & Subletting — Consent requirements, recapture rights, profit sharing
14. Insurance Requirements — Tenant's insurance obligations, named insured requirements, limits
15. Default & Remedies — Events of default, cure periods, landlord's remedies, tenant's remedies
16. Early Termination — Termination rights, termination fee, notice requirements
17. Parking — Number of spaces, reserved vs unreserved, rate, location
18. Governing Law & Jurisdiction

Flag any unusual, tenant-unfavorable, or non-market terms.`,
  },

  // -----------------------------------------------------------------------
  // Employment Agreement Review
  // -----------------------------------------------------------------------
  {
    id: "employment-agreement-review",
    title: "Employment Agreement Review",
    description:
      "Analyze an employment agreement across 15 key sections covering compensation, restrictive covenants, termination, and IP assignment.",
    prompt: `Review the uploaded employment agreement and produce a comprehensive analysis covering:
1. Parties & Position — Employer, employee, title, reporting structure, start date
2. Term & At-Will Status — Fixed term or at-will, probationary period
3. Compensation — Base salary, bonus structure, commission, equity/options
4. Benefits — Health, dental, vision, retirement, PTO/vacation, other perquisites
5. Duties & Exclusivity — Scope of duties, full-time commitment, outside activities restrictions
6. Non-Compete — Geographic scope, duration, restricted activities, industry, enforceability concerns
7. Non-Solicitation — Customer non-solicitation, employee non-solicitation, duration
8. Confidentiality — Definition of confidential information, duration, exceptions, return of materials
9. IP Assignment — Scope of assignment, prior inventions excluded, moral rights waiver, work product
10. Termination Without Cause — Notice period, severance amount, benefits continuation, COBRA
11. Termination For Cause — Definition of cause, cure period, process
12. Resignation — Notice period, garden leave, forfeiture provisions
13. Change of Control — Acceleration, double-trigger vs single-trigger, enhanced severance
14. Dispute Resolution — Arbitration, venue, choice of law, fee-shifting, jury waiver
15. Clawback & Repayment — Signing bonus clawback, relocation repayment, training cost recovery

Flag any provisions that are unusually broad, potentially unenforceable, or significantly favor one party.`,
  },

  // -----------------------------------------------------------------------
  // IP Assignment/License Review
  // -----------------------------------------------------------------------
  {
    id: "ip-assignment-review",
    title: "IP Assignment/License Review",
    description:
      "Analyze an IP assignment or license agreement across 12 key sections covering scope, field of use, royalties, and termination.",
    prompt: `Review the uploaded IP assignment or license agreement and produce a comprehensive analysis covering:
1. Parties — Assignor/Licensor, Assignee/Licensee, relationship between parties
2. Type — Assignment vs license, exclusive vs non-exclusive, sole license
3. IP Description — Patents, trademarks, copyrights, trade secrets, domain names, specific identification
4. Field of Use — Permitted fields, geographic restrictions, channel restrictions
5. Term & Territory — Duration, geographic scope, worldwide vs limited
6. Consideration & Royalties — Upfront payment, running royalties, minimum royalties, milestone payments, audit rights
7. Sublicense Rights — Whether permitted, conditions, sublicense revenue sharing
8. Representations & Warranties — Ownership, non-infringement, validity, enforceability
9. Indemnification — IP infringement indemnity, scope, caps, procedure
10. Improvements — Ownership of improvements, grant-back provisions, feedback
11. Enforcement — Who has right to enforce, cooperation obligations, cost sharing
12. Termination — Termination for breach, convenience termination, post-termination rights`,
  },

  // -----------------------------------------------------------------------
  // Litigation Case Assessment
  // -----------------------------------------------------------------------
  {
    id: "litigation-case-assessment",
    title: "Litigation Case Assessment",
    description:
      "Structured evaluation of a potential or pending litigation case covering claims, defenses, damages, and strategic considerations.",
    prompt: `Based on the facts and documents provided, produce a structured litigation case assessment covering:
1. Case Overview — Parties, court/jurisdiction, case number if filed, procedural status
2. Factual Summary — Chronological narrative of key facts
3. Claims Analysis — Each potential cause of action, elements, strength assessment (Strong/Moderate/Weak)
4. Defenses Analysis — Available defenses, affirmative defenses, strength assessment
5. Jurisdiction & Venue — Subject matter jurisdiction, personal jurisdiction, venue analysis
6. Statute of Limitations — Applicable limitations periods, accrual date analysis, tolling arguments
7. Damages Assessment — Compensatory, consequential, punitive, statutory damages, mitigation
8. Discovery Considerations — Key documents needed, deposition targets, ESI issues, privilege concerns
9. Motion Practice — Potential dispositive motions (MTD, MSJ), timing, likelihood of success
10. Settlement Analysis — BATNA, settlement range, mediation prospects, early settlement opportunities
11. Budget & Timeline — Estimated litigation costs by phase, expected timeline to trial
12. Strategic Recommendations — Recommended course of action with supporting rationale

For each claim and defense, cite the applicable legal standard and assess the strength of the position.`,
  },

  // -----------------------------------------------------------------------
  // Regulatory Compliance Review
  // -----------------------------------------------------------------------
  {
    id: "regulatory-compliance-review",
    title: "Regulatory Compliance Review",
    description:
      "Framework for identifying regulatory obligations and compliance gaps based on provided documents.",
    prompt: `Review the uploaded documents and produce a regulatory compliance assessment covering:
1. Business Description — Entity type, industry, products/services, jurisdictions of operation
2. Applicable Regulatory Framework — Federal, state, and local regulations that apply
3. Licensing & Permits — Required licenses, current status, renewal dates
4. Industry-Specific Regulations — Sector-specific compliance requirements
5. Data Privacy — CCPA, GDPR, HIPAA, or other privacy regime applicability and compliance status
6. Employment Regulations — FLSA, FMLA, ADA, Title VII, state employment laws
7. Environmental — EPA, state environmental requirements, reporting obligations
8. Financial Regulations — SOX, Dodd-Frank, BSA/AML if applicable
9. Compliance Gaps — Identified areas of non-compliance or risk
10. Remediation Recommendations — Specific actions to address each gap, priority, and timeline`,
  },

  // -----------------------------------------------------------------------
  // Power of Attorney Review
  // -----------------------------------------------------------------------
  {
    id: "power-of-attorney-review",
    title: "Power of Attorney Review",
    description:
      "Analysis of a power of attorney document covering scope, limitations, durability, and revocation provisions.",
    prompt: `Review the uploaded power of attorney and produce a comprehensive analysis covering:
1. Parties — Principal (grantor), Agent (attorney-in-fact), successor agents
2. Type — General vs limited/special, durable vs non-durable, springing
3. Powers Granted — Specific enumeration of powers (financial, real property, legal, healthcare)
4. Limitations & Exclusions — Powers explicitly excluded or limited
5. Effective Date — Immediately effective vs springing (trigger conditions)
6. Durability — Whether power survives incapacity, applicable state law
7. Compensation — Agent compensation, expense reimbursement
8. Accounting & Reporting — Agent's duty to account, reporting requirements
9. Third-Party Reliance — Liability protection for third parties, certification provisions
10. Revocation — How the power may be revoked, notice requirements
11. Governing Law — Applicable state law, multi-state recognition issues`,
  },

  // -----------------------------------------------------------------------
  // Corporate Bylaws Review
  // -----------------------------------------------------------------------
  {
    id: "corporate-bylaws-review",
    title: "Corporate Bylaws Review",
    description:
      "12-section analysis of corporate bylaws covering governance, meetings, officers, amendments, and indemnification.",
    prompt: `Review the uploaded corporate bylaws and produce a comprehensive analysis covering:
1. Offices — Principal office, registered agent, other offices
2. Shareholders — Annual/special meetings, notice, quorum, voting, proxies, action without meeting
3. Board of Directors — Number, election, term, removal, vacancies, quorum, regular/special meetings
4. Committees — Standing committees, composition, authority, limitations
5. Officers — Required officers, appointment, removal, duties, succession
6. Stock — Certificates, transfers, record date, lost certificates
7. Dividends — Declaration authority, restrictions, record date
8. Indemnification — Scope, advancement of expenses, limitations, insurance
9. Corporate Records — Required records, inspection rights, annual report
10. Amendments — Amendment procedure, board vs shareholder amendments, supermajority requirements
11. Fiscal Year — Fiscal year definition
12. Conflicts of Interest — Disclosure requirements, approval process, interested director transactions`,
  },

  // -----------------------------------------------------------------------
  // Settlement Agreement Review
  // -----------------------------------------------------------------------
  {
    id: "settlement-agreement-review",
    title: "Settlement Agreement Review",
    description:
      "14-section analysis of a settlement agreement covering releases, payment terms, confidentiality, and representations.",
    prompt: `Review the uploaded settlement agreement and produce a comprehensive analysis covering:
1. Parties — All parties to the settlement, including related entities
2. Recitals — Background dispute, claims settled, case number if applicable
3. Settlement Payment — Amount, structure (lump sum vs installments), timing, tax treatment
4. Releases — Scope of mutual releases, known vs unknown claims, California Civil Code 1542 waiver
5. Confidentiality — Non-disclosure obligations, permitted disclosures, consequences of breach
6. Non-Disparagement — Scope, duration, social media provisions
7. Cooperation — Cooperation obligations, testimony, document production
8. Representations & Warranties — Authority, capacity, no assignment of claims
9. Return/Destruction — Return of property, destruction of documents/data
10. Enforcement — Venue for enforcement, attorneys' fees, specific performance
11. Dismissal — Stipulated dismissal, with/without prejudice, filing obligations
12. Indemnification — Indemnification for breach, tax indemnification
13. Entire Agreement — Integration clause, modification requirements
14. Governing Law — Choice of law, jurisdiction, dispute resolution for settlement disputes`,
  },

  // -----------------------------------------------------------------------
  // Partnership Agreement Review
  // -----------------------------------------------------------------------
  {
    id: "partnership-agreement-review",
    title: "Partnership Agreement Review",
    description:
      "15-section analysis of a partnership or LLC operating agreement covering contributions, distributions, management, and dissolution.",
    prompt: `Review the uploaded partnership agreement or LLC operating agreement and produce a comprehensive analysis covering:
1. Parties & Entity — Partners/members, entity name, type (GP, LP, LLP, LLC), jurisdiction
2. Purpose — Business purpose, permitted activities, restrictions
3. Capital Contributions — Initial contributions, additional contribution obligations, capital accounts
4. Profit & Loss Allocation — Allocation methodology, special allocations, tax allocations
5. Distributions — Distribution policy, priority (waterfall), tax distributions, timing
6. Management & Authority — Managing partner/member vs member-managed, day-to-day authority, major decisions
7. Voting — Voting rights, supermajority requirements, class voting
8. Transfer Restrictions — Restrictions on transfer, ROFR, tag-along, drag-along
9. New Partners/Members — Admission process, capital requirements, consent requirements
10. Withdrawal & Dissociation — Voluntary withdrawal, involuntary dissociation, consequences
11. Buyout Provisions — Buyout triggers, valuation methodology, payment terms
12. Non-Compete — Scope, duration, competing activities
13. Books & Records — Accounting method, fiscal year, reporting, audit rights
14. Dissolution — Events triggering dissolution, winding up procedures, distribution of assets
15. Governing Law — Choice of law, dispute resolution, arbitration`,
  },
];

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

/**
 * Register legal workflow template tools on the MCP server.
 */
export function registerWorkflowTools(server: McpServer): void {
  // -------------------------------------------------------------------------
  // list_legal_workflows
  // -------------------------------------------------------------------------

  server.tool(
    "list_legal_workflows",
    "List available legal workflow templates. These are structured analysis " +
      "frameworks for common legal tasks. Use get_legal_workflow to load the " +
      "full prompt for a specific workflow.",
    {},
    async () => {
      try {
        const listing = LEGAL_WORKFLOWS.map(
          (w) => `• ${w.id} — ${w.title}\n  ${w.description}`,
        ).join("\n\n");

        return {
          content: [
            {
              type: "text" as const,
              text: [
                `Available legal workflows (${LEGAL_WORKFLOWS.length}):`,
                "",
                listing,
                "",
                'Use get_legal_workflow with the workflow ID to load the full prompt.',
              ].join("\n"),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error listing workflows: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );

  // -------------------------------------------------------------------------
  // get_legal_workflow
  // -------------------------------------------------------------------------

  server.tool(
    "get_legal_workflow",
    "Get the full prompt/instructions for a legal workflow template. After " +
      "retrieving a workflow, follow its instructions to analyze the user's " +
      "document. The workflow prompt will tell you exactly what to extract " +
      "and how to format the output.",
    {
      workflow_id: z
        .string()
        .describe("The workflow ID (e.g. 'cp-checklist')"),
    },
    async ({ workflow_id }) => {
      try {
        const workflow = LEGAL_WORKFLOWS.find((w) => w.id === workflow_id);

        if (!workflow) {
          const available = LEGAL_WORKFLOWS.map((w) => w.id).join(", ");
          return {
            content: [
              {
                type: "text" as const,
                text: `Workflow "${workflow_id}" not found. Available workflow IDs: ${available}`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text: [
                `Workflow: ${workflow.title}`,
                `ID: ${workflow.id}`,
                "",
                "--- WORKFLOW PROMPT ---",
                "",
                workflow.prompt,
              ].join("\n"),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error retrieving workflow: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );
}
