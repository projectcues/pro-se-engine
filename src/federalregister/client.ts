// ---------------------------------------------------------------------------
// Federal Register API Client
// ---------------------------------------------------------------------------

const BASE_URL = "https://www.federalregister.gov/api/v1";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FRAgency {
  slug: string;
  name: string;
  short_name: string | null;
  url: string;
}

export interface FRDocument {
  document_number: string;
  title: string;
  type: string;
  abstract: string | null;
  publication_date: string;
  agencies: Array<{ name: string; slug: string }>;
  html_url: string;
  pdf_url: string;
  full_text_xml_url: string | null;
  action: string | null;
  dates: string | null;
  effective_on: string | null;
  comments_close_on: string | null;
  agency_names: string[];
  cfr_references: Array<{ title: number; part: number }>;
  regulation_id_numbers: string[];
  body_html_url: string | null;
}

export interface FRSearchResult {
  count: number;
  total_pages: number;
  results: FRDocument[];
}

export interface FRSearchParams {
  term?: string;
  type?: string[];
  agencies?: string[];
  publicationDateGte?: string;
  publicationDateLte?: string;
  significant?: boolean;
  perPage?: number;
  page?: number;
  order?: "relevance" | "newest" | "oldest";
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class FederalRegisterClient {
  // -------------------------------------------------------------------------
  // Core HTTP
  // -------------------------------------------------------------------------

  private async request<T>(url: string): Promise<T> {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(
        `Federal Register API error ${res.status}: ${res.statusText}. ${errText.slice(0, 500)}`,
      );
    }

    return (await res.json()) as T;
  }

  // -------------------------------------------------------------------------
  // Search Documents
  // -------------------------------------------------------------------------

  /**
   * Search Federal Register documents with filters.
   */
  async searchDocuments(params: FRSearchParams): Promise<FRSearchResult> {
    const url = new URL(`${BASE_URL}/documents.json`);

    if (params.term) {
      url.searchParams.set("conditions[term]", params.term);
    }
    if (params.type) {
      for (const t of params.type) {
        url.searchParams.append("conditions[type][]", t);
      }
    }
    if (params.agencies) {
      for (const a of params.agencies) {
        url.searchParams.append("conditions[agencies][]", a);
      }
    }
    if (params.publicationDateGte) {
      url.searchParams.set(
        "conditions[publication_date][gte]",
        params.publicationDateGte,
      );
    }
    if (params.publicationDateLte) {
      url.searchParams.set(
        "conditions[publication_date][lte]",
        params.publicationDateLte,
      );
    }
    if (params.significant !== undefined) {
      url.searchParams.set(
        "conditions[significant]",
        params.significant ? "1" : "0",
      );
    }
    if (params.perPage) {
      url.searchParams.set(
        "per_page",
        String(Math.min(params.perPage, 1000)),
      );
    }
    if (params.page) {
      url.searchParams.set("page", String(params.page));
    }
    if (params.order) {
      url.searchParams.set("order", params.order);
    }

    // Request specific fields for richer results
    const fields = [
      "document_number",
      "title",
      "type",
      "abstract",
      "publication_date",
      "agencies",
      "html_url",
      "pdf_url",
      "full_text_xml_url",
      "action",
      "dates",
      "effective_on",
      "comments_close_on",
      "agency_names",
      "cfr_references",
      "regulation_id_numbers",
    ];
    for (const field of fields) {
      url.searchParams.append("fields[]", field);
    }

    return this.request<FRSearchResult>(url.toString());
  }

  // -------------------------------------------------------------------------
  // Get Document
  // -------------------------------------------------------------------------

  /**
   * Get full details for a specific Federal Register document.
   */
  async getDocument(documentNumber: string): Promise<FRDocument> {
    const fields = [
      "abstract",
      "body_html_url",
      "action",
      "dates",
      "effective_on",
      "comments_close_on",
      "agency_names",
      "cfr_references",
      "regulation_id_numbers",
      "title",
      "type",
      "publication_date",
      "html_url",
      "pdf_url",
      "document_number",
      "full_text_xml_url",
      "agencies",
    ];

    const url = new URL(
      `${BASE_URL}/documents/${encodeURIComponent(documentNumber)}.json`,
    );
    for (const field of fields) {
      url.searchParams.append("fields[]", field);
    }

    return this.request<FRDocument>(url.toString());
  }

  // -------------------------------------------------------------------------
  // List Agencies
  // -------------------------------------------------------------------------

  /**
   * List all federal agencies that publish in the Federal Register.
   */
  async listAgencies(): Promise<FRAgency[]> {
    return this.request<FRAgency[]>(`${BASE_URL}/agencies`);
  }
}
